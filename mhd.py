"""MHD podle jízdních řádů (GTFS, adresa v mesto.json mhd.gtfs) -> site/mhd.json

python mhd.py [--stahnout]   stáhne build/gtfs.zip (při --stahnout nebo když je starší než den) a převede ho:
  routes   [číslo linky, typ (0 tramvaj, 2 vlak, 3 autobus)]
  shapes   trasy ve světových souřadnicích mapy [[x, y], ...] (zjednodušené na 1 m)
  services kalendář {id: [po..ne (7× 0/1), od, do, [přidané dny], [zrušené dny]]}
  trips    [linka, trasa, služba, začátek (s od půlnoci), [Δt, vzdálenost po trase (m)] × zastávky, cíl, [zastávka, Δt příjezdu] × zastávky]
  heads, stops  názvy cílů a zastávek (indexy v trips)
Krajské GTFS (např. IDS JMK) se ořízne: jen autobusy a tramvaje, jejichž trasa vede územím mapy.
Prohlížeč z toho podle skutečného času dopočítá, kde je každé vozidlo. Bez mhd.gtfs skript nic neudělá.
"""
import csv, io, json, os, re, subprocess, sys, time, zipfile
import shapely
from nastroje.gtfs_casy import cekani_na_konecne, dopln_mezicasy
from geo import CHUNKS, HALF, MESTO, chunk_center, to_local

URL = (MESTO.get('mhd') or {}).get('gtfs')
if not URL: sys.exit('mesto.json nemá mhd.gtfs – MHD se vynechá')
Z = 'build/gtfs.zip'
if '--stahnout' in sys.argv or not os.path.exists(Z) or time.time() - os.path.getmtime(Z) > 86400:
    subprocess.run(['curl', '-sL', '-m', '120', '-o', Z + '.tmp', URL], check=True)
    zipfile.ZipFile(Z + '.tmp').testzip(); os.replace(Z + '.tmp', Z)
zf = zipfile.ZipFile(Z)
T = lambda n: (csv.DictReader(io.TextIOWrapper(zf.open(n + '.txt'), encoding='utf-8-sig')))
sec = lambda t: (lambda h, m, s: h * 3600 + m * 60 + s)(*map(int, t.split(':')))

AREA = shapely.union_all([shapely.box(x - HALF, y - HALF, x + HALF, y + HALF) for x, y in map(chunk_center, CHUNKS)])
# tramvaj 0 / 900–906, autobus 3 / 700–716, trolejbus 11 / 800 (kreslí se jako autobus); vlak 2, jen s volbou "vlak" a s tvary tras (po silnicích jezdit nemůže); lanovky prohlížeč nekreslí
KIND = lambda t: 0 if t == 0 or 900 <= t <= 906 else 3 if t in (3, 11, 800) or 700 <= t <= 716 else 2 if t == 2 and MESTO.get('vlak') and 'shapes.txt' in zf.namelist() else None
RT = {r['route_id']: r for r in T('routes') if KIND(int(r['route_type'] or 3)) is not None}
trips = [t for t in T('trips') if t['route_id'] in RT]
SN, SXY = {}, {}
for r in T('stops'):
    SN[r['stop_id']] = r['stop_name']
    if r.get('stop_lat'): SXY[r['stop_id']] = tuple(float(v) for v in to_local(float(r['stop_lon']), float(r['stop_lat'])))
shapes, SI, SLEN = [], {}, {}
if 'shapes.txt' in zf.namelist():
    used = {t['shape_id'] for t in trips}
    pts = {}
    for r in T('shapes'):
        if r['shape_id'] in used: pts.setdefault(r['shape_id'], []).append((int(r['shape_pt_sequence']), float(r['shape_pt_lon']), float(r['shape_pt_lat']), float(r['shape_dist_traveled'] or 0)))
    for k, v in pts.items():
        if len(v) < 2: continue
        v.sort(); x, y = to_local([p[1] for p in v], [p[2] for p in v])
        l = shapely.LineString(list(zip(x, y)))
        if not l.intersects(AREA): continue                      # trasa mimo mapu
        SI[k] = len(shapes); SLEN[k] = (l.length, v[-1][3] or 1.0)
        shapes.append([[round(a, 1), round(b, 1)] for a, b in shapely.simplify(l, 1.0).coords])
    trips = [t for t in trips if t['shape_id'] in SI]
