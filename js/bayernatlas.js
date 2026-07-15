// js/bayernatlas.js

// URL-encode the WMS server addresses so BayernAtlas can read them
const SCHUTZGEBIETE_WMS = "https%3A%2F%2Fwww.lfu.bayern.de%2Fgdi%2Fwms%2Fnatur%2Fschutzgebiete";
const BIOTOP_WMS = "https%3A%2F%2Fwww.lfu.bayern.de%2Fgdi%2Fwms%2Fnatur%2Fbiotopkartierung";

/**
 * Builds the URL for the free BayernAtlas.
 * Uses the standard map (atkis) + Nature Reserve layers + Alpine Biotopes.
 */
export function buildBayernAtlasUrl(lat, lon) {
  const layers = [
    "atkis", 
    `${SCHUTZGEBIETE_WMS}||fauna_flora_habitat_gebiet||FFH-Gebiete`,
    `${SCHUTZGEBIETE_WMS}||vogelschutzgebiet||Vogelschutzgebiete`,
    `${SCHUTZGEBIETE_WMS}||naturschutzgebiet||Naturschutzgebiete`,
    `${BIOTOP_WMS}||biotopkartierung_alpen||Biotopkartierung (Alpen)`
  ].join(",");

  return `https://atlas.bayern.de/?c=${lon},${lat}&z=14&crh=true&l=${layers}`;
}

/**
 * Builds the URL for BayernAtlas Plus.
 * Uses the standard map (atkis) which automatically turns into the ALKIS-Flurkarte 
 * (including parcel numbers and boundaries) when zoomed to z=17.
 */
export function buildBayernAtlasPlusUrl(lat, lon) {
  const layers = [
    "atkis", // Use atkis to prevent the orange crash error
    `${SCHUTZGEBIETE_WMS}||fauna_flora_habitat_gebiet||FFH-Gebiete`,
    `${SCHUTZGEBIETE_WMS}||vogelschutzgebiet||Vogelschutzgebiete`,
    `${SCHUTZGEBIETE_WMS}||naturschutzgebiet||Naturschutzgebiete`,
    `${BIOTOP_WMS}||biotopkartierung_alpen||Biotopkartierung (Alpen)`
  ].join(",");

  return `https://atlas.bayern.de/plus/?c=${lon},${lat}&z=17&crh=true&l=${layers}`;
}
