"""PLANETARY TWIN similarity engine.

Design rule: the comparison method follows the nature of the variable.

  direct   Quantities that mean the same thing on both bodies and that Earth can
           actually reach (terrain geometry, albedo, dust optical depth).
           similarity = 0.5 ** (|difference| / tau): it halves for every tau of
           mismatch. tau = TOL_K x the robust spread of that variable over Earth's
           land, so tolerances come from data, not from hand-tuning.

  gap      Quantities where no place on Earth reaches the planetary value
           (temperature, dryness, pressure). Scoring them as distances would
           give ~0 everywhere, hiding real differences between sites, so we
           report GAP CLOSURE: the fraction of the way from "typical Earth land"
           (area-weighted median) to the planetary value that the site gets.
           1 = reaches the target, 0 = no better than ordinary Earth.

  category Lithology classes, compared through an explicit affinity table
           (pipeline/geology.py) — site tier only.

Feature scores are combined inside a factor, and factors into the overall
score, with GEOMETRIC means, so a site cannot buy back a failed variable or
dimension with a good one. Evidence coverage and confidence are computed separately and never
folded into the similarity number.
"""
import numpy as np

from terrain import SLOPE_Q

FACTORS = ["terrain", "thermal", "aridity", "surface", "atmosphere", "ice", "geology"]
FACTOR_LABEL = {
    "terrain": "Terrain", "thermal": "Thermal", "aridity": "Aridity", "surface": "Surface",
    "atmosphere": "Atmosphere", "ice": "Ground ice", "geology": "Geology",
}

# id, factor, method, earth array, target feature key, label, unit, evidence kind of the Earth data
FEATURES = [
    dict(id="slope", factor="terrain", method="distribution", earth="t_slope_q", target="slope_q",
         label="Slope distribution (3.8 km baseline)", unit="deg", earth_kind="measured"),
    dict(id="relief", factor="terrain", method="direct_log", earth="t_relief", target="relief",
         label="Local relief (p95−p5 in 61 km)", unit="m", earth_kind="measured", offset=10.0),
    dict(id="hurst", factor="terrain", method="direct", earth="t_hurst", target="hurst",
         label="Roughness scaling (Hurst exponent)", unit="", earth_kind="measured"),
    dict(id="t_mean", factor="thermal", method="gap", earth="th_t_mean", target="t_mean",
         label="Mean surface temperature", unit="K", earth_kind="blend"),
    dict(id="t_dtr", factor="thermal", method="gap", earth="th_dtr", target="t_dtr",
         label="Diurnal temperature range", unit="K", earth_kind="model"),
    dict(id="t_cold", factor="thermal", method="gap", earth="th_t_cold", target="t_cold",
         label="Coldest sustained temperature", unit="K", earth_kind="blend"),
    dict(id="precip", factor="aridity", method="gap_log", earth="precip", target="precip",
         label="Annual precipitation", unit="mm/yr", earth_kind="blend", floor=10.0),
    dict(id="albedo", factor="surface", method="direct", earth="albedo", target="albedo",
         label="Shortwave surface albedo", unit="", earth_kind="measured"),
    dict(id="bare", factor="surface", method="gap", earth="ndvi_max", target="ndvi",
         label="Vegetation (peak NDVI)", unit="", earth_kind="measured", target_floor=0.08),
    dict(id="pressure", factor="atmosphere", method="gap_log", earth="pressure", target="pressure",
         label="Surface pressure", unit="kPa", earth_kind="model", floor=0.01, bodies=["mars"]),
    dict(id="dust", factor="atmosphere", method="direct", earth="aod", target="dust",
         label="Dust / aerosol optical depth", unit="", earth_kind="measured", bodies=["mars"]),
    dict(id="tqv", factor="atmosphere", method="gap_log", earth="tqv", target="tqv",
         label="Column water vapour", unit="kg/m²", earth_kind="model", floor=0.01, bodies=["mars"]),
    dict(id="cryo", factor="ice", method="proxy_cryo", earth="th_t_mean", target=None,
         label="Permafrost likelihood (from mean surface temperature)", unit="K", earth_kind="proxy", ice_only=True),
    dict(id="frozen", factor="ice", method="proxy_frozen", earth="th_frozen", target=None,
         label="Fraction of year frozen", unit="", earth_kind="proxy", ice_only=True),
]
FEATURE_BY_ID = {f["id"]: f for f in FEATURES}

