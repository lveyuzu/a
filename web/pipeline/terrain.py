"""Terrain sampling and feature extraction — one code path for Earth, Mars and Moon.

Every site (Earth grid cell or planetary reference region) is characterised from a
WIN_N x WIN_N window sampled at STEP_KM spacing on a local azimuthal-equidistant
grid, so slopes are measured over the same ground distance on all three bodies
and at every latitude (a plain lat/lon grid would shrink east-west near the poles).
"""
import numpy as np
import rasterio
from scipy.ndimage import map_coordinates

from config import RADIUS_KM, RAW, STEP_KM, WIN_N

SLOPE_Q = [10, 25, 50, 75, 90, 95, 99]  # percentiles kept to describe the slope distribution
LAGS = [1, 2, 4, 8]                      # structure-function lags (x STEP_KM)


class DEM:
    """Global simple-cylindrical DEM, rows north -> south, elevation in metres."""

    def __init__(self, z, ppd, lon_west, body):
        self.z, self.ppd, self.lon_west, self.body = z, ppd, lon_west, body
        self.radius = RADIUS_KM[body]

    def sample(self, lat, lon):
        row = (90.0 - lat) * self.ppd - 0.5
        col = ((lon - self.lon_west) % 360.0) * self.ppd - 0.5
        row = np.clip(row, 0, self.z.shape[0] - 1)
        return map_coordinates(self.z, [row, col], order=1, mode="grid-wrap", prefilter=False)


def load_dem(body):
    if body == "earth":
        # NOAA ETOPO 2022, 60 arc-second, ice-surface elevation (bathymetry below sea level).
        with rasterio.open(RAW / "ETOPO_2022_v1_60s_N90W180_surface.tif") as ds:
            z = ds.read(1).astype("f4")
        return DEM(z, 60.0, -180.0, body)
    if body == "mars":
        # MGS MOLA MEGDR 32 px/deg: 16-bit MSB integers, metres above the areoid, lon 0..360 E.
        z = np.fromfile(RAW / "megt90n000fb.img", dtype=">i2").reshape(5760, 11520).astype("f4")
        return DEM(z, 32.0, 0.0, body)
    if body == "moon":
        # LRO LOLA GDR 16 px/deg: 16-bit LSB integers, height = DN * 0.5 m above a 1737.4 km sphere.
        z = np.fromfile(RAW / "ldem_16.img", dtype="<i2").reshape(2880, 5760).astype("f4") * 0.5
        return DEM(z, 16.0, 0.0, body)
    raise ValueError(body)


def window_coords(lat0, lon0, radius_km, n=WIN_N, step=STEP_KM):
    """Lat/lon of an n x n azimuthal-equidistant grid centred on each (lat0, lon0).
    Returns arrays shaped (M, n, n); row 0 is the northern edge."""
    lat0 = np.radians(np.atleast_1d(lat0).astype("f8"))[:, None, None]
    lon0 = np.radians(np.atleast_1d(lon0).astype("f8"))[:, None, None]
    off = (np.arange(n) - (n - 1) / 2.0) * step
    x, y = np.meshgrid(off, -off)  # east, north
    c = np.hypot(x, y)[None] / radius_km
    az = np.arctan2(x, y)[None]
    lat = np.arcsin(np.sin(lat0) * np.cos(c) + np.cos(lat0) * np.sin(c) * np.cos(az))
    lon = lon0 + np.arctan2(np.sin(az) * np.sin(c) * np.cos(lat0), np.cos(c) - np.sin(lat0) * np.sin(lat))
    return np.degrees(lat), (np.degrees(lon) + 180.0) % 360.0 - 180.0


def nan_quantiles(a, qs):
    """Row-wise percentiles ignoring NaN (vectorised: sort pushes NaN to the end)."""
    s = np.sort(a, axis=1)
    n = np.isfinite(a).sum(1)
    out = np.full((a.shape[0], len(qs)), np.nan, "f4")
    ok = n > 0
    rows = np.nonzero(ok)[0]
    for k, q in enumerate(qs):
        pos = (n[ok] - 1) * q / 100.0
        lo = np.floor(pos).astype(int)
        hi = np.minimum(lo + 1, n[ok] - 1)
        w = pos - lo
        out[ok, k] = s[rows, lo] * (1 - w) + s[rows, hi] * w
    return out


