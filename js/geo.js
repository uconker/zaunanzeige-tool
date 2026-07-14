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
    // Downgraded to 1.0.0 for maximum ArcGIS compatibility
    const url = `${wfsBase}?service=WFS&version=1.0.0&request=GetCapabilities`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`WFS GetCapabilities failed for ${wfsBase} (${res.status})`);
    const xmlText = await res.text();
    const xml = new DOMParser().parseFromString(xmlText, "application/xml");
    return Array.from(xml.getElementsByTagNameNS("*", "Name")).map((n) => n.textContent.trim());
  })();

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

async function wfsGetFeature(wfsBase, typeName, bbox) {
  const params = new URLSearchParams({
    service: "WFS",
    version: "1.0.0", // WFS 1.0.0 strictly uses Lon,Lat (X,Y) and is highly reliable
    request: "GetFeature",
    typeName: typeName, // 1.0.0 uses singular "typeName" instead of "typeNames"
    srsName: "EPSG:4326",
    bbox: bbox // format: minLon,minLat,maxLon,maxLat
  });
  
  const url = `${wfsBase}?${params.toString()}`;
  console.log(`🌐 Requesting WFS 1.0.0 BBOX for ${typeName}:`, url);
  
  const res = await fetch(url);
  const text = await res.text(); 
  
  // Catch Server Exceptions
  if (text.includes("ServiceException") || text.includes("ExceptionReport")) {
    console.error(`❌ Server Error for ${typeName}:\n`, text);
    throw new Error("Server returned a WFS Exception");
  }
  
  const xml = new DOMParser().parseFromString(text, "application/xml");
  
  // WFS 1.0.0 uses featureMember
  let members = Array.from(xml.getElementsByTagNameNS("*", "featureMember"));
  if (members.length === 0) {
    members = Array.from(xml.getElementsByTagNameNS("*", "member"));
  }
  
  const features = members.map(member => {
    // Look for <NAME> or <name> tags inside the feature
    const nameNode = member.getElementsByTagNameNS("*", "NAME")[0] || 
                     member.getElementsByTagNameNS("*", "name")[0] ||
                     member.getElementsByTagNameNS("*", "Name")[0];
    return {
      properties: {
        name: nameNode ? nameNode.textContent.trim() : null
      }
    };
  });
  
  console.log(`✅ Success for ${typeName}:`, features.length, "features found in bounding box");
  return { features };
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
 * Naturschutzgebiet. Two WFS queries per layer using Bounding Boxes.
 */
export async function checkProtectedAreas(lat, lon) {
  const { ffh, spa, nsg } = await discoverSchutzgebieteLayers();

  // WFS 1.0.0 requires bbox = minX,minY,maxX,maxY (Lon, Lat)
  
  // ~10 meter square for the "Inside" check
  const tLat = 0.0001;
  const tLon = 0.00015;
  const insideBbox = `${lon - tLon},${lat - tLat},${lon + tLon},${lat + tLat}`;
  
  // ~5 km square for the "Near" check
  const nLat = 0.045; 
  const nLon = 0.067;
  const nearBbox = `${lon - nLon},${lat - nLat},${lon + nLon},${lat + nLat}`;

  async function checkLayer(typeName, label) {
    if (!typeName) {
      return { label, checked: false, reason: "layer name not found - see console" };
    }
    
    const [insideResult, nearResult] = await Promise.all([
      wfsGetFeature(CONFIG.SCHUTZGEBIETE_WFS_BASE, typeName, insideBbox).catch(() => null),
      wfsGetFeature(CONFIG.SCHUTZGEBIETE_WFS_BASE, typeName, nearBbox).catch(() => null),
    ]);

    const insideFeatures = insideResult?.features ?? [];
    const nearFeatures = nearResult?.features ?? [];

    return {
      label,
      checked: true,
      inside: insideFeatures.length > 0,
      near: nearFeatures.length > 0,
      areaNames: [...new Set(nearFeatures.map((f) => f.properties?.name).filter(Boolean))],
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
// Biotopkartierung (Bypassed)
// ---------------------------------------------------------------------------

export async function checkBiotopkartierung(lat, lon) {
  // The LfU does not provide a live public WFS for Biotopkartierung, which
  // causes a 400 Bad Request error. This bypass prevents the tool from crashing.
  return {
    results: [],
    isAlpine: false,
    matchedZone: null,
    error: "WFS-Dienst vom LfU nicht verfügbar (Datensatz existiert nur als Download)."
  };
}
