#!/usr/bin/env bash
# Reproduce the whole analysis from public data. ~1.2 GB download, ~25 min on a laptop
# (dominated by download speed). Every step caches, so re-runs are fast.
#   python3 -m venv .venv && . .venv/bin/activate && pip install -r pipeline/requirements.txt
#   bash pipeline/run_all.sh
set -euo pipefail
cd "$(dirname "$0")"
PY="${PYTHON:-python3}"
mkdir -p ../data/raw/ne ../data/interim

echo "== 1/9 raw rasters (ETOPO, MOLA, LOLA, TES)";        PYTHON="$PY" bash fetch_raw.sh
echo "== 2/9 NASA POWER climatologies (MERRA-2, CERES, IMERG)"; "$PY" fetch_power.py
echo "== 3/9 MODIS land products via NASA GIBS";            "$PY" fetch_gibs.py
echo "== 4/9 Mars Climate Database site queries";           "$PY" fetch_mcd.py
echo "== 5/9 LRO Diviner temperatures (range requests)";    "$PY" fetch_diviner.py
echo "== 6/9 Natural Earth names"
for u in 10m/physical/ne_10m_geography_regions_polys 50m/cultural/ne_50m_admin_0_countries 10m/cultural/ne_10m_admin_1_states_provinces; do
  f="../data/raw/ne/$(basename "$u").zip"
  [ -f "$f" ] || curl -fsSL -A "Mozilla/5.0" -o "$f" "https://naciscdn.org/naturalearth/$u.zip"
  unzip -qo "$f" -d ../data/raw/ne
done
echo "== 7/9 feature extraction";                           "$PY" build_earth.py; "$PY" build_targets.py
echo "== 8/9 scoring, validation, sensitivity, portfolio";  "$PY" analyze.py
echo "== 9/9 display imagery and findings";                 "$PY" imagery.py; "$PY" findings.py
"$PY" test_pipeline.py
echo "Done. Outputs are in web/public/data and web/public/img."
