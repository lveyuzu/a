"""Extract the same descriptors for each Moon / Mars reference region.

Every value is stored with its source and an evidence `kind`:
  measured   : orbital instrument product processed here (MOLA, LOLA, Diviner, TES)
  model      : general-circulation-model climatology (Mars Climate Database)
  literature : published constant assigned by terrain type
  definition : true by definition of the environment (e.g. no rainfall)

Output: data/interim/targets.json
"""
import json

import numpy as np
import rasterio

from config import INTERIM, RAW, STEP_KM, TARGETS, WIN_N
from terrain import SLOPE_Q, load_dem, terrain_features, window_coords

MARS_E, MARS_LS_PERI = 0.0934, 251.0


def feat(value, unit, source, kind, note=""):
    return {"value": None if value is None or not np.isfinite(value) else float(value),
            "unit": unit, "source": source, "kind": kind, "note": note}


def terrain_block(dem, lat, lon):
    """Features for the centre window plus 8 windows offset by half a window (spread = how
    much the reference region itself varies; shown to users, and a reminder that a
    'reference value' is a sample of a heterogeneous surface)."""
    half = WIN_N * STEP_KM / 2.0
    R = dem.radius
    offs = [(0, 0)] + [(dx, dy) for dx in (-half, 0, half) for dy in (-half, 0, half) if (dx, dy) != (0, 0)]
    lats = [lat + np.degrees(dy / R) for dx, dy in offs]
    lons = [lon + np.degrees(dx / (R * max(np.cos(np.radians(lat)), 0.05))) for dx, dy in offs]
    lats = np.clip(lats, -89.9, 89.9)
    la, lo = window_coords(np.array(lats), np.array(lons), R)
    z = dem.sample(la, lo)
    f = terrain_features(z)
    return f, z[0]


def mars_climate(tid):
    rec = json.loads((RAW / "mcd" / f"{tid}.json").read_text())
    ls = sorted(int(k) for k in rec["seasons"])
    w = np.array([(1 + MARS_E * np.cos(np.radians(l - MARS_LS_PERI))) ** -2 for l in ls])
    w /= w.sum()  # time spent per 30 deg of Ls (Kepler's 2nd law)
    def series(i):
        return np.array([[v for _, v in rec["seasons"][str(l)]["series"][i][:24]] for l in ls])
    ts, ps, dod = series(0), series(1), series(2)
    daily = ts.mean(1)
    return dict(
        t_mean=float((w * daily).sum()), t_dtr=float((w * (ts.max(1) - ts.min(1))).sum()),
        t_cold=float(daily.min()), t_warm=float(daily.max()), t_min=float(ts.min()), t_max=float(ts.max()),
        pressure=float((w * ps.mean(1)).sum()) / 1000.0, dust=float((w * dod.mean(1)).sum()),
        diurnal_curves={str(l): np.round(ts[i], 1).tolist() for i, l in enumerate(ls) if l in (0, 90, 180, 270)},
        seasonal_mean=np.round(daily, 1).tolist(), ls=ls)


