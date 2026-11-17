# Data-source assessment

Which outside data services were examined for Planetary Twin, what each can and cannot contribute, and
what was done with it. Examined on 14 November 2026 from the build machine; availability and counts are
as observed that day.

## How a source was judged

Every source was put through the same three questions.

1. **Does its measurement belong to a scored dimension?** Terrain, thermal, aridity, surface,
   atmosphere, ground ice or geology. A dataset that measures something else adds a picture, not evidence.
2. **Can Earth and the Moon or Mars be put on the same footing?** Same quantity, comparable resolution,
   a defensible way to normalise. If only one side has the measurement, it cannot be scored.
3. **Can it be fetched without credentials?** The pipeline uses only sources that need no login, and the
   web app is a static site that cannot keep a secret.

A source that passes all three can be scored. One that fails any of them can still be **displayed**
(drawn on a map as a picture, never read as numbers) or **searched** (its catalogue queried for
metadata). The interface keeps the three uses apart, and so does this document.

**Outcome in one line:** none of the newly examined sources passed all three, so the scoring engine is
unchanged. Twenty-five outside map layers and one live catalogue search were added for viewing.

| Source | Decision |
|---|---|
| NASA GIBS / Worldview | Displayed (13 layers). Five of them are products already scored |
| NASA PDS | Already scored (MOLA, LOLA, Diviner). Mosaics built from PDS data now displayed |
| LRO Diviner | Already scored (GCP, PRP). Polar statistics now shown; rock abundance displayed |
| NASA Solar System Treks | Displayed (9 Moon and Mars layers) |
| Copernicus Data Space | Catalogue searched live. Pixel services not used (credentials) |
| Macrostrat | Already scored (point lookup). Map tiles now displayed |
| Terrain Tiles, Natural Earth | Displayed (relief basemap, coastlines, boundaries, place names) |
| JAXA G-Portal / JAXA Earth API | Not used. Recommended next step for cross-checks |
| ESA Open Science Data Catalogue | Not used |
| RADARSAT-1 | Not used |
| RADARSAT Constellation Mission | Not used |
| NASA Earthdata Search | Used for discovery only |

---

## 1. Sources in use

### 1.1 NASA GIBS (Global Imagery Browse Services) and Worldview

- **What it is.** Pre-rendered map tiles of NASA Earth-observation products. Worldview is the viewer
  built on it.
- **Access.** WMTS (REST), WMS and TWMS; projections EPSG:4326, EPSG:3857 and two polar stereographic.
  The app uses the WMTS REST endpoint in EPSG:3857,
  `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/{layer}/default/{time}/{tilematrixset}/{z}/{y}/{x}.{ext}`.
  1,330 layers were listed. No key. Tiles carry `Access-Control-Allow-Origin: *`.
- **Time.** Each layer declares its periods in the capabilities document. The app steps by the layer's
  own period and stops at a date the service should hold (a lag is assumed per layer).
- **Legends.** Published per layer as SVG and as a colour-map XML. The app shows the SVG; the pipeline
  uses the XML to turn colours back into values.
- **Licence and credit.** NASA data are free and open. Requested credit: "We acknowledge the use of
  imagery provided by services from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth
  Science Data and Information System (ESDIS)." Sentinel-derived layers also carry "contains modified
  Copernicus Sentinel data".
- **The limit that matters.** A tile is a picture: colour-mapped into bins, resampled to the tile grid,
  sometimes JPEG-compressed. The interface never reads a displayed tile as a number. Where the pipeline
  scores a GIBS-served product, it requests it separately at full grid size and decodes it with the
  official colour table (`pipeline/fetch_gibs.py`), which was already the case before this work.

