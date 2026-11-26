"""Vzpomínková a pozoruhodná místa z OpenStreetMap (Overpass, ODbL) pro vrstvu „Památná místa“ (web/mapa_pamatna.js).

Druhy: deska (pamětní deska), kamen (Stolperstein, kámen zmizelých), pomnik (pomník, válečný pomník, památník),
socha (socha, busta), kriz (boží muka, kříž, kaplička u cesty), strom (památný strom), vyhlidka (vyhlídka).
-> assets/pamatna.json (build_html.py kopíruje do site/): [{druh, lat, lon, nazev?, napis?, wiki?, zdroj}]
Render není potřeba. Použití: .venv/bin/python nastroje/pamatna.py
"""
import json, os, subprocess, sys
sys.path.insert(0, '.')
import geo


def druh(g):
    h, m = g.get('historic'), g.get('memorial')
    if h == 'memorial' and m == 'stolperstein': return 'kamen'
    if h == 'memorial' and m == 'plaque' or h == 'plaque': return 'deska'
    if h == 'memorial' and m in ('statue', 'bust') or g.get('artwork_type') in ('statue', 'bust') or h == 'statue': return 'socha'
    if h in ('memorial', 'monument', 'war_memorial'): return 'pomnik'
    if h in ('wayside_cross', 'wayside_shrine') or g.get('man_made') == 'cross': return 'kriz'
    if g.get('natural') == 'tree' and (g.get('denotation') == 'natural_monument' or g.get('protected') == 'yes' or g.get('protection_title')): return 'strom'
    if g.get('tourism') == 'viewpoint': return 'vyhlidka'
    return None


def main():
    x0, y0, x1, y1 = geo.extent(geo.MARGIN)
    lo0, la0 = geo.to_lonlat(x0, y0); lo1, la1 = geo.to_lonlat(x1, y1)
    bb = f'({la0},{lo0},{la1},{lo1})'
    q = (f'[out:json][timeout:90];('
         f'nwr["historic"~"^(memorial|monument|war_memorial|wayside_cross|wayside_shrine|plaque|statue)$"]{bb};'
         f'nwr["man_made"="cross"]{bb};nwr["tourism"="artwork"]["artwork_type"~"^(statue|bust)$"]{bb};'
         f'node["natural"="tree"]["denotation"="natural_monument"]{bb};node["natural"="tree"]["protected"="yes"]{bb};'
         f'nwr["tourism"="viewpoint"]{bb};);out tags center;')
    t = subprocess.run(['curl', '-s', '-f', '-m', '150', '-A', 'izomapa-tools/1.0', '--data-urlencode', f'data={q}', 'https://overpass-api.de/api/interpreter'],
                       check=True, capture_output=True, text=True, encoding='utf-8').stdout
    H, out, videno = geo.HALF, [], set()
    for e in json.loads(t)['elements']:
        g = e.get('tags', {}); c = e.get('center') or e; d = druh(g)
        if not d or g.get('access') in ('private', 'no'): continue
        x, y = geo.to_local(c['lon'], c['lat'])
        if not any(abs(x - cx) <= H and abs(y - cy) <= H for cx, cy in map(geo.chunk_center, geo.CHUNKS)): continue
        kl = (d, round(c['lat'], 5), round(c['lon'], 5))
        if kl in videno: continue
        videno.add(kl)
        p = {'druh': d, 'lat': round(c['lat'], 6), 'lon': round(c['lon'], 6), 'zdroj': f'https://www.openstreetmap.org/{e["type"]}/{e["id"]}'}
        nm = g.get('name') or g.get('memorial:name') or g.get('subject')
        if nm: p['nazev'] = nm[:90]
        if g.get('inscription'): p['napis'] = g['inscription'][:300]
        wk = g.get('wikipedia', '')
        if wk.startswith('cs:'): p['wiki'] = 'https://cs.wikipedia.org/wiki/' + wk[3:].replace(' ', '_')
        out.append(p)
    os.makedirs('assets', exist_ok=True)
    json.dump(out, open('assets/pamatna.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    pocty = {}
    for p in out: pocty[p['druh']] = pocty.get(p['druh'], 0) + 1
    print('památná místa', len(out), pocty)


if __name__ == '__main__':
    main()
