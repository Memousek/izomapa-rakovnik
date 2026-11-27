# ukazatele rychlosti („Vaše rychlost“, highway=speed_display) a radary (highway=speed_camera) z OpenStreetMap (Overpass, ODbL)
# -> assets/merice.json: [{id, lat, lon, typ: displej|radar, smer: ° (kompas, odkud auta přijíždějí) | null, limit, ulice,
#    stoji: [lat, lon] sloupu u pravého okraje vozovky (bod z OSM bývá na ose silnice), osa: směr silnice (°), usek?}]
# Měřený úsek (dvojice tabulí, mezi kterými 3D jízda počítá průměrnou rychlost): "merene_useky": [[[lat, lon], [lat, lon]], …]
# v mesto.json, každý bod se přiřadí k nejbližší tabuli do 60 m. Prohlížeč (web/mapa_merice.js) ukazuje rychlost aut ze simulace,
# 3D jízda (web/jizda_merice.js) rychlost hráče. Pak build_html.py a nastroje/jizda.py (render ani overlay.py není potřeba).
# Tabule, které v OSM chybí: "merice_rucne" v mesto.json (lepší je je doplnit do OSM).
# spouštět z kořene repa: python nastroje/merice.py
import json, math, subprocess, sys; sys.path.insert(0, '.')
import numpy as np, pyarrow.parquet as pq, shapely
import geo

x0, y0, x1, y1 = geo.extent(geo.MARGIN)
lo0, la0 = geo.to_lonlat(x0, y0); lo1, la1 = geo.to_lonlat(x1, y1); b = f'{la0},{lo0},{la1},{lo1}'
q = f'[out:json][timeout:90];(node["highway"="speed_display"]({b});node["highway"="speed_camera"]({b}););out body;'
t = None
for url in ('https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter'):   # záložní server
    try:
        t = subprocess.run(['curl', '-s', '-f', '-m', '150', '-A', 'izomapa-tools/1.0', '--data-urlencode', f'data={q}', url],
                           check=True, capture_output=True, text=True).stdout; json.loads(t); break
    except (subprocess.CalledProcessError, ValueError) as ex: print(url, str(ex)[:120]); t = None
CACHE = 'build/merice_osm.json'                   # poslední odpověď Overpassu, když je server přetížený
if t is not None: open(CACHE, 'w').write(t)
else:
    try: t = open(CACHE).read(); print('Overpass nedostupný, beru', CACHE)
    except OSError: sys.exit('Overpass nedostupný, zkus to později')

# název ulice a místo pro sloup: nejbližší silnice z Overture (do 30 m), v místních metrech
SILNICE = {'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street'}
PULKA = {'motorway': 7, 'trunk': 5, 'primary': 4, 'secondary': 3.5, 'tertiary': 3.2}   # půl šířky vozovky, jinak 2,8 m
s = pq.read_table('data_all/segment.parquet', columns=['names', 'class', 'geometry']).to_pydict()
sil = [(shapely.from_wkb(g), (n or {}).get('primary'), c) for g, n, c in zip(s['geometry'], s['names'], s['class']) if c in SILNICE]
def lok(a): x, y = geo.to_local(a[:, 0], a[:, 1]); return np.column_stack([x, y])
geom = shapely.transform(np.array([g for g, _, _ in sil]), lok)
def silnice(x, y, sm):
    """název ulice a [x, y] sloupu: kousek za okrajem vozovky, vpravo pro auta, která tabule měří"""
    P = shapely.Point(x, y); d = shapely.distance(geom, P); poradi = np.argsort(d)[:6]
    nazev = next((sil[i][1] for i in poradi if d[i] <= 30 and sil[i][1]), None)
    i = poradi[0]
    if d[i] > 30: return nazev, [x, y], None
    L = geom[i]; t = L.project(P); A = L.interpolate(t); a, b = L.interpolate(max(0, t - 3)), L.interpolate(min(L.length, t + 3))
    tx, ty = b.x - a.x, b.y - a.y; l = math.hypot(tx, ty) or 1; tx, ty = tx / l, ty / l
    off = PULKA.get(sil[i][2], 2.8) + 2   # na chodník, před ploty
    if sm is not None:                                      # auta jedou směrem sm + 180°, vpravo od nich je sm - 90°
        u = math.radians(sm - 90); nx, ny = math.sin(u), math.cos(u)
    else:                                                   # na tu stranu, kde bod leží; na ose vpravo od směru kreslení
        c = tx * (y - A.y) - ty * (x - A.x)
        nx, ny = (-ty, tx) if c > 0.5 else (ty, -tx)
    return nazev, [A.x + nx * off, A.y + ny * off], round(math.degrees(math.atan2(tx, ty)) % 180)   # osa silnice (°, kompas)

SMER = {'north': 0, 'east': 90, 'south': 180, 'west': 270, 'N': 0, 'E': 90, 'S': 180, 'W': 270}
out = []
for e in json.loads(t)['elements']:
    tg = e.get('tags', {})
    x, y = (float(v) for v in geo.to_local(e['lon'], e['lat']))
    if not (x0 <= x <= x1 and y0 <= y <= y1): continue
    sm = tg.get('direction'); sm = SMER.get(sm, sm)
    try: sm = float(sm) % 360
    except (TypeError, ValueError): sm = None             # forward / both / chybí: měří se oba směry
    lim = tg.get('maxspeed', '50')
    nazev, (sx, sy), osa = silnice(x, y, sm)
    slo, sla = geo.to_lonlat(sx, sy)
    out.append({'id': e['id'], 'lat': round(e['lat'], 7), 'lon': round(e['lon'], 7),
                'typ': 'displej' if tg['highway'] == 'speed_display' else 'radar', 'smer': sm,
                'limit': int(lim) if str(lim).isdigit() else 50, 'ulice': nazev, 'stoji': [round(float(sla), 7), round(float(slo), 7)], 'osa': osa})
# ruční doplnění (tabule, které v OSM chybí): "merice_rucne": [{"lat", "lon", "smer", "limit"?, "typ"?, "pozn"?}] v mesto.json
for k, m in enumerate(geo.MESTO.get('merice_rucne', [])):
    x, y = (float(v) for v in geo.to_local(m['lon'], m['lat'])); sm = m.get('smer')
    nazev, (sx, sy), osa = silnice(x, y, sm)
    slo, sla = geo.to_lonlat(sx, sy)
    out.append({'id': f'rucne{k}', 'lat': m['lat'], 'lon': m['lon'], 'typ': m.get('typ', 'displej'), 'smer': sm, 'limit': m.get('limit', 50),
                'ulice': nazev, 'stoji': [round(float(sla), 7), round(float(slo), 7)], 'osa': osa, 'rucne': 1})
out.sort(key=lambda m: (m['lat'], m['lon']))

def blizko(lat, lon):
    d = [(math.hypot((m['lat'] - lat) * 111320, (m['lon'] - lon) * 111320 * math.cos(math.radians(lat))), i) for i, m in enumerate(out)]
    d = min(d, default=(1e9, -1)); return d[1] if d[0] < 60 else -1
for k, (a, c) in enumerate(geo.MESTO.get('merene_useky', [])):
    i, j = blizko(*a), blizko(*c)
    if i < 0 or j < 0 or i == j: print('měřený úsek', k, 'nemá obě tabule do 60 m, vynechávám'); continue
    out[i]['usek'] = out[j]['usek'] = k

json.dump(out, open('assets/merice.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
for m in out: print(m['typ'], m['lat'], m['lon'], m['ulice'], m['limit'], 'směr', m['smer'], 'úsek', m.get('usek', '-'))
print('měřičů', len(out))
