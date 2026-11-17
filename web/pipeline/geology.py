"""Site-tier geology: lithology at each candidate from Macrostrat's global geologic
map compilation (CC-BY 4.0; Peters et al. 2018, Geochem. Geophys. Geosyst. 19, 1393),
reduced to a small class vocabulary and compared with the documented geology of
the planetary reference region through an explicit affinity table.

This evidence is independent of everything used in the gridded scan, so it also
serves as a check on candidates the scan surfaces.

Limits (stated in the app): map units are 1:1M–1:50M compilations, so a class
being present "at" a site means "mapped in the unit containing the point".
Process classes that maps do not encode — impact structures, lava tubes,
periglacial landforms, mass wasting, regolith maturity — are NOT scored.
"""
import json
import re
import time
import urllib.request

from config import INTERIM

CLASS_LABEL = {
    "volc_mafic": "Basaltic / mafic volcanic", "volc_other": "Intermediate–felsic volcanic",
    "plut_mafic": "Mafic–ultramafic intrusive", "anorthosite": "Anorthosite", "plut_felsic": "Granitic intrusive",
    "sed_clastic": "Clastic sedimentary", "carbonate": "Carbonate", "evaporite": "Evaporite / salt",
    "aeolian": "Aeolian sand / loess", "unconsolidated": "Unconsolidated surficial deposits",
    "metamorphic": "Metamorphic", "ice": "Glacier ice", "other_rock": "Other exposed rock / sediment",
    # process classes (documented for targets, not assessable from lithology maps)
    "impact": "Impact structure", "lava_tube": "Lava tubes / pits", "periglacial": "Periglacial ground ice landforms",
    "mass_wasting": "Landslides / mass wasting", "regolith": "Impact-gardened regolith",
}
UNASSESSED = {"impact", "lava_tube", "periglacial", "mass_wasting", "regolith"}

# Order matters: first match wins for the more specific volcanic / intrusive classes.
RULES = [
    ("anorthosite", r"anorthosit"),
    ("volc_mafic", r"basalt|basanit|tholei|mafic volcan|basic volcan|scoria|picrit|flood volcan"),
    ("plut_mafic", r"gabbro|norit|ultramafic|peridot|dunite|pyroxenit|mafic intrus|basic intrus|diabase|dolerite|troctolit|ophiolit|mafic"),
    ("volc_other", r"volcan|andesit|rhyolit|dacit|tuff|ignimbrit|pyroclast|trachyt|lava|tephra"),
    ("plut_felsic", r"granit|granodior|tonalit|diorit|syenit|monzon|plutonic|intrusive|pegmatit"),
    ("evaporite", r"evaporit|gypsum|halite|anhydrit|\bsalt\b|playa|sabkha|salar|saline"),
    ("carbonate", r"limestone|dolomit|dolostone|carbonate|marl|chalk|travertin"),
    ("aeolian", r"eolian|aeolian|dune|loess|sand sea|\berg\b|wind-blown|windblown"),
    ("sed_clastic", r"sandstone|shale|siltstone|mudstone|conglomerat|clastic|arenit|claystone|greywacke|graywacke|sedimentary|fluvial|lacustrine|deltaic|turbidit|flysch|molasse|breccia|arkose"),
    ("unconsolidated", r"unconsolidated|alluvi|colluvi|gravel|surficial|\btill\b|glacial drift|moraine|\bsand\b|\bsilt\b|\bclay\b|quaternary|regolith|talus"),
    ("metamorphic", r"gneiss|schist|metamorph|quartzit|slate|phyllit|marble|migmatit|amphibolit|granulit|metased|metavolc"),
    ("ice", r"\bice\b|glacier|ice sheet|ice cap"),
]

# AFFINITY[target class][site class] = how well the terrestrial lithology stands in for the planetary one.
AFFINITY = {
    "volc_mafic": {"volc_mafic": 1.0, "plut_mafic": 0.6, "volc_other": 0.4},
    "anorthosite": {"anorthosite": 1.0, "plut_mafic": 0.5, "plut_felsic": 0.2},
    "sed_clastic": {"sed_clastic": 1.0, "unconsolidated": 0.6, "aeolian": 0.4, "carbonate": 0.2},
    "carbonate": {"carbonate": 1.0, "evaporite": 0.3},
    "evaporite": {"evaporite": 1.0, "carbonate": 0.25},
    "aeolian": {"aeolian": 1.0, "unconsolidated": 0.5, "sed_clastic": 0.4},
}


BASE_ROCK = 0.15  # affinity of any exposed rock / sediment that is not the documented lithology


def classify(text):
    t = text.lower()
    return [c for c, rx in RULES if re.search(rx, t)]


def macrostrat(lat, lon):
    """Map units containing the point, all compilation scales. Cached on disk."""
    cache = INTERIM / "macrostrat"
    cache.mkdir(parents=True, exist_ok=True)
    f = cache / f"{lat:.3f}_{lon:.3f}.json"
    if f.exists():
        return json.loads(f.read_text())
    url = f"https://macrostrat.org/api/v2/geologic_units/map?lat={lat:.4f}&lng={lon:.4f}&format=json"
    data = None
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "planetary-twin-pipeline/1.0"})
            raw = json.loads(urllib.request.urlopen(req, timeout=60).read())
            data = raw.get("success", {}).get("data", [])
            refs = raw.get("success", {}).get("refs", {})
            break
        except Exception:
            time.sleep(2 * (attempt + 1))
    if data is None:
        return None  # network failure: do not cache, geology stays "no data"
    units = [dict(name=u.get("name", ""), lith=u.get("lith", ""), descrip=(u.get("descrip") or "")[:300],
                  age=u.get("best_int_name", ""), b_age=u.get("b_age"), t_age=u.get("t_age"),
                  scale=u.get("scale", ""), ref=refs.get(str(u.get("source_id")), "")) for u in data]
    f.write_text(json.dumps(units))
    time.sleep(0.25)
    return units


def site_geology(lat, lon):
    units = macrostrat(lat, lon)
    if units is None:
        return None
    classes = {}
    for u in units:
        for c in classify(" ".join([u["lith"], u["name"], u["descrip"]])):
            classes.setdefault(c, []).append(u["scale"])
    order = {"large": 0, "medium": 1, "small": 2, "tiny": 3}
    best = sorted(units, key=lambda u: order.get(u["scale"], 9))
    return dict(classes=sorted(classes), units=best[:4], n_units=len(units),
                best_scale=best[0]["scale"] if best else None)


def geology_score(target_classes, site_classes):
    """Mean, over the assessable lithologies documented at the target, of the best
    affinity offered by any lithology mapped at the site. Returns (score, detail)."""
    assess = [c for c in target_classes if c not in UNASSESSED]
    if not assess or site_classes is None:
        return None, []
    detail = []
    for c in assess:
        best, via = 0.0, None
        for s in site_classes:
            a = AFFINITY.get(c, {}).get(s, 0.0)
            if a > best:
                best, via = a, s
        if best == 0.0 and any(sc != "ice" for sc in site_classes):
            best, via = BASE_ROCK, "other_rock"  # wrong lithology, but still exposed rock or sediment
        detail.append(dict(target=c, match=via, affinity=best))
    return sum(d["affinity"] for d in detail) / len(assess), detail
