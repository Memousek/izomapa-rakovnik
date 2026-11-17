"""Historická ortofotomapa z 50. let (CENIA, CC BY 4.0) jako podklad terénu pro izometrickou variantu „hist“.

python nastroje/historie.py            všechny čtverce
python nastroje/historie.py 0,0 1,0    jen vybrané

Pro každý čtverec stáhne snímek z WMS CENIA (jen S-JTSK, EPSG:5514), převzorkuje ho přesně na mřížku textury terénu
(stejná jako ground_<období>.png z prep.py: 8000 px na 2 HALF, řádek 0 = sever) a uloží build/…/ground_hist.png.
Snímky ze služby se ukládají do build/hist/ (při dalším běhu se nestahují znovu).
Render varianty: node render.mjs … season=hist (render.html pak kreslí jen terén, bez dnešních budov, stromů a aut).
Uvedení zdroje: „Historická ortofotomapa © CENIA 2010 a © GEODIS BRNO, spol. s r.o. 2010, podkladové letecké snímky
poskytl VGHMÚř Dobruška, © MO ČR 2009“ (CC BY 4.0).
"""
import io, os, subprocess, sys, time
sys.path.insert(0, '.')
import numpy as np
from PIL import Image
from pyproj import Transformer
from scipy.ndimage import map_coordinates
import geo

Image.MAX_IMAGE_PIXELS = None
WMS = 'https://gis.cenia.cz/mapcache/ortofotomapa_historicka/wms?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=orto&STYLES=&SRS=EPSG:5514&FORMAT=image/jpeg'
PX = 8000                       # textura terénu (prep.py TEX_RES)
RES = 0.45                      # m/px stahovaného snímku (originál má zhruba půl metru)
KUS = 2000                      # nejvíc px na jeden požadavek
T = Transformer.from_crs(4326, 5514, always_xy=True)


def stahni(X0, Y0, X1, Y1, cache):
    """mozaika snímku pro obdélník v S-JTSK (šedotón, řádek 0 = Y1)"""
    if os.path.exists(cache): return np.asarray(Image.open(cache).convert('L'))
    W, H = int(np.ceil((X1 - X0) / RES)), int(np.ceil((Y1 - Y0) / RES))
    out = np.zeros((H, W), np.uint8)
    for r in range(0, H, KUS):
        for c in range(0, W, KUS):
            w, h = min(KUS, W - c), min(KUS, H - r)
            bx0, by1 = X0 + c * RES, Y1 - r * RES
            url = f'{WMS}&BBOX={bx0:.2f},{by1 - h * RES:.2f},{bx0 + w * RES:.2f},{by1:.2f}&WIDTH={w}&HEIGHT={h}'
            for pokus in range(4):
                d = subprocess.run(['curl', '-s', '-f', '-m', '120', '-A', 'izomapa-tools/1.0', url], capture_output=True).stdout
                try: out[r:r + h, c:c + w] = np.asarray(Image.open(io.BytesIO(d)).convert('L')); break
                except Exception: time.sleep(3 * (pokus + 1))
            else: raise SystemExit(f'WMS CENIA neodpovídá ({url[:80]}…)')
            time.sleep(0.3)                                  # ohleduplně ke službě
    Image.fromarray(out).save(cache)
    return out


def ctverec(c):
    cx, cy = geo.chunk_center(c); H_ = geo.HALF; R = 2 * H_ / PX
    dst = 'build' if tuple(c) == (0, 0) else geo.chunk_dir(c)
    if not os.path.isdir(dst): print('chybí', dst); return
    # S-JTSK na hrubé mřížce středů pixelů, mezi nimi lineárně (zobrazení je na 2,3 km skoro afinní)
    n = 65; g = (np.arange(n) / (n - 1)) * (PX - 1) + 0.5
    xs, ys = cx - H_ + g * R, cy + H_ - g * R
    XX, YY = np.meshgrid(xs, ys)
    lon, lat = geo.to_lonlat(XX, YY); SX, SY = T.transform(lon, lat)
    m = 30
    X0, X1, Y0, Y1 = SX.min() - m, SX.max() + m, SY.min() - m, SY.max() + m
    os.makedirs('build/hist', exist_ok=True)
    img = stahni(X0, Y0, X1, Y1, f'build/hist/c{c[0]}_{c[1]}.png').astype(np.float32)
    # tónování: černobílý snímek do teplé sépie, trochu víc kontrastu (snímky z 50. let bývají mdlé)
    lo, hi = np.percentile(img[img > 0], [1, 99.5]) if (img > 0).any() else (0, 255)
    out = np.zeros((PX, PX, 3), np.uint8)
    for r0 in range(0, PX, 500):
        rr = np.arange(r0, min(PX, r0 + 500)); cc = np.arange(PX)
        fr, fc = rr / (PX - 1) * (n - 1), cc / (PX - 1) * (n - 1)
        u = map_coordinates((SX - X0) / RES, np.meshgrid(fr, fc, indexing='ij'), order=1)
        v = map_coordinates((Y1 - SY) / RES, np.meshgrid(fr, fc, indexing='ij'), order=1)
        s = map_coordinates(img, [v, u], order=1, cval=0)
        s = np.clip((s - lo) / max(1, hi - lo), 0, 1)
        out[r0:r0 + len(rr)] = np.clip(np.stack([s * 238 + 14, s * 226 + 12, s * 196 + 10], -1), 0, 255).astype(np.uint8)
    Image.fromarray(out).save(f'{dst}/ground_hist.png')
    print('čtverec', c, '->', f'{dst}/ground_hist.png')


if __name__ == '__main__':
    ch = [tuple(int(v) for v in a.split(',')) for a in sys.argv[1:]] or sorted(geo.CHUNKS)
    for c in ch: ctverec(c)
