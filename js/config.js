// ---------------------------------------------------------------------------
// Central configuration. These are the only values you should need to touch
// when a public endpoint changes or when you get better information.
// ---------------------------------------------------------------------------

export const CONFIG = {
  // Bavarian LfU (Landesamt für Umwelt) protection-area WFS.
  // Public, no login, CC BY 4.0. VERIFY once online: the exact typeNames
  // can shift; app.js auto-discovers them from GetCapabilities on first use
  // (see js/geo.js -> discoverLayerNames), so you normally don't need to
  // edit this by hand. If discovery fails, look up the current typeNames at
  // https://www.lfu.bayern.de/gdi/wfs/natur/schutzgebiete?service=WFS&request=GetCapabilities
  // and paste them into the *_TYPENAME_HINT values below.
  SCHUTZGEBIETE_WFS_BASE: "https://www.lfu.bayern.de/gdi/wfs/natur/schutzgebiete",
  FFH_TYPENAME_HINT: "fauna_flora_habitat_gebiet",
  SPA_TYPENAME_HINT: "vogelschutzgebiet",
  NSG_TYPENAME_HINT: "naturschutzgebiet",

  // Biotopkartierung WFS — separate dataset/endpoint from Schutzgebiete.
  // URL is a best guess following LfU's naming pattern and is UNVERIFIED
  // (built without live internet access) — confirm and correct once online,
  // e.g. by browsing https://www.lfu.bayern.de/gdi/wfs/natur/ for the actual
  // service name, or via the Bayern Atlas layer info panel for
  // "Biotopkartierung Stadt/Flachland/Alpen".
  BIOTOPKARTIERUNG_WFS_BASE: "https://www.lfu.bayern.de/gdi/wfs/natur/biotopkartierung",
  BIOTOP_STADT_HINT: "bio_sbk",
  BIOTOP_FLACHLAND_HINT: "bio_fbk",       
  BIOTOP_ALPEN_HINT: "bio_abk", // Note: This wasn't in your links, but following the naming pattern, Alpen is very likely "bio_abk" (Alpenbiotopkartierung).
  // Radius (in meters) that counts as "near" a protection area.
  NEAR_RADIUS_M: 5000,

  // Name of the geometry column in the WFS layers. GeoServer defaults vary
  // ("geom", "the_geom", "SHAPE", "geometry"...). VERIFY via a DescribeFeatureType
  // call once online (?service=WFS&request=DescribeFeatureType&typeName=...)
  // and adjust if the CQL_FILTER queries in geo.js come back empty/erroring.
  GEOMETRY_PROPERTY: "SHAPE",

  // Bavarian aerial imagery (DOP), public WMS, used as the satellite layer.
  // VERIFY this endpoint once online — Bayern reorganizes geoservices.bayern.de
  // occasionally. Fallback below is plain OpenStreetMap tiles, which always work.
  DOP_WMS_URL: "https://geoservices.bayern.de/od/wms/dop/v1/dop20",
  DOP_WMS_LAYER: "by_dop20c",

  // Reverse geocoding to identify the Landkreis (county) for a coordinate.
  // Nominatim (OpenStreetMap) - public, no key, but rate-limited to ~1 req/sec
  // and requires a descriptive User-Agent/Referer, which browsers send anyway.
  NOMINATIM_URL: "https://nominatim.openstreetmap.org/reverse",

  // Deep links to BayernAtlas / BayernAtlas Plus, centered on the fence
  // coordinates, so a click opens the right spot instead of a manual
  // search. Public, documented URL scheme (same one their own "Teilen"
  // button generates) - E/N are UTM32N (EPSG:25832) coordinates, converted
  // client-side from WGS84 lat/lon via proj4js.
  // VERIFY once online: the base path and param names below are built from
  // published documentation, not tested live in this sandbox. If the link
  // doesn't land in the right place, open BayernAtlas manually, use
  // "Teilen" to get a real link, and copy its param names/values here.
  BAYERNATLAS_BASE_URL: "https://geoportal.bayern.de/bayernatlas/",
  BAYERNATLAS_PLUS_BASE_URL: "https://geoportal.bayern.de/bayernatlas-plus/",
  BAYERNATLAS_DEFAULT_ZOOM: 15,

  // Default map center: Bavaria.
  DEFAULT_CENTER: [48.79, 11.5],
  DEFAULT_ZOOM: 7,
};
