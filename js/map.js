import { CONFIG } from "./config.js";

let map = null;
let marker = null;
let radiusCircle = null;

export function initMap(elementId) {
  map = L.map(elementId).setView(CONFIG.DEFAULT_CENTER, CONFIG.DEFAULT_ZOOM);

  // Plain OSM tiles as a reliable base layer.
  const osm = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 19,
  });

  // Bavarian aerial imagery (DOP) as a WMS overlay, if reachable. VERIFY
  // endpoint/layer name in config.js - falls back silently to OSM alone.
  const dop = L.tileLayer.wms(CONFIG.DOP_WMS_URL, {
    layers: CONFIG.DOP_WMS_LAYER,
    format: "image/png",
    transparent: false,
    attribution: "Bayerische Vermessungsverwaltung",
  });

  osm.addTo(map);
  const baseLayers = { "OpenStreetMap": osm, "Luftbild (Bayern DOP)": dop };
  L.control.layers(baseLayers).addTo(map);

  return map;
}

export function setPoint(lat, lon, { radiusM = null } = {}) {
  if (!map) throw new Error("Call initMap() first");

  if (marker) map.removeLayer(marker);
  if (radiusCircle) map.removeLayer(radiusCircle);

  marker = L.marker([lat, lon]).addTo(map);
  map.setView([lat, lon], 17);

  if (radiusM) {
    radiusCircle = L.circle([lat, lon], {
      radius: radiusM,
      color: "#7a5c3e",
      weight: 1,
      fillOpacity: 0.05,
    }).addTo(map);
  }
}

/**
 * Exports the current map view as a PNG data URL, using leaflet-image.
 * Useful to attach a "satellite image confirming the coordinates" to the
 * letter without a manual screenshot.
 */
export function exportMapImage() {
  return new Promise((resolve, reject) => {
    if (!map) return reject(new Error("Call initMap() first"));
    leafletImage(map, (err, canvas) => {
      if (err) return reject(err);
      resolve(canvas.toDataURL("image/png"));
    });
  });
}
