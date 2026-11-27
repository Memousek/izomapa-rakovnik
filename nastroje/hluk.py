# hluk pro vrstvu „Hluk“ (web/mapa_vrstvy.js): strategické hlukové mapy 2022 Ministerstva zdravotnictví, celodenní hladina Ldvn.
# Mimo aglomerace jsou zmapované jen hlavní silnice (přes 3 mil. vozidel za rok) a hlavní železnice (přes 30 000 vlaků za rok),
# v Rakovníku D6 a průtah městem, železnice žádná. Otevřená data MZd (INSPIRE), https://geoportal.mzcr.cz/SHM2022/
# Stáhne rastry ImageServeru (10 m na pixel, třída podle barvy z tabulky atributů), složí silnice a železnici (vyšší třída),
# z tříd od 55 dB udělá polygony (každé pásmo = „aspoň tolik dB“, kreslí se od nejnižšího).
# -> assets/hluk.json {"meta": {...}, "pasma": [{"k", "n", "poly": [[[lat, lon], ...], ...]}]}; build_html.py kopíruje do site/.
# spouštět z kořene repa: .venv/bin/python nastroje/hluk.py   (dlaždice v build/hluk/)
import io, json, math, os, subprocess, sys, time
sys.path.insert(0, '.')
sys.path.insert(0, 'nastroje')
import geo, numpy as np, shapely
from PIL import Image
from hustota import plocha_mapy, kruhy

SLUZBA = 'https://geoportal.mzcr.cz/server/rest/services/SHM2022/{}/ImageServer/exportImage'
ZDROJE = ['Silnice_Ldvn', 'Zeleznice_Ldvn']
D = 'build/hluk/'
M = 5.0          # metrů na pixel (služba má 10 m, polovina kvůli šikmým hranám po převodu do místních metrů)
T = 2000         # pixelů na dlaždici
BARVY = {(255, 255, 114): 1, (255, 194, 0): 2, (229, 0, 0): 3, (181, 0, 0): 4, (98, 20, 110): 5, (0, 31, 156): 6}   # rasterAttributeTable
PASMA = [('l55', 2, '55–60 dB'), ('l60', 3, '60–65 dB'), ('l65', 4, '65–70 dB'), ('l70', 5, '70–75 dB'), ('l75', 6, 'nad 75 dB')]


def trida(sluzba, lo0, la0, lo1, la1, w, h):
    f = f'{D}{sluzba}_{lo0:.5f}_{la0:.5f}_{w}x{h}.png'
    if not os.path.exists(f):
        url = (SLUZBA.format(sluzba) + f'?bbox={lo0},{la0},{lo1},{la1}&bboxSR=4326&imageSR=4326&size={w},{h}'
               '&format=png&interpolation=RSP_NearestNeighbor&f=image')
        subprocess.run(['curl', '-s', '-f', '-m', '180', '-A', 'izomapa-tools/1.0', '-o', f + '.tmp', url], check=True)
        os.replace(f + '.tmp', f); time.sleep(0.5)
    a = np.asarray(Image.open(f).convert('RGB')).astype(np.int32)
    out = np.zeros(a.shape[:2], np.uint8)
    for (r, g, b), t in BARVY.items(): out[(a[..., 0] == r) & (a[..., 1] == g) & (a[..., 2] == b)] = t
    return out


def polygony(m, lo0, la1, dlo, dla):
    """pixely masky -> sjednocená plocha v místních metrech (běhy pixelů v řádcích, pak sjednocení)"""
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
    (LO0, LO1), (LA0, LA1) = geo.to_lonlat([X0, X1], [Y0, Y1])
    dlo = M / geo.KX; dla = M / geo.KY
    W, H = math.ceil((LO1 - LO0) / dlo), math.ceil((LA1 - LA0) / dla)
    mapa = plocha_mapy()
    casti = {k: [] for k, _, _ in PASMA}
    for ty in range(0, H, T):
        for tx in range(0, W, T):
            w, h = min(T, W - tx), min(T, H - ty)
            lo0, la1 = LO0 + tx * dlo, LA1 - ty * dla
            m = np.maximum.reduce([trida(s, lo0, la1 - h * dla, lo0 + w * dlo, la1, w, h) for s in ZDROJE])
            for k, od, _ in PASMA:
                p = polygony(m >= od, lo0, la1, dlo, dla)
                if p is not None: casti[k].append(p)
    pasma = []
    for k, _, nazev in PASMA:
        if not casti[k]: continue
        # schody po pixelech zaoblit a zjednodušit, oříznout na čtverce mapy, drobky pryč
        g = shapely.union_all(casti[k]).buffer(4, quad_segs=2).buffer(-4, quad_segs=2).simplify(2.5).intersection(mapa)
        g = shapely.union_all([p for p in (g.geoms if hasattr(g, 'geoms') else [g]) if p.geom_type == 'Polygon' and p.area >= 100])
        pasma.append({'k': k, 'n': nazev, 'poly': kruhy(g)})
        print(k, 'plocha ha', round(g.area / 1e4, 1), flush=True)
    meta = {'zdroj': 'Ministerstvo zdravotnictví, strategické hlukové mapy 2022 (hlavní silnice, Ldvn)',
            'url': 'https://geoportal.mzcr.cz/SHM2022/', 'licence': 'otevřená data MZd (INSPIRE)', 'stav': '2022'}
    json.dump({'meta': meta, 'pasma': pasma}, open('assets/hluk.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print('-> assets/hluk.json')