TI = {t['trip_id'] for t in trips}
st, PRUJ = {}, set(); PRUJEZD = PRUJ   # upstream značí průjezd v seznamu zastávek jménem None
# PRUJ: (spoj, pořadí) průjezdů bez nástupu i výstupu (provozní body na trati)
for r in T('stop_times'):
    if r['trip_id'] not in TI: continue
    if r.get('pickup_type') == '1' and r.get('drop_off_type') == '1': PRUJ.add((r['trip_id'], int(r['stop_sequence'])))
    ta = r.get('arrival_time') or r.get('departure_time')
    td = r.get('departure_time') or ta
    st.setdefault(r['trip_id'], []).append((int(r['stop_sequence']), sec(ta) if ta else None, sec(td) if td else None, float(r.get('shape_dist_traveled') or 0), r['stop_id']))
st = {trip_id: dopln_mezicasy(rows) for trip_id, rows in st.items()}
if 'shapes.txt' not in zf.namelist():                      # GTFS bez tvarů tras (např. IDS JMK): trasa mezi zastávkami po silnicích z mapy
    import road_route
    near = AREA.buffer(300)
    trips = [t for t in trips if any(near.contains(shapely.Point(SXY[z[4]])) for z in st.get(t['trip_id'], []) if z[4] in SXY)]
    R = road_route.Graph('data_all/segment.parquet')
    syn = {}
    for t in trips:
        s = [z for z in st[t['trip_id']] if z[4] in SXY]
        key = tuple(z[4] for z in s)
        if key not in syn:
            line, dists = R.path([SXY[z] for z in key])
            syn[key] = (f'syn{len(shapes)}', dists)
            SI[syn[key][0]] = len(shapes); SLEN[syn[key][0]] = (dists[-1] or 1.0, dists[-1] or 1.0)
            shapes.append([[round(a, 1), round(b, 1)] for a, b in shapely.simplify(shapely.LineString(line), 1.0).coords])
        t['shape_id'], dists = syn[key]
        st[t['trip_id']] = [(q, a_, d_, dist, z) for (q, a_, d_, _, z), dist in zip(s, dists)]
    print('trasy dopočítané po silnicích:', len(shapes), 'úseků bez silnice:', R.fails)
TI = {t['trip_id'] for t in trips}; SV = {t['service_id'] for t in trips}
st = {k: [(q, a_, d_, dist, SN.get(z, '') if (k, q) not in PRUJEZD else None) for q, a_, d_, dist, z in v] for k, v in st.items() if k in TI}
routes, RI = [], {}
for rid in dict.fromkeys(t['route_id'] for t in trips):
    RI[rid] = len(routes); routes.append([RT[rid]['route_short_name'], KIND(int(RT[rid]['route_type'] or 3))])