def moon_climate(tid, lat):
    rec = json.loads((RAW / "diviner" / f"{tid}.json").read_text())
    tb = np.array([b["tbol"] for b in rec["gcp"]], "f8")
    tb[tb < 0] = np.nan  # -9999 = empty bin
    lt = np.array(rec["gcp"][0]["ltim"])
    with np.errstate(all="ignore"):
        curve = np.nanmean(tb, 0)
    ok = np.isfinite(curve)
    if ok.sum() >= 8:  # fill empty local-time bins by periodic interpolation
        curve = np.interp(lt, lt[ok], curve[ok], period=24.0)
    out = dict(curve_lt=lt.round(2).tolist(), curve_t=np.round(curve, 1).tolist(),
               t_mean=float(np.nanmean(curve)), t_max=float(np.nanmax(curve)), t_min=float(np.nanmin(curve)),
               gcp_valid=float(ok.mean()))
    out["t_dtr"] = out["t_max"] - out["t_min"]
    night = (lt < 6) | (lt > 18)
    out["t_cold"] = float(np.nanmean(curve[night]))
    out["polar"] = None
    if "prp" in rec:
        a = np.array(rec["prp"]["rows"], "f8")
        tavg, tmax, ice = a[:, 3], a[:, 4], a[:, 5]
        good = (tavg > 0) & (tmax > 0)
        trap = good & (tmax < 110.0)  # never warmer than ~110 K: water ice stable at the surface
        out["polar"] = dict(
            n=int(good.sum()), t_avg_median=float(np.median(tavg[good])), t_avg_min=float(tavg[good].min()),
            t_max_median=float(np.median(tmax[good])), t_max_max=float(tmax[good].max()),
            trap_frac=float(trap.sum() / max(good.sum(), 1)),
            trap_t_avg=float(tavg[trap].mean()) if trap.any() else None,
            ice_stable_frac=float(((ice >= 0) & (ice < 1.0) & good).sum() / max(good.sum(), 1)))
        # For polar regions the 0.5 km PRP mesh replaces the coarse 0.5 deg bin for mean and cold values.
        out["t_mean"] = out["polar"]["t_avg_median"]
        out["t_cold"] = out["polar"]["trap_t_avg"] if trap.any() else out["polar"]["t_avg_min"]
    return out


def tes_albedo(ds, arr, lat, lon, half_deg=0.5):
    left = ds.bounds.left
    w, h = ds.width, ds.height
    lon_w = -180.0 if left < 0 else 0.0
    c0 = int(((lon - half_deg - lon_w) % 360) / 360 * w)
    c1 = int(((lon + half_deg - lon_w) % 360) / 360 * w) + 1
    r0 = int((90 - (lat + half_deg)) / 180 * h)
    r1 = int((90 - (lat - half_deg)) / 180 * h) + 1
    win = arr[r0:r1, c0:c1].astype("f8")
    win = win[(win > 0) & (win < 1)] if win.dtype.kind == "f" else win
    return float(np.mean(win)) if win.size else float("nan")


