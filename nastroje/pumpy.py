"""Čerpací stanice a nabíječky z OpenStreetMap pro mapu a 3D jízdu.

Stáhne z Overpass `amenity=fuel` a `amenity=charging_station` v rozsahu mapy a uloží je do assets/pumpy.json.
Druhy: "pumpa" (paliva), "ev" (nabíječka pro auta), "kolo" (nabíjecí box pro elektrokola, Powerbox apod.).
Soukromé (access=private/no) se vynechají.

Ceny paliv (volitelné): assets/ceny_paliv.json
  {"zdroj": "mBenzin.cz", "zdroj_url": "https://mbenzin.cz",
   "stanice": {"node/123": {"ceny": {"95": 39.9, "nafta": 41.2, "lpg": 18.9}, "cas": "2026-11-17T10:00", "url": "…"}}}
Klíč je OSM id pumpy (typ/číslo, viz assets/pumpy.json). Cenu starší než 7 dní zápis vynechá, prohlížeč ji po 2 dnech zešedí.
Ceny přebírej jen ze zdroje, který to výslovně dovoluje (smlouva, API s licencí), a vždy s uvedením zdroje.

Ceny nabíjení (volitelné): assets/ceny_nabijeni.json, veřejné ceníky provozovatelů podle výkonu
  {"provozovatele": [{"shoda": "E.ON", "nazev": "E.ON Drive", "pasma": [{"do_kw": 100, "cena": 10.5, "noc": 8.5, "reg": 9.5, "reg_noc": 8.0}, …],
    "noc": "20:00–8:00", "poplatek": "…", "platnost": "2026-04-01", "zdroj": "…", "url": "…", "overeno": "2026-11-17"}]}
„shoda“ je regulární výraz na provozovatele, značku a název nabíječky z OSM; k nabíječce se přiřadí pásma podle výkonu
jejích konektorů (bez údaje o výkonu všechna). cena = bez registrace, reg = s registrací zdarma.

Výstup pro prohlížeč i 3D jízdu: site/pumpy.json (zapsat(), volá ho i overlay.py). Render není potřeba.
Použití: .venv/Scripts/python nastroje/pumpy.py [--bez-stahovani]
"""
import json, os, re, subprocess, sys, time
sys.path.insert(0, '.')
import geo

ASSET, CENY, CENY_NAB, OUT = 'assets/pumpy.json', 'assets/ceny_paliv.json', 'assets/ceny_nabijeni.json', 'site/pumpy.json'
PALIVA = [('octane_95', '95'), ('octane_98', '98'), ('octane_100', '100'), ('diesel', 'nafta'), ('lpg', 'lpg'), ('cng', 'cng'),
          ('lng', 'lng'), ('adblue', 'adblue'), ('propane', 'propan')]
AUTO_SOCKETY = ('type2', 'type2_combo', 'type2_cable', 'chademo', 'type1', 'type1_combo', 'tesla_supercharger', 'tesla_standard', 'gb_dc')
MAX_STARI = 7 * 86400


def dotaz(q):
    for pokus in range(3):                                    # Overpass bývá přetížený (429/504): zkusit znovu po chvíli
        r = subprocess.run(['curl', '-s', '-f', '-m', '120', '-A', 'izomapa-tools/1.0', '--data-urlencode', f'data={q}', 'https://overpass-api.de/api/interpreter'],
                           capture_output=True, text=True, encoding='utf-8')
        if r.returncode == 0: return json.loads(r.stdout)['elements']
        print('Overpass neodpověděl, zkusím znovu za', 20 * (pokus + 1), 's'); time.sleep(20 * (pokus + 1))
    sys.exit('Overpass nejde stáhnout, zkus to později (stávající assets/pumpy.json zůstává).')


def ano(v): return str(v or '').lower() not in ('', 'no', '0', 'false')


def vykon(t, s):
    """výkon konektoru jako text („50 kW“, „32 A“), z tagu socket:<druh>:output nebo :current"""
    o = (t.get(f'socket:{s}:output') or '').replace('kw', 'kW').replace('KW', 'kW')
    if o and o.replace(' ', '').replace('kW', '').replace('.', '').isdigit() and 'kW' not in o: o += ' kW'
    if not o and t.get(f'socket:{s}:current'): o = t[f'socket:{s}:current'].replace(' ', '').rstrip('Aa') + ' A'
    return o.replace('kW', ' kW').replace('  ', ' ').strip()


def zpracuj(e):
    t = e.get('tags', {})
    if t.get('access') in ('private', 'no') or t.get('disused') == 'yes': return None
    c = e.get('center') or e
    p = {'id': f"{e['type']}/{e['id']}", 'lat': round(c['lat'], 6), 'lon': round(c['lon'], 6)}
    for k_osm, k in (('brand', 'znacka'), ('operator', 'provozovatel'), ('name', 'nazev'), ('opening_hours', 'oteviraci'), ('website', 'web'),
                     ('addr:street', 'ulice'), ('addr:housenumber', 'cp'), ('ref:CZ:evcs', 'evcs')):
        if t.get(k_osm): p[k] = t[k_osm]
    if t.get('access') == 'customers': p['zakaznici'] = 1
    if t['amenity'] == 'fuel':
        p['druh'] = 'pumpa'
        p['paliva'] = [k for o, k in PALIVA if ano(t.get(f'fuel:{o}')) or (o == 'adblue' and ano(t.get('fuel:adblue:canister')))]
        if ano(t.get('shop')) or t.get('shop'): p['obchod'] = 1
        if ano(t.get('car_wash')): p['myci'] = 1
        if ano(t.get('compressed_air')): p['vzduch'] = 1
        return p
    sockety = {s.split(':')[1]: t[s] for s in t if s.startswith('socket:') and s.count(':') == 1}
    # pro kola jen box s kolovými zásuvkami (Powerbox: schuko, Bosch, Shimano…) nebo bicycle=yes; bez údajů o konektorech je to nabíječka aut
    kolo = (t.get('bicycle') == 'yes' or any(s not in AUTO_SOCKETY for s in sockety)) and not any(s in AUTO_SOCKETY for s in sockety) and t.get('motorcar') != 'yes'
    auto = not kolo
    p['druh'] = 'ev' if auto else 'kolo'
    p['konektory'] = [[s, int(n) if str(n).isdigit() else 1, vykon(t, s)] for s, n in sockety.items() if (s in AUTO_SOCKETY) == auto]
    if t.get('capacity', '').isdigit(): p['stojanu'] = int(t['capacity'])
    if t.get('fee'): p['placene'] = 0 if t['fee'] == 'no' else 1
    plat = [k.split(':')[1] for k in t if k.startswith('authentication:') and ano(t[k])]
    if plat: p['overeni'] = plat
    return p


