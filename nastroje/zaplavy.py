# záplavová území pro vrstvu „Záplavy“ (web/mapa_vrstvy.js): WMS VÚV T. G. M. (HEIS), záplavová území Q5, Q20, Q100 a aktivní zóna.
# Licence CC BY 4.0, podmínkou je uvedení zdroje („Záplavová území: VÚV T. G. M., v. v. i.“, je v legendě vrstvy).
# Stáhne obrázky WMS po dlaždicích (3 m na pixel), z neprůhledných pixelů udělá polygony a uloží je zjednodušené.
# -> assets/zaplavy.json {"q5": [[[lat, lon], ...], ...], "q20": ..., "q100": ..., "az": ...}; build_html.py kopíruje do site/.
# spouštět z kořene repa: .venv/bin/python nastroje/zaplavy.py   (dlaždice v build/zaplavy/, po přerušení pokračuje)
import io, json, math, os, subprocess, sys, time
sys.path.insert(0, '.')
import geo, numpy as np, shapely
from PIL import Image

WMS = 'https://heis.vuv.cz/data/webmap/wms.dll'
VRSTVY = {'q5': 'isvs_zapluz_5', 'q20': 'isvs_zapluz_20', 'q100': 'isvs_zapluz_100', 'az': 'isvs_zapluz_az'}
D = 'build/zaplavy/'
M = 3.0          # metrů na pixel
T = 1024         # pixelů na dlaždici


def maska(vrstva, lo0, la0, lo1, la1, w, h):
    f = f'{D}v13_{vrstva}_{lo0:.5f}_{la0:.5f}_{w}x{h}.png'
    if not os.path.exists(f):
        url = (f'{WMS}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS={vrstva}&STYLES=&CRS=EPSG:4326&BBOX={la0},{lo0},{la1},{lo1}'   # 1.3.0: osy lat, lon
               f'&WIDTH={w}&HEIGHT={h}&FORMAT=image/png&TRANSPARENT=TRUE')
        subprocess.run(['curl', '-s', '-f', '-m', '120', '-A', 'izomapa-tools/1.0', '-o', f + '.tmp', url], check=True)
        os.replace(f + '.tmp', f); time.sleep(0.5)
    a = np.asarray(Image.open(f).convert('RGBA'))
    # zóna je plná barva (alfa 255); vodoznak serveru je šedý nebo průsvitný
    return (a[..., 3] == 255) & ~((a[..., 0] == a[..., 1]) & (a[..., 1] == a[..., 2]))


def polygony(m, lo0, la1, dlo, dla):
    """neprůhledné pixely -> sjednocené polygony v lokálních metrech (běhy pixelů v řádcích, pak sjednocení)"""
    boxy = []
    for r in range(m.shape[0]):
        row = m[r]
        if not row.any(): continue
        d = np.diff(np.concatenate([[0], row.astype(np.int8), [0]]))
        for c0, c1 in zip(np.where(d == 1)[0], np.where(d == -1)[0]):
            (x0, y0), (x1, y1) = geo.to_local(lo0 + c0 * dlo, la1 - r * dla), geo.to_local(lo0 + c1 * dlo, la1 - (r + 1) * dla)
            boxy.append(shapely.box(min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1)))
    return shapely.union_all(boxy) if boxy else None


if __name__ == '__main__':
    os.makedirs(D, exist_ok=True)
    X0, Y0, X1, Y1 = geo.extent(geo.MARGIN)
    (LO0, LA0), (LO1, LA1) = geo.to_lonlat(X0, Y0), geo.to_lonlat(X1, Y1)
    dlo = M / geo.KX; dla = M / geo.KY
    W, H = math.ceil((LO1 - LO0) / dlo), math.ceil((LA1 - LA0) / dla)
    out = {}
    for k, vrstva in VRSTVY.items():
        casti = []
        for ty in range(0, H, T):
            for tx in range(0, W, T):
                w, h = min(T, W - tx), min(T, H - ty)
                lo0, la1 = LO0 + tx * dlo, LA1 - ty * dla
                m = maska(vrstva, lo0, la1 - h * dla, lo0 + w * dlo, la1, w, h)
                p = polygony(m, lo0, la1, dlo, dla)
                if p is not None: casti.append(p)
        g = shapely.union_all(casti).simplify(2.5) if casti else None
        kr = []
        for p in ([] if g is None else (g.geoms if hasattr(g, 'geoms') else [g])):
            if p.geom_type != 'Polygon' or p.area < 150: continue
            kr.append([[round(float(la), 6), round(float(lo), 6)] for lo, la in zip(*geo.to_lonlat(*np.array(p.exterior.coords).T))])
        out[k] = kr
        print(k, 'polygonů', len(kr), 'plocha ha', round(g.area / 1e4, 1) if g is not None else 0, flush=True)
    json.dump(out, open('assets/zaplavy.json', 'w'), separators=(',', ':'))