def main():
    INTERIM.mkdir(parents=True, exist_ok=True)
    dems = {b: load_dem(b) for b in ("mars", "moon")}
    tes = rasterio.open(RAW / "Mars_MGS_TES_Albedo_mosaic_global_7410m.tif")
    tes_arr = tes.read(1)
    out = []
    for t in TARGETS:
        body = t["body"]
        f, zwin = terrain_block(dems[body], t["lat"], t["lon"])
        topo_src = ("MGS MOLA MEGDR 32 px/deg (1.85 km), PDS Geosciences" if body == "mars"
                    else "LRO LOLA GDR 16 px/deg (1.90 km), PDS Geosciences")
        rec = dict(t)
        rec["features"] = {
            "slope_med": feat(f["slope_q"][0, SLOPE_Q.index(50)], "deg", topo_src, "measured", "median slope, 3.8 km baseline"),
            "slope_p90": feat(f["slope_q"][0, SLOPE_Q.index(90)], "deg", topo_src, "measured", "90th-percentile slope, 3.8 km baseline"),
            "relief": feat(f["relief"][0], "m", topo_src, "measured", "p95 − p5 elevation in the 61 km window"),
            "rough": feat(f["rough"][0], "m", topo_src, "measured", "RMS height about best-fit plane"),
            "hurst": feat(f["hurst"][0], "", topo_src, "measured", "Hurst exponent, 1.9–15 km"),
            "elev": feat(f["elev"][0], "m", topo_src, "measured", "mean elevation (areoid / 1737.4 km sphere)"),
        }
        rec["slope_q"] = np.round(f["slope_q"][0], 4).tolist()
        rec["terrain_spread"] = {k: [float(np.nanmin(f[k][1:])), float(np.nanmax(f[k][1:]))] for k in ("relief", "hurst")}
        rec["terrain_spread"]["slope_med"] = [float(np.nanmin(f["slope_q"][1:, 2])), float(np.nanmax(f["slope_q"][1:, 2]))]
        rec["neighbors"] = dict(slope_q=np.round(f["slope_q"][1:], 4).tolist(), relief=np.round(f["relief"][1:], 1).tolist(),
                                hurst=np.round(f["hurst"][1:], 4).tolist())
        rec["window"] = np.round(zwin, 1).tolist()
        rec["profile"] = np.round(zwin[WIN_N // 2], 1).tolist()

        if body == "mars":
            c = mars_climate(t["id"])
            src = "Mars Climate Database v6.2 (LMD/OU/IAA/ESA/CNES), climatology scenario"
            rec["features"].update({
                "t_mean": feat(c["t_mean"], "K", src, "model", "annual-mean surface temperature"),
                "t_dtr": feat(c["t_dtr"], "K", src, "model", "mean diurnal surface-temperature range"),
                "t_cold": feat(c["t_cold"], "K", src, "model", "daily-mean surface temperature of the coldest season"),
                "t_warm": feat(c["t_warm"], "K", src, "model", "daily-mean surface temperature of the warmest season"),
                "t_min": feat(c["t_min"], "K", src, "model", "coldest hour of the year"),
                "t_max": feat(c["t_max"], "K", src, "model", "warmest hour of the year"),
                "pressure": feat(c["pressure"], "kPa", src, "model", "annual-mean surface pressure"),
                "dust": feat(c["dust"], "", src, "model", "annual-mean visible dust column optical depth"),
                "albedo": feat(tes_albedo(tes, tes_arr, t["lat"], t["lon"]), "",
                               "MGS TES bolometric albedo mosaic 7.4 km (Christensen et al. 2001), USGS Astrogeology", "measured",
                               "solar-band Lambert albedo, 1° box mean"),
                "precip": feat(0.0, "mm/yr", "No rainfall under present Mars climate", "definition"),
                "tqv": feat(0.01, "kg/m²", "MGS TES column water vapour, ~10 precipitable µm global annual mean (Smith 2004, Icarus 167, 148)", "literature"),
                "ndvi": feat(0.0, "", "No vegetation", "definition"),
            })
            rec["climate"] = dict(kind="mars", diurnal_curves=c["diurnal_curves"], seasonal_mean=c["seasonal_mean"], ls=c["ls"])
        else:
            c = moon_climate(t["id"], t["lat"])
            src = "LRO Diviner bolometric temperature, 0.5° × 0.25 h bins (Williams et al. 2017), PDS"
            polar = c["polar"] is not None
            psrc = "LRO Diviner Polar Resource Product, 0.5 km mesh (Paige et al. 2010), PDS"
            mare = "volc_mafic" in t["geology"]
            rec["features"].update({
                "t_mean": feat(c["t_mean"], "K", psrc if polar else src, "measured",
                               "median annual-average temperature in a 30 km box" if polar else "mean over the lunar day"),
                "t_dtr": feat(c["t_dtr"], "K", src, "measured",
                              "day–night range of the 0.5° bin (mixes sunlit and shadowed ground)" if polar else "day–night range"),
                "t_cold": feat(c["t_cold"], "K", psrc if polar else src, "measured",
                               "mean annual-average temperature inside cold traps (Tmax < 110 K)" if polar else "mean night-time temperature"),
                "t_min": feat(c["t_min"], "K", src, "measured", "coldest local-time bin"),
                "t_max": feat(c["t_max"], "K", src, "measured", "warmest local-time bin"),
                "albedo": feat(0.07 if mare else 0.16, "", "Normal bolometric albedo by terrain type: mare 0.07, highland 0.16 (Vasavada et al. 2012, JGR 117, E00H18)", "literature"),
                "precip": feat(0.0, "mm/yr", "Airless body", "definition"),
                "tqv": feat(0.0, "kg/m²", "Airless body", "definition"),
                "ndvi": feat(0.0, "", "No vegetation", "definition"),
            })
            rec["climate"] = dict(kind="moon", curve_lt=c["curve_lt"], curve_t=c["curve_t"], polar=c["polar"])
        out.append(rec)
        fv = {k: (round(v["value"], 3) if v["value"] is not None else None) for k, v in rec["features"].items()}
        print(t["id"], fv, flush=True)
    (INTERIM / "targets.json").write_text(json.dumps(out))
    print("wrote targets.json")


if __name__ == "__main__":
    main()
