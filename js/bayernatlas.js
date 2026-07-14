import { CONFIG } from "./config.js";

// EPSG:25832 = ETRS89 / UTM zone 32N, the coordinate system BayernAtlas
// URLs use for their E/N parameters.
proj4.defs("EPSG:25832", "+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs");

function toUtm32(lat, lon) {
  const [E, N] = proj4("EPSG:4326", "EPSG:25832", [lon, lat]);
  return { E: Math.round(E), N: Math.round(N) };
}

function buildUrl(baseUrl, lat, lon) {
  const { E, N } = toUtm32(lat, lon);
  const params = new URLSearchParams({
    lang: "de",
    topic: "ba",
    bgLayer: "luftbild",
    E: String(E),
    N: String(N),
    zoom: String(CONFIG.BAYERNATLAS_DEFAULT_ZOOM),
  });
  return `${baseUrl}?${params.toString()}`;
}

export function buildBayernAtlasUrl(lat, lon) {
  return buildUrl(CONFIG.BAYERNATLAS_BASE_URL, lat, lon);
}

export function buildBayernAtlasPlusUrl(lat, lon) {
  return buildUrl(CONFIG.BAYERNATLAS_PLUS_BASE_URL, lat, lon);
}
