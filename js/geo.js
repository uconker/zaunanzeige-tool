import { CONFIG } from "./config.js";

// ---------------------------------------------------------------------------
// Landkreis / responsible authority lookup
// ---------------------------------------------------------------------------

export async function findLandkreis(lat, lon) {
  const url = `${CONFIG.NOMINATIM_URL}?format=jsonv2&lat=${lat}&lon=${lon}&zoom=8&addressdetails=1`;
  const res = await fetch(url, { headers: { "Accept-Language": "de" } });
  if (!res.ok) throw new Error(`Nominatim request failed (${res.status})`);
  const data = await res.json();
  const addr = data.address || {};
  return {
    landkreis: addr.county || addr.state_district || addr.city || null,
    raw: addr,
    displayName: data.display_name,
  };
}

// ---------------------------------------------------------------------------
// Local GeoJSON & Turf.js Processing
// ---------------------------------------------------------------------------

const geojsonCache = {};

async function fetchLocalGeoJSON(fileName) {
  const url = `data/schutzgebiete/${fileName}`;
  if (geojsonCache[url]) return geojsonCache[url];
  
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    geojsonCache[url] = data;
    return data;
  } catch (e) {
    console.warn(`Fehler beim Laden von ${fileName}:`, e.message);
    return null; 
  }
}

export async function checkProtectedAreas(lat, lon) {
  // Turf uses standard GeoJSON axis order: [Longitude, Latitude]
  const pt = turf.point([lon, lat]);
  // Draw a digital 5km circle around the point
  const searchBuffer = turf.buffer(pt, CONFIG.NEAR_RADIUS_M / 1000, { units: 'kilometers' });

  async function checkLayer(fileName, label) {
    const geojson = await fetchLocalGeoJSON(fileName);
    if (!geojson) return { label, checked: false, reason: "Datei nicht gefunden", inside: false, near: false, areaNames: [] };

    let inside = false;
    let near = false;
    const areaNames = new Set();

    // Loop through every polygon in the downloaded file
    turf.featureEach(geojson, (feature) => {
      // Mapshaper sometimes alters case on export
      const name = feature.properties?.NAME || feature.properties?.name || feature.properties?.Name;
      
      if (turf.booleanIntersects(feature, pt)) {
        inside = true;
        near = true;
        if (name) areaNames.add(name);
      } else if (turf.booleanIntersects(feature, searchBuffer)) {
        near = true;
        if (name) areaNames.add(name);
      }
    });

    return {
      label,
      checked: true,
      inside,
      near,
      areaNames: Array.from(areaNames).filter(Boolean)
    };
  }

  // Changed extensions from .geojson to .json to match Mapshaper's export behavior
  const [ffh, spa, nsg] = await Promise.all([
    checkLayer("ffh.json", "FFH-Gebiet (Flora-Fauna-Habitat-Gebiet)"),
    checkLayer("spa.json", "SPA-Gebiet (Vogelschutzgebiet)"),
    checkLayer("nsg.json", "Naturschutzgebiet")
  ]);

  return { ffh, spa, nsg };
}

// ---------------------------------------------------------------------------
// Biotopkartierung (Bypassed)
// ---------------------------------------------------------------------------

export async function checkBiotopkartierung(lat, lon) {
  return {
    results: [],
    isAlpine: false,
    matchedZone: null,
    error: "WFS-Dienst vom LfU nicht verfügbar (Datensatz existiert nur als Download)."
  };
}