# Mission profiles = factor weights. They are judgement calls, stated openly, and
# stress-tested in the sensitivity analysis (weights are randomly perturbed).
PROFILES = {
    "balanced": dict(label="Balanced", blurb="Every available dimension counts equally.",
                     w=dict(terrain=1, thermal=1, aridity=1, surface=1, atmosphere=1, ice=1, geology=1)),
    "science": dict(label="Field science", blurb="Geological process fidelity first: rocks, dryness, surface.",
                    w=dict(terrain=1.0, thermal=0.5, aridity=1.5, surface=1.0, atmosphere=0.25, ice=0.5, geology=2.5)),
    "environment": dict(label="Hardware & environment", blurb="Thermal, atmospheric and moisture stress on equipment and crews.",
                        w=dict(terrain=0.5, thermal=2.5, aridity=1.5, surface=0.5, atmosphere=1.5, ice=0.5, geology=0.0)),
    "mobility": dict(label="Rover mobility", blurb="Slopes, relief and roughness at traverse-planning scale.",
                     w=dict(terrain=3.5, thermal=0.25, aridity=0.75, surface=1.0, atmosphere=0.0, ice=0.0, geology=0.5)),
    "ice": dict(label="Ice prospecting", blurb="Frozen ground, cold and dryness for volatile-access rehearsal.",
                w=dict(terrain=0.75, thermal=2.0, aridity=1.0, surface=0.5, atmosphere=0.25, ice=2.5, geology=0.25)),
}

DEFAULT_PARAMS = dict(tol_k=0.5, precip_floor=10.0, agg="geometric", floor=0.02, match_threshold=0.6)
EVIDENCE_GRADE = {"measured": 1.0, "definition": 1.0, "blend": 0.85, "model": 0.7, "literature": 0.6, "proxy": 0.5, "category": 0.5}


def wquantile(x, w, q):
    ok = np.isfinite(x)
    x, w = x[ok], w[ok]
    o = np.argsort(x)
    cw = np.cumsum(w[o])
    return np.interp(np.asarray(q) * cw[-1], cw, x[o])


def earth_reference(E, area):
    """Area-weighted medians (gap anchors) and robust spreads (tolerances) over Earth's land."""
    ref = {}
    def stats(v):
        p16, p50, p84 = wquantile(v, area, [0.16, 0.5, 0.84])
        return dict(median=float(p50), sigma=float((p84 - p16) / 2))
    for f in FEATURES:
        v = E[f["earth"]]
        if f["method"] == "distribution":
            ref[f["id"]] = stats(np.log10(v[SLOPE_Q.index(50)] + 0.1))
        elif f["method"] == "direct_log":
            ref[f["id"]] = stats(np.log10(v + f["offset"]))
        elif f["method"] == "gap_log":
            ref[f["id"]] = stats(np.log10(np.maximum(v, f["floor"])))
        else:
            ref[f["id"]] = stats(v)
    return ref


def applicable(f, target):
    if f.get("ice_only") and not target["ice"]:
        return False
    if "bodies" in f and target["body"] not in f["bodies"]:
        return False
    return True


