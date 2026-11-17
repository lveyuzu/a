"""Parallel HTTP range downloader (resumable per chunk).

Usage: pget.py URL OUTFILE [connections]
Some archive servers throttle per connection; splitting the file into ranges
keeps the full pipeline bootstrap to a few minutes.
"""
import concurrent.futures as cf
import os
import sys
import urllib.request

UA = {"User-Agent": "planetary-twin-pipeline/1.0"}


def main(url, out, n=16, chunk=8 << 20):
    head = urllib.request.Request(url, method="HEAD", headers=UA)
    size = int(urllib.request.urlopen(head, timeout=60).headers["Content-Length"])
    parts = out + ".parts"
    if os.path.exists(out) and os.path.getsize(out) == size and not os.path.exists(parts):
        print("have", out)
        return
    done = set()
    if os.path.exists(parts) and os.path.exists(out):
        done = {int(x) for x in open(parts).read().split()}
    else:
        with open(out, "wb") as f:
            f.truncate(size)
        open(parts, "w").close()
    starts = [s for s in range(0, size, chunk) if s not in done]

    def work(s):
        e = min(s + chunk, size) - 1
        for _ in range(8):
            try:
                r = urllib.request.Request(url, headers={**UA, "Range": f"bytes={s}-{e}"})
                data = urllib.request.urlopen(r, timeout=180).read()
                if len(data) == e - s + 1:
                    with open(out, "r+b") as f:
                        f.seek(s)
                        f.write(data)
                    with open(parts, "a") as p:
                        p.write(f"{s}\n")
                    return s
            except Exception:
                pass
        raise RuntimeError(f"chunk {s} of {out} failed")

    with cf.ThreadPoolExecutor(n) as ex:
        for i, _ in enumerate(ex.map(work, starts)):
            if i % 10 == 0:
                print(f"{out}: {i + 1}/{len(starts)} chunks", flush=True)
    os.remove(parts)
    print("done", out, size)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 16)
