# stáří budov z RÚIAN (ČÚZK, CC BY 4.0): „datum dokončení stavebního objektu“ pro vrstvu „Stáří domů“ (web/mapa_vrstvy.js)
# U starších domů je to většinou jen konec období ze sčítání (1919, 1945, 1960, 1980, 1990), proto mapa ukazuje třídy, ne přesný rok.
# -> assets/stari_budov.json {id budovy Overture: rok dokončení}; build_html.py kopíruje do site/.
# spouštět z kořene repa: .venv/bin/python nastroje/stari.py   (stahuje se po čtvercích do build/ruian_stari/, po přerušení pokračuje)
import glob, json, os, subprocess, sys, time, urllib.parse
sys.path.insert(0, '.')
import geo, numpy as np, pyarrow.parquet as pq, shapely

URL = 'https://ags.cuzk.gov.cz/arcgis/rest/services/RUIAN/Prohlizeci_sluzba_nad_daty_RUIAN/MapServer/3/query?'
D = 'build/ruian_stari/'
KROK = 2000
MIN_PREKRYTI = 0.5


def stahni(x0, y0, x1, y1):
    f = f'{D}{round(x0)}_{round(y0)}.json'
    if not os.path.exists(f):
        lo0, la0 = geo.to_lonlat(x0, y0); lo1, la1 = geo.to_lonlat(x1, y1)
        q = urllib.parse.urlencode({'geometry': f'{lo0},{la0},{lo1},{la1}', 'geometryType': 'esriGeometryEnvelope', 'inSR': 4326, 'outSR': 4326,
                                    'spatialRel': 'esriSpatialRelIntersects', 'outFields': 'kod,dokonceni', 'f': 'json'})
        subprocess.run(['curl', '-s', '-f', '-m', '180', '-A', 'izomapa-tools/1.0', '-o', f + '.tmp', URL + q], check=True)
        if 'features' not in json.load(open(f + '.tmp')): raise SystemExit(f'RÚIAN nevrátil data pro {f}')
        os.replace(f + '.tmp', f)
        time.sleep(1)
    return json.load(open(f))['features']


def rok(v):
    """ArcGIS vrací datum jako milisekundy od 1970 (i záporné), někdy jako text"""
    if v is None: return None
    if isinstance(v, (int, float)): return time.gmtime(v / 1000).tm_year if v > -2208988800000 else 1900 + int(v / 31557600000)
    try: return int(str(v)[:4])
    except ValueError: return None


if __name__ == '__main__':
    os.makedirs(D, exist_ok=True)
    X0, Y0, X1, Y1 = geo.extent(geo.MARGIN + 20)
    seen = {}; x = X0
    while x < X1:
        y = Y0
        while y < Y1:
            for o in stahni(x, y, min(x + KROK, X1), min(y + KROK, Y1)):
                a = o['attributes']; g = o.get('geometry'); r_ = rok(a.get('dokonceni'))
                if g and g.get('rings') and r_ and 1000 < r_ <= time.gmtime().tm_year and a['kod'] not in seen:
                    r = [[geo.to_local(lo, la) for lo, la in q] for q in g['rings']]
                    seen[a['kod']] = (shapely.make_valid(shapely.Polygon(r[0], r[1:])), r_)
            y += KROK
        x += KROK
    objekty = list(seen.values()); strom = shapely.STRtree([o[0] for o in objekty]); out = {}
    for f in sorted(glob.glob('data*/building.parquet')):
        if 'data_all' in f: continue
        for r in pq.read_table(f, columns=['id', 'geometry']).to_pylist():
            if r['id'] in out: continue
            g = shapely.from_wkb(r['geometry']); g = g if g.geom_type == 'Polygon' else max(g.geoms, key=lambda q: q.area)
            p = shapely.transform(g, lambda c: np.array([geo.to_local(*q) for q in c]))
            best, kolik = None, 0.0
            for j in strom.query(p):
                a_ = shapely.area(shapely.intersection(p, objekty[j][0]))
                if a_ > kolik: best, kolik = j, a_
            if best is not None and kolik >= MIN_PREKRYTI * p.area: out[r['id']] = objekty[best][1]
    json.dump(out, open('assets/stari_budov.json', 'w'), separators=(',', ':'))
    hist = {}
    for v in out.values(): hist[v] = hist.get(v, 0) + 1
    print('objektů s datem', len(seen), 'přiřazeno budov', len(out), 'nejčastější roky', sorted(hist.items(), key=lambda q: -q[1])[:8])
