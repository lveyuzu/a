"""Checks on the scientific calculations. Run:  python pipeline/test_pipeline.py
Needs no downloaded data (pure functions on synthetic inputs)."""
import numpy as np

import geology as geo
from config import RADIUS_KM, STEP_KM, WIN_N
from fetch_diviner import gcp_band
from score import DEFAULT_PARAMS, FEATURE_BY_ID, combine, factor_scores, feature_score
from terrain import SLOPE_Q, terrain_features, window_coords

P = dict(DEFAULT_PARAMS)


def target(**values):
    return dict(body="mars", ice=True, slope_q=[0.2, 0.5, 1.0, 2.0, 4.0, 6.0, 9.0],
                features={k: dict(value=v) for k, v in values.items()})


def test_window_spacing():
    """Samples are STEP_KM apart on the ground at the equator and near a pole, on any body."""
    for body in ("earth", "mars", "moon"):
        for lat in (0.0, 60.0, -84.0):
            la, lo = window_coords(np.array([lat]), np.array([30.0]), RADIUS_KM[body])
            p = np.radians(la[0]); q = np.radians(lo[0])
            xyz = RADIUS_KM[body] * np.stack([np.cos(p) * np.cos(q), np.cos(p) * np.sin(q), np.sin(p)], -1)
            ew = np.linalg.norm(xyz[:, 1:] - xyz[:, :-1], axis=-1)
            ns = np.linalg.norm(xyz[1:] - xyz[:-1], axis=-1)
            c = WIN_N // 2  # the projection is exact along lines through the centre
            assert abs(ew[c].mean() - STEP_KM) < 0.02 and abs(ns[:, c].mean() - STEP_KM) < 0.02, (body, lat)
            assert abs(ew.mean() - STEP_KM) / STEP_KM < 0.01, (body, lat, ew.mean())


def test_terrain_plane():
    """A tilted plane has a single known slope, zero roughness and Hurst exponent 1."""
    off = (np.arange(WIN_N) - (WIN_N - 1) / 2) * STEP_KM * 1000
    x, _ = np.meshgrid(off, off)
    z = (np.tan(np.radians(3.0)) * x)[None]
    f = terrain_features(z)
    assert np.allclose(f["slope_q"], 3.0, atol=1e-3)
    assert f["rough"][0] < 1e-2 and abs(f["hurst"][0] - 1) < 1e-3
    assert abs(f["relief"][0] - (np.percentile(z, 95) - np.percentile(z, 5))) < 1.0


def test_terrain_mask():
    z = np.random.default_rng(0).normal(0, 50, (1, WIN_N, WIN_N))
    z[0, :, : WIN_N // 2] = np.nan  # half water: below the 80 % validity threshold
    f = terrain_features(z)
    assert np.isnan(f["relief"][0]) and np.isnan(f["slope_q"][0]).all()


def test_direct_kernel():
    """Identical value scores 1; one tolerance of mismatch scores exactly 0.5."""
    f = FEATURE_BY_ID["albedo"]
    ref = {"albedo": dict(median=0.15, sigma=0.10)}
    tau = P["tol_k"] * 0.10
    s = feature_score(f, {"albedo": np.array([0.20, 0.20 + tau, 0.20 - 2 * tau])}, target(albedo=0.20), ref, P)
    assert np.allclose(s, [1.0, 0.5, 0.25])


def test_gap_closure():
    """Earth median -> 0, planetary value -> 1, halfway -> 0.5, overshoot penalised symmetrically."""
    f = FEATURE_BY_ID["t_mean"]
    ref = {"t_mean": dict(median=290.0, sigma=18.0)}
    s = feature_score(f, {"th_t_mean": np.array([290.0, 220.0, 255.0, 300.0, 185.0])}, target(t_mean=220.0), ref, P)
    assert np.allclose(s, [0.0, 1.0, 0.5, 0.0, 0.5])


def test_precip_floor_and_bare_ground():
    f = FEATURE_BY_ID["precip"]
    ref = {"precip": dict(median=np.log10(500.0), sigma=0.5)}
    s = feature_score(f, {"precip": np.array([0.0, 5.0, 10.0, 500.0, 2000.0])}, target(precip=0.0), ref, P)
    assert np.allclose(s[:3], 1.0) and s[3] == 0 and s[4] == 0  # anything at or below the floor is "no rain"
    f = FEATURE_BY_ID["bare"]
    s = feature_score(f, {"ndvi_max": np.array([-0.05, 0.08, 0.6])}, target(ndvi=0.0), {"bare": dict(median=0.6, sigma=0.3)}, P)
    assert np.allclose(s, [1.0, 1.0, 0.0])  # snow / bare soil are not penalised for being "barer than bare"


def test_slope_distribution_self_match():
    f = FEATURE_BY_ID["slope"]
    t = target()
    q = np.array(t["slope_q"])[:, None]
    s = feature_score(f, {"t_slope_q": np.concatenate([q, q * 1.75], 1)}, t, {"slope": dict(median=0.0, sigma=0.486)}, P)
    assert abs(s[0] - 1) < 1e-9 and 0.45 < s[1] < 0.6  # same distribution = 1; x1.75 steeper is about one tolerance
    assert len(t["slope_q"]) == len(SLOPE_Q)


def test_geometric_aggregation():
    """One failed variable or dimension cannot be bought back; zero weights and missing factors are ignored."""
    fs = {"albedo": np.array([0.0, 1.0]), "bare": np.array([1.0, 1.0])}
    fac, cov = factor_scores(fs, P)
    assert abs(fac["surface"][0] - np.sqrt(P["floor"])) < 1e-9 and fac["surface"][1] == 1.0
    fa = {"terrain": np.array(0.9), "thermal": np.array(0.0), "surface": np.array(np.nan)}
    cv = {k: np.array(1.0) for k in fa}
    o, c = combine(fa, cv, dict(terrain=1, thermal=1, surface=2), P, expected=["terrain", "thermal", "surface"])
    assert abs(float(o) - np.sqrt(0.9 * P["floor"])) < 1e-9
    assert abs(float(c) - 0.5) < 1e-9  # the missing factor carries half the weight -> coverage 50 %
    o2, _ = combine(fa, cv, dict(terrain=1, thermal=0, surface=0), P, expected=["terrain", "thermal", "surface"])
    assert abs(float(o2) - 0.9) < 1e-9


def test_geology():
    assert "volc_mafic" in geo.classify("Mafic volcanic rocks; basalt")
    assert "evaporite" in geo.classify("gypsum and halite playa deposits")
    s, d = geo.geology_score(["volc_mafic", "lava_tube", "regolith"], ["volc_mafic"])
    assert s == 1.0 and len(d) == 1  # process classes are not scored
    s, _ = geo.geology_score(["volc_mafic"], ["sed_clastic"])
    assert s == geo.BASE_ROCK
    s, _ = geo.geology_score(["volc_mafic"], ["ice"])
    assert s == 0.0
    assert geo.geology_score(["impact", "regolith"], ["sed_clastic"])[0] is None  # nothing assessable -> no score, lower coverage


def test_diviner_file_naming():
    assert gcp_band(-5.0)[1].endswith("global_cumul_avg_cyl_10s00s_002.tab")
    assert gcp_band(5.0)[1].endswith("global_cumul_avg_cyl_00n10n_002.tab")
    assert gcp_band(-85.2)[1].endswith("global_cumul_avg_cyl_90s80s_002.tab")
    assert gcp_band(14.09)[0] == 10


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        t()
        print("ok  ", t.__name__)
    print(f"{len(tests)} tests passed")
