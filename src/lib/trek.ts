// Moon and Mars imagery for the interactive planetary maps.
//
// NASA Solar System Treks publishes its global mosaics as plate-carrée (equirectangular) tile pyramids:
// level L has 2^(L+1) columns and 2^L rows of 256 px tiles, origin at 180°W 90°N.
// MapLibre draws Web-Mercator tiles. This module registers a "trek://" protocol that builds each
// Mercator tile from the equirectangular tiles that cover it, resampling every output row to its true
// latitude. Columns line up exactly (Mercator zoom z has the same longitude step as Trek level z-1),
// so the only resampling is north-south. Mercator stops at 85.05°: the polar caps are not drawn.
import maplibregl from "maplibre-gl";
import type { BodyLayerDef } from "./layers";

const TILE = 256;
const mercLat = (yNorm: number) => (Math.atan(Math.sinh(Math.PI * (1 - 2 * yNorm))) * 180) / Math.PI;

export function trekTemplate(l: BodyLayerDef) {
  const prefix = l.prefix ?? `https://trek.nasa.gov/tiles/${l.body === "moon" ? "Moon" : "Mars"}/EQ/${l.label}/1.0.0/default/default028mm`;
  return `trek://${l.ext}/${l.maxLevel}/{z}/{x}/{y}?p=${encodeURIComponent(prefix)}`;
}

const cache = new Map<string, Promise<ImageBitmap | null>>();
function source(url: string, signal?: AbortSignal): Promise<ImageBitmap | null> {
  let p = cache.get(url);
  if (!p) {
    p = fetch(url, { signal, mode: "cors" })
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => (b && b.size > 0 ? createImageBitmap(b) : null))
      .catch(() => { cache.delete(url); return null; });
    cache.set(url, p);
    if (cache.size > 220) cache.delete(cache.keys().next().value as string);
  }
  return p;
}

function makeCanvas(w: number, h: number): any {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}
async function toBuffer(c: any, type: string): Promise<ArrayBuffer> {
  const blob: Blob = c.convertToBlob ? await c.convertToBlob({ type, quality: 0.9 }) : await new Promise((res) => c.toBlob((b: Blob) => res(b), type, 0.9));
  return blob.arrayBuffer();
}

let registered = false;
export function registerTrek() {
  if (registered) return;
  registered = true;
  maplibregl.addProtocol("trek", async (params, abort) => {
    const m = params.url.match(/^trek:\/\/(jpg|png)\/(\d+)\/(\d+)\/(\d+)\/(\d+)\?p=(.+)$/);
    if (!m) throw new Error("bad trek url");
    const ext = m[1], maxLevel = +m[2], z = +m[3], x = +m[4], y = +m[5], prefix = decodeURIComponent(m[6]);
    const n = 2 ** z;
    // Trek level with the same longitude step as this Mercator zoom, capped at what the product holds.
    const L = Math.max(0, Math.min(maxLevel, z - 1));
    const cols = 2 ** (L + 1), rows = 2 ** L, gW = cols * TILE, gH = rows * TILE;
    const gx0 = (x / n) * gW, gx1 = ((x + 1) / n) * gW;
    const latN = mercLat(y / n), latS = mercLat((y + 1) / n);
    const gy0 = ((90 - latN) / 180) * gH, gy1 = ((90 - latS) / 180) * gH;
    const c0 = Math.floor(gx0 / TILE), c1 = Math.min(cols - 1, Math.floor((gx1 - 1e-6) / TILE));
    const r0 = Math.max(0, Math.floor(gy0 / TILE)), r1 = Math.min(rows - 1, Math.floor((gy1 - 1e-6) / TILE));

    const jobs: Promise<{ c: number; r: number; img: ImageBitmap | null }>[] = [];
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++)
      jobs.push(source(`${prefix}/${L}/${r}/${c}.${ext}`, abort.signal).then((img) => ({ c, r, img })));
    const tiles = await Promise.all(jobs);
    if (!tiles.some((t) => t.img)) throw new Error("no imagery for this tile");

    // Stitch the covering source tiles, then pull one output row at a time from its own latitude.
    const sw = (c1 - c0 + 1) * TILE, sh = (r1 - r0 + 1) * TILE;
    const strip = makeCanvas(sw, sh), sctx = strip.getContext("2d");
    for (const t of tiles) if (t.img) sctx.drawImage(t.img, (t.c - c0) * TILE, (t.r - r0) * TILE);
    const out = makeCanvas(TILE, TILE), octx = out.getContext("2d");
    octx.imageSmoothingEnabled = true;
    const sx = gx0 - c0 * TILE, sWidth = gx1 - gx0;
    for (let j = 0; j < TILE; j++) {
      const lat = mercLat((y + (j + 0.5) / TILE) / n);
      const sy = ((90 - lat) / 180) * gH - r0 * TILE;
      if (sy < 0 || sy >= sh) continue;
      octx.drawImage(strip, sx, Math.min(sh - 1, Math.max(0, sy - 0.5)), sWidth, 1, 0, j, TILE, 1);
    }
    return { data: await toBuffer(out, ext === "jpg" ? "image/jpeg" : "image/png") };
  });
}
