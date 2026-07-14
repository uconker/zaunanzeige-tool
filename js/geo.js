import { CONFIG } from "./config.js";

// ---------------------------------------------------------------------------
// Landkreis / responsible authority lookup
// ---------------------------------------------------------------------------

/**
 * Reverse-geocodes a coordinate to a Landkreis / kreisfreie Stadt name
 * using Nominatim (OpenStreetMap). Returns e.g. "Landkreis Freising".
 */
export async function findLandkreis(lat, lon) {
  const url = `${CONFIG.NOMINATIM_URL}?format=jsonv2&lat=${lat}&lon=${lon}&zoom=8&addressdetails=1`;
  const res = await fetch(url, { headers: { "Accept-Language": "de" } });
  if (!res.ok) throw new Error(`Nominatim request failed (${res.status})`);
  const data = await res.json();
  const addr = data.address || {};
  const landkreis = addr.county || addr.state_district || addr.city || null;
  return {
    landkreis,
    raw: addr,
    displayName: data.display_name,
  };
}

// ---------------------------------------------------------------------------
// Generic WFS helpers - shared by the Schutzgebiete and Biotopkartierung
// datasets, since both are plain GeoServer-style WFS services.
// ---------------------------------------------------------------------------

const layerNameCache = new Map(); // wfsBase -> Promise<string[]>

async function getAllLayerNames(wfsBase) {
  if (layerNameCache.has(wfsBase)) return layerNameCache.get(wfsBase);

  const promise = (async () => {
    const url = `${wfsBase}?service=WFS&version=2.0.0&request=GetCapabilities`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`WFS GetCapabilities failed for ${wfsBase} (${res.status})`);
    const xmlText = await res.text();
    const xml = new DOMParser().parseFromString(xmlText, "application/xml");
    return Array.from(xml.getElementsByTagNameNS("*", "Name")).map((n) => n.textContent.trim());  })();

  layerNameCache.set(wfsBase, promise);
  return promise;
}

/** Picks the first layer name containing `hint` (case-insensitive), or any fallback hints. */
function pickLayer(names, ...hints) {
  for (const hint of hints) {
    const match = names.find((n) => n.toLowerCase().includes(hint.toLowerCase()));
    if (match) return match;
  }
  return null;
}

async function wfsGetFeature(wfsBase, typeName, cqlFilter) {
  const params = new URLSearchParams({
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typeNames: typeName,
    outputFormat: "application/json",
    srsName: "EPSG:4326",
    CQL_FILTER: cqlFilter,
  });
  
  const url = `${wfsBase}?${params.toString()}`;
  console.log(`🌐 Sending WFS Request for ${typeName}:`, url); // <--- This prints the clickable URL
  
  const res = await fetch(url);
  
  if (!res.ok) {
    const errorText = await res.text();
    console.error(`❌ Server Error for ${typeName}:`, errorText); // <--- This prints the server's rejection reason
    throw new Error(`WFS GetFeature failed for ${typeName} (${res.status})`);
  }
  
  const data = await res.json();
  console.log(`✅ Server Response for ${typeName}:`, data); // <--- This prints the features found
  return data;
}

// ---------------------------------------------------------------------------
// FFH / SPA / Naturschutzgebiete lookup (js/config.js: SCHUTZGEBIETE_WFS_BASE)
// ---------------------------------------------------------------------------

let schutzgebieteLayers = null;

async function discoverSchutzgebieteLayers() {
  if (schutzgebieteLayers) return schutzgebieteLayers;
  const names = await getAllLayerNames(CONFIG.SCHUTZGEBIETE_WFS_BASE);

  schutzgebieteLayers = {
    ffh: pickLayer(names, CONFIG.FFH_TYPENAME_HINT, "flora-fauna-habitat"),
    spa: pickLayer(names, CONFIG.SPA_TYPENAME_HINT, "vogelschutz"),
    nsg: pickLayer(names, CONFIG.NSG_TYPENAME_HINT, "nsg"),
    allNames: names,
  };

  const missing = ["ffh", "spa", "nsg"].filter((k) => !schutzgebieteLayers[k]);
  if (missing.length) {
    console.warn(
      `Could not auto-detect layer name(s) for: ${missing.join(", ")}. ` +
        `All available Schutzgebiete layer names:`,
      names
    );
  }
  return schutzgebieteLayers;
}

/**
 * Checks whether a point is inside, or within CONFIG.NEAR_RADIUS_M of,
 * an FFH-Gebiet (Flora-Fauna-Habitat), SPA-Gebiet (Vogelschutzgebiet), or
 * Naturschutzgebiet. Two WFS queries per layer (INTERSECTS for "inside",
 * DWITHIN for "nearby") so no client-side geometry math is needed.
 */
