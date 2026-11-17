"""Pre-fetch display imagery so the application works without calling remote
image services during a demo. Imagery is DISPLAY ONLY — it never enters a score.

Every image covers the same ground footprint as the terrain analysis window
(60.8 km), so Earth and planetary panels are shown at equal scale.

  Earth sites   Sentinel-2 cloudless 2020 (EOX; contains modified Copernicus Sentinel data)
  Mars          THEMIS daytime-infrared global mosaic, 100 m (NASA/JPL-Caltech/ASU, USGS WMS)
  Moon          LROC WAC global mosaic, 100 m (NASA/GSFC/ASU, USGS WMS)
  Lunar poles   shaded relief rendered here from LOLA LDEM_75S_240M (optical mosaics are
                mostly shadow there, and the USGS polar WMS returned empty images)
"""
import json
import math
import time
import urllib.request

import numpy as np
from PIL import Image

from config import RADIUS_KM, RAW, ROOT, STEP_KM, TARGETS, WEB_DATA, WIN_N
from terrain import hillshade

IMG = ROOT / "web" / "public" / "img"
HALF_KM = WIN_N * STEP_KM / 2.0
UA = {"User-Agent": "planetary-twin-pipeline/1.0"}
USGS = "https://planetarymaps.usgs.gov/cgi-bin/mapserv?map=/maps/{map}&SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS={layer}&STYLES=&SRS=EPSG:4326&BBOX={bbox}&WIDTH={px}&HEIGHT={px}&FORMAT=image/jpeg"
EOX = "https://tiles.maps.eox.at/wms?service=WMS&version=1.1.1&request=GetMap&layers=s2cloudless-2020&styles=&srs=EPSG:4326&bbox={bbox}&width={px}&height={px}&format=image/jpeg"


def bbox(lat, lon, body, half_km=HALF_KM):
    dlat = math.degrees(half_km / RADIUS_KM[body])
    dlon = dlat / max(math.cos(math.radians(lat)), 1e-3)
    return f"{lon - dlon:.5f},{max(lat - dlat, -90):.5f},{lon + dlon:.5f},{min(lat + dlat, 90):.5f}"


def fetch(url, out, min_bytes=3000):
    if out.exists() and out.stat().st_size >= min_bytes:
        return True
    for attempt in range(4):
        try:
            data = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=90).read()
            if len(data) >= min_bytes and data[:2] == b"\xff\xd8":
                out.write_bytes(data)
                return True
            return False  # blank / error image: nothing useful at this location
        except Exception:
            time.sleep(3 * (attempt + 1))
    return False


def lunar_polar_relief(lat, lon, out, px=512):
    """Shaded relief from LOLA LDEM_75S_240M (polar stereographic, 240 m/px, int16 * 0.5 m)."""
    f = RAW / "ldem_75s_240m.img"
    if not f.exists():
        url = "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/ldem_75s_240m.img"
        f.write_bytes(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=900).read())
    z = np.fromfile(f, dtype="<i2").astype("f4") * 0.5
    n = int(round(math.sqrt(z.size)))
    z = z.reshape(n, n)
    R = RADIUS_KM["moon"]
    # south polar stereographic: x = 2R tan(c/2) sin(lon), y = 2R tan(c/2) cos(lon), c = colatitude from the pole
    rr = 2 * R * math.tan(math.radians(90 + lat) / 2)
    x, y = rr * math.sin(math.radians(lon)), rr * math.cos(math.radians(lon))
    col, row = n / 2 + x / 0.24, n / 2 - y / 0.24
    h = int(HALF_KM / 0.24)
    r0, c0 = int(round(row)) - h, int(round(col)) - h
    win = z[max(r0, 0):r0 + 2 * h, max(c0, 0):c0 + 2 * h]
    hs = hillshade(win, step_km=0.24, alt=25.0)
    Image.fromarray((hs * 255).astype("u1"), "L").resize((px, px), Image.LANCZOS).convert("RGB").save(out, quality=88)


def main():
    (IMG / "targets").mkdir(parents=True, exist_ok=True)
    (IMG / "sites").mkdir(parents=True, exist_ok=True)
    credits = {}
    for t in TARGETS:
        out = IMG / "targets" / f"{t['id']}.jpg"
        if t["body"] == "mars":
            ok = fetch(USGS.format(map="mars/mars_simp_cyl.map", layer="THEMIS", bbox=bbox(t["lat"], t["lon"], "mars"), px=512), out)
            credits[t["id"]] = "THEMIS daytime IR mosaic · NASA/JPL-Caltech/ASU · USGS Astrogeology"
        elif abs(t["lat"]) > 80:
            if not out.exists():
                lunar_polar_relief(t["lat"], t["lon"], out)
            ok = True
            credits[t["id"]] = "Shaded relief from LOLA LDEM 240 m · NASA/GSFC/MIT (optical imagery is mostly shadow here)"
        else:
            ok = fetch(USGS.format(map="earth/moon_simp_cyl.map", layer="LROC_WAC", bbox=bbox(t["lat"], t["lon"], "moon"), px=512), out)
            credits[t["id"]] = "LROC WAC global mosaic · NASA/GSFC/Arizona State University · USGS Astrogeology"
        print("target", t["id"], ok, flush=True)
    sites = json.loads((WEB_DATA / "sites.json").read_text())
    have = {}
    for s in sites:
        out = IMG / "sites" / f"{s['id']}.jpg"
        have[s["id"]] = fetch(EOX.format(bbox=bbox(s["lat"], s["lon"], "earth"), px=512), out)
        print("site", s["id"], have[s["id"]], flush=True)
    (WEB_DATA / "imagery.json").write_text(json.dumps(dict(
        footprint_km=2 * HALF_KM, targets=credits, sites=have,
        site_credit="Sentinel-2 cloudless 2020 · EOX IT Services GmbH (contains modified Copernicus Sentinel data 2020)")))


if __name__ == "__main__":
    main()