def terrain_features(win, step=STEP_KM, min_valid=0.8):
    """win: (M, n, n) elevations in metres, NaN = masked (water).

    slope_q   percentiles of slope (deg) from central differences (baseline 2*step = 3.8 km)
    relief    p95 - p5 elevation in the window (m)
    rough     RMS height about the best-fit plane (m)
    hurst     Hurst exponent from the structure function at lags 1,2,4,8 x step
    elev      mean elevation (m);  valid: fraction of unmasked samples
    """
    m, n, _ = win.shape
    valid = np.isfinite(win).mean(axis=(1, 2))
    d = 2.0 * step * 1000.0
    dzdx = (win[:, 1:-1, 2:] - win[:, 1:-1, :-2]) / d
    dzdy = (win[:, :-2, 1:-1] - win[:, 2:, 1:-1]) / d
    slope = np.degrees(np.arctan(np.hypot(dzdx, dzdy))).reshape(m, -1)
    slope_q = nan_quantiles(slope, SLOPE_Q)

    flat = win.reshape(m, -1)
    p = nan_quantiles(flat, [5, 95])
    relief = p[:, 1] - p[:, 0]
    elev = np.nanmean(flat, axis=1) if m else np.zeros(0)

    # plane detrend (NaNs replaced by the window mean for the fit only)
    off = (np.arange(n) - (n - 1) / 2.0)
    xx, yy = np.meshgrid(off, off)
    A = np.stack([np.ones(n * n), xx.ravel(), yy.ravel()], 1)
    filled = np.where(np.isfinite(flat), flat, elev[:, None])
    coef = filled @ np.linalg.pinv(A).T
    resid = np.where(np.isfinite(flat), flat - coef @ A.T, np.nan)
    rough = np.sqrt(np.nanmean(resid ** 2, axis=1))

    # structure function nu(L): RMS elevation difference at lag L, both axes pooled
    logv = []
    for L in LAGS:
        dx = (win[:, :, L:] - win[:, :, :-L]).reshape(m, -1)
        dy = (win[:, L:, :] - win[:, :-L, :]).reshape(m, -1)
        ms = np.nanmean(np.concatenate([dx, dy], 1) ** 2, axis=1)
        logv.append(0.5 * np.log10(np.maximum(ms, 1e-4)))
    logv = np.stack(logv, 1)
    logl = np.log10(np.array(LAGS, "f8") * step)
    hurst = ((logv - logv.mean(1, keepdims=True)) * (logl - logl.mean())).sum(1) / ((logl - logl.mean()) ** 2).sum()
    rms_slope = np.degrees(np.arctan(10 ** logv[:, 0] / (step * 1000.0)))

    bad = valid < min_valid
    out = dict(slope_q=slope_q, relief=relief, rough=rough, hurst=hurst, elev=elev, valid=valid, rms_slope=rms_slope)
    for k in ("slope_q", "relief", "rough", "hurst", "rms_slope"):
        out[k] = out[k].astype("f4")
        out[k][bad] = np.nan
    return out


def hillshade(z, step_km=STEP_KM, az=315.0, alt=40.0, zfactor=1.0):
    """Simple Lambertian hillshade (0..1) for display of a sampled window."""
    d = step_km * 1000.0
    gy, gx = np.gradient(z * zfactor, d)
    slope = np.pi / 2 - np.arctan(np.hypot(gx, gy))
    aspect = np.arctan2(gy, -gx)
    azr, altr = np.radians(360.0 - az + 90.0), np.radians(alt)
    hs = np.sin(altr) * np.sin(slope) + np.cos(altr) * np.cos(slope) * np.cos(azr - aspect)
    return np.clip(hs, 0, 1)
