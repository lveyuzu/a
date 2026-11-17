// Registry of every map layer the atlas can draw that is NOT pipeline output.
// These layers are for looking, never for scoring: each one is a rendered picture of a data product,
// served by the agency that made it. The fields below are what the interface shows in the layer panel
// and on the Method & data page, so a layer cannot be added without saying where it comes from.

export type LayerRole = "base" | "observation" | "reference";

export interface MapLayerDef {
  id: string;
  role: LayerRole;
  name: string;
  /** One sentence: why a reader would turn this on. */
  purpose: string;
  /** Agency or service that renders and serves the tiles. */
  source: string;
  /** Instrument / mission / product behind the picture. */
  product: string;
  resolution: string;
  /** What the colours mean and in which unit. */
  units: string;
  /** "static" | "daily" | "monthly" | "yearly": how the time dimension is addressed. */
  time: "static" | "daily" | "monthly" | "yearly";
  /** Fixed date for static composites, or a note on the period covered. */
  period: string;
  /** Tile URL template. {time} is replaced with an ISO date. */
  tiles: string;
  maxzoom: number;
  attribution: string;
  /** Official legend image published with the layer, when there is one. */
  legend?: string;
  /** Does the scoring pipeline read the same product (as numbers, not as this picture)? */
  scored?: string;
  limits: string;
  /** Earliest date the service holds. */
  from?: string;
  /** Typical delay before a date is available, in days. */
  lagDays?: number;
  info: string;
}

const GIBS = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best";
const gibs = (layer: string, set: string, ext: string, timed = true) =>
  `${GIBS}/${layer}/default/${timed ? "{time}/" : ""}GoogleMapsCompatible_${set}/{z}/{y}/{x}.${ext}`;
const GIBS_ATTR = "NASA EOSDIS GIBS";
const legend = (n: string) => `https://gibs.earthdata.nasa.gov/legends/${n}_H.svg`;

export const ATLAS_DEM = {
  tiles: "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
  maxzoom: 12,
  attribution: "Terrain Tiles (Mapzen / AWS Open Data): SRTM, GMTED2010, ETOPO1 and others",
};

