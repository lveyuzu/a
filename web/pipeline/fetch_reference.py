"""Build the small cartographic reference files the web app draws on top of its maps.

DISPLAY ONLY: none of this enters a score. Everything comes from Natural Earth
(public domain, naturalearthdata.com) and is only reduced in precision here.

  land110.json     1:110m land polygons   -> locator globes and the portfolio world map (SVG)
  coast50.geojson  1:50m coastline        -> coastline on the interactive maps
  borders50.geojson 1:50m country boundary lines (Natural Earth's de facto view)
  regions.json     1:50m named physical regions (deserts, plateaus, ranges, basins) as label points

Standard library only, so it runs without the scientific environment:
    python pipeline/fetch_reference.py
"""
import json
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "web" / "public" / "data" / "ref"
CACHE = ROOT / "data" / "raw" / "ne"
BASE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/"
UA = {"User-Agent": "planetary-twin-pipeline/1.0"}

# Physical feature classes worth a label on an analog atlas. Oceans, seas and islands are left out.
KEEP = {"Desert", "Plateau", "Range/mtn", "Basin", "Plain", "Tundra", "Peninsula", "Depression", "Valley", "Lowland"}


def get(name):
    CACHE.mkdir(parents=True, exist_ok=True)
    f = CACHE / name
    if not f.exists():
        f.write_bytes(urllib.request.urlopen(urllib.request.Request(BASE + name, headers=UA), timeout=120).read())
    return json.loads(f.read_text(encoding="utf-8"))


def rnd(ring, nd):
    """Round a coordinate ring and drop points that collapse onto their predecessor."""
    out = []
    for x, y in ring:
        p = [round(x, nd), round(y, nd)]
        if not out or out[-1] != p:
            out.append(p)
    return out


def rings(geom):
    if geom["type"] == "Polygon":
        return [geom["coordinates"][0]]
    if geom["type"] == "MultiPolygon":
        return [p[0] for p in geom["coordinates"]]
    return []


def lines(geom):
    if geom["type"] == "LineString":
        return [geom["coordinates"]]
    if geom["type"] == "MultiLineString":
        return geom["coordinates"]
    return []


def area(ring):
    return abs(sum(ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1] for i in range(len(ring) - 1))) / 2


def centroid(ring):
    """Area centroid of a ring in plain lon/lat. Good enough to place a label."""
    a = cx = cy = 0.0
    for i in range(len(ring) - 1):
        x0, y0 = ring[i]
        x1, y1 = ring[i + 1]
        k = x0 * y1 - x1 * y0
        a += k
        cx += (x0 + x1) * k
        cy += (y0 + y1) * k
    if abs(a) < 1e-9:
        return [sum(p[0] for p in ring) / len(ring), sum(p[1] for p in ring) / len(ring)]
    return [cx / (3 * a), cy / (3 * a)]


def tidy(name):
    """Natural Earth sets the largest regions in capitals; give them ordinary title case."""
    if not name.isupper():
        return name
    small = {"Of", "The", "De", "Du", "La", "Del", "And"}
    words = name.title().split(" ")
    return " ".join(w.lower() if i and w in small else w for i, w in enumerate(words))


def main():
    OUT.mkdir(parents=True, exist_ok=True)

    land = []
    for f in get("ne_110m_land.geojson")["features"]:
        for r in rings(f["geometry"]):
            r = rnd(r, 1)
            if len(r) >= 4:
                land.append([c for p in r for c in p])
    (OUT / "land110.json").write_text(json.dumps(land, separators=(",", ":")))

    def linefile(src, dst, nd=2):
        coords = []
        for f in get(src)["features"]:
            for ln in lines(f["geometry"]):
                ln = rnd(ln, nd)
                if len(ln) >= 2:
                    coords.append(ln)
        gj = {"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {}, "geometry": {"type": "MultiLineString", "coordinates": coords}}]}
        (OUT / dst).write_text(json.dumps(gj, separators=(",", ":")))
        return len(coords)

    n_coast = linefile("ne_50m_coastline.geojson", "coast50.geojson")
    n_border = linefile("ne_50m_admin_0_boundary_lines_land.geojson", "borders50.geojson")

    regions = []
    for f in get("ne_50m_geography_regions_polys.geojson")["features"]:
        p = f["properties"]
        cls = p.get("FEATURECLA") or p.get("featurecla")
        name = p.get("NAME") or p.get("name")
        if cls not in KEEP or not name:
            continue
        rs = rings(f["geometry"])
        if not rs:
            continue
        lon, lat = centroid(max(rs, key=area))
        regions.append({"name": tidy(name), "cls": cls, "rank": int(p.get("SCALERANK", p.get("scalerank", 5)) or 5),
                        "lon": round(lon, 2), "lat": round(lat, 2)})
    regions.sort(key=lambda r: (r["rank"], r["name"]))
    (OUT / "regions.json").write_text(json.dumps(regions, ensure_ascii=False, separators=(",", ":")))

    print(f"land rings {len(land)} · coast lines {n_coast} · border lines {n_border} · labelled regions {len(regions)}")
    for f in sorted(OUT.iterdir()):
        print(f"  {f.name:20s} {f.stat().st_size / 1024:7.1f} kB")


if __name__ == "__main__":
    main()