| Layer in the app | GIBS identifier | Instrument and product | Level | Resolution | Period | Units | Use |
|---|---|---|---|---|---|---|---|
| Blue Marble with relief | `BlueMarble_ShadedRelief_Bathymetry` | MODIS Blue Marble Next Generation | composite | 500 m | 2004 | true colour | basemap |
| MODIS true colour, by day | `MODIS_Terra_CorrectedReflectance_TrueColor` | Terra MODIS, bands 1-4-3 | browse product | 250 m | daily, 2000– | corrected reflectance | basemap |
| Land surface temperature, day | `MODIS_Terra_L3_Land_Surface_Temp_Monthly_Day` | Terra MODIS MOD11C3 | L3 | 0.05° | monthly, 2000– | K | overlay; **same product scored** (thermal) |
| Land surface temperature, night | `MODIS_Terra_L3_Land_Surface_Temp_Monthly_Night` | Terra MODIS MOD11C3 | L3 | 0.05° | monthly, 2000– | K | overlay; **same product scored** (thermal) |
| Vegetation index | `MODIS_Terra_L3_NDVI_Monthly` | Terra MODIS MOD13 | L3 | 1 km | monthly, 2000– | NDVI | overlay; **same product scored** (surface) |
| Shortwave albedo | `MODIS_Combined_L3_Black_Sky_Albedo_Daily` | Terra + Aqua MODIS MCD43 | L3 | 1 km | daily, 2000– | albedo 0–1 | overlay; **same product scored** (surface) |
| Land cover classes | `MODIS_Combined_L3_IGBP_Land_Cover_Type_Annual` | MODIS MCD12Q1 | L3 | 500 m | yearly, 2001–2024 | 17 IGBP classes | overlay; **same product scored** (land mask) |
| Precipitation, by day | `IMERG_Precipitation_Rate` | GPM IMERG | L3 | 0.1° | daily, 2000– | mm/h | overlay. Scoring uses IMERG annual totals via NASA POWER, a different statistic |
| Surface pressure | `MERRA2_Surface_Pressure_Monthly` | MERRA-2 reanalysis | model | 0.5° × 0.625° | monthly, 1980– | pressure | overlay. Scoring reads MERRA-2 via NASA POWER |
| Column water vapour | `MERRA2_Total_Precipitable_Water_Vapor_Monthly` | MERRA-2 reanalysis | model | 0.5° × 0.625° | monthly, 1980– | kg/m² | overlay. Scoring reads MERRA-2 via NASA POWER |
| Snow cover, by day | `MODIS_Terra_NDSI_Snow_Cover` | Terra MODIS MOD10 | L3 | 500 m | daily, 2000– | NDSI snow cover | overlay, context only |
| Sentinel-2 passes, 30 m | `HLS_S30_Nadir_BRDF_Adjusted_Reflectance` | Sentinel-2 MSI, Harmonized Landsat Sentinel-2 | L2 (HLS) | 30 m | per pass, 2015– | surface reflectance, true colour | dated site imagery |
| Sentinel-1 radar backscatter | `OPERA_L2_Radiometric_Terrain_Corrected_SAR_Sentinel-1` | Sentinel-1 C-band SAR, OPERA RTC-S1 | L2 | 30 m | per pass, 2025– | false colour from VV and VH gamma-nought | radar texture, with caution note |

Also available and examined but not added: ASTER GDEM shaded relief (the relief basemap covers this),
VIIRS true colour, SMAP and AMSR2 soil moisture (36 km and 10–25 km: too coarse to show anything at a
61 km site and not a scored quantity), NISAR covariance (too new, sparse coverage).

### 1.2 NASA Planetary Data System and LRO Diviner

The scored planetary references were already PDS products and are unchanged:

| Product | Identifier | Level | Resolution | Coverage in time | Use |
|---|---|---|---|---|---|
| MGS MOLA MEGDR | `MGS-M-MOLA-5-MEGDR-L3-V1.0` | gridded (L3/5) | 32 px/deg, 1.85 km | 1997–2001 | Mars terrain |
| LRO LOLA LDEM | `LRO-L-LOLA-4-GDR-V1.0` | gridded | 16 px/deg, 1.90 km (240 m polar for display) | 2009– | Moon terrain |
| Diviner Global Cumulative Product (GCP) | `LRO-L-DLRE-5-GCP-V1.0` | derived | 0.5° × 0.25 h local time | 5 Jul 2009 – 1 Apr 2015 | lunar mean, range, night temperature |
| Diviner Polar Resource Product (PRP) | `LRO-L-DLRE-5-PRP-V2.0` | derived, part model | 0.5 km polar mesh | cumulative | polar mean and maximum temperature, ice-stability depth |

**Diviner products examined** (PDS Geosciences Node, LRO release 67, 15 Sep 2026):

| Product | What it is | Decision |
|---|---|---|
| EDR, `lro-l-dlre-2-edr-v1` | Raw instrument counts, Jul 2009 – Jun 2026 | Not used: uncalibrated |
| RDR, `lro-l-dlre-4-rdr-v1` | Calibrated radiance and brightness temperature per footprint | Not used: needs re-gridding for no gain at a 61 km window; channels 1–2 mostly missing since Apr 2019 and the archive lists a brightness-temperature problem under investigation |
| GDR Level 2 and 3 | Gridded maps per channel and derived quantities (rock abundance, regolith temperature), to Oct 2016 | Rock abundance displayed, see below |
| GCP | Global cumulative temperature by local time, to Apr 2015 | **Scored** (unchanged) |
| PCP | Polar cumulative products, to Mar 2020 | Not used: PRP already supplies the polar mesh |
| PRP | Polar resource products | **Scored** (unchanged); its statistics are now shown |
| RCP | Regional cumulative products, to Mar 2021 | Not used: none covers a reference region better than GCP/PRP |
| GHRM | Global high-resolution mosaics, to Aug 2022 | Not used yet. Candidate to replace the 0.5° GCP bin for equatorial regions; needs a pipeline run and re-validation |
| EPF | Emission phase function products, to Feb 2024 | Not relevant |