export const EARTH_LAYERS: MapLayerDef[] = [
  {
    id: "atlas", role: "base", name: "Atlas relief",
    purpose: "Shows landform with no vegetation or cloud in the way, so slope and relief can be read under the similarity layer.",
    source: "Drawn in the browser from Terrain Tiles on AWS Open Data", product: "Merged global elevation: SRTM, GMTED2010, ETOPO1 bathymetry and regional models",
    resolution: "about 30 m to 1 km depending on zoom and region", units: "Hill shading from elevation in metres; tint steps at 0, 500, 1500, 3000, 4500 and 6000 m",
    time: "static", period: "Source models date from 2000 to 2013", tiles: ATLAS_DEM.tiles, maxzoom: ATLAS_DEM.maxzoom, attribution: ATLAS_DEM.attribution,
    limits: "A different elevation model from the one that is scored (ETOPO 2022 at 1.85 km). Use it to read the landscape, not to check a slope value.",
    info: "https://registry.opendata.aws/terrain-tiles/",
  },
  {
    id: "s2", role: "base", name: "Sentinel-2 cloudless",
    purpose: "True-colour ground detail down to field scale: lava flows, dunes, playas, snow.",
    source: "EOX IT Services", product: "Sentinel-2 MSI Level-2A, cloud-free annual composite", resolution: "10 m", units: "True colour (red, green, blue reflectance)",
    time: "static", period: "Composite of 2020 acquisitions",
    tiles: "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg", maxzoom: 13,
    attribution: "Sentinel-2 cloudless 2020 by EOX (contains modified Copernicus Sentinel data 2020)",
    limits: "A mosaic of many dates. Snow lines and seasonal colour are not from a single day.", info: "https://s2maps.eu",
  },
  {
    id: "bluemarble", role: "base", name: "Blue Marble with relief",
    purpose: "A calm global picture of land cover, relief and sea floor for small-scale views.",
    source: GIBS_ATTR, product: "MODIS Blue Marble Next Generation with shaded relief and bathymetry", resolution: "500 m", units: "True colour with added hill shading",
    time: "static", period: "Composite, 2004", tiles: gibs("BlueMarble_ShadedRelief_Bathymetry", "Level8", "jpeg", false), maxzoom: 8, attribution: GIBS_ATTR + " · Blue Marble (NASA Earth Observatory)",
    limits: "Too coarse below about 1 km. A 2004 composite, so it does not show recent change.", info: "https://nasa-gibs.github.io/gibs-api-docs/",
  },
  {
    id: "modis", role: "base", name: "MODIS true colour, by day",
    purpose: "What the surface and the weather over it looked like on one chosen day, back to 2000.",
    source: GIBS_ATTR, product: "Terra MODIS corrected reflectance, bands 1-4-3", resolution: "250 m", units: "True colour (corrected reflectance, not surface reflectance)",
    time: "daily", period: "Daily since 24 Feb 2000", from: "2000-02-24", lagDays: 1,
    tiles: gibs("MODIS_Terra_CorrectedReflectance_TrueColor", "Level9", "jpeg"), maxzoom: 9, attribution: GIBS_ATTR + " · MODIS Terra",
    limits: "Clouds, swath gaps near the equator and polar night are all in the picture. Rendered for viewing, not calibrated for analysis.",
    info: "https://nasa-gibs.github.io/gibs-api-docs/available-visualizations/",
  },

  {
    id: "lst_day", role: "observation", name: "Land surface temperature, day",
    purpose: "The monthly daytime skin temperature that sharpens the thermal dimension.",
    source: GIBS_ATTR, product: "Terra MODIS MOD11C3 monthly land surface temperature (Level 3)", resolution: "0.05° (about 5.6 km)", units: "Kelvin, see legend",
    time: "monthly", period: "Monthly since Mar 2000", from: "2000-03-01", lagDays: 60,
    tiles: gibs("MODIS_Terra_L3_Land_Surface_Temp_Monthly_Day", "Level6", "png"), maxzoom: 6, attribution: GIBS_ATTR + " · MODIS Terra LST", legend: legend("MODIS_Land_Surface_Temp"),
    scored: "Thermal: the pipeline decodes this product month by month with the published colour table.",
    limits: "Clear-sky only, so cloudy regions are biased warm by day. One month is not the multi-year mean that is scored.", info: "https://lpdaac.usgs.gov/products/mod11c3v061/",
  },
  {
    id: "lst_night", role: "observation", name: "Land surface temperature, night",
    purpose: "Night-time skin temperature; with the day layer it shows the daily swing.",
    source: GIBS_ATTR, product: "Terra MODIS MOD11C3 monthly land surface temperature (Level 3)", resolution: "0.05° (about 5.6 km)", units: "Kelvin, see legend",
    time: "monthly", period: "Monthly since Mar 2000", from: "2000-03-01", lagDays: 60,
    tiles: gibs("MODIS_Terra_L3_Land_Surface_Temp_Monthly_Night", "Level6", "png"), maxzoom: 6, attribution: GIBS_ATTR + " · MODIS Terra LST", legend: legend("MODIS_Land_Surface_Temp"),
    scored: "Thermal: used with the day product for the diurnal range where MODIS detail exists.",
    limits: "Clear-sky only. Overpass near 22:30 local time, not the coldest hour.", info: "https://lpdaac.usgs.gov/products/mod11c3v061/",
  },
  {
    id: "ndvi", role: "observation", name: "Vegetation index",
    purpose: "Where the ground is bare. Analogs for the Moon and Mars need almost no plant cover.",
    source: GIBS_ATTR, product: "Terra MODIS MOD13 monthly NDVI (Level 3)", resolution: "1 km", units: "NDVI, unitless, see legend",
    time: "monthly", period: "Monthly since Mar 2000", from: "2000-03-01", lagDays: 60,
    tiles: gibs("MODIS_Terra_L3_NDVI_Monthly", "Level7", "png"), maxzoom: 7, attribution: GIBS_ATTR + " · MODIS Terra NDVI", legend: legend("MODIS_L3_NDVI"),
    scored: "Surface: the pipeline takes the yearly peak of this product as the bare-ground measure.",
    limits: "Low NDVI also means snow, water or cloud shadow. Read it with the true-colour base.", info: "https://lpdaac.usgs.gov/products/mod13a3v061/",
  },
  {
    id: "albedo", role: "observation", name: "Shortwave albedo",
    purpose: "How bright the surface is to sunlight, the quantity compared with TES and lunar albedo.",
    source: GIBS_ATTR, product: "MODIS MCD43 black-sky shortwave albedo (Level 3, Terra and Aqua)", resolution: "1 km", units: "Albedo 0 to 1, see legend",
    time: "daily", period: "Daily since 2000", from: "2001-06-26", lagDays: 10,
    tiles: gibs("MODIS_Combined_L3_Black_Sky_Albedo_Daily", "Level8", "png"), maxzoom: 8, attribution: GIBS_ATTR + " · MODIS MCD43", legend: legend("MODIS_Combined_Albedo_Daily"),
    scored: "Surface: seven dates of this product are decoded and averaged.",
    limits: "Gaps under persistent cloud and in polar night. Band limits differ from the Mars and Moon instruments.", info: "https://lpdaac.usgs.gov/products/mcd43a3v061/",
  },
  {
    id: "landcover", role: "observation", name: "Land cover classes",
    purpose: "Which cells are barren, ice, water or vegetated; the land mask of the scan.",
    source: GIBS_ATTR, product: "MODIS MCD12Q1 IGBP land cover type (Level 3, annual)", resolution: "500 m", units: "17 IGBP classes, see legend",
    time: "yearly", period: "Annual, 2001 to 2024", from: "2001-01-01", lagDays: 700,
    tiles: gibs("MODIS_Combined_L3_IGBP_Land_Cover_Type_Annual", "Level8", "png"), maxzoom: 8, attribution: GIBS_ATTR + " · MODIS MCD12Q1", legend: legend("MODIS_IGBP_Land_Cover_Type"),
    scored: "Land mask and the barren and ice fractions.",
    limits: "A classification, not a measurement: sparse desert scrub and bare rock can share a class.", info: "https://lpdaac.usgs.gov/products/mcd12q1v061/",
  },
  {
    id: "precip", role: "observation", name: "Precipitation, by day",
    purpose: "Whether and where it rained on a given day; storms that cross a hyper-arid site are visible.",
    source: GIBS_ATTR, product: "GPM IMERG precipitation rate (Level 3)", resolution: "0.1° (about 11 km)", units: "mm per hour, see legend",
    time: "daily", period: "Daily since Jun 2000", from: "2000-06-01", lagDays: 3,
    tiles: gibs("IMERG_Precipitation_Rate", "Level6", "png"), maxzoom: 6, attribution: GIBS_ATTR + " · GPM IMERG", legend: legend("GPM_Precipitation_Rate"),
    scored: "Aridity uses IMERG annual totals from NASA POWER. This layer is one day's rate, a different statistic.",
    limits: "A daily snapshot says nothing about the annual total. IMERG over-reads in the driest deserts.", info: "https://gpm.nasa.gov/data/imerg",
  },
  {
    id: "pressure", role: "observation", name: "Surface pressure",
    purpose: "Air pressure at the ground: high plateaus stand out as the closest Earth gets to thin air.",
    source: GIBS_ATTR, product: "MERRA-2 reanalysis, monthly surface pressure", resolution: "0.5° × 0.625°", units: "Pressure, see legend",
    time: "monthly", period: "Monthly, 1980 onward", from: "1980-01-01", lagDays: 120,
    tiles: gibs("MERRA2_Surface_Pressure_Monthly", "Level6", "png"), maxzoom: 6, attribution: GIBS_ATTR + " · NASA GMAO MERRA-2", legend: legend("MERRA2_Surface_Pressure_Monthly"),
    scored: "Atmosphere: MERRA-2 surface pressure, read through NASA POWER.",
    limits: "Model output on a coarse grid. Valleys and peaks inside one cell share a value.", info: "https://gmao.gsfc.nasa.gov/reanalysis/MERRA-2/",
  },
  {
    id: "tqv", role: "observation", name: "Column water vapour",
    purpose: "How much water the whole air column holds, the second half of the atmosphere dimension.",
    source: GIBS_ATTR, product: "MERRA-2 reanalysis, monthly total precipitable water vapour", resolution: "0.5° × 0.625°", units: "kg per m², see legend",
    time: "monthly", period: "Monthly, 1980 onward", from: "1980-01-01", lagDays: 120,
    tiles: gibs("MERRA2_Total_Precipitable_Water_Vapor_Monthly", "Level6", "png"), maxzoom: 6, attribution: GIBS_ATTR + " · NASA GMAO MERRA-2", legend: legend("MERRA2_Total_Precipitable_Water_Vapor_Monthly"),
    scored: "Atmosphere: MERRA-2 column water vapour, read through NASA POWER.",
    limits: "Model output, not a retrieval.", info: "https://gmao.gsfc.nasa.gov/reanalysis/MERRA-2/",
  },
  {
    id: "snow", role: "observation", name: "Snow cover, by day",
    purpose: "Seasonal snow that hides the surface a field team would actually work on.",
    source: GIBS_ATTR, product: "Terra MODIS MOD10 NDSI snow cover (Level 3)", resolution: "500 m", units: "NDSI snow cover 0 to 100, see legend",
    time: "daily", period: "Daily since Feb 2000", from: "2000-02-24", lagDays: 2,
    tiles: gibs("MODIS_Terra_NDSI_Snow_Cover", "Level8", "png"), maxzoom: 8, attribution: GIBS_ATTR + " · MODIS Terra snow (NSIDC)", legend: legend("MODIS_NDSI_Snow_Cover"),
    limits: "Not scored. Cloud hides snow; polar night has no data.", info: "https://nsidc.org/data/mod10a1",
  },
  {
    id: "hls", role: "observation", name: "Sentinel-2 passes, 30 m",
    purpose: "A dated Sentinel-2 view of a site: pick a pass to see the ground on that day.",
    source: GIBS_ATTR, product: "Harmonized Landsat Sentinel-2 (HLS S30), nadir BRDF-adjusted reflectance, from Sentinel-2 MSI", resolution: "30 m", units: "True colour (surface reflectance)",
    time: "daily", period: "Per pass since Nov 2015; a site is revisited every few days", from: "2015-11-28", lagDays: 8,
    tiles: gibs("HLS_S30_Nadir_BRDF_Adjusted_Reflectance", "Level12", "png"), maxzoom: 12, attribution: GIBS_ATTR + " · HLS (NASA LP DAAC, contains modified Copernicus Sentinel data)",
    limits: "Only the swaths flown that day are drawn; most of the globe is blank on any one date. Cloud is not removed.", info: "https://lpdaac.usgs.gov/products/hlss30v002/",
  },
  {
    id: "sar", role: "observation", name: "Sentinel-1 radar backscatter",
    purpose: "Surface roughness and structure seen by radar, through cloud and at night.",
    source: GIBS_ATTR, product: "OPERA RTC-S1: radiometric terrain-corrected C-band backscatter from Sentinel-1 (Level 2), false colour from VV and VH", resolution: "30 m", units: "False colour from co- and cross-polarised backscatter (gamma-nought); no numeric legend is published",
    time: "daily", period: "Per pass since Jan 2025", from: "2025-01-10", lagDays: 3,
    tiles: gibs("OPERA_L2_Radiometric_Terrain_Corrected_SAR_Sentinel-1", "Level12", "png"), maxzoom: 12, attribution: GIBS_ATTR + " · OPERA RTC-S1 (NASA JPL / ASF, contains modified Copernicus Sentinel data)",
    limits: "Brightness depends on roughness, moisture, slope facing, look angle and polarisation together. It is not a map of rock type, and two similar radar pictures do not show two surfaces are the same rock. Never scored.",
    info: "https://www.jpl.nasa.gov/go/opera/products/rtc-product/",
  },

  {
    id: "geology", role: "reference", name: "Geologic map units",
    purpose: "The mapped rock units and their boundaries, from the same compilation the geology dimension looks up.",
    source: "Macrostrat", product: "Macrostrat geologic map compilation (national and regional survey maps)", resolution: "Source maps from 1:50,000 to 1:50,000,000, switching with zoom", units: "Colour follows each source map's unit colours; identify a unit in the dossier",
    time: "static", period: "Compiled maps of many dates", tiles: "https://tiles.macrostrat.org/carto/{z}/{x}/{y}.png", maxzoom: 12,
    attribution: "Macrostrat (CC-BY 4.0) and the original map authors",
    scored: "Geology: the pipeline asks Macrostrat for the units at each listed site.",
    limits: "Boundaries are as drawn by the source maps and shift where maps of different scale meet. Coverage is thin in parts of Africa and Antarctica.",
    info: "https://macrostrat.org/map",
  },
];

