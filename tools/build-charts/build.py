#!/usr/bin/env python3
"""Costruisce una carta di gioco da dati costieri reali.

    python3 tools/build-charts/build.py tools/build-charts/ionian.yaml

Prende un file di configurazione con un riquadro geografico e un elenco di
porti, scarica (una volta sola, poi cache) i dati Natural Earth, e produce
un JSON pronto per il gioco con:

  - coste ritagliate sul riquadro e ammorbidite con spline Catmull-Rom
  - terraferma inclusa, tagliata dritta sul bordo della carta
  - porti e boe garantiti nello specchio d'acqua navigabile connesso
  - punto di partenza in acqua libera
  - toponimi collocati nel punto più interno di ogni costa
  - georeferenziazione, per il reticolato in gradi veri

L'output va committato; questo script serve a poterlo rigenerare.
"""
import argparse, json, math, sys, urllib.request
from pathlib import Path

try:
    import yaml
    from shapely.geometry import Polygon, MultiPolygon, Point, box
    from shapely.ops import unary_union, nearest_points
except ImportError:
    sys.exit("Servono le dipendenze: pip install -r tools/build-charts/requirements.txt")

NE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/"
SOURCES = ["ne_10m_land.geojson", "ne_10m_minor_islands.geojson"]
CACHE = Path(__file__).parent / ".cache"


def fetch(name):
    CACHE.mkdir(exist_ok=True)
    f = CACHE / name
    if not f.exists():
        print(f"  scarico {name} …")
        urllib.request.urlretrieve(NE + name, f)
    return json.loads(f.read_text())


def rings_in(bb):
    """Poligoni di terra che intersecano il riquadro, ritagliati sul riquadro."""
    out = []
    for src in SOURCES:
        for feat in fetch(src)["features"]:
            g = Polygon() if not feat["geometry"] else None
            from shapely.geometry import shape
            g = shape(feat["geometry"])
            if not g.is_valid:
                g = g.buffer(0)
            if not g.intersects(bb):
                continue
            clip = g.intersection(bb)
            parts = [clip] if isinstance(clip, Polygon) else \
                    list(clip.geoms) if isinstance(clip, MultiPolygon) else []
            out += [p for p in parts if not p.is_empty]
    return out