def feature_score(f, E, target, ref, P):
    """Similarity in [0, 1] of every Earth cell to `target` for one feature (NaN = no data)."""
    m = f["method"]
    x = E[f["earth"]]
    r = ref[f["id"]]
    if m == "distribution":
        tq = np.log10(np.array(target["slope_q"]) + 0.1)[:, None]
        d = np.mean(np.abs(np.log10(x + 0.1) - tq), axis=0)
        return 0.5 ** (d / (P["tol_k"] * r["sigma"]))
    tv = target["features"][f["target"]]["value"] if f["target"] else None
    if m == "direct_log":
        d = np.abs(np.log10(x + f["offset"]) - np.log10(tv + f["offset"]))
        return 0.5 ** (d / (P["tol_k"] * r["sigma"]))
    if m == "direct":
        return 0.5 ** (np.abs(x - tv) / (P["tol_k"] * r["sigma"]))
    if m in ("gap", "gap_log"):
        if m == "gap_log":
            floor = P["precip_floor"] if f["id"] == "precip" else f["floor"]
            xe = np.log10(np.maximum(x, floor))
            t = np.log10(max(tv, floor))
            # the Earth anchor must use the same floor
            anchor = r["median"]
        else:
            xe, t, anchor = x, tv, r["median"]
            if "target_floor" in f:  # values past the floor are as good as the floor (e.g. bare ground)
                t = max(tv, f["target_floor"])
                xe = np.maximum(x, f["target_floor"])
        span = t - anchor
        if abs(span) < 1e-9:
            return np.where(np.isfinite(xe), 1.0, np.nan)
        g = (xe - anchor) / span
        # beyond the target counts against the site symmetrically
        return np.clip(np.where(g > 1, 2 - g, g), 0, 1)
    if m == "proxy_cryo":
        return 1.0 / (1.0 + np.exp((x - 271.15) / 2.0))
    if m == "proxy_frozen":
        return np.clip(x, 0, 1)
    raise ValueError(m)


def all_feature_scores(E, target, ref, P=DEFAULT_PARAMS):
    return {f["id"]: feature_score(f, E, target, ref, P) for f in FEATURES if applicable(f, target)}


def factor_scores(fs, P=DEFAULT_PARAMS):
    """Combine the available feature scores inside each factor (geometric mean by default, so
    one failed variable cannot hide behind a good one: an ice sheet is bare but not rock-coloured).
    Also returns the fraction of the factor's features that had data."""
    out, cov = {}, {}
    for fac in FACTORS:
        ids = [f["id"] for f in FEATURES if f["factor"] == fac and f["id"] in fs]
        if not ids:
            continue
        a = np.stack([fs[i] for i in ids])
        n = np.isfinite(a).sum(0)
        with np.errstate(invalid="ignore", divide="ignore"):
            if P["agg"] == "geometric":
                v = np.exp(np.nansum(np.log(np.maximum(a, P["floor"])), 0) / np.maximum(n, 1))
            else:
                v = np.nansum(a, 0) / np.maximum(n, 1)
        out[fac] = np.where(n > 0, v, np.nan)
        cov[fac] = n / len(ids)
    return out, cov


def combine(fac, cov, weights, P=DEFAULT_PARAMS, expected=None):
    """Weighted geometric (default) or arithmetic mean over available factors.
    Returns (overall, coverage). `expected` = factors that this target/profile should
    have; missing ones lower coverage but are not counted as zero similarity."""
    expected = expected or list(fac)
    num = den = covn = 0.0
    wtot = sum(weights.get(k, 0) for k in expected)
    for k in expected:
        w = weights.get(k, 0)
        if w <= 0 or k not in fac:
            continue
        s = fac[k]
        ok = np.isfinite(s)
        v = np.log(np.maximum(s, P["floor"])) if P["agg"] == "geometric" else s
        num = num + np.where(ok, w * v, 0.0)
        den = den + np.where(ok, w, 0.0)
        covn = covn + np.where(ok, w * cov[k], 0.0)
    with np.errstate(invalid="ignore", divide="ignore"):
        mean = num / den
    overall = np.exp(mean) if P["agg"] == "geometric" else mean
    return np.where(den > 0, overall, np.nan), covn / max(wtot, 1e-9)


def expected_factors(target, with_geology=False):
    out = ["terrain", "thermal", "aridity", "surface"]
    if target["body"] == "mars":
        out.append("atmosphere")
    if target["ice"]:
        out.append("ice")
    if with_geology:
        out.append("geology")
    return out