/* ------------------------------------------------------------------ Moon and Mars */
// NASA Solar System Treks serves these as plate-carrée (equirectangular) tile pyramids.
// The app re-projects each tile to Web Mercator in the browser (see lib/trek.ts).

export interface BodyLayerDef {
  id: string;
  body: "moon" | "mars";
  role: "base" | "overlay";
  name: string;
  purpose: string;
  product: string;
  instrument: string;
  resolution: string;
  units: string;
  /** Trek product label. */
  label: string;
  ext: "jpg" | "png";
  maxLevel: number;
  /** Full URL prefix when the product is not under /tiles/{Body}/EQ. */
  prefix?: string;
  scored?: string;
  limits: string;
}

export const BODY_LAYERS: BodyLayerDef[] = [
  { id: "wac", body: "moon", role: "base", name: "LROC WAC mosaic", purpose: "The Moon in visible light, the usual orientation picture.",
    product: "LRO LROC Wide Angle Camera global mosaic v2 (303 px/deg)", instrument: "LRO LROC WAC", resolution: "100 m", units: "Visible reflectance, greyscale",
    label: "LRO_WAC_Mosaic_Global_303ppd_v02", ext: "jpg", maxLevel: 8,
    limits: "Mosaic of more than 15,000 images taken Nov 2009 to Feb 2011; sun angle varies across it. The poles are mostly shadow." },
  { id: "lola", body: "moon", role: "base", name: "LOLA colour relief", purpose: "Lunar topography from laser altimetry: basins, maria and highlands at a glance.",
    product: "LRO LOLA digital elevation model v4, colour hill shade (128 px/deg)", instrument: "LRO LOLA", resolution: "237 m", units: "Colour is elevation relative to a 1737.4 km sphere; the service publishes no numeric legend",
    label: "LRO_LOLA_ClrShade_Global_128ppd_v04", ext: "png", maxLevel: 5,
    scored: "Terrain: the pipeline samples the LOLA LDEM at 16 px/deg (1.90 km).",
    limits: "Read colours as relative height only. Altimetry through Sep 2011, interpolated between ground tracks." },
  { id: "moongeo", body: "moon", role: "overlay", name: "Geologic units", purpose: "The mapped lunar rock units, the source for each region's documented geology.",
    product: "USGS Unified Geologic Map of the Moon, 1:5,000,000 (Fortezzo et al. 2020)", instrument: "Compiled from six Apollo-era maps, SELENE and LRO data", resolution: "1:5,000,000", units: "Unit colours of the published map",
    label: "Unified_Geologic_Map_of_the_Moon_RASTER", ext: "png", maxLevel: 5,
    limits: "A 1:5M compilation. Not reliable for features smaller than a few kilometres." },
  { id: "rock", body: "moon", role: "overlay", name: "Diviner rock abundance", purpose: "Share of the surface covered by rocks, a hazard the terrain score cannot see.",
    product: "LRO Diviner Level 3 gridded rock abundance (Bandfield et al. 2011, 2016), 128 px/deg", instrument: "LRO Diviner radiometer", resolution: "237 m, latitudes 80°S to 80°N", units: "Areal fraction of rock, colourised; the service publishes no numeric legend",
    label: "Diviner_avg_RockAbundance", ext: "png", maxLevel: 6,
    limits: "No comparable rock-abundance product exists for Earth, so this cannot be scored. Mapping-orbit data, Oct 2009 to Oct 2011. Read colours as relative only." },

  { id: "viking", body: "mars", role: "base", name: "Viking colour mosaic", purpose: "Mars in approximate natural colour: bright dust, dark basalt, polar caps.",
    product: "Viking Orbiter MDIM 2.1 colour mosaic (232 m)", instrument: "Viking Orbiter Visual Imaging Subsystem", resolution: "232 m", units: "Approximate true colour",
    label: "Mars_Viking_MDIM21_ClrMosaic_global_232m", ext: "jpg", maxLevel: 7,
    limits: "1970s imaging; colour is merged from lower-resolution data. Surface dust has moved since." },
  { id: "mola", body: "mars", role: "base", name: "MOLA colour relief", purpose: "Martian topography from laser altimetry: the dichotomy, Tharsis, the basins.",
    product: "MGS MOLA MEGDR colour hill shade (463 m)", instrument: "MGS MOLA", resolution: "463 m", units: "Colour is elevation above the areoid; the service publishes no numeric legend",
    label: "Mars_MGS_MOLA_ClrShade_merge_global_463m", ext: "jpg", maxLevel: 7,
    scored: "Terrain: the pipeline samples the MOLA MEGDR at 32 px/deg (1.85 km).",
    limits: "Read colours as relative height only." },
  { id: "themis", body: "mars", role: "base", name: "THEMIS daytime infrared", purpose: "Sharpest global view of landforms: sun-warmed slopes are bright.",
    product: "Mars Odyssey THEMIS daytime infrared controlled mosaic v2 (100 m)", instrument: "Mars Odyssey THEMIS", resolution: "100 m, latitudes 65°S to 65°N", units: "Relative daytime surface temperature, greyscale",
    label: "THEMIS_DayIR_ControlledMosaics_100m_v2_oct2018", ext: "png", maxLevel: 9,
    limits: "Brightness mixes slope facing, albedo and thermal inertia. It is not a visible-light image. No coverage poleward of 65°." },
  { id: "marsgeo", body: "mars", role: "overlay", name: "Geologic units", purpose: "The mapped Martian rock units and their ages.",
    product: "USGS Geologic Map of Mars, SIM 3292, 1:20,000,000 (Tanaka et al. 2014)", instrument: "Compiled from MOLA, THEMIS, CTX and HRSC", resolution: "1:20,000,000", units: "Unit colours of the published map",
    label: "SIM3292_Global_Geology", ext: "png", maxLevel: 7,
    prefix: "https://trek.nasa.gov/mars/trekarcgis/rest/services/SIM3292_Global_Geology/MapServer/WMTS/tile/1.0.0/SIM3292_Global_Geology/default/default028mm",
    limits: "A 1:20M global map: units are hundreds of kilometres across." },
  { id: "tesalb", body: "mars", role: "overlay", name: "TES albedo", purpose: "Surface brightness, the Mars half of the albedo comparison.",
    product: "MGS TES bolometric albedo global mosaic (7.4 km)", instrument: "MGS TES", resolution: "7.4 km", units: "Lambert albedo, greyscale (brighter is higher)",
    label: "Mars_MGS_TES_Albedo_mosaic_global_7410m", ext: "png", maxLevel: 1,
    scored: "Surface: the pipeline reads TES bolometric albedo at each reference region.",
    limits: "Very coarse: one pixel is wider than Jezero's delta. Band 0.3 to 2.9 µm, narrower than the MODIS band." },
];