export async function checkProtectedAreas(lat, lon) {
  const { ffh, spa, nsg } = await discoverSchutzgebieteLayers();
  const point = `POINT(${lon} ${lat})`;
  const geomProp = CONFIG.GEOMETRY_PROPERTY;

  async function checkLayer(typeName, label) {
    if (!typeName) {
      return { label, checked: false, reason: "layer name not found - see console" };
    }
    const insideFilter = `INTERSECTS(${geomProp}, SRID=4326;${point})`;
    const nearFilter = `DWITHIN(${geomProp}, SRID=4326;${point}, ${CONFIG.NEAR_RADIUS_M}, meters)`;

    const [insideResult, nearResult] = await Promise.all([
      wfsGetFeature(CONFIG.SCHUTZGEBIETE_WFS_BASE, typeName, insideFilter).catch(() => null),
      wfsGetFeature(CONFIG.SCHUTZGEBIETE_WFS_BASE, typeName, nearFilter).catch(() => null),
    ]);

    const insideFeatures = insideResult?.features ?? [];
    const nearFeatures = nearResult?.features ?? [];

    return {
      label,
      checked: true,
      inside: insideFeatures.length > 0,
      near: nearFeatures.length > 0,
      areaNames: [...new Set(nearFeatures.map((f) => f.properties?.NAME || f.properties?.name).filter(Boolean))],
    };
  }

  const [ffhResult, spaResult, nsgResult] = await Promise.all([
    checkLayer(ffh, "FFH-Gebiet (Flora-Fauna-Habitat-Gebiet)"),
    checkLayer(spa, "SPA-Gebiet (Vogelschutzgebiet)"),
    checkLayer(nsg, "Naturschutzgebiet"),
  ]);

  return { ffh: ffhResult, spa: spaResult, nsg: nsgResult };
}

// ---------------------------------------------------------------------------
// Biotopkartierung (Stadt / Flachland / Alpen) - tells us whether the point
// sits in alpine, lowland, or urban terrain, per LfU's own classification.
// Used mainly to decide whether alpine-specific species (Gamswild,
// Raufußhühner) belong in the letter's wording.
// ---------------------------------------------------------------------------

let biotopLayers = null;

async function discoverBiotopLayers() {
  if (biotopLayers) return biotopLayers;
  const names = await getAllLayerNames(CONFIG.BIOTOPKARTIERUNG_WFS_BASE);

  biotopLayers = {
    stadt: pickLayer(names, CONFIG.BIOTOP_STADT_HINT),
    flachland: pickLayer(names, CONFIG.BIOTOP_FLACHLAND_HINT, "tiefland"),
    alpen: pickLayer(names, CONFIG.BIOTOP_ALPEN_HINT),
    allNames: names,
  };

  const missing = ["stadt", "flachland", "alpen"].filter((k) => !biotopLayers[k]);
  if (missing.length) {
    console.warn(
      `Could not auto-detect Biotopkartierung layer name(s) for: ${missing.join(", ")}. ` +
        `All available Biotopkartierung layer names:`,
      names
    );
  }
  return biotopLayers;
}

/**
 * Returns which Biotopkartierung zone(s) the point falls in. Point-only
 * INTERSECTS check (no "near" radius - this classifies the terrain the
 * fence itself sits in, not a surrounding area).
 */
export async function checkBiotopkartierung(lat, lon) {
  const { stadt, flachland, alpen } = await discoverBiotopLayers();
  const point = `POINT(${lon} ${lat})`;
  const geomProp = CONFIG.GEOMETRY_PROPERTY;

  async function checkLayer(typeName, label, key) {
    if (!typeName) return { key, label, checked: false, matched: false, reason: "layer name not found - see console" };
    const filter = `INTERSECTS(${geomProp}, SRID=4326;${point})`;
    const result = await wfsGetFeature(CONFIG.BIOTOPKARTIERUNG_WFS_BASE, typeName, filter).catch(() => null);
    const features = result?.features ?? [];
    return { key, label, checked: true, matched: features.length > 0 };
  }

  const results = await Promise.all([
    checkLayer(stadt, "Biotopkartierung Stadt", "stadt"),
    checkLayer(flachland, "Biotopkartierung Flachland", "flachland"),
    checkLayer(alpen, "Biotopkartierung Alpen", "alpen"),
  ]);

  const matched = results.find((r) => r.matched);
  return {
    results,
    isAlpine: results.find((r) => r.key === "alpen")?.matched ?? false,
    matchedZone: matched?.key ?? null,
  };
}
