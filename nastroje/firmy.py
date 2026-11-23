"""Názvy velkých firem a areálů (průmyslové areály, továrny, pivovary, sklady) z OpenStreetMap (Overpass, ODbL) pro popisky
při velkém přiblížení (web/mapa_firmy.js). Bez kanceláří (pojišťovny, realitky): jen landuse/industrial, man_made=works,
craft=brewery a office=company. Právní forma se zkrátí („ANEXIA s.r.o.“ → „ANEXIA“), názvy částí obce (ZSJ) se vynechají.
-> assets/firmy.json [{nazev, lat, lon, druh}]
Ruční úpravy v mesto.json: "firmy_nazvy": {"Tradiční pivovar v Rakovníku, a.s.": "Pivovar Bakalář"} (přejmenování),
"firmy": {"Název": [lat, lon]} (doplnění), "firmy_skryt": ["Název"].
Použití: .venv/Scripts/python nastroje/firmy.py   (pak build_html.py, render není potřeba)
"""
import json, math, os, re, subprocess, sys, time
sys.path.insert(0, '.')
import geo

DRUHY = ['["landuse"="industrial"]', '["industrial"]', '["man_made"="works"]', '["craft"="brewery"]', '["office"="company"]']
FORMA = re.compile(r',?\s*(spol\.\s*s\s*r\.\s*o\.|s\.\s*r\.\s*o\.?|a\.\s*s\.|k\.\s*s\.|v\.\s*o\.\s*s\.|s\.\s*p\.|z\.\s*s\.|SE|GmbH)\s*$', re.I)


def main():
    x0, y0, x1, y1 = geo.extent(geo.MARGIN)
    lo0, la0 = geo.to_lonlat(x0, y0); lo1, la1 = geo.to_lonlat(x1, y1)
    bb = f'({la0},{lo0},{la1},{lo1})'
    q = '[out:json][timeout:120];(' + ''.join(f'nwr{d}["name"]{bb};' for d in DRUHY) + ');out tags center;'
    t = ''
    for pokus in range(4):                                     # Overpass bývá přetížený: zkusit znovu s delší pauzou
        url = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'][pokus % 2]
        t = subprocess.run(['curl', '-s', '-m', '180', '-A', 'izomapa-tools/1.0', '--data-urlencode', f'data={q}', url], capture_output=True, text=True, encoding='utf-8').stdout
        if t.startswith('{'): break
        time.sleep(20 + 20 * pokus)
    if not t.startswith('{'): raise SystemExit('Overpass neodpověděl, zkus to později')
    zsj = set()
    if os.path.exists('assets/zsj.json'): zsj = {z['nazev'] for z in json.load(open('assets/zsj.json', encoding='utf-8'))['zsj']}
    ren, skryt = geo.MESTO.get('firmy_nazvy', {}), set(geo.MESTO.get('firmy_skryt', []))
    out = []
    for e in json.loads(t)['elements']:
        g = e.get('tags', {}); c = e.get('center') or e
        nm = g.get('name', '').strip()
        if not nm or 'lat' not in c or nm in zsj or nm in skryt: continue
        nm = ren.get(nm) or FORMA.sub('', nm).strip(' ,')
        if nm in skryt: continue
        druh = g.get('industrial') or g.get('craft') or g.get('man_made') or g.get('office') or 'industrial'
        p = {'nazev': nm, 'lat': round(c['lat'], 6), 'lon': round(c['lon'], 6), 'druh': druh}
        blizko = [o for o in out if o['nazev'].lower() == nm.lower() and math.dist((o['lat'], o['lon']), (p['lat'], p['lon'])) < 0.01]
        if blizko: continue                                    # stejná firma zakreslená dvakrát (areál i bod)
        out.append(p)
    for nm, (la, lo) in (geo.MESTO.get('firmy') or {}).items():
        out = [o for o in out if o['nazev'] != nm] + [{'nazev': nm, 'lat': la, 'lon': lo, 'druh': 'rucne'}]
    json.dump(out, open('assets/firmy.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print('firem', len(out), ', '.join(o['nazev'] for o in out))


if __name__ == '__main__':
    main()
