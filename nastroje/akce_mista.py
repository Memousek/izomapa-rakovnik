"""Místa konání akcí (divadlo, kino, muzeum, galerie, sportoviště, kostely, náměstí) z OpenStreetMap (Overpass, ODbL)
pro kalendář akcí a zápasy v mapě (web/mapa_kalendar.js): text místa z kalendáře („sál Tylova divadla, Rakovník“) se
přiřadí k pojmenovanému místu podle slov v názvu. -> assets/akce_mista.json [{nazev, slova, lat, lon}]
Ruční doplnění nebo oprava: mesto.json "akce_mista": {"Tylovo divadlo": [lat, lon]}. Render není potřeba.
Použití: .venv/Scripts/python nastroje/akce_mista.py
"""
import json, re, subprocess, sys, unicodedata
sys.path.insert(0, '.')
import geo

DRUHY = ('nwr["amenity"~"^(theatre|cinema|arts_centre|community_centre|library|place_of_worship|townhall|events_venue|music_venue)$"]["name"]',
         'nwr["tourism"~"^(museum|gallery|attraction)$"]["name"]',
         'nwr["leisure"~"^(stadium|sports_centre|ice_rink|sports_hall|park|swimming_pool|water_park)$"]["name"]',
         'nwr["place"="square"]["name"]', 'nwr["highway"="pedestrian"]["area"="yes"]["name"]')
VATA = {'a', 'v', 've', 'na', 'u', 'pod', 'nad', 'do', 'sv', 'svateho', 'svate', 'rakovnik', 'rakovniku', 'mesto', 'mestske', 'mestsky', 'sal', 'areal', 'budova'}


def slova(t):
    t = unicodedata.normalize('NFD', t.lower()); t = ''.join(c for c in t if unicodedata.category(c) != 'Mn')
    return [w[:5] for w in re.findall(r'[a-z0-9]+', t) if len(w) > 1 and w not in VATA]   # prvních 5 písmen: Tylovo / Tylova


def main():
    x0, y0, x1, y1 = geo.extent(geo.MARGIN)
    lo0, la0 = geo.to_lonlat(x0, y0); lo1, la1 = geo.to_lonlat(x1, y1)
    bb = f'({la0},{lo0},{la1},{lo1})'
    q = '[out:json][timeout:90];(' + ''.join(d + bb + ';' for d in DRUHY) + ');out tags center;'
    t = subprocess.run(['curl', '-s', '-f', '-m', '150', '-A', 'izomapa-tools/1.0', '--data-urlencode', f'data={q}', 'https://overpass-api.de/api/interpreter'],
                       check=True, capture_output=True, text=True, encoding='utf-8').stdout
    out, videno = [], set()
    for e in json.loads(t)['elements']:
        g = e.get('tags', {}); c = e.get('center') or e
        nm = g.get('name', '').strip()
        if not nm or nm in videno or 'lat' not in c: continue
        videno.add(nm)
        out.append({'nazev': nm, 'slova': slova(nm), 'lat': round(c['lat'], 6), 'lon': round(c['lon'], 6)})
    for nm, (la, lo) in (geo.MESTO.get('akce_mista') or {}).items():   # ruční místa mají přednost
        out = [o for o in out if o['nazev'] != nm] + [{'nazev': nm, 'slova': slova(nm), 'lat': la, 'lon': lo, 'rucne': 1}]
    out = [o for o in out if o['slova']]
    json.dump(out, open('assets/akce_mista.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print('míst', len(out))


if __name__ == '__main__':
    main()
