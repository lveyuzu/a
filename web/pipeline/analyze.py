"""Run the full analysis: score every land cell against every reference region,
extract candidate regions, add site-tier geology, validate against established
analogs, test sensitivity, build the complementary portfolio, and export
everything the web application needs.

Stage 1  global scan      all land cells, factors: terrain, thermal, aridity, surface, atmosphere, ice
Stage 2  site tier        established analogs + top regions from stage 1, adds independent geology
"""
import json
import sys
import time

import numpy as np
from PIL import Image

import geology as geo
import names
from config import GRID_DEG, INTERIM, KNOWN_ANALOGS, PLACE_LABELS, STEP_KM, TARGETS, WEB_DATA, WIN_N
from provenance import DATASETS, LIMITATIONS
from score import (DEFAULT_PARAMS, EVIDENCE_GRADE, FACTOR_LABEL, FACTORS, FEATURES, PROFILES, all_feature_scores,
                   applicable, combine, earth_reference, expected_factors, factor_scores, wquantile)
from terrain import SLOPE_Q, load_dem, window_coords

RNG = np.random.default_rng(20261113)
N_SENS = 150
NMS_KM = 250.0
TOP_DEFAULT, TOP_OTHER = 8, 3
MERGE_KM = 80.0


def hav(lat1, lon1, lat2, lon2):
    p1, p2 = np.radians(lat1), np.radians(lat2)
    a = np.sin((p2 - p1) / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(np.radians(lon2 - lon1) / 2) ** 2
    return 2 * 6371.0088 * np.arcsin(np.sqrt(np.clip(a, 0, 1)))


def percentile_of(scores, area, idx):
    """Area-weighted share of Earth's land scoring below each cell in idx (0..100)."""
    ok = np.isfinite(scores)
    o = np.argsort(scores[ok])
    cw = np.cumsum(area[ok][o])
    s_sorted = scores[ok][o]
    pos = np.searchsorted(s_sorted, scores[idx], side="left")
    below = np.where(pos > 0, cw[np.clip(pos - 1, 0, len(cw) - 1)], 0.0)
    return np.where(np.isfinite(scores[idx]), 100.0 * below / cw[-1], np.nan)


def nms(score, lat, lon, k, radius_km, pool=6000):
    order = np.argsort(-np.where(np.isfinite(score), score, -1))[:pool]
    picked = []
    for i in order:
        if not np.isfinite(score[i]):
            break
        if all(hav(lat[i], lon[i], lat[j], lon[j]) > radius_km for j in picked):
            picked.append(i)
            if len(picked) == k:
                break
    return picked


def r(v, n=4):
    if v is None:
        return None
    v = float(v)
    return None if not np.isfinite(v) else round(v, n)


def main():
    t0 = time.time()
    WEB_DATA.mkdir(parents=True, exist_ok=True)
    (WEB_DATA / "grid").mkdir(exist_ok=True)
    G = np.load(INTERIM / "earth_grid.npz")
    targets = json.loads((INTERIM / "targets.json").read_text())
    land2d = G["land"]
    nlat, nlon = land2d.shape
    ii, jj = np.nonzero(land2d)
    lat, lon = G["lat"][ii], G["lon"][jj]
    area = np.cos(np.radians(lat))
    E = {}
    for k in G.files:
        a = G[k]
        if a.ndim == 2 and a.shape == land2d.shape:
            E[k] = a[ii, jj]
        elif a.ndim == 3:
            E[k] = a[:, ii, jj]
    ncell = len(ii)
    print(f"{ncell} land cells; {len(targets)} reference regions", flush=True)

    ref = earth_reference(E, area)
    P0 = dict(DEFAULT_PARAMS)

    # eligibility for candidate extraction: mostly land, terrain window mostly unmasked, core factors present
    eligible = (E["land_frac"] >= 0.75) & (E["t_valid"] >= 0.8)

    # ------------------------------------------------------------ Stage 1: global scan
    FS, FAC, COV = {}, {}, {}
    for t in targets:
        fs = all_feature_scores(E, t, ref, P0)
        fac, cov = factor_scores(fs, P0)
        FS[t["id"]], FAC[t["id"]], COV[t["id"]] = fs, fac, cov
        t["factors"] = expected_factors(t)
        for k, v in fac.items():
            img = np.zeros((nlat, nlon), "u1")
            img[ii, jj] = np.where(np.isfinite(v), 1 + np.round(np.clip(v, 0, 1) * 254), 0).astype("u1")
            Image.fromarray(img, "L").save(WEB_DATA / "grid" / f"{t['id']}_{k}.png", optimize=True)
    print(f"stage 1 scored in {time.time() - t0:.0f}s", flush=True)

    def overall(tid, profile, with_geo=None, P=P0, weights=None):
        t = next(x for x in targets if x["id"] == tid)
        w = weights or PROFILES[profile]["w"]
        return combine(FAC[tid], COV[tid], w, P, expected=expected_factors(t))

    # ------------------------------------------------------------ candidate regions
    cand = {}  # cell index -> list of (target, profile, rank)
    for t in targets:
        for pname in PROFILES:
            s, c = overall(t["id"], pname)
            s = np.where(eligible & (c > 0.999), s, np.nan)
            k = TOP_DEFAULT if pname == "balanced" else TOP_OTHER
            for rank, i in enumerate(nms(s, lat, lon, k, NMS_KM)):
                cand.setdefault(int(i), []).append((t["id"], pname, rank + 1))

    # Regional probe requested in the challenge brief: how does Mongolia's Gobi do?
    mong = np.array([names.place(la, lo)["country"] == "Mongolia" if (41 < la < 52.5 and 87 < lo < 120.5) else False
                     for la, lo in zip(lat, lon)])
    probe = {}
    for t in targets:
        s, c = overall(t["id"], "balanced")
        s = np.where(eligible & mong, s, np.nan)
        if np.isfinite(s).any():
            i = int(np.nanargmax(s))
            probe.setdefault(i, []).append(t["id"])

    # ------------------------------------------------------------ site list
    sites = []
    def cell_near(la, lo):
        d = hav(la, lo, lat, lon)
        d = np.where(np.isfinite(E["t_relief"]) & np.isfinite(E["th_t_mean"]), d, 1e9)
        i = int(np.argmin(d))
        return i if d[i] < 60 else None
    for k in KNOWN_ANALOGS:
        i = cell_near(k["lat"], k["lon"])
        sites.append(dict(id=k["id"], kind="known", name=k["name"], lat=k["lat"], lon=k["lon"], cell=i,
                          known=dict(note=k["note"], ref=k["ref"], basis=k["basis"], for_=k["for_"]), found=[]))
    order = sorted(cand.items(), key=lambda kv: min(x[2] for x in kv[1]))
    for i, hits in order + [(i, []) for i in probe if i not in cand]:
        la, lo = float(lat[i]), float(lon[i])
        near = [s for s in sites if hav(la, lo, s["lat"], s["lon"]) < MERGE_KM]
        if near:
            near[0]["found"] += hits
            if i in probe:
                near[0].setdefault("probe", []).extend(probe[i])
            continue
        pl = names.place(la, lo)
        for gla, glo, gkm, gname in PLACE_LABELS:
            if hav(la, lo, gla, glo) <= gkm:
                pl["region"] = gname
                break
        parts = [pl["region"], pl["admin1"] if pl["admin1"] != pl["country"] else None, pl["country"]]
        nm = " · ".join(dict.fromkeys(p for p in parts if p)) or f"{la:.2f}°, {lo:.2f}°"
        s = dict(id=f"c{len(sites):03d}", kind="candidate", name=nm, lat=la, lon=lo, cell=i, place=pl, found=list(hits))
        if i in probe:
            s["probe"] = probe[i]
        sites.append(s)
    print(f"{len(sites)} sites in tier ({sum(s['kind'] == 'candidate' for s in sites)} candidates)", flush=True)

    # distance from each candidate to the nearest established analog (context for novelty claims)
    known = [s for s in sites if s["kind"] == "known"]
    for s in sites:
        if s["kind"] == "candidate":
            d = [(hav(s["lat"], s["lon"], k["lat"], k["lon"]), k["name"]) for k in known]
            dm = min(d)
            s["nearest_known"] = dict(km=round(float(dm[0])), name=dm[1])

    # ------------------------------------------------------------ Stage 2: geology + windows
    dem = load_dem("earth")
    for n, s in enumerate(sites):
        s["geology"] = geo.site_geology(s["lat"], s["lon"])
        la, lo = window_coords(np.array([s["lat"]]), np.array([s["lon"]]), dem.radius)
        z = dem.sample(la, lo)[0]
        s["window"] = np.round(z).astype(int).tolist()
        s["profile"] = np.round(z[WIN_N // 2]).astype(int).tolist()
        if "place" not in s:
            s["place"] = names.place(s["lat"], s["lon"])
        if n % 25 == 0:
            print(f"  geology {n}/{len(sites)}", flush=True)
    del dem

    # ------------------------------------------------------------ sensitivity (stage-1 factors, balanced profile)
    cells = np.array([s["cell"] if s["cell"] is not None else 0 for s in sites])
    sub = RNG.choice(ncell, 20000, replace=False, p=area / area.sum())
    SENS = {}
    for t in targets:
        base, _ = overall(t["id"], "balanced")
        base_rank = np.argsort(np.argsort(base[sub]))
        pct_runs, rho = [], []
        exp = expected_factors(t)
        for _ in range(N_SENS):
            P = dict(P0, tol_k=float(np.exp(RNG.uniform(np.log(0.25), np.log(1.0)))),
                     precip_floor=float(RNG.choice([2.0, 5.0, 10.0, 20.0])),
                     agg="geometric" if RNG.random() < 0.7 else "arithmetic")
            w = {k: float(np.exp(RNG.normal(0, 0.5))) for k in exp}
            if RNG.random() < 0.25:
                w[RNG.choice(exp)] = 0.0
            fac, cov = factor_scores(all_feature_scores(E, t, ref, P), P)
            s, _ = combine(fac, cov, w, P, expected=exp)
            pct_runs.append(percentile_of(s, area, cells))
            rk = np.argsort(np.argsort(s[sub]))
            rho.append(np.corrcoef(base_rank, rk)[0, 1])
        pr = np.array(pct_runs)
        SENS[t["id"]] = dict(p10=np.nanpercentile(pr, 10, 0), p50=np.nanpercentile(pr, 50, 0), p90=np.nanpercentile(pr, 90, 0),
                             top1=(pr >= 99).mean(0), top5=(pr >= 95).mean(0),
                             rho_mean=float(np.mean(rho)), rho_min=float(np.min(rho)))
        print(f"  sensitivity {t['id']}: mean Spearman vs baseline {np.mean(rho):.3f} (min {np.min(rho):.3f})", flush=True)

    # ------------------------------------------------------------ per-site scores
    PCT = {(t["id"], p): None for t in targets for p in PROFILES}
    GRID_OVERALL = {}
    for t in targets:
        for p in PROFILES:
            s, _ = overall(t["id"], p)
            GRID_OVERALL[(t["id"], p)] = s
            PCT[(t["id"], p)] = percentile_of(s, area, cells)

    feat_keys = dict(slope_med=("t_slope_q", SLOPE_Q.index(50)), slope_p90=("t_slope_q", SLOPE_Q.index(90)), relief="t_relief",
                     rough="t_rough", hurst="t_hurst", elev="t_elev", t_mean="th_t_mean", t_dtr="th_dtr", t_cold="th_t_cold",
                     t_warm="th_t_warm", frozen="th_frozen", precip="precip", tqv="tqv", albedo="albedo", ndvi="ndvi_max",
                     pressure="pressure", dust="aod", wind10="wind10", uv_index="uv_index", f_barren="f_barren", f_ice="f_ice",
                     modis_t_mean="modis_t_mean", merra_t_mean="merra_t_mean", modis_dtr="modis_dtr",
                     imerg_precip="imerg_precip", merra_precip="merra_precip", modis_albedo="modis_albedo", ceres_albedo="ceres_albedo")
    tkind = {t["id"]: {k: v["kind"] for k, v in t["features"].items()} for t in targets}
    for n, s in enumerate(sites):
        i = s["cell"]
        if i is None:
            s["features"], s["scores"] = None, {}
            continue
        fv = {}
        for k, src in feat_keys.items():
            fv[k] = r(E[src[0]][src[1], i] if isinstance(src, tuple) else E[src][i], 4)
        fv["slope_q"] = [r(v, 4) for v in E["t_slope_q"][:, i]]
        s["features"] = fv
        s["sources"] = dict(thermal="MODIS" if bool(E["th_src_modis"][i]) else "MERRA-2",
                            albedo="MODIS" if bool(E["albedo_src_modis"][i]) else "CERES",
                            precip="IMERG" if np.isfinite(E["imerg_precip"][i]) else "MERRA-2")
        s["cell_center"] = [float(lat[i]), float(lon[i])]
        s["scores"] = {}
        gcls = s["geology"]["classes"] if s["geology"] else None
        for t in targets:
            tid = t["id"]
            fsc = {k: r(v[i]) for k, v in FS[tid].items()}
            fac = {k: r(v[i]) for k, v in FAC[tid].items()}
            gs, gdetail = geo.geology_score(t["geology"], gcls)
            if gs is not None:
                fac["geology"] = r(gs)
            exp = expected_factors(t, with_geology=True)
            ov, cv = {}, {}
            for pname, prof in PROFILES.items():
                facv = {k: np.array(v if v is not None else np.nan) for k, v in fac.items()}
                covv = {k: np.array(float(COV[tid][k][i])) if k in COV[tid] else np.array(1.0) for k in facv}
                o, c = combine(facv, covv, prof["w"], P0, expected=exp)
                ov[pname], cv[pname] = r(float(o)), r(float(c), 3)
            # evidence quality: weakest of (Earth data kind, planetary data kind) per feature, averaged
            grades = []
            for f in FEATURES:
                if f["id"] in fsc and fsc[f["id"]] is not None:
                    tk = tkind[tid].get(f["target"] if f["target"] != "slope_q" else "slope_med", "measured") if f["target"] else "measured"
                    grades.append(min(EVIDENCE_GRADE[f["earth_kind"]], EVIDENCE_GRADE[tk]))
            if gs is not None:
                grades.append(EVIDENCE_GRADE["category"])
            evidence = float(np.mean(grades)) if grades else 0.0
            sp = SENS[tid]
            spread = float(sp["p90"][n] - sp["p10"][n]) if np.isfinite(sp["p90"][n]) else 100.0
            stability = float(np.clip(1 - spread / 20.0, 0, 1))
            conf = cv["balanced"] * evidence * stability
            s["scores"][tid] = dict(
                f=fsc, fac=fac, geo=gdetail, overall=ov, cov=cv,
                pct={p: r(PCT[(tid, p)][n], 2) for p in PROFILES},
                matched=[k for k in exp if fac.get(k) is not None and fac[k] >= P0["match_threshold"]],
                expected=exp,
                conf=dict(value=r(conf, 3), coverage=cv["balanced"], evidence=r(evidence, 3), stability=r(stability, 3),
                          label="high" if conf >= 0.55 else "moderate" if conf >= 0.35 else "low",
                          pct_p10=r(sp["p10"][n], 2), pct_p50=r(sp["p50"][n], 2), pct_p90=r(sp["p90"][n], 2),
                          top1=r(sp["top1"][n], 3), top5=r(sp["top5"][n], 3)))
        s.pop("cell")

    # ------------------------------------------------------------ validation: known-analog recovery
    # For each established analog: its best percentile over the reference regions of the body it is
    # used for. The same statistic is computed for EVERY land cell, giving a null distribution, so
    # u = share of Earth's land whose best percentile is lower. A random location has u ~ Uniform(0,1).
    ALLPCT = {key: percentile_of(v, area, np.arange(ncell)).astype("f4") for key, v in GRID_OVERALL.items()}
    cell_of = {s["id"]: int(c) for s, c in zip(sites, cells)}
    def best_field(bodies, profs):
        out = np.full(ncell, -np.inf, "f4")
        for t in targets:
            if t["body"] in bodies:
                for p in profs:
                    out = np.fmax(out, ALLPCT[(t["id"], p)])
        return out
    fields = {}
    def calibrated(site_cell, bodies, profs):
        key = (tuple(sorted(bodies)), tuple(profs))
        if key not in fields:
            fields[key] = best_field(bodies, profs)
        f = fields[key]
        v = f[site_cell]
        return float(v), float((area * (f < v)).sum() / area.sum())
    val_rows = []
    for s in sites:
        if s["kind"] != "known" or not s["scores"]:
            continue
        c = cell_of[s["id"]]
        bodies = s["known"]["for_"]
        b_bal, u_bal = calibrated(c, bodies, ["balanced"])
        b_any, u_any = calibrated(c, bodies, list(PROFILES))
        per = [(s["scores"][t["id"]]["pct"]["balanced"], t["id"]) for t in targets if t["body"] in bodies]
        bt = max(per)[1]
        per_any = [(s["scores"][t["id"]]["pct"][p], t["id"], p) for t in targets if t["body"] in bodies for p in PROFILES]
        ba = max(per_any)
        val_rows.append(dict(id=s["id"], name=s["name"], basis=s["known"]["basis"], env="env" in s["known"]["basis"],
                             best_target=bt, best_pct=r(b_bal, 2), u=r(u_bal, 3),
                             any_target=ba[1], any_profile=ba[2], any_pct=r(b_any, 2), u_any=r(u_any, 3),
                             found=bool(s["found"]), found_as=[dict(target=a, profile=b, rank=c2) for a, b, c2 in s["found"]][:6]))
    def summary(rows, key):
        u = np.array([x[key] for x in rows])
        n = len(u)
        z = (u.mean() - 0.5) / (1 / np.sqrt(12 * n)) if n else 0.0
        from math import erf, sqrt
        pval = 0.5 * (1 - erf(z / sqrt(2)))
        return dict(n=n, mean_u=r(u.mean(), 3), median_u=r(float(np.median(u)), 3), top1=int((u >= 0.99).sum()),
                    top5=int((u >= 0.95).sum()), top10=int((u >= 0.90).sum()), top25=int((u >= 0.75).sum()), z=r(z, 2), p=float(f"{pval:.2g}"))
    env_rows = [x for x in val_rows if x["env"]]
    oth_rows = [x for x in val_rows if not x["env"]]
    validation = dict(
        rows=sorted(val_rows, key=lambda x: -x["u_any"]),
        env=dict(balanced=summary(env_rows, "u"), any=summary(env_rows, "u_any")),
        other=dict(balanced=summary(oth_rows, "u"), any=summary(oth_rows, "u_any")),
        sensitivity={t["id"]: dict(rho_mean=r(SENS[t["id"]]["rho_mean"], 3), rho_min=r(SENS[t["id"]]["rho_min"], 3)) for t in targets},
        n_runs=N_SENS,
        unscored=[s["name"] for s in sites if s["kind"] == "known" and not s["scores"]],
        note=("Percentile = area-weighted share of Earth's land that scores lower for a reference region (stage-1 factors, no geology). "
              "u calibrates the 'best of several regions/profiles' statistic against the same statistic for all land, so a random "
              "location has u uniformly distributed between 0 and 1. Known sites never influence weights or tolerances."))

    # ------------------------------------------------------------ portfolio: greedy set cover
    reqs = []
    for t in targets:
        for k in expected_factors(t, with_geology=True):
            reqs.append((t["id"], k))
    TH = P0["match_threshold"]
    usable = [s for s in sites if s["scores"]]
    cover = {s["id"]: {(tid, k) for tid, sc in s["scores"].items() for k, v in sc["fac"].items() if v is not None and v >= TH and (tid, k) in set(reqs)}
             for s in usable}
    chosen, covered = [], set()
    for _ in range(6):
        best = max(usable, key=lambda s: (len(cover[s["id"]] - covered), -abs(s["lat"])))
        gain = cover[best["id"]] - covered
        if not gain:
            break
        covered |= gain
        chosen.append(dict(id=best["id"], name=best["name"], gain=sorted([list(g) for g in gain]), total=len(cover[best["id"]])))
    best_req = {}
    for (tid, k) in reqs:
        cands = [(s["scores"][tid]["fac"].get(k) or 0, s["id"], s["name"]) for s in usable]
        b = max(cands)
        best_req[f"{tid}|{k}"] = dict(score=r(b[0]), site=b[1], name=b[2], covered=(tid, k) in covered)
    portfolio = dict(threshold=TH, n_requirements=len(reqs), n_covered=len(covered), chosen=chosen, best=best_req,
                     requirements=[list(q) for q in reqs])

    # ------------------------------------------------------------ export
    for t in targets:
        t["sensitivity"] = dict(rho_mean=r(SENS[t["id"]]["rho_mean"], 3), rho_min=r(SENS[t["id"]]["rho_min"], 3))
        t["grid"] = {k: f"grid/{t['id']}_{k}.png" for k in FAC[t["id"]]}
        t["geology_assessable"] = [c for c in t["geology"] if c not in geo.UNASSESSED]
    meta = dict(
        generated=time.strftime("%Y-%m-%d"),
        grid=dict(deg=GRID_DEG, nlat=nlat, nlon=nlon, land_cells=int(ncell)),
        window=dict(n=WIN_N, step_km=STEP_KM, size_km=WIN_N * STEP_KM),
        factors=[dict(id=k, label=FACTOR_LABEL[k]) for k in FACTORS],
        features=[{k: v for k, v in f.items() if k not in ("earth",)} for f in FEATURES],
        profiles={k: dict(label=v["label"], blurb=v["blurb"], w=v["w"]) for k, v in PROFILES.items()},
        params=P0, earth_ref={k: dict(median=r(v["median"]), sigma=r(v["sigma"])) for k, v in ref.items()},
        slope_q=SLOPE_Q, geology=dict(labels=geo.CLASS_LABEL, affinity=geo.AFFINITY, unassessed=sorted(geo.UNASSESSED)),
        evidence_grade=EVIDENCE_GRADE, datasets=DATASETS, limitations=LIMITATIONS,
        counts=dict(sites=len(sites), known=len(known), candidates=len(sites) - len(known), targets=len(targets)),
        sensitivity=dict(runs=N_SENS, description="Each run redraws factor weights (log-normal, σ=0.5), the tolerance multiplier (0.25–1.0), "
                         "the precipitation floor (2–20 mm/yr), the aggregator (geometric 70% / arithmetic 30%) and drops one factor 25% of the time."))
    (WEB_DATA / "meta.json").write_text(json.dumps(meta))
    (WEB_DATA / "targets.json").write_text(json.dumps(targets))
    (WEB_DATA / "sites.json").write_text(json.dumps(sites))
    (WEB_DATA / "validation.json").write_text(json.dumps(validation))
    (WEB_DATA / "portfolio.json").write_text(json.dumps(portfolio))
    print(f"exported in {time.time() - t0:.0f}s")
    print("env-basis:", validation["env"])
    print("geo/ops-only:", validation["other"])
    for row in validation["rows"]:
        print(f"  {row['name'][:42]:42s} bal: {row['best_target']:15s} pct={row['best_pct']:6.2f} u={row['u']:.3f} | any: {row['any_target']}/{row['any_profile']} u={row['u_any']:.3f} found={row['found']}")
    print("portfolio:", [(c["name"], len(c["gain"])) for c in chosen], f"{len(covered)}/{len(reqs)}")


if __name__ == "__main__":
    sys.exit(main())
