"""Offline place naming for grid cells from Natural Earth (public domain):
physical region (desert, range, plateau, basin ...), first-level admin unit, country."""
import shapefile
from shapely.geometry import Point, shape
from shapely.strtree import STRtree

from config import RAW

NE = RAW / "ne"
_cache = {}


def _layer(stem, name_fields):
    if stem in _cache:
        return _cache[stem]
    r = shapefile.Reader(str(NE / f"{stem}.shp"), encoding="utf-8")
    geoms, names = [], []
    for sr in r.iterShapeRecords():
        rec = sr.record.as_dict()
        nm = next((rec.get(f) for f in name_fields if rec.get(f)), None)
        if not nm or sr.shape.shapeType == 0:
            continue
        g = shape(sr.shape.__geo_interface__)
        if not g.is_valid:
            g = g.buffer(0)
        geoms.append(g)
        names.append((nm, rec.get("FEATURECLA", "")))
    _cache[stem] = (STRtree(geoms), geoms, names)
    return _cache[stem]


def _lookup(stem, fields, lat, lon, max_deg=0.0, skip=()):
    tree, geoms, names = _layer(stem, fields)
    p = Point(lon, lat)
    hits = [i for i in tree.query(p) if geoms[i].contains(p) and names[i][1] not in skip]
    if hits:
        i = min(hits, key=lambda k: geoms[k].area)  # most specific containing feature
        return names[i][0]
    if max_deg > 0:
        i = tree.nearest(p)
        if geoms[i].distance(p) <= max_deg and names[i][1] not in skip:
            return names[i][0]
    return None


def tidy(n):
    return n.title() if n and n.isupper() else n


def place(lat, lon):
    region = _lookup("ne_10m_geography_regions_polys", ["NAME"], lat, lon, skip=("Continent", "Dragons-be-here"))
    admin1 = None
    try:
        admin1 = _lookup("ne_10m_admin_1_states_provinces", ["name", "NAME"], lat, lon, max_deg=0.3)
    except Exception:
        pass
    country = _lookup("ne_50m_admin_0_countries", ["NAME", "ADMIN"], lat, lon, max_deg=0.5)
    return dict(region=tidy(region), admin1=admin1, country=country)