What changed for the lunar thermal reference:

- The pipeline already computed, for each polar window, the median and extreme annual temperatures, the
  share never warmer than 110 K and the share where ice is stable within a metre. These were stored but
  not shown. Each polar field report now shows them, states that the temperatures are measured and the
  ice depth is modelled, and says that an Earth site is compared with the window median, not with the
  cold traps.
- **Rock abundance** (Level 3, Bandfield et al. 2011, 2016, 128 px/deg, 80°S–80°N, mapping-orbit data
  Oct 2009 – Oct 2011) answers a limit the project lists: rock hazards are not assessed. It fails
  question 2: there is no comparable rock-abundance product for Earth. It is displayed on the Moon map
  and not scored.

### 1.3 NASA Solar System Treks (Moon and Mars map tiles)

- **Access.** WMTS, plate-carrée tile pyramids (level L has 2^(L+1) × 2^L tiles of 256 px), no key,
  CORS open. `https://trek.nasa.gov/tiles/{Body}/EQ/{product}/1.0.0/default/default028mm/{z}/{row}/{col}.{ext}`.
- **Projection handling.** The map library draws Web-Mercator tiles. `web/src/lib/trek.ts` builds each
  Mercator tile from the plate-carrée tiles that cover it, taking every output row from its true
  latitude. Columns line up exactly, so only north–south resampling happens. Nothing is drawn poleward
  of 85°, and the interface says so for the two polar regions.
- **Scale.** Scale bars use 1,737.4 km (Moon) and 3,389.5 km (Mars).
- **Legends.** The service publishes none for colourised layers. Those layers are labelled "read colours
  as relative only".
- **Licence.** NASA and USGS products, public domain; credit NASA Solar System Treks (JPL) and USGS
  Astrogeology plus the instrument teams.

| Layer | Trek product | Instrument | Resolution | Coverage | Scored? |
|---|---|---|---|---|---|
| LROC WAC mosaic | `LRO_WAC_Mosaic_Global_303ppd_v02` | LRO LROC WAC | 100 m | global, images Nov 2009 – Feb 2011 | no |
| LOLA colour relief | `LRO_LOLA_ClrShade_Global_128ppd_v04` | LRO LOLA | 237 m | global, altimetry to Sep 2011 | LOLA LDEM is (terrain) |
| Lunar geologic units | `Unified_Geologic_Map_of_the_Moon_RASTER` | USGS compilation, 1:5M (Fortezzo et al. 2020) | 1:5,000,000 | global | source of the documented geology |
| Diviner rock abundance | `Diviner_avg_RockAbundance` | LRO Diviner | 237 m | 80°S–80°N | no (no Earth counterpart) |
| Viking colour mosaic | `Mars_Viking_MDIM21_ClrMosaic_global_232m` | Viking Orbiter VIS | 232 m | global, 1970s | no |
| MOLA colour relief | `Mars_MGS_MOLA_ClrShade_merge_global_463m` | MGS MOLA | 463 m | global | MOLA MEGDR is (terrain) |
| THEMIS daytime infrared | `THEMIS_DayIR_ControlledMosaics_100m_v2_oct2018` | Mars Odyssey THEMIS | 100 m | 65°S–65°N | no |
| Mars geologic units | `SIM3292_Global_Geology` | USGS SIM 3292, 1:20M (Tanaka et al. 2014) | 1:20,000,000 | global | source of the documented geology |
| TES albedo | `Mars_MGS_TES_Albedo_mosaic_global_7410m` | MGS TES | 7.4 km | global | TES albedo is (surface) |

### 1.4 Copernicus Data Space Ecosystem

| Interface | Needs an account? | Decision |
|---|---|---|
| STAC catalogue (`stac.dataspace.copernicus.eu/v1`) | No, for search | **Used**: live search from each field report |
| OData catalogue | No for search, yes for download | Not used; STAC covers the need |
| Sentinel Hub (processing, WMS/WMTS, statistics) | Yes, OAuth client | Not used |
| openEO | Yes | Not used |