export const TREK_ATTR = "NASA Solar System Treks (JPL) · USGS Astrogeology";
export const bodyLayers = (body: "moon" | "mars", role?: "base" | "overlay") => BODY_LAYERS.filter((l) => l.body === body && (!role || l.role === role));
export const earthLayer = (id: string | null | undefined) => EARTH_LAYERS.find((l) => l.id === id);
export const earthLayers = (role: LayerRole) => EARTH_LAYERS.filter((l) => l.role === role);

/* ------------------------------------------------------------------ dates */
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Latest date a time-enabled layer is likely to hold, snapped to its period. */
export function latestDate(l: MapLayerDef, now = new Date()): string {
  if (l.time === "static") return "";
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - (l.lagDays ?? 2) * 86400000);
  return snapDate(l, iso(d));
}

/** Snap any date to the layer's period start (first of month, first of year) and clamp it to what exists. */
export function snapDate(l: MapLayerDef, date: string): string {
  if (l.time === "static") return "";
  let d = date;
  if (l.from && d < l.from) d = l.from;
  if (l.time === "monthly") d = d.slice(0, 7) + "-01";
  if (l.time === "yearly") d = d.slice(0, 4) + "-01-01";
  return d;
}

export function tileUrl(l: MapLayerDef, date: string): string {
  return l.tiles.replace("{time}", date || latestDate(l));
}

export function shiftDate(l: MapLayerDef, date: string, step: number): string {
  const d = new Date(date + "T00:00:00Z");
  if (l.time === "monthly") d.setUTCMonth(d.getUTCMonth() + step);
  else if (l.time === "yearly") d.setUTCFullYear(d.getUTCFullYear() + step);
  else d.setUTCDate(d.getUTCDate() + step);
  const out = snapDate(l, iso(d)), max = latestDate(l);
  return out > max ? max : out;
}

export function dateLabel(l: MapLayerDef, date: string): string {
  if (!date) return l.period;
  const d = new Date(date + "T00:00:00Z");
  const month = d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
  if (l.time === "yearly") return String(d.getUTCFullYear());
  if (l.time === "monthly") return `${month} ${d.getUTCFullYear()}`;
  return `${d.getUTCDate()} ${month} ${d.getUTCFullYear()}`;
}