def catmull(ring, sub, on_edge):
    """Ammorbidisce la costa. I lati che corrono sul bordo della carta
    restano dritti: lì la terra continua fuori dalla carta."""
    p = ring[:-1] if ring[0] == ring[-1] else ring[:]
    n, out = len(p), []
    for i in range(n):
        p0, p1, p2, p3 = p[(i - 1) % n], p[i], p[(i + 1) % n], p[(i + 2) % n]
        if on_edge(p1) and on_edge(p2):
            out.append(list(p1)); continue
        for k in range(sub):
            t = k / sub; t2 = t * t; t3 = t2 * t
            out.append([
                0.5*((2*p1[j]) + (-p0[j]+p2[j])*t
                     + (2*p0[j]-5*p1[j]+4*p2[j]-p3[j])*t2
                     + (-p0[j]+3*p1[j]-3*p2[j]+p3[j])*t3)
                for j in (0, 1)])
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("config")
    ap.add_argument("-o", "--out", default=None)
    a = ap.parse_args()
    cfg = yaml.safe_load(Path(a.config).read_text())

    lon0, lat0, lon1, lat1 = cfg["bbox"]
    bb = box(lon0, lat0, lon1, lat1)
    scale = float(cfg.get("scale", 6))
    clearance = float(cfg.get("min_clearance", 170))
    latc = (lat0 + lat1) / 2
    mLat, mLon = 110574.0, 111320.0 * math.cos(math.radians(latc))
    gy, gx = mLat / scale, mLon / scale          # metri di gioco per grado

    print(f"carta «{cfg['name']}» — riquadro {lon1-lon0:.2f}° × {lat1-lat0:.2f}°, scala 1:{scale:g}")
    parts = rings_in(bb)
    names = {(round(v["lon"], 2), round(v["lat"], 2)): k
             for k, v in (cfg.get("names") or {}).items()}

    def name_of(c):
        for (lo, la), n in names.items():
            if abs(lo - c.x) < 0.03 and abs(la - c.y) < 0.03:
                return n
        return ""

    KM2 = 111.32 * mLon / 1000
    tol = 2e-4
    on_edge = lambda p: (abs(p[0]-lon0) < tol or abs(p[0]-lon1) < tol
                         or abs(p[1]-lat0) < tol or abs(p[1]-lat1) < tol)

    isl = []
    for pol in sorted(parts, key=lambda p: -p.area):
        if pol.area * KM2 < cfg.get("min_area_km2", 0.25):
            continue
        n = name_of(pol.centroid)
        sub = 3 if pol.area * KM2 > 200 else 4
        isl.append((n, catmull(list(pol.exterior.coords), sub, on_edge), pol.area * KM2))

    for extra in cfg.get("extra_islands", []):     # isole troppo piccole per il dato
        pts = []
        for i in range(30):
            t = i / 30 * math.tau
            r = 1 + 0.10*math.sin(3*t+0.7) + 0.06*math.sin(5*t+2.1)
            pts.append([extra["lon"] + math.sin(t)*extra["rlon"]*r,
                        extra["lat"] + math.cos(t)*extra["rlat"]*r])
        pts.append(pts[0])
        isl.append((extra["name"], catmull(pts, 6, lambda p: False), 0))

    proj = [(n, [[(lo-lon0)*gx, -(la-latc)*gy] for lo, la in ring], A) for n, ring, A in isl]
    allp = [p for _, r, _ in proj for p in r]
    cx = (min(p[0] for p in allp) + max(p[0] for p in allp)) / 2
    cy = (min(p[1] for p in allp) + max(p[1] for p in allp)) / 2
    W = max(max(p[0] for p in allp) - min(p[0] for p in allp),
            max(p[1] for p in allp) - min(p[1] for p in allp))

    out_isl, polys = [], []
    for n, ring, A in proj:
        q = [[round(x-cx), round(y-cy)] for x, y in ring]
        f = [q[0]]
        for p in q[1:]:
            if abs(p[0]-f[-1][0]) + abs(p[1]-f[-1][1]) > 7:
                f.append(p)
        out_isl.append({"n": n, "p": [v for p in f for v in p]})
        polys.append(Polygon(f).buffer(0))
        print(f"  {(n or '(isolotto)'):12s} {A:7.1f} km²  {len(f):4d} punti")

    land = unary_union(polys)
    nav = box(min(p[0] for p in allp)-cx-1500, min(p[1] for p in allp)-cy-1500,
              max(p[0] for p in allp)-cx+1500, max(p[1] for p in allp)-cy+1500
              ).difference(land.buffer(clearance))
    if isinstance(nav, MultiPolygon):
        nav = max(nav.geoms, key=lambda g: g.area)
    print(f"  mare navigabile connesso: {nav.area/1e6:.1f} km² di gioco")

    def place(lat, lon):
        p = Point((lon-lon0)*gx - cx, -(lat-latc)*gy - cy)
        if not nav.contains(p):
            p = nearest_points(nav, p)[0]
        return round(p.x), round(p.y)

    def dedup(items, minsep):
        kept = []
        for it in items:
            if any(math.hypot(k["x"]-it["x"], k["y"]-it["y"]) < minsep for k in kept):
                print(f"    scartato {it['n']}: troppo vicino a un altro")
                continue
            kept.append(it)
        return kept

    ports = [{"n": p["name"], **dict(zip(("x", "y"), place(p["lat"], p["lon"])))}
             for p in cfg["ports"]]
    ports = dedup(ports, cfg.get("min_port_gap", 700))
    marks = [{"n": m["name"], **dict(zip(("x", "y"), place(m["lat"], m["lon"])))}
             for m in cfg["marks"]]

    # toponimo nel punto più interno di ogni costa
    for it, pol in zip(out_isl, polys):
        if not it["n"]:
            continue
        if isinstance(pol, MultiPolygon):        # buffer(0) può spezzare un anello
            pol = max(pol.geoms, key=lambda g: g.area)
        x0, y0, x1, y1 = pol.bounds
        best = None
        for i in range(26):
            for j in range(26):
                p = Point(x0+(x1-x0)*(i+.5)/26, y0+(y1-y0)*(j+.5)/26)
                if pol.contains(p):
                    d = pol.exterior.distance(p)
                    if not best or d > best[0]:
                        best = (d, round(p.x), round(p.y))
        if best:
            it["l"] = [best[1], best[2]]

    s = cfg["start"]
    start = dict(zip(("x", "y"), place(s["lat"], s["lon"])))
    data = {
        "name": cfg["name"], "scale": scale,
        "size": round(W * 1.22), "start": start,
        "geo": {"lat0": round(latc - cy/gy, 6), "lon0": round(lon0 + cx/gx, 6),
                "gx": round(gx, 2), "gy": round(gy, 2)},
        "isl": out_isl, "marks": marks, "ports": ports,
    }
    out = Path(a.out or cfg.get("out", "src/data/chart.json"))
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, separators=(",", ":")))
    print(f"→ {out}  ({out.stat().st_size/1024:.1f} KB, {len(out_isl)} terre, "
          f"{len(ports)} porti, {len(marks)} boe)")


if __name__ == "__main__":
    main()
