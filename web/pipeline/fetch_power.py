"""Pull climatology fields from the NASA POWER public Zarr archive (AWS Open Data).

Source: NASA Langley POWER project, https://power.larc.nasa.gov  (bucket: nasa-power)
  - MERRA-2 reanalysis meteorology, 0.5 x 0.625 deg  (model / data assimilation)
  - CERES SYN1deg surface albedo, aerosol optical depth, UV, 1 x 1 deg (satellite-derived)
  - GPM IMERG precipitation, 0.1 deg (satellite-derived)
Time axis: 12 monthly climatologies + index 13 = annual.
"""
import warnings
from pathlib import Path
import numpy as np
import xarray as xr

warnings.filterwarnings("ignore")
RAW = Path(__file__).resolve().parents[1] / "data" / "raw"
BASE = "https://nasa-power.s3.amazonaws.com/"
SETS = {
    "merra2": ("merra2/temporal/power_merra2_climatology_temporal_utc.zarr",
               ["TS", "TS_MAX_AVG", "TS_MIN_AVG", "T2M", "PRECTOTCORR", "TQV", "QV2M", "PS",
                "WS10M", "FRSNO", "TSOIL6", "GWETTOP"]),
    "syn1deg": ("syn1deg/temporal/power_syn1deg_climatology_temporal_utc.zarr",
                ["CLRSKY_SRF_ALB", "ALLSKY_SRF_ALB", "AOD_55", "ALLSKY_SFC_UV_INDEX", "PW"]),
    "imerg": ("imerg/temporal/power_imerg_climatology_temporal_utc.zarr", ["IMERG_PRECTOT"]),
}

def main():
    for name, (path, variables) in SETS.items():
        out = RAW / f"power_{name}.npz"
        if out.exists():
            print("have", out.name); continue
        ds = xr.open_zarr(BASE + path, consolidated=True)
        data = {"lat": ds.lat.values.astype("f4"), "lon": ds.lon.values.astype("f4")}
        for v in variables:
            arr = ds[v]
            if name == "imerg":
                arr = arr.isel(time=12)  # annual mean only (0.1 deg grid is large)
            data[v] = arr.values.astype("f4")
            data[v + "__units"] = str(ds[v].attrs.get("units", ""))
            print(name, v, data[v].shape, float(np.nanmin(data[v])), float(np.nanmax(data[v])), flush=True)
        for k in ("time_coverage_start", "time_coverage_end"):
            data["attr_" + k] = str(ds.attrs.get(k, ""))
        np.savez_compressed(out, **data)
        print("wrote", out)

def diurnal():
    """Mean diurnal range of skin temperature from the 24 hourly climatology fields
    (TS_00..TS_23 = multi-year mean at each UTC hour, per calendar month).
    max - min over the hours is the amplitude of the mean daily cycle, the same quantity
    the Mars Climate Database and Diviner local-time bins give for Mars and the Moon.
    (TS_MAX_AVG / TS_MIN_AVG are monthly extremes and include weather, so they are not used.)"""
    out = RAW / "power_merra2_dtr.npz"
    if out.exists():
        print("have", out.name); return
    ds = xr.open_zarr(BASE + SETS["merra2"][0], consolidated=True)
    hi = lo = None
    for h in range(24):
        a = ds[f"TS_{h:02d}"].values.astype("f4")
        hi = a if hi is None else np.fmax(hi, a)
        lo = a if lo is None else np.fmin(lo, a)
        print("hour", h, flush=True)
    np.savez_compressed(out, lat=ds.lat.values.astype("f4"), lon=ds.lon.values.astype("f4"), dtr=(hi - lo).astype("f4"))
    print("wrote", out)


if __name__ == "__main__":
    main()
    diurnal()