- **What the search does.** For a 0.04° box at the site it asks for the latest Sentinel-2 L2A scenes
  with under 15% cloud (CQL2 filter on `eo:cloud_cover`) and the latest Sentinel-1 GRD scenes, one per
  day, and lists date, platform, cloud, sun elevation, orbit direction, relative orbit, instrument mode,
  polarisations and incidence angle. It is metadata. Nothing is downloaded.
- **Why no pixels.** Sentinel Hub and openEO need a client secret or a user token. A static site would
  have to ship it to every visitor. Putting a proxy server in front would change the project from a
  static site into a service to run. Pictures of the same acquisitions are taken from NASA GIBS instead
  (HLS S30 and OPERA RTC-S1, section 1.1); they can lag the acquisition by several days.
- **Licence.** Copernicus Sentinel data are free, full and open. Credit: "Contains modified Copernicus
  Sentinel data [year]".
- **Copernicus DEM (GLO-30/90).** A candidate for a fine-scale terrain tier. Not used: the terrain
  comparison is deliberately held at 1.9 km, where Earth, Mars and Moon models match.

### 1.5 Macrostrat, Terrain Tiles, Natural Earth, EOX

| Source | Used for | Resolution | Licence / credit | Limits |
|---|---|---|---|---|
| Macrostrat map tiles (`tiles.macrostrat.org/carto`) | Geologic unit boundaries on Earth maps; the same compilation the geology score queries | source maps 1:50k to 1:50M | CC-BY 4.0, Macrostrat and original map authors | boundaries shift where maps of different scale meet; thin in parts of Africa and Antarctica |
| Terrain Tiles on AWS Open Data (terrarium encoding) | Hill shading and elevation tint of the relief basemap | about 30 m to 1 km | open; credit Mapzen and the source models (SRTM, GMTED2010, ETOPO1 and others) | not the model that is scored (ETOPO 2022) |
| Natural Earth 1:50m and 1:110m | Coastlines, country boundaries, names of physical regions, land on the SVG maps | 1:50,000,000 | public domain | boundaries are Natural Earth's de facto view; reduced by `pipeline/fetch_reference.py` |
| Sentinel-2 cloudless 2020 (EOX) | True-colour basemap and the 61 km site images (as before) | 10 m | CC BY-NC-SA 4.0; "Sentinel-2 cloudless 2020 by EOX (contains modified Copernicus Sentinel data 2020)" | a mosaic of many dates; non-commercial licence |

---

## 2. Sources examined and not used

### 2.1 JAXA G-Portal and JAXA Earth API

- **G-Portal** searches JAXA products by satellite, sensor, level and physical quantity (GCOM-C SGLI,
  GCOM-W AMSR2, GPM/GSMaP, ALOS and others) in HDF5, NetCDF and GeoTIFF. Downloading needs a registered
  account (SFTP or HTTPS). That fails question 3, so it is not in the pipeline.
- **JAXA Earth API** (`data.earth.jaxa.jp`) is open: a STAC catalogue of cloud-optimised GeoTIFFs, CORS
  enabled, no account. Collections seen include:

| Collection | Quantity | Could serve as |
|---|---|---|
| GCOM-C SGLI L3 land surface temperature, day and night | K, daily to monthly | independent check on MODIS LST (thermal) |
| GCOM-C SGLI L3 NDVI | unitless | independent check on MODIS NDVI (surface) |
| GSMaP gauge-adjusted precipitation, daily to monthly normals | mm | independent check on IMERG (aridity) |
| ALOS PRISM AW3D30 v4.1 | elevation, 30 m | fine-scale terrain tier |
| GCOM-W AMSR2 L3 soil moisture | volumetric | context only; too coarse |

- **Decision.** Not integrated. These products measure scored quantities with different instruments, so
  their best use is a cross-check at the 122 listed sites that would raise or lower evidence quality.
  That is an analytical change: it needs a pipeline run, a comparison against the current inputs and a
  re-validation. It is the first recommended next step and was not attempted as part of an interface
  redesign.

### 2.2 ESA Open Science Data Catalogue

- A static STAC catalogue (366 products) of outputs from ESA-funded research projects, each with its own
  host, format and licence.
- Most are regional or thematic: CryoSat ice elevation, sea-ice thickness, Alpine and Arctic snow, ocean
  products, CALIPSO aerosol climatologies.
- No product supplies a global land variable for a scored dimension at a suitable resolution.
- One candidate noted: the CALIPSO dust optical depth climatology (LIVAS) as a cross-check for the
  dust-loading variable.
