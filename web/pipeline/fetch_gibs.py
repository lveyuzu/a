"""Fetch MODIS land products through NASA GIBS (Global Imagery Browse Services)
and decode the images back to physical values with the official GIBS colormaps.

GIBS serves science products as palette images; every palette colour maps to a
documented value bin (https://gibs.earthdata.nasa.gov/colormaps/v1.3/*.xml).
Decoding therefore recovers the real MODIS values quantised to the bin width:
    Land surface temperature (MOD11C3, Terra)  0.6 K bins, 200-350 K
    NDVI (MOD13, Terra)                        0.005 bins
    Black-sky shortwave albedo (MCD43)         0.003 bins
    IGBP land cover (MCD12)                    exact classes
No Earthdata login is needed, which keeps the pipeline reproducible by anyone.

Output: data/raw/gibs_modis.npz on a 0.1 degree global grid (1800 x 3600, north-up).
"""
import io
import re
import time
import urllib.request

import numpy as np
from PIL import Image

from config import RAW

Image.MAX_IMAGE_PIXELS = None
WMS = ("https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap"
       "&LAYERS={layer}&STYLES=&SRS=EPSG:4326&BBOX=-180,-90,180,90&WIDTH={w}&HEIGHT={h}"
       "&FORMAT=image/png&TRANSPARENT=TRUE&TIME={time}")
CMAP = "https://gibs.earthdata.nasa.gov/colormaps/v1.3/{name}.xml"
UA = {"User-Agent": "planetary-twin-pipeline/1.0"}
CACHE = RAW / "gibs"
W, H = 3600, 1800

LST_YEARS = [2021, 2022, 2023]
NDVI_YEAR = 2023
ALBEDO_DATES = ["2021-07-15", "2021-10-15", "2022-01-15", "2022-04-15", "2022-07-15", "2022-10-15", "2023-01-15"]


def http(url, tries=6):
    for i in range(tries):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=300).read()
        except Exception as e:
            print("   retry", repr(e)[:70], flush=True)
            time.sleep(4 * (i + 1))
    raise RuntimeError(url)


def colormap(name, categorical=False):
    """rgb-packed-int -> value (bin midpoint, or class id). Unlisted/no-data colours -> NaN."""
    xml = http(CMAP.format(name=name)).decode()
    keys, vals = [], []
    for m in re.finditer(r"<ColorMapEntry ([^>]*)/>", xml):
        attr = dict(re.findall(r'(\w+)="([^"]*)"', m.group(1)))
        if attr.get("nodata") == "true":
            continue
        r, g, b = (int(v) for v in attr["rgb"].split(","))
        if categorical:
            val = float(attr["sourceValue"].split(",")[-1])  # water is listed as "0,17"
            if val > 17:  # 255 = unclassified -> treat as no data
                continue
        else:
            nums = [float(v) for v in re.findall(r"-?\d+\.?\d*(?:[eE][-+]?\d+)?", attr.get("value", ""))]
            if len(nums) < 2:
                continue
            val = 0.5 * (nums[0] + nums[1])
        keys.append((r << 16) | (g << 8) | b)
        vals.append(val)
    order = np.argsort(keys)
    return np.array(keys)[order], np.array(vals, dtype="f4")[order]


def fetch_decode(layer, date, cmap, w=W, h=H):
    f = CACHE / f"{layer}_{date}_{w}.png"
    if not f.exists():
        for attempt in range(4):
            raw = http(WMS.format(layer=layer, w=w, h=h, time=date))
            if raw[:4] == b"\x89PNG":
                f.write_bytes(raw)
                break
            # GIBS occasionally answers with a WMS ServiceException instead of an image
            print("   not an image, retrying:", layer, date, flush=True)
            time.sleep(10)
        else:
            print("   SKIPPED (no image available):", layer, date, flush=True)
            return np.full((h, w), np.nan, "f4")
    im = np.asarray(Image.open(io.BytesIO(f.read_bytes())).convert("RGBA"))
    key = (im[..., 0].astype(np.int64) << 16) | (im[..., 1].astype(np.int64) << 8) | im[..., 2]
    keys, vals = cmap
    idx = np.clip(np.searchsorted(keys, key), 0, len(keys) - 1)
    out = np.where((keys[idx] == key) & (im[..., 3] > 0), vals[idx], np.nan).astype("f4")
    return out


def main():
    CACHE.mkdir(parents=True, exist_ok=True)
    out = RAW / "gibs_modis.npz"
    res = {}

    # ---- Land surface temperature: 12 monthly climatologies, day and night ----
    cm = colormap("MODIS_Land_Surface_Temp")
    for tod in ("Day", "Night"):
        s = np.zeros((12, H, W), "f4")
        n = np.zeros((12, H, W), "u1")
        for y in LST_YEARS:
            for mth in range(12):
                a = fetch_decode(f"MODIS_Terra_L3_Land_Surface_Temp_Monthly_{tod}", f"{y}-{mth + 1:02d}-01", cm)
                ok = np.isfinite(a)
                s[mth][ok] += a[ok]
                n[mth] += ok
                print("LST", tod, y, mth + 1, f"valid={ok.mean():.3f}", flush=True)
        res[f"lst_{tod.lower()}"] = np.where(n > 0, s / np.maximum(n, 1), np.nan).astype("f4")

    # ---- NDVI: annual maximum and mean of monthly composites ----
    cm = colormap("MODIS_L3_NDVI")
    stack = np.stack([fetch_decode("MODIS_Terra_L3_NDVI_Monthly", f"{NDVI_YEAR}-{m + 1:02d}-01", cm) for m in range(12)])
    import warnings
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        res["ndvi_max"] = np.nanmax(stack, axis=0).astype("f4")
        res["ndvi_mean"] = np.nanmean(stack, axis=0).astype("f4")
    print("NDVI done", flush=True)

    # ---- Albedo: lower-quartile of seasonal samples = snow-free shortwave albedo ----
    cm = colormap("MODIS_Combined_Albedo_Daily")
    stack = np.stack([fetch_decode("MODIS_Combined_L3_Black_Sky_Albedo_Daily", d, cm) for d in ALBEDO_DATES]) / 1000.0
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        res["albedo_q25"] = np.nanpercentile(stack, 25, axis=0).astype("f4")
        res["albedo_med"] = np.nanmedian(stack, axis=0).astype("f4")
    res["albedo_n"] = np.isfinite(stack).sum(0).astype("u1")
    print("albedo done", flush=True)

    # ---- IGBP land cover at 0.05 deg (classes 1..17; 15 = snow/ice, 16 = barren, 17 = water) ----
    cm = colormap("MODIS_IGBP_Land_Cover_Type", categorical=True)
    lc = fetch_decode("MODIS_Combined_L3_IGBP_Land_Cover_Type_Annual", "2023-01-01", cm, w=7200, h=3600)
    res["igbp"] = np.where(np.isfinite(lc), lc, 0).astype("u1")
    print("IGBP done", flush=True)

    np.savez_compressed(out, **res)
    print("wrote", out)


if __name__ == "__main__":
    main()
