"""Build the Earth feature grid: every land cell on a 0.25 degree global grid gets
terrain, thermal, moisture, surface and atmosphere descriptors from real datasets.

Output: data/interim/earth_grid.npz  (arrays 720 x 1440, north-up, NaN = no data)
"""
import warnings

import numpy as np
from scipy.ndimage import map_coordinates, uniform_filter

from config import GRID_DEG, INTERIM, RAW
from terrain import SLOPE_Q, load_dem, terrain_features, window_coords

warnings.filterwarnings("ignore", category=RuntimeWarning)

NLAT, NLON = int(180 / GRID_DEG), int(360 / GRID_DEG)
LAT = 90 - GRID_DEG / 2 - np.arange(NLAT) * GRID_DEG
LON = -180 + GRID_DEG / 2 + np.arange(NLON) * GRID_DEG


def regrid(src, lat_n, lon_w, dlat, dlon, smooth=0, wrap_lon=True):
    """NaN-aware bilinear resampling of a north-up global grid onto the analysis grid.
    lat_n / lon_w are the centre coordinates of src[0, 0]; smooth = box size (src px)
    applied first so that fine grids are area-averaged instead of point-sampled."""
    ok = np.isfinite(src).astype("f4")
    val = np.where(ok > 0, src, 0).astype("f4")
    if smooth > 1:
        val = uniform_filter(val, smooth, mode="nearest")
        ok = uniform_filter(ok, smooth, mode="nearest")
    rows = np.clip((lat_n - LAT) / dlat, 0, src.shape[0] - 1)
    cols = (LON - lon_w) / dlon
    if wrap_lon:
        cols = cols % src.shape[1]
    rr, cc = np.meshgrid(rows, cols, indexing="ij")
    mode = "grid-wrap" if wrap_lon else "nearest"
    v = map_coordinates(val, [rr, cc], order=1, mode=mode, prefilter=False)
    w = map_coordinates(ok, [rr, cc], order=1, mode=mode, prefilter=False)
    return np.where(w > 0.35, v / np.maximum(w, 1e-6), np.nan).astype("f4")