def stahnout():
    x0, y0, x1, y1 = geo.extent(geo.MARGIN)
    lo0, la0 = geo.to_lonlat(x0, y0); lo1, la1 = geo.to_lonlat(x1, y1); b = f'{la0},{lo0},{la1},{lo1}'
    el = dotaz(f'[out:json][timeout:60];(nwr["amenity"="fuel"]({b});nwr["amenity"="charging_station"]({b}););out tags center;')
    H = geo.HALF
    def v_mape(p):
        x, y = geo.to_local(p['lon'], p['lat'])
        return any(abs(x - cx) <= H and abs(y - cy) <= H for cx, cy in map(geo.chunk_center, geo.CHUNKS))
    vse = [p for p in map(zpracuj, el) if p and v_mape(p)]
    vse.sort(key=lambda p: (p['druh'] != 'pumpa', p['druh'], p['id']))
    json.dump(vse, open(ASSET, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    return vse


def kw(v):
    """výkon konektoru v kW z textu „50 kW“ / „32 A“ (proud: třífázově 230 V); bez údaje None"""
    m = re.match(r'([\d.,]+)\s*(kW|A)', v or '', re.I)
    if not m: return None
    x = float(m.group(1).replace(',', '.'))
    return x if m.group(2).lower() == 'kw' else round(x * 0.69)


def nabijeni(p, ceniky):
    """ceník provozovatele pro nabíječku: jen pásma, do kterých spadají její konektory"""
    text = ' '.join(str(p.get(k, '')) for k in ('provozovatel', 'znacka', 'nazev'))
    c = next((c for c in ceniky if c.get('shoda') and re.search(c['shoda'], text, re.I)), None)
    if not c or not c.get('pasma'): return None
    vykony = {kw(k[2]) for k in p.get('konektory', [])} - {None}
    pasma = c['pasma'] if not vykony else [q for q in c['pasma'] if any(
        v <= (q['do_kw'] if q['do_kw'] is not None else 1e9) and v > max([0] + [r['do_kw'] for r in c['pasma'] if r['do_kw'] is not None and r['do_kw'] < (q['do_kw'] or 1e9)]) for v in vykony)]
    od = lambda q: max([0] + [r['do_kw'] for r in c['pasma'] if r['do_kw'] is not None and r['do_kw'] < (q['do_kw'] or 1e9)])
    pasma = [{**q, 'od_kw': od(q)} for q in (pasma or c['pasma'])]      # dolní hranice pásma pro popisek („nad 200 kW“)
    return {k: c[k] for k in ('nazev', 'noc', 'poplatek', 'platnost', 'zdroj', 'url', 'overeno') if c.get(k)} | {'pasma': pasma}


def zapsat():
    """site/pumpy.json: stanice z assets/pumpy.json + čerstvé ceny z assets/ceny_paliv.json (když jsou)"""
    if not os.path.exists(ASSET): return []
    vse = json.load(open(ASSET, encoding='utf-8'))
    ceny = json.load(open(CENY, encoding='utf-8')) if os.path.exists(CENY) else {}
    zdroj = {k: ceny[k] for k in ('zdroj', 'zdroj_url') if ceny.get(k)}
    ceniky = json.load(open(CENY_NAB, encoding='utf-8')).get('provozovatele', []) if os.path.exists(CENY_NAB) else []
    ted = time.time()
    for p in vse:
        if p['druh'] == 'ev' and (n := nabijeni(p, ceniky)): p['nabijeni'] = n
        c = (ceny.get('stanice') or {}).get(p['id'])
        if not c or not c.get('ceny') or not c.get('cas'): continue
        try: stari = ted - time.mktime(time.strptime(c['cas'][:16], '%Y-%m-%dT%H:%M'))
        except ValueError: continue
        if stari > MAX_STARI: continue
        p['ceny'] = {k: round(float(v), 2) for k, v in c['ceny'].items() if isinstance(v, (int, float)) and 5 < v < 100}
        p['cas'] = c['cas'][:16]
        if c.get('url'): p['ceny_url'] = c['url']
    os.makedirs('site', exist_ok=True)
    json.dump({'zdroj': zdroj, 'stanice': vse}, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    return vse


if __name__ == '__main__':
    if '--bez-stahovani' not in sys.argv: stahnout()
    v = zapsat()
    print('pump', sum(p['druh'] == 'pumpa' for p in v), 'nabíječek', sum(p['druh'] == 'ev' for p in v), 'pro kola', sum(p['druh'] == 'kolo' for p in v),
          's cenou', sum('ceny' in p for p in v), 's ceníkem nabíjení', sum('nabijeni' in p for p in v))