- **Decision.** Not integrated.

### 2.3 RADARSAT-1 archive

- C-band, HH polarisation, 1995–2013. About 36,500 scenes were opened in 2019 under the Open Government
  Licence – Canada, through NRCan's EODMS and on AWS.
- Scene-based Level 1 products. No global mosaic or tile service.
- Uneven coverage of the listed sites; single polarisation; each scene would need calibration and
  terrain correction before it could be compared with another.
- **Decision.** Not integrated. Radar is shown from a terrain-corrected Sentinel-1 product instead.
- **Note on access.** `donnees-data.asc-csa.gc.ca` did not answer from the build machine on
  14 Nov 2026. The facts above come from the CSA announcement and the AWS open-data registry, not from
  the portal itself.

### 2.4 RADARSAT Constellation Mission

- Three C-band satellites with compact polarimetry among their modes.
- Image products are distributed through EODMS and need an account; most users also need vetting.
- The open analysis-ready (CEOS-ARD) product covers Canada's landmass only, 30 m compact-pol, every
  12 days. Among the listed sites that reaches only Haughton crater on Devon Island.
- **Decision.** Not integrated.
- **The CSA SAR tutorial** (`asc-csa/Synthetic_Aperture_Radar_Tutorial`) teaches loading and plotting
  RCM rasters and shapefiles with GDAL, cartopy, matplotlib and QGIS, using RCM scenes of British
  Columbia wildfires. It does not cover calibration, speckle filtering or terrain correction. Nothing
  from it was copied into the application. What it informed is a rule: a plotted radar raster is
  uncalibrated brightness, which must not be compared between scenes, so the app draws only a
  radiometrically terrain-corrected product.

### 2.5 NASA Earthdata Search

Used as the discovery tool, not as a data source. It confirmed product levels, resolutions and time
spans for MOD11C3, MOD13, MCD43, MCD12Q1, GPM IMERG, MERRA-2, HLSS30 and OPERA RTC-S1. Granule download
needs an Earthdata Login, so nothing is pulled from it: scored inputs come through GIBS and NASA POWER.
Candidates noted for a fine-scale tier: NASADEM (30 m) and ASTER GED emissivity (surface composition).

---

## 3. Rules the interface follows

**Display and analysis are kept apart.** Every outside layer is listed under "Map layers that are shown,
not scored" on the Method & data page with its relation to the score. The layer panel repeats it per
layer ("In the score: No. Context only." or the dimension that scores the same product).

**Radar.** Synthetic aperture radar brightness depends on surface roughness at the scale of the
wavelength, moisture, local slope and facing, look angle, polarisation, vegetation and processing.
Therefore:

- only a radiometrically terrain-corrected product is drawn (OPERA RTC-S1, gamma-nought, VV and VH);
- radar is a separate overlay and is never blended with optical imagery;
- wherever it appears, a note says it shows texture and structure, does not identify rock type, and that
  two similar radar pictures do not show two surfaces are the same rock;
- the pass table lists mode, polarisation, pass direction, relative orbit and incidence angle, because
  two scenes are comparable only when those agree;
- radar is not scored, and no planetary radar is shown beside it. To score it, an Earth product and a
  planetary product would have to share band, polarisation and incidence geometry. They do not.

**Earth against Moon and Mars.** The paired image panels in each report differ in instrument, band and
lighting. Each report now carries a table saying what is comparable (footprint, relief view) and what is
not (brightness, shadow, colour). The three-body panel notes that a day lasts 24 hours on Earth,
24.66 hours on Mars and 29.5 days on the Moon, so daily temperature swings are not over equal times.
Nothing is resampled to hide a resolution gap: layers show their native resolution and coarse layers are
drawn with visible cells.

**Provenance.** A layer cannot be registered without product, instrument, resolution, units, period,
limits, source link and its relation to the score (`web/src/lib/layers.ts`). The 17 datasets that enter
scores keep their full records (`pipeline/provenance.py`), unchanged.

**Credentials.** No key, token or account is used anywhere. Services that need one were left out.

## 4. If more were to be integrated, in this order

1. JAXA Earth API cross-checks (GCOM-C LST and NDVI, GSMaP) at the listed sites, feeding evidence quality.
2. Diviner GHRM in place of the 0.5° GCP bin for the three equatorial lunar regions, with re-validation.
3. A fine-scale terrain tier (AW3D30, NASADEM or Copernicus DEM against HiRISE/CTX and LROC NAC models)
   for shortlisted sites only.
4. CALIPSO dust optical depth as a second opinion on the dust-loading variable.