services = {}
for c in T('calendar'):
    if c['service_id'] not in SV: continue
    services[c['service_id']] = [[int(c[d]) for d in ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')],
                                 int(c['start_date']), int(c['end_date']), [], []]
for c in T('calendar_dates'):
    if c['service_id'] not in SV: continue
    s = services.setdefault(c['service_id'], [[0] * 7, 0, 0, [], []])
    s[3 if c['exception_type'] == '1' else 4].append(int(c['date']))
names, NI = [], {}
def nid(n):
    if n not in NI: NI[n] = len(names); names.append(n)
    return NI[n]
out, TID = [], {}
# vlaky z celostátního jízdního řádu (nastroje/vlaky_vyber.py a nastroje/vlaky.py), hodí se, když GTFS vlaky nemá; druh vozidla určuje volba "vlak"
if MESTO.get('vlak') and os.path.exists('build/vlaky/vlaky_mhd.json'):
    _v = json.load(open('build/vlaky/vlaky_mhd.json', encoding='utf-8'))
    _r, _s = len(routes), len(shapes)
    routes += _v['routes']; shapes += _v['shapes']; services.update(_v['services'])
    for t in _v['trips']:
        z_ = t[6]; out.append([t[0] + _r, t[1] + _s, t[2], t[3], t[4], nid(t[5]), [q for i in range(0, len(z_), 2) for q in (nid(z_[i]), z_[i + 1])]])
    print('vlaků z celostátního jízdního řádu', len(_v['trips']))
# vlak ve stanici po své koleji (assets/koleje.json z nastroje/koleje.py: kolej z celostátního jízdního řádu, očíslované koleje z OSM).
# GTFS má pro všechny vlaky jednu trasu přes stanici, takže by všechny stály na jedné koleji; pro každou kombinaci kolejí vznikne vlastní tvar.
KOL = json.load(open('assets/koleje.json', encoding='utf-8')) if os.path.exists('assets/koleje.json') else None
_KVAR, _kol_stat = {}, {'na koleji': 0, 'bez koleje v OSM': 0}
if KOL:
    from nastroje.koleje import po_koleji
    _KL = {}
    for _k in KOL['koleje']: _KL.setdefault(_k['ref'], []).append(shapely.LineString([tuple(float(v) for v in to_local(lo, la)) for la, lo in _k['line']]))
def tvar_trasy(t, s, k):
    """index tvaru trasy spoje t; vlak se známou kolejí jede ve stanicích po ní"""
    i = SI[t['shape_id']]
    if not KOL or routes[RI[t['route_id']]][1] != 2: return i
    zk = KOL['vlaky'].get(re.sub(r'\D', '', t.get('trip_short_name') or ''))
    if not zk: return i
    tvar = shapely.LineString(shapes[i])
    cile = []
    for (_, _, _, dist, nm) in s:
        ref = zk.get(nm)
        if not ref or ref not in _KL: continue
        pt = tvar.interpolate(min(dist * k, tvar.length))          # stanice na trase spoje
        kand = [l for l in _KL[ref] if l.distance(pt) < 400]
        if not kand: _kol_stat['bez koleje v OSM'] += 1; continue
        slouceno = shapely.line_merge(shapely.MultiLineString(kand)) if len(kand) > 1 else kand[0]
        casti = list(getattr(slouceno, 'geoms', [slouceno]))
        nej = min(casti, key=lambda l: l.distance(pt))
        if nej.distance(pt) > 60: _kol_stat['bez koleje v OSM'] += 1; continue
        cile.append((nm, ref, nej))
    if not cile: return i
    klic = (i, tuple((nm, ref) for nm, ref, _ in cile))
    if klic not in _KVAR:
        body = [tuple(q) for q in shapes[i]]
        for _, _, kol in cile: body = po_koleji(body, list(kol.coords))
        _KVAR[klic] = len(shapes)
        shapes.append([[round(a, 1), round(b, 1)] for a, b in shapely.simplify(shapely.LineString(body), 0.4).coords])
    _kol_stat['na koleji'] += 1
    return _KVAR[klic]
for t in trips:
    if routes[RI[t['route_id']]][1] != 2 and len(routes[RI[t['route_id']]][0]) > 4: continue   # poptávková doprava apod. bez pravidelné trasy; vlaky mají dlouhá čísla
    s = st.get(t['trip_id'], [])
    if len(s) < 2 or t['shape_id'] not in SI: continue
    L, gl = SLEN[t['shape_id']]; k = L / gl                     # vzdálenost z jízdního řádu -> délka trasy v mapě
    t0 = s[0][1]; seq = []; zs = []
    for j, (sq, a, d, dist, nm) in enumerate(s):
        pruj = (t['trip_id'], sq) in PRUJ                       # průjezd: nestát, nevypisovat jako zastávku
        if 0 < j < len(s) - 1 and d == a and not pruj:       # jízdní řád je po minutách: v zastávce stát ~20 s kolem času odjezdu
            gap = min(a - s[j - 1][2], s[j + 1][1] - d)
            w = min(10, gap // 4)
            a, d = a - w, d + w
        seq += [a - t0, round(dist * k)]
        if d > a: seq += [d - t0, round(dist * k)]              # pobyt v zastávce
        if not pruj: zs += [nid(nm), a - t0]
    out.append([RI[t['route_id']], tvar_trasy(t, s, k), t['service_id'], t0, seq, nid(t['trip_headsign'] or s[-1][4] or ''), zs])
    TID[id(out[-1])] = t['trip_id']                            # spárování s polohami vozidel v reálném čase (GTFS-RT)
# čekání na konečné (q[7] = s do odjezdu, kdy vůz už stojí na první zastávce): GTFS čekání nezná, spoj začíná až odjezdem
print('spojů s čekáním na konečné', cekani_na_konecne(out, lambda q: routes[q[0]][1]))
# vlak bez spárovaného příjezdu (přijel jako jiná linka nebo služba) stojí v počáteční stanici přistavený 15 min před odjezdem
_vl = [q for q in out if routes[q[0]][1] == 2 and not q[7]]
for q in _vl: q[7] = 900
print('vlaků přistavených předem bez příjezdu', len(_vl))
if KOL: print('vlaky po svých kolejích:', _kol_stat, 'variant tras', len(_KVAR))
out.sort(key=lambda q: q[3])
# zastávky na mapě (prohlížeč z nich po kliknutí ukáže odjezdy, hledání je najde): [jméno, x, y, druh 0 tramvaj / 3 autobus / 2 jen vlak]
# i železniční stanice (když jsou v mapě vlaky): odjezdy vlaků, popisky zastávek sledovaného vlaku
_obsl = {}
for q in out:
    for i in range(0, len(q[6]), 2): _obsl.setdefault(q[6][i], set()).add(routes[q[0]][1])
stops = []
for sid, (x, y) in SXY.items():
    n_ = NI.get(SN.get(sid))
    if n_ is None or n_ not in _obsl or not AREA.contains(shapely.Point(x, y)): continue
    if any(q[0] == n_ and abs(q[1] - x) < 6 and abs(q[2] - y) < 6 for q in stops): continue   # stejné místo vícekrát (nástupiště, stanice)
    stops.append([n_, round(x, 1), round(y, 1), 0 if 0 in _obsl[n_] else 3 if 3 in _obsl[n_] else 2])
print('zastávek na mapě', len(stops))
# odstav na konečné: kolej za zastávkou končí slepě (do 160 m), tramvaj čeká vzadu na konci koleje, ne na nástupišti
# {tvar: [[[x, y], …] od zastávky po konec koleje, …]}, nejvýš dvě koleje, ať se vozy můžou vystřídat
import heapq as _hq, math as _m
_gk = lambda p: (round(p[0] / 2) * 2, round(p[1] / 2) * 2)
_g = {}
for _c in CHUNKS:
    _f = 'build/info_src.json' if tuple(_c) == (0, 0) else f'build/c{_c[0]}_{_c[1]}/info_src.json'
    if not os.path.exists(_f): continue
    _cx, _cy = chunk_center(_c)
    for _t in json.load(open(_f, encoding='utf-8')).get('trams') or []:
        _p = [(_q[0] + _cx, _q[1] + _cy) for _q in _t]
        for _a, _b in zip(_p, _p[1:]):
            _d = _m.dist(_a, _b)
            if _d: _g.setdefault(_gk(_a), {})[_gk(_b)] = _d; _g.setdefault(_gk(_b), {})[_gk(_a)] = _d
odstav = {}
for _sh in sorted({q[1] for q in out if routes[q[0]][1] == 0 and len(q) > 7 and q[7]}) if _g else []:
    _s0, _s1 = shapes[_sh][0], shapes[_sh][1]
    _st = min(_g, key=lambda k: (k[0] - _s0[0]) ** 2 + (k[1] - _s0[1]) ** 2)
    if _m.dist(_st, _s0) > 6: continue
    _dist, _prev, _h = {_st: 0.0}, {}, [(0.0, _st)]
    while _h:
        _d, _u = _hq.heappop(_h)
        if _d > _dist[_u] or _d > 160: continue
        for _v, _w in _g[_u].items():
            if _d + _w < _dist.get(_v, 1e18): _dist[_v] = _d + _w; _prev[_v] = _u; _hq.heappush(_h, (_d + _w, _v))
    _vyber = []
    for _e in sorted((k for k in _dist if len(_g[k]) == 1 and 20 <= _dist[k] <= 160), key=lambda k: -_dist[k]):
        if any(_m.dist(_e, _o[-1]) < 6 for _o in _vyber): continue
        _pts = [_e]
        while _pts[-1] != _st: _pts.append(_prev[_pts[-1]])
        _pts.reverse()
        _n = _pts[min(3, len(_pts) - 1)]
        if (_n[0] - _pts[0][0]) * (_s1[0] - _s0[0]) + (_n[1] - _pts[0][1]) * (_s1[1] - _s0[1]) < 0: _vyber.append(_pts)   # jen kolej za zastávkou, ne dopředu po trase
        if len(_vyber) == 2: break
    if _vyber: odstav[str(_sh)] = [[[round(float(_a), 1), round(float(_b), 1)] for _a, _b in _o] for _o in _vyber]
print('tvarů s odstavem na konečné', len(odstav))
json.dump({'routes': routes, 'shapes': shapes, 'services': services, 'trips': out, 'tid': [TID.get(id(q), '') for q in out], 'names': names, 'odstav': odstav, 'stops': stops,
           'feed': next(iter(T('feed_info')), {}).get('feed_version', '') if 'feed_info.txt' in zf.namelist() else time.strftime('%Y-%m-%d', time.localtime(os.path.getmtime(Z)))}, open('site/mhd.json', 'w', encoding='utf-8'), separators=(',', ':'), ensure_ascii=False)
print('linek', len(routes), 'tras', len(shapes), 'spojů', len(out), 'kB', os.path.getsize('site/mhd.json') // 1000)
