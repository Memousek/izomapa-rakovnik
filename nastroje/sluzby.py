"""Pítka a veřejné záchody z OpenStreetMap (Overpass, ODbL) pro vrstvu „Pítka a WC“ v mapě.

-> assets/sluzby.json a site/sluzby.json: [{druh: 'pitko'|'wc', lat, lon, nazev?, poplatek?, oteviraci?, bezbarier?, zakaznici?}]
Soukromé (access=private/no) se vynechají. Render není potřeba, prohlížeč si soubor načte sám.
Použití: .venv/Scripts/python nastroje/sluzby.py
"""
import json, os, subprocess, sys
sys.path.insert(0, '.')
import geo


def main():
    x0, y0, x1, y1 = geo.extent(geo.MARGIN)
    lo0, la0 = geo.to_lonlat(x0, y0); lo1, la1 = geo.to_lonlat(x1, y1)
    q = f'[out:json][timeout:60];(nwr["amenity"~"^(drinking_water|toilets)$"]({la0},{lo0},{la1},{lo1}););out tags center;'
    t = subprocess.run(['curl', '-s', '-f', '-m', '120', '-A', 'izomapa-tools/1.0', '--data-urlencode', f'data={q}', 'https://overpass-api.de/api/interpreter'],
                       check=True, capture_output=True, text=True, encoding='utf-8').stdout
    H = geo.HALF
    out = []
    for e in json.loads(t)['elements']:
        g = e.get('tags', {}); c = e.get('center') or e
        if g.get('access') in ('private', 'no'): continue
        x, y = geo.to_local(c['lon'], c['lat'])
        if not any(abs(x - cx) <= H and abs(y - cy) <= H for cx, cy in map(geo.chunk_center, geo.CHUNKS)): continue
        p = {'druh': 'pitko' if g['amenity'] == 'drinking_water' else 'wc', 'lat': round(c['lat'], 6), 'lon': round(c['lon'], 6)}
        if g.get('name'): p['nazev'] = g['name'][:80]
        if g.get('fee') in ('yes', 'no'): p['poplatek'] = 1 if g['fee'] == 'yes' else 0
        if g.get('opening_hours'): p['oteviraci'] = g['opening_hours'][:120]
        if g.get('wheelchair') == 'yes': p['bezbarier'] = 1
        if g.get('access') == 'customers': p['zakaznici'] = 1
        out.append(p)
    for f in ('assets/sluzby.json', 'site/sluzby.json'):
        os.makedirs(os.path.dirname(f), exist_ok=True)
        json.dump(out, open(f, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print('pítek', sum(p['druh'] == 'pitko' for p in out), 'WC', sum(p['druh'] == 'wc' for p in out))


if __name__ == '__main__':
    main()
