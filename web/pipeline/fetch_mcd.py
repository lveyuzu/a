"""Query the Mars Climate Database (MCD v6.2) web interface for each Mars
reference region: full diurnal cycle of surface temperature, surface pressure,
and dust optical depth at 12 seasons (Ls = 0..330).

IMPORTANT: MCD is a general-circulation-MODEL climatology (LMD/OU/IAA/ESA/CNES),
not a measurement. It is the standard engineering climate reference for Mars
and is used here because no single instrument dataset gives diurnally and
seasonally complete surface temperatures at every site. Where landers have
measured ground temperature, pipeline/features_planet.py reports the in-situ
range next to the model value.

Results are cached in data/raw/mcd/<target>.json; ~100 small polite requests.
"""
import json
import re
import time
import urllib.parse
import urllib.request

from config import RAW, TARGETS

BASE = "http://www-mars.lmd.jussieu.fr/mcd_python/"
VARS = ["tsurf", "ps", "dod", "none"]
OUT = RAW / "mcd"
UA = {"User-Agent": "planetary-twin-pipeline/1.0"}


def query(lat, lon, ls):
    p = dict(var1=VARS[0], var2=VARS[1], var3=VARS[2], var4=VARS[3], datekeyhtml=1, ls=ls,
             localtime="all", year=2026, month=1, day=1, hours=12, minutes=0, seconds=0,
             julian=2461042.0, martianyear=38, sol=1, latitude=lat, longitude=lon,
             altitude=10., zkey=3, spacecraft="none", isfixedlt="off", dust=1, hrkey=1,
             averaging="off", dpi=80, islog="off", colorm="jet", minval="", maxval="",
             proj="cyl", palt="", plon="", plat="", trans="", iswind="off", latpoint="", lonpoint="")
    url = BASE + "cgi-bin/mcdcgi.py?" + urllib.parse.urlencode(p)
    html = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120).read().decode("latin-1")
    m = re.search(r"href='\.\./(txt/[0-9a-f]+\.txt)'", html)
    if not m:
        raise RuntimeError("no ASCII link in MCD response")
    txt = urllib.request.urlopen(urllib.request.Request(BASE + m.group(1), headers=UA), timeout=120).read().decode()
    blocks, names = [], []
    cur = None
    for line in txt.splitlines():
        if line.startswith("### Column 2 is"):
            names.append(line.split("Column 2 is", 1)[1].strip())
            cur = []
            blocks.append(cur)
        elif line and not line.startswith("#") and cur is not None:
            a, b = line.split()
            cur.append([float(a), float(b)])
    return {"labels": names, "series": blocks}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for t in TARGETS:
        if t["body"] != "mars":
            continue
        f = OUT / f"{t['id']}.json"
        rec = json.loads(f.read_text()) if f.exists() else {"lat": t["lat"], "lon": t["lon"], "seasons": {}}
        for ls in range(0, 360, 30):
            if str(ls) in rec["seasons"]:
                continue
            for attempt in range(4):
                try:
                    rec["seasons"][str(ls)] = query(t["lat"], t["lon"], ls)
                    break
                except Exception as e:  # network hiccup: back off and retry
                    print("retry", t["id"], ls, repr(e)[:80], flush=True)
                    time.sleep(5 * (attempt + 1))
            f.write_text(json.dumps(rec))
            print(t["id"], "Ls", ls, "ok", flush=True)
            time.sleep(1.0)


if __name__ == "__main__":
    main()
