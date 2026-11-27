# hustota obyvatel pro vrstvu „Hustota obyvatel“ (web/mapa_vrstvy.js): Sčítání 2021 v mřížce 1 × 1 km (Eurostat, Census grid 2021 V3).
# Zdroj: https://ec.europa.eu/eurostat/web/gisco/geodata/population-distribution/population-grids, volné užití s uvedením zdroje.
# Z 566MB ZIPu stáhne po kouscích (HTTP Range) jen CSV (49 MB komprimované) a vybere buňky kolem mapy, výřez uloží do build/hustota_vyrez.csv.
# -> assets/hustota.json {"meta": {...}, "pasma": [{"k", "n", "poly": [[[lat, lon], ...], ...]}]}; build_html.py kopíruje do site/.
# spouštět z kořene repa: .venv/bin/python nastroje/hustota.py
import csv, io, json, os, sys, urllib.request, zipfile
sys.path.insert(0, '.')
import geo, numpy as np, shapely
from pyproj import Transformer

URL = 'https://gisco-services.ec.europa.eu/census/2021/Eurostat_Census-GRID_2021_V3.zip'
CSV = 'Eurostat_Census-GRID_2021_V3/ESTAT_Census_2021_V3.csv'
VYREZ = 'build/hustota_vyrez.csv'
PASMA = [('h1', 1, '1–99 obyv./km²'), ('h100', 100, '100–499 obyv./km²'), ('h500', 500, '500–1 999 obyv./km²'),
         ('h2000', 2000, '2 000–4 999 obyv./km²'), ('h5000', 5000, '5 000 a víc obyv./km²')]
UA = 'izomapa-tools/1.0'


class Rozsah(io.RawIOBase):
    """soubor na webu čtený po kouscích přes HTTP Range (zipfile si přečte jen obsah a potřebný soubor)"""
    def __init__(self, url):
        self.url, self.p = url, 0
        self.n = int(urllib.request.urlopen(urllib.request.Request(url, method='HEAD', headers={'User-Agent': UA})).headers['Content-Length'])
    def seekable(self): return True
    def readable(self): return True
    def tell(self): return self.p
    def seek(self, o, w=0):
        self.p = o if w == 0 else self.p + o if w == 1 else self.n + o
        return self.p
    def readinto(self, b):
        if self.p >= self.n: return 0
        e = min(self.n, self.p + len(b)) - 1
        d = urllib.request.urlopen(urllib.request.Request(self.url, headers={'Range': f'bytes={self.p}-{e}', 'User-Agent': UA}), timeout=120).read()
        b[:len(d)] = d; self.p += len(d)
        return len(d)


def plocha_mapy():
    """čtverce mapy v místních metrech (jen ty, které se kreslí)"""
    return shapely.union_all([shapely.box(cx - geo.HALF, cy - geo.HALF, cx + geo.HALF, cy + geo.HALF)
                              for cx, cy in (geo.chunk_center(c) for c in geo.CHUNKS)])


def kruhy(g):
    """shapely plocha -> [[vnější kruh, díry…], …] v [lat, lon]"""
    out = []
    for p in ([] if g is None or g.is_empty else (g.geoms if hasattr(g, 'geoms') else [g])):
        if p.geom_type != 'Polygon': continue
        rr = []
        for r in [p.exterior, *p.interiors]:
            lo, la = geo.to_lonlat(*np.array(r.coords).T)
            rr.append([[round(float(a), 6), round(float(b), 6)] for a, b in zip(la, lo)])
        out.append(rr)
    return out


if __name__ == '__main__':
    os.makedirs('build', exist_ok=True)
    do3035 = Transformer.from_crs('EPSG:4326', 'EPSG:3035', always_xy=True)
    z3035 = Transformer.from_crs('EPSG:3035', 'EPSG:4326', always_xy=True)
    lo0, lo1, la0, la1 = geo.bbox_lonlat(1500)
    xs, ys = do3035.transform([lo0, lo1, lo0, lo1], [la0, la0, la1, la1])
    E0, E1, N0, N1 = min(xs) - 1000, max(xs), min(ys) - 1000, max(ys)
    if not os.path.exists(VYREZ):
        print('stahuji CSV mřížky (49 MB po kouscích)…', flush=True)
        z = zipfile.ZipFile(io.BufferedReader(Rozsah(URL), 1 << 22))
        rows = []
        with z.open(CSV) as f:
            r = csv.reader(io.TextIOWrapper(f, encoding='utf-8'))
            hlava = next(r)
            for row in r:
                gid = row[0]                                   # CRS3035RES1000mN{sever}E{východ}, levý dolní roh buňky
                if not gid.startswith('CRS3035RES1000mN'): continue
                n, e = gid[16:].split('E')
                if N0 <= int(n) <= N1 and E0 <= int(e) <= E1: rows.append(row)
        with open(VYREZ + '.tmp', 'w', newline='', encoding='utf-8') as f:
            w = csv.writer(f); w.writerow(hlava); w.writerows(rows)
        os.replace(VYREZ + '.tmp', VYREZ)
    rows = list(csv.DictReader(open(VYREZ, encoding='utf-8')))
    mapa = plocha_mapy()
    bunky = {k: [] for k, _, _ in PASMA}
    lidi = 0
    for row in rows:
        t = int(row['T'])
        if t <= 0: continue                                    # neobydlené a důvěrné (-8888) buňky se nekreslí
        n, e = map(int, row['GRD_ID'][16:].split('E'))
        # okraj buňky po 100 m, ať se čtverec v místních metrech (jiná projekce) neohne mimo sousedy
        st = np.linspace(0, 1000, 11)
        bx = np.concatenate([e + st, np.full(10, e + 1000.0), e + 1000 - st[1:], np.full(10, float(e))])
        by = np.concatenate([np.full(11, float(n)), n + st[1:], np.full(10, n + 1000.0), n + 1000 - st[1:]])
        lo, la = z3035.transform(bx, by)
        p = shapely.Polygon(list(zip(*geo.to_local(np.array(lo), np.array(la))))).intersection(mapa)
        if p.is_empty: continue
        lidi += t * p.area / 1e6
        k = [k for k, od, _ in PASMA if t >= od][-1]
        bunky[k].append(p)
    pasma = []
    for k, _, nazev in PASMA:
        if not bunky[k]: continue
        g = shapely.union_all(bunky[k])
        pasma.append({'k': k, 'n': nazev, 'poly': kruhy(g)})
        print(k, 'buněk', len(bunky[k]), flush=True)
    meta = {'zdroj': 'Sčítání 2021 (ČSÚ), mřížka 1 km z Eurostatu (Census grid 2021)',
            'url': 'https://ec.europa.eu/eurostat/web/gisco/geodata/population-distribution/population-grids',
            'licence': 'volné užití s uvedením zdroje (Eurostat)', 'stav': '2021-03-26'}
    json.dump({'meta': meta, 'pasma': pasma}, open('assets/hustota.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print('obyvatel v mapě asi', round(lidi), '-> assets/hustota.json')
