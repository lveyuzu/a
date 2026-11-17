// Outside data services that were examined for this atlas, and what was decided for each.
// The long form, with every field the project records per dataset, is docs/DATA_SOURCES.md.
// "Decision" uses four fixed words so the table can be scanned:
//   scored      numbers from this source enter the similarity score (unchanged from the original pipeline)
//   displayed   pictures from this source are drawn on maps; nothing from it is scored
//   searched    the catalogue is queried live for metadata; nothing is downloaded or scored
//   not used    examined and left out, with the reason

export type Decision = "scored" | "displayed" | "searched" | "not used";

export interface Assessed {
  name: string;
  agency: string;
  decision: Decision[];
  examined: string;
  outcome: string;
  access: string;
  url: string;
}

export const ASSESSED: Assessed[] = [
  {
    name: "NASA GIBS and Worldview", agency: "NASA EOSDIS", decision: ["displayed", "scored"],
    examined: "The WMTS endpoint in Web Mercator (1,330 layers on 14 Nov 2026), its time dimension, legends and colour tables.",
    outcome: "Two basemaps and eleven observation overlays are drawn from GIBS tiles, with date controls and the official legends. Five of them (MODIS land surface temperature by day and by night, NDVI, albedo, land cover) are the same products the pipeline already scores, decoded there to numbers with the published colour tables. The map tiles themselves are pictures and are never read as data.",
    access: "Open, no key. Tiles carry CORS headers.", url: "https://nasa-gibs.github.io/gibs-api-docs/",
  },
  {
    name: "NASA Planetary Data System", agency: "NASA PDS Geosciences Node, Imaging Node", decision: ["scored", "displayed"],
    examined: "Geosciences Node archives for MGS MOLA, LRO LOLA and LRO Diviner; the Orbital Data Explorer; global mosaics derived from PDS holdings.",
    outcome: "MOLA MEGDR, LOLA LDEM and two Diviner products stay the scored planetary references, with product identifiers kept. New in this version: global Moon and Mars mosaics built from PDS data (LROC WAC, LOLA, MOLA, THEMIS, Viking MDIM, TES albedo, the USGS geologic maps) are drawn on interactive maps through NASA Solar System Treks.",
    access: "Open, no key. Large tables are read by HTTP range request.", url: "https://pds.nasa.gov/",
  },
  {
    name: "LRO Diviner archive", agency: "NASA / UCLA / PDS Geosciences Node", decision: ["scored", "displayed"],
    examined: "Raw EDR and calibrated RDR records (2009 to June 2026), and the derived bundle: gridded GDR Level 2 and 3, global cumulative (GCP), polar cumulative (PCP), polar resource (PRP), regional cumulative (RCP), global high-resolution mosaics (GHRM) and emission phase function products.",
    outcome: "GCP (0.5° bolometric temperature by local time) and PRP (0.5 km polar annual mean, maximum and modelled ice-stability depth) remain the scored lunar thermal reference. The PRP cold-trap statistics, already computed but not shown before, now appear in each polar dossier. The Level 3 rock-abundance grid is displayed on the Moon map only: Earth has no comparable product, so it cannot be scored. RDR footprints were not used: they would need re-gridding for no gain at a 61 km window, and the archive notes a brightness-temperature problem under investigation.",
    access: "Open, no key.", url: "https://pds-geosciences.wustl.edu/missions/lro/diviner.htm",
  },
  {
    name: "Copernicus Data Space Ecosystem", agency: "ESA / European Commission", decision: ["searched", "not used"],
    examined: "The four interfaces: STAC and OData catalogues, Sentinel Hub processing and openEO; Sentinel-1 GRD and Sentinel-2 L2A collections; Copernicus DEM.",
    outcome: "The STAC catalogue is searched live from each dossier for recent Sentinel-2 scenes under 15% cloud and recent Sentinel-1 scenes, listing date, cloud, sun elevation, orbit, mode and polarisation. Sentinel Hub, openEO and product download all need an account token, which a static web page cannot hold without exposing it, so no Copernicus pixels are fetched. Pictures of the same acquisitions come from NASA GIBS instead (HLS S30 and OPERA RTC-S1).",
    access: "Catalogue search open; processing and download need a registered account and OAuth token.", url: "https://dataspace.copernicus.eu/",
  },
  {
    name: "JAXA G-Portal and JAXA Earth API", agency: "JAXA", decision: ["not used"],
    examined: "G-Portal product search (GCOM-C SGLI, GCOM-W AMSR2, GSMaP, ALOS) and the public JAXA Earth API catalogue of cloud-optimised GeoTIFFs.",
    outcome: "G-Portal downloads need a registered account, so it is not part of the pipeline, which uses only sources that need no login. The JAXA Earth API is open and holds GCOM-C land surface temperature and NDVI, GSMaP rainfall and the AW3D30 elevation model. These are the best candidates for an independent cross-check of the MODIS and IMERG inputs at the 122 listed sites. That is an analytical change needing a pipeline run and validation, so it is recorded as the recommended next step and not done here.",
    access: "G-Portal: registration. JAXA Earth API: open.", url: "https://www.gportal.jaxa.jp/gpr/?lang=en",
  },
  {
    name: "ESA Open Science Data Catalogue", agency: "ESA EarthCODE", decision: ["not used"],
    examined: "The static STAC catalogue (366 products on 14 Nov 2026) of results from ESA-funded research projects.",
    outcome: "Most entries are regional or thematic research products: polar ice elevation, sea ice, Alpine snow, ocean colour. None supplies a global land variable at a resolution that matches a scored dimension. The CALIPSO dust optical depth climatology is a possible cross-check for the dust-loading variable, noted for later. Nothing was integrated.",
    access: "Open catalogue; each product has its own licence and host.", url: "https://opensciencedata.esa.int/",
  },
  {
    name: "RADARSAT-1 archive", agency: "Canadian Space Agency / NRCan", decision: ["not used"],
    examined: "The open archive of C-band HH scenes (1995 to 2013), released under the Open Government Licence – Canada through EODMS and AWS.",
    outcome: "Scene-based Level 1 products with no global mosaic or tile service, a single polarisation, and uneven coverage of the listed sites. Using it would mean calibrating and terrain-correcting scenes one by one. Radar is shown instead from a terrain-corrected Sentinel-1 product. The CSA data portal could not be reached from the build machine on 14 Nov 2026; access facts are from the CSA announcement and the AWS registry.",
    access: "Open licence; EODMS account or AWS S3.", url: "https://donnees-data.asc-csa.gc.ca/en/dataset/radarsat1",
  },
  {
    name: "RADARSAT Constellation Mission", agency: "Canadian Space Agency / NRCan", decision: ["not used"],
    examined: "RCM image products on EODMS and the open analysis-ready (CEOS-ARD) coverage; the CSA synthetic aperture radar tutorial.",
    outcome: "Most RCM products need an EODMS account and user vetting. The open analysis-ready product covers Canada's landmass only, which among the listed sites reaches just Haughton crater on Devon Island. The tutorial teaches loading and plotting RCM rasters with GDAL, cartopy and QGIS; it does not cover calibration or terrain correction. Its lesson for this atlas is a constraint: uncalibrated radar brightness must not be compared between scenes, so only a radiometrically terrain-corrected product is drawn, and it is never scored.",
    access: "EODMS account and vetting; open ARD for Canada only.", url: "https://donnees-data.asc-csa.gc.ca/en/dataset/rcm",
  },
  {
    name: "NASA Earthdata Search", agency: "NASA EOSDIS", decision: ["not used"],
    examined: "Used as the discovery tool to check collections behind every Earth layer: MOD11C3, MOD13, MCD43, MCD12Q1, GPM IMERG, MERRA-2, HLSS30 and OPERA RTC-S1, plus candidates for a fine-scale tier.",
    outcome: "It confirmed product levels, resolutions and time spans listed on this page. Granule download needs an Earthdata Login, so nothing is pulled from it directly: scored inputs come through GIBS and NASA POWER, which need none. Candidates noted for a later fine-scale tier: NASADEM and Copernicus DEM at 30 m, and ASTER GED emissivity for surface composition.",
    access: "Search open; download needs Earthdata Login.", url: "https://search.earthdata.nasa.gov/",
  },
  {
    name: "NASA Solar System Treks", agency: "NASA JPL / SSERVI", decision: ["displayed"],
    examined: "The Moon Trek and Mars Trek tile services and their product catalogue.",
    outcome: "Nine global Moon and Mars layers are drawn. Treks serves plate-carrée tiles; the app re-projects each tile to the map projection in the browser. Colourised layers arrive without a numeric legend, which the interface states wherever one is shown.",
    access: "Open, no key.", url: "https://trek.nasa.gov/",
  },
  {
    name: "Macrostrat map tiles", agency: "Macrostrat, University of Wisconsin–Madison", decision: ["scored", "displayed"],
    examined: "The raster tile service of the geologic map compilation the pipeline already queries point by point.",
    outcome: "Mapped unit boundaries can now be drawn on the global map and on each site map, so the lithology behind the geology score can be seen in its setting.",
    access: "Open, CC-BY 4.0.", url: "https://macrostrat.org/",
  },
  {
    name: "Terrain Tiles and Natural Earth", agency: "Mapzen / AWS Open Data; Natural Earth", decision: ["displayed"],
    examined: "Global elevation tiles for hill shading; 1:50m coastlines, boundaries and named physical regions.",
    outcome: "They draw the paper relief basemap, coastlines, borders and the names of deserts, plateaus and ranges. They give geographic context only. Slopes and relief in the score still come from ETOPO 2022.",
    access: "Open; Natural Earth is public domain.", url: "https://registry.opendata.aws/terrain-tiles/",
  },
];
