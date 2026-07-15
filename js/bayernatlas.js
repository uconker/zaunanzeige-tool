// js/bayernatlas.js

// We URL-encode the LfU's WMS server address once so both functions can use it
const LFU_WMS = "https%3A%2F%2Fwww.lfu.bayern.de%2Fgdi%2Fwms%2Fnatur%2Fschutzgebiete";

/**
 * Builds the URL for the free BayernAtlas.
 * Uses the standard map (atkis) + Nature Reserve layers.
 */
export function buildBayernAtlasUrl(lat, lon) {
  const layers = [
    "atkis", 
    `${LFU_WMS}||fauna_flora_habitat_gebiet||FFH-Gebiete`,
    `${LFU_WMS}||vogelschutzgebiet||Vogelschutzgebiete`,
    `${LFU_WMS}||naturschutzgebiet||Naturschutzgebiete`
  ].join(",");

  return `https://atlas.bayern.de/?c=${lon},${lat}&z=14&crh=true&l=${layers}`;
}

/**
 * Builds the URL for BayernAtlas Plus.
 * Uses the Flurkarte (parzellarkarte) + Nature Reserve layers.
 * Zooms in much closer (z=17) to clearly show the Flurstück boundaries.
 */
export function buildBayernAtlasPlusUrl(lat, lon) {
  const layers = [
    "parzellarkarte", // This forces the Flurstück/property boundaries to load
    `${LFU_WMS}||fauna_flora_habitat_gebiet||FFH-Gebiete`,
    `${LFU_WMS}||vogelschutzgebiet||Vogelschutzgebiete`,
    `${LFU_WMS}||naturschutzgebiet||Naturschutzgebiete`
  ].join(",");

  return `https://atlas.bayern.de/plus/?c=${lon},${lat}&z=17&crh=true&l=${layers}`;
}