def main():
    INTERIM.mkdir(parents=True, exist_ok=True)
    g = {}

    # ------------------------------------------------------------------ MODIS (0.1 deg) + IGBP (0.05 deg)
    mod = np.load(RAW / "gibs_modis.npz")
    igbp = mod["igbp"]  # 3600 x 7200, 0 = no data, 17 = water, 15 = snow/ice, 16 = barren
    def frac(cls):
        m = (igbp == cls).astype("f4").reshape(NLAT, 5, NLON, 5).mean(axis=(1, 3))
        return m
    f_nodata, f_water, f_ice, f_barren = frac(0), frac(17), frac(15), frac(16)

    # ------------------------------------------------------------------ land mask
    dem = load_dem("earth")
    zc = dem.z.reshape(NLAT, 15, NLON, 15)
    elev_cell = zc.mean(axis=(1, 3))
    frac_above = (zc > 0).mean(axis=(1, 3))
    # MODIS land cover classifies the land surface where it is mapped; where it is not
    # (Antarctic interior, some high-Arctic islands) fall back to ETOPO elevation > 0.
    mapped = 1 - f_nodata
    land_frac = np.where(mapped > 0.5, 1 - f_water / np.maximum(mapped, 1e-6), frac_above)
    land = land_frac >= 0.5
    g["land_frac"] = land_frac.astype("f4")
    g["f_ice"] = np.where(mapped > 0.5, f_ice / np.maximum(mapped, 1e-6), np.nan).astype("f4")
    g["f_barren"] = np.where(mapped > 0.5, f_barren / np.maximum(mapped, 1e-6), np.nan).astype("f4")
    print("land cells:", int(land.sum()), flush=True)

    # ------------------------------------------------------------------ terrain (ETOPO 2022)
    ii, jj = np.nonzero(land)
    nq = len(SLOPE_Q)
    T = {k: np.full((NLAT, NLON), np.nan, "f4") for k in ("relief", "rough", "hurst", "elev", "rms_slope", "valid")}
    SQ = np.full((nq, NLAT, NLON), np.nan, "f4")
    B = 6000
    for s in range(0, len(ii), B):
        bi, bj = ii[s:s + B], jj[s:s + B]
        la, lo = window_coords(LAT[bi], LON[bj], dem.radius)
        z = dem.sample(la, lo)
        # mask open water: MODIS water class where mapped, else bathymetry (z <= 0)
        r = np.clip(((90 - la) / 0.05).astype(int), 0, 3599)
        c = np.clip(((lo + 180) / 0.05).astype(int), 0, 7199)
        cls = igbp[r, c]
        water = (cls == 17) | ((cls == 0) & (z <= 0))
        z = np.where(water, np.nan, z)
        f = terrain_features(z)
        for k in T:
            T[k][bi, bj] = f[k]
        SQ[:, bi, bj] = f["slope_q"].T
        if (s // B) % 10 == 0:
            print(f"terrain {s}/{len(ii)}", flush=True)
    g.update({"t_" + k: v for k, v in T.items()})
    g["t_slope_q"] = SQ
    g["elev_cell"] = elev_cell.astype("f4")
    del dem, zc

    # ------------------------------------------------------------------ thermal
    lst_d, lst_n = mod["lst_day"], mod["lst_night"]            # (12, 1800, 3600) K
    daily = 0.5 * (lst_d + lst_n)
    nmon = np.isfinite(daily).sum(0)
    full = nmon >= 10
    modis_mean = np.where(full, np.nanmean(daily, 0), np.nan)
    modis_cold = np.where(full, np.nanmin(daily, 0), np.nan)
    modis_warm = np.where(full, np.nanmax(daily, 0), np.nan)
    modis_dtr = np.where(full, np.nanmean(lst_d - lst_n, 0), np.nan)
    modis_frozen = np.where(full, np.nansum(daily < 273.15, 0) / np.maximum(nmon, 1), np.nan)
    kw = dict(lat_n=89.95, lon_w=-179.95, dlat=0.1, dlon=0.1, smooth=3)
    g["modis_t_mean"] = regrid(modis_mean, **kw)
    g["modis_t_cold"] = regrid(modis_cold, **kw)
    g["modis_t_warm"] = regrid(modis_warm, **kw)
    g["modis_dtr"] = regrid(modis_dtr, **kw)
    g["modis_frozen"] = regrid(modis_frozen, **kw)

    mer = np.load(RAW / "power_merra2.npz")
    mlat, mlon = mer["lat"], mer["lon"]                         # south -> north, -180..179.375
    def merra(name, t=12):
        a = mer[name][t][::-1]                                  # flip to north-up
        return regrid(a, lat_n=float(mlat[-1]), lon_w=float(mlon[0]), dlat=0.5, dlon=0.625)
    ts_m = np.stack([mer["TS"][m][::-1] for m in range(12)]) + 273.15
    # amplitude of the mean daily skin-temperature cycle per month (see fetch_power.diurnal)
    rng_m = np.load(RAW / "power_merra2_dtr.npz")["dtr"][:12, ::-1]
    mk = dict(lat_n=float(mlat[-1]), lon_w=float(mlon[0]), dlat=0.5, dlon=0.625)
    g["merra_t_mean"] = regrid(ts_m.mean(0), **mk)
    g["merra_t_cold"] = regrid(ts_m.min(0), **mk)
    g["merra_t_warm"] = regrid(ts_m.max(0), **mk)
    g["merra_dtr"] = regrid(rng_m.mean(0), **mk)
    g["merra_frozen"] = regrid((ts_m < 273.15).mean(0), **mk)

    # Temperature = MERRA-2 full-cycle, all-sky mean (55 km) sharpened with the fine-scale spatial
    # pattern of MODIS LST. MODIS alone is biased warm in deserts (two clear-sky overpasses at
    # 10:30 / 22:30 are not the daily mean), MERRA-2 alone cannot see valley-scale contrasts, so:
    #     T = MERRA2 + (MODIS - MODIS smoothed to ~0.75 deg)
    mm = g["modis_t_mean"]
    okm = np.isfinite(mm).astype("f4")
    sm = uniform_filter(np.where(okm > 0, mm, 0), 3, mode="nearest") / np.maximum(uniform_filter(okm, 3, mode="nearest"), 1e-6)
    anom = np.where(okm > 0, mm - sm, 0.0).astype("f4")
    g["modis_anomaly"] = anom
    monthly = np.stack([regrid(ts_m[m], **mk) for m in range(12)]) + anom[None]
    g["th_t_mean"] = monthly.mean(0)
    g["th_t_cold"] = monthly.min(0)
    g["th_t_warm"] = monthly.max(0)
    g["th_frozen"] = (monthly < 273.15).mean(0).astype("f4")
    g["th_src_modis"] = okm > 0
    # Diurnal range: amplitude of the MERRA-2 mean hourly skin-temperature cycle. MODIS day-night
    # (two overpasses, clear sky) is kept only as a cross-check.
    g["th_dtr"] = g["merra_dtr"]

    # ------------------------------------------------------------------ moisture
    im = np.load(RAW / "power_imerg.npz")
    imerg = im["IMERG_PRECTOT"][::-1] * 365.25                   # mm / yr, 0.1 deg
    g["imerg_precip"] = regrid(imerg, lat_n=float(im["lat"][-1]), lon_w=float(im["lon"][0]), dlat=0.1, dlon=0.1, smooth=3)
    g["merra_precip"] = merra("PRECTOTCORR") * 365.25
    # IMERG has no usable retrieval poleward of ~60 deg (zero-filled over ice): use it only at
    # |lat| <= 60 and MERRA-2 bias-corrected precipitation beyond.
    use_imerg = np.isfinite(g["imerg_precip"]) & (np.abs(LAT)[:, None] <= 60)
    g["imerg_precip"] = np.where(use_imerg, g["imerg_precip"], np.nan).astype("f4")
    # Two independent estimates (satellite, gauge-corrected reanalysis) are averaged in log space.
    # Both over-read in hyper-arid cores, so dryness scores there are conservative.
    both = np.sqrt(np.maximum(g["imerg_precip"], 0.1) * np.maximum(g["merra_precip"], 0.1))
    g["precip"] = np.where(use_imerg, both, g["merra_precip"]).astype("f4")
    g["tqv"] = merra("TQV")                                      # kg m-2 = mm precipitable water
    g["pressure"] = merra("PS") / 10.0                           # hPa -> kPa
    g["wind10"] = merra("WS10M")
    g["snow_frac"] = merra("FRSNO")

    # ------------------------------------------------------------------ surface & atmosphere
    alb_raw = mod["albedo_q25"]
    alb = regrid(np.where(alb_raw <= 1.0, alb_raw, np.nan), **kw)   # palette's top bin is a fill code
    syn = np.load(RAW / "power_syn1deg.npz")
    sk = dict(lat_n=float(syn["lat"][-1]), lon_w=float(syn["lon"][0]), dlat=1.0, dlon=1.0)
    ceres_alb = regrid(syn["CLRSKY_SRF_ALB"][12][::-1], **sk)
    g["modis_albedo"], g["ceres_albedo"] = alb, ceres_alb
    g["albedo"] = np.where(np.isfinite(alb), alb, ceres_alb)
    g["albedo_src_modis"] = np.isfinite(alb)
    ndvi = regrid(mod["ndvi_max"], **kw)
    # MOD13 has no retrieval over permanent ice or Antarctica. There is no vegetation signal
    # there, so those cells are set to NDVI = 0 (a derived fill, flagged in ndvi_filled).
    fill = ~np.isfinite(ndvi) & ((LAT[:, None] < -60) | (np.nan_to_num(g["f_ice"]) > 0.5))
    g["ndvi_max"] = np.where(fill, 0.0, ndvi).astype("f4")
    g["ndvi_filled"] = fill
    g["aod"] = regrid(syn["AOD_55"][12][::-1], **sk)
    g["uv_index"] = regrid(syn["ALLSKY_SFC_UV_INDEX"][12][::-1], **sk)

    g["land"] = land
    for k, v in g.items():
        if v.dtype.kind == "f":
            v[..., ~land] = np.nan
    g["lat"], g["lon"] = LAT.astype("f4"), LON.astype("f4")
    np.savez_compressed(INTERIM / "earth_grid.npz", **g)
    for k in ("t_relief", "t_hurst", "th_t_mean", "th_dtr", "precip", "tqv", "pressure", "albedo", "ndvi_max", "aod"):
        v = g[k][land]
        print(f"{k:12s} valid={np.isfinite(v).mean():.3f}  p5={np.nanpercentile(v,5):.3g} p50={np.nanpercentile(v,50):.3g} p95={np.nanpercentile(v,95):.3g}")
    print("wrote earth_grid.npz")


if __name__ == "__main__":
    main()
