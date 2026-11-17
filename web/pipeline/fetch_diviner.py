"""Fetch LRO Diviner temperatures for the lunar reference regions using HTTP
range requests against fixed-width PDS tables (no full-file downloads).

1. Global Cumulative Product (GCP), LRO-L-DLRE-5-GCP-V1.0
   Bolometric brightness temperature binned 0.5 deg x 0.5 deg x 0.25 h local time,
   all nadir data 2009-07-05..2015-04-01 (Williams et al. 2017, Icarus 283, 300).
   Direct orbital radiometer measurement. We read the full 96-step diurnal curve
   for the 3 x 3 bins centred on each site.

2. Polar Resource Product (PRP), LRO-L-DLRE-5-PRP-V2.0  (Paige et al. 2010,
   Science 330, 479): annual average / maximum temperature and modelled ice
   stability depth on a 0.5 km mesh poleward of ~76 deg. Used for polar sites,
   where a 0.5 deg bin mixes sunlit ridges and permanent shadow.
"""
import json
import math
import urllib.request

import numpy as np

from config import RADIUS_KM, RAW, TARGETS

PDS = "https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/"
UA = {"User-Agent": "planetary-twin-pipeline/1.0"}
OUT = RAW / "diviner"


def get_range(url, start, nbytes):
    for attempt in range(6):
        try:
            r = urllib.request.Request(url, headers={**UA, "Range": f"bytes={start}-{start + nbytes - 1}"})
            data = urllib.request.urlopen(r, timeout=180).read()
            if len(data) == nbytes:
                return data.decode("ascii")
        except Exception as e:
            print("  retry", repr(e)[:60], flush=True)
    raise RuntimeError("range request failed")


def gcp_band(lat):
    lo = math.floor(lat / 10.0) * 10
    hi = lo + 10
    # File names always run south -> north; the equator is written 00n / 00s.
    a = f"{abs(lo):02d}{'s' if lo < 0 else 'n'}"
    b = f"{abs(hi):02d}{'s' if hi <= 0 else 'n'}"
    return lo, PDS + f"data_derived_gcp/global_cumul_avg_cyl_{a}{b}_002.tab"


def fetch_gcp(lat, lon, half=1):
    """Diurnal bolometric-temperature curves for (2*half+1)^2 bins around the site."""
    ROW = 113
    out = []
    ilat0 = math.floor(lat / 0.5)
    ilon0 = math.floor((lon + 180.0) / 0.5)
    for di in range(-half, half + 1):
        for dj in range(-half, half + 1):
            clat = (ilat0 + di) * 0.5 + 0.25
            if not -90 < clat < 90:
                continue
            ilon = (ilon0 + dj) % 720
            lo, url = gcp_band(clat)
            ilat = int(round((clat - lo - 0.25) / 0.5))
            first = 1 + ilon * 20 * 96 + ilat * 96
            txt = get_range(url, first * ROW, 96 * ROW)
            rows = [[float(v) for v in line.split(",")] for line in txt.strip().splitlines()]
            a = np.array(rows)
            assert abs(a[0, 1] - clat) < 1e-3 and abs(a[0, 0] - (ilon * 0.5 - 179.75)) < 1e-3, (a[0, :3], clat, ilon)
            out.append({"clat": clat, "clon": float(a[0, 0]), "ltim": a[:, 2].tolist(), "tbol": a[:, 10].tolist()})
    return out


def fetch_prp_south(lat, lon, half_km=15.0):
    """Annual mean / max temperature and ice-stability depth on the 0.5 km polar mesh."""
    ROW, PER_COL = 210, 2400
    url = PDS + "data_derived_prp/dlre_prp_south.tab"
    R = RADIUS_KM["moon"]
    x = R * math.cos(math.radians(lat)) * math.cos(math.radians(lon))
    y = R * math.cos(math.radians(lat)) * math.sin(math.radians(lon))
    ix0 = int(round((300.0 - x) / 0.5))
    iy0 = int(round((y + 300.0) / 0.5))
    n = int(half_km / 0.5)
    recs = []
    for ix in range(max(0, ix0 - n), min(1200, ix0 + n)):
        first = 1 + ix * PER_COL + max(0, iy0 - n) * 2
        count = (min(1200, iy0 + n) - max(0, iy0 - n)) * 2
        txt = get_range(url, first * ROW, count * ROW)
        for line in txt.strip().splitlines():
            v = line.split(",")
            recs.append([float(v[9]), float(v[10]), float(v[11]), float(v[12]), float(v[13]), float(v[14])])
        if (ix - ix0) % 20 == 0:
            print("   prp column", ix, flush=True)
    a = np.array(recs, dtype="f4")
    return {"cols": ["lon", "lat", "alt_km", "t_avg", "t_max", "ice_depth_m"], "rows": a.round(3).tolist()}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for t in TARGETS:
        if t["body"] != "moon":
            continue
        f = OUT / f"{t['id']}.json"
        if f.exists():
            print("have", f.name)
            continue
        print(t["id"], flush=True)
        rec = {"lat": t["lat"], "lon": t["lon"], "gcp": fetch_gcp(t["lat"], t["lon"])}
        if t["lat"] < -78:
            rec["prp"] = fetch_prp_south(t["lat"], t["lon"])
        f.write_text(json.dumps(rec))
        print("  wrote", f.name, flush=True)


if __name__ == "__main__":
    main()
