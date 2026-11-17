#!/usr/bin/env bash
# Downloads the large raw rasters/tables used by the pipeline (resumable, ~650 MB total).
# All sources are public and need no credentials.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/../data/raw"
PY="${PYTHON:-python3}"
PDS=https://pds-geosciences.wustl.edu
pget(){ "$PY" "$HERE/pget.py" "$1" "$(basename "$1")" "${2:-8}"; }

# Earth topography: NOAA ETOPO 2022, 60 arc-second ice-surface elevation
pget https://www.ngdc.noaa.gov/mgg/global/relief/ETOPO2022/data/60s/60s_surface_elev_gtif/ETOPO_2022_v1_60s_N90W180_surface.tif 24 &
(
  # Mars topography: MGS MOLA MEGDR 32 px/deg (PDS Geosciences)
  pget $PDS/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg032/megt90n000fb.img
  pget $PDS/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg032/megt90n000fb.lbl 1
  # Moon topography: LRO LOLA GDR 16 px/deg (PDS Geosciences)
  pget $PDS/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/img/ldem_16.img
  pget $PDS/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/img/ldem_16.lbl 1
  # Mars albedo: MGS TES bolometric albedo mosaic (USGS Astrogeology)
  pget https://planetarymaps.usgs.gov/mosaic/Mars_MGS_TES_Albedo_mosaic_global_7410m.tif
) &
wait
echo "[fetch] done"
