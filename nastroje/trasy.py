# značené turistické a cyklistické trasy a rozcestníky z OpenStreetMap (Overpass, ODbL, bez registrace)
# assets/trasy.json: {"cesty": [{"l": [[lat, lon], ...], "p": ["red", "blue"...], "c": ["0045", ...]}], "rozcestniky": [[lat, lon, "název"]]}
#   p = barvy pěších tras KČT na úseku (z osmc:symbol, jinak colour), c = čísla cyklotras na úseku
# build_html.py soubor zkopíruje do site/trasy.json a v mapě přibude vrstva „Turistické a cyklotrasy“.
# spouštět z kořene repa: python nastroje/trasy.py
import json, subprocess, sys; sys.path.insert(0, '.')
import geo
from shapely.geometry import LineString, box

BARVY = ('red', 'blue', 'green', 'yellow')
SERVERY = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']


def dotaz(q):
    for u in SERVERY:
        r = subprocess.run(['curl', '-s', '-f', '-m', '180', '-A', 'izomapa-tools/1.0', '--data-urlencode', f'data={q}', u], capture_output=True, text=True)
        if r.returncode == 0 and '"elements"' in r.stdout: return json.loads(r.stdout)['elements']
    raise SystemExit('Overpass neodpovídá, zkus to později')


def barva(t):
    s = (t.get('osmc:symbol') or '').split(':')[0].lower()
    if s in BARVY: return s
    c = (t.get('colour') or '').lower()
    return c if c in BARVY else None


def zjednodus(body, tol=1.5):
    """zjednodušení v metrech (méně bodů pro prohlížeč), zpět ve stupních"""
    xy = [tuple(map(float, geo.to_local(lo, la))) for la, lo in body]
    if len(xy) < 2: return []
    l = LineString(xy).simplify(tol)
    return [[round(float(la), 6), round(float(lo), 6)] for lo, la in (geo.to_lonlat(x, y) for x, y in l.coords)]


if __name__ == '__main__':
    lo0, lo1, la0, la1 = geo.bbox_lonlat(geo.MARGIN + 20)
    b = f'{la0},{lo0},{la1},{lo1}'
    rel = dotaz(f'[out:json][timeout:120];relation["type"="route"]["route"~"^(hiking|foot|bicycle|mtb)$"]({b});out geom({b});')
    cesty = {}                                   # id cesty -> úsek se všemi trasami, které po něm vedou
    for r in rel:
        t = r.get('tags', {}); pesi = t['route'] in ('hiking', 'foot')
        znak = barva(t) if pesi else (t.get('ref') or t.get('name') or '?')
        if pesi and not znak: continue
        for m in r.get('members', []):
            if m.get('type') != 'way' or not m.get('geometry'): continue
            c = cesty.setdefault(m['ref'], {'l': [[g['lat'], g['lon']] for g in m['geometry'] if g], 'p': [], 'c': []})
            if znak not in c['p' if pesi else 'c']: c['p' if pesi else 'c'].append(znak)
    ram = box(*geo.extent(geo.MARGIN))
    out = []
    for c in cesty.values():
        l = zjednodus(c['l'])
        if len(l) < 2 or not LineString([tuple(map(float, geo.to_local(lo, la))) for la, lo in l]).intersects(ram): continue
        c['p'].sort(key=BARVY.index); out.append({'l': l, 'p': c['p'], 'c': sorted(c['c'])})
    rz = dotaz(f'[out:json][timeout:60];node["tourism"="information"]["information"="guidepost"]({b});out;')
    rozc = [[round(e['lat'], 6), round(e['lon'], 6), e.get('tags', {}).get('name', '')] for e in rz]
    json.dump({'cesty': out, 'rozcestniky': rozc}, open('assets/trasy.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print('úseků', len(out), 'pěších', sum(1 for c in out if c['p']), 'cyklo', sum(1 for c in out if c['c']), 'rozcestníků', len(rozc))
