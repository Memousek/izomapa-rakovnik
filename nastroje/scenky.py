# Místa pro drobné scénky života na mapě (web/mapa_scenky.js): rybáři u rybníků, otužilci a bruslaři, koupání,
# draci a pikniky na loukách a v parcích, houbaři na kraji lesa, pálení čarodějnic, svíčky na hřbitově o Dušičkách.
# Bere jen data z Overture (data_all/*.parquet) a vybírá místa uvnitř mapy. Výstup: assets/scenky.json (lat, lon).
# Ruční úpravy: assets/upresneni.json "scenky": {"druh": [[lat, lon], ...]} nahradí automatický seznam daného druhu.
# Spouštět z kořene repa: .venv/bin/python nastroje/scenky.py
import json, math, os, sys, warnings
warnings.filterwarnings('ignore', category=DeprecationWarning)
import pyarrow.parquet as pq
import shapely, shapely.ops
from shapely.geometry import Point, Polygon
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import geo

DATA = 'data_all' if os.path.exists('data_all/water.parquet') else 'data'


def nacti(jm):
    t = pq.read_table(f'{DATA}/{jm}.parquet').to_pandas().sort_values('id', kind='stable')
    for _, r in t.iterrows():
        g = shapely.from_wkb(r['geometry'])
        g = shapely.ops.transform(lambda x, y, z=None: geo.to_local(x, y), g)
        nm = r['names']['primary'] if r.get('names') is not None and r['names'] is not None else None
        yield r, g, nm


def v_mape(x, y, okraj=60):
    c = geo.chunk_of(x, y)
    if c not in geo.CHUNKS: return False
    cx, cy = geo.chunk_center(c)
    return abs(x - cx) < geo.HALF - (okraj if (c[0] + (1 if x > cx else -1), c[1]) not in geo.CHUNKS or (c[0], c[1] + (1 if y > cy else -1)) not in geo.CHUNKS else 0) and abs(y - cy) < geo.HALF


def ll(x, y):
    lon, lat = geo.to_lonlat(x, y)
    return [round(float(lat), 6), round(float(lon), 6)]


def polys(g):
    if isinstance(g, Polygon): return [g]
    return [p for q in getattr(g, 'geoms', []) for p in polys(q)]


def breh(p, k, ven=1.5):
    """k bodů na břehu (mimo vodu o `ven` metrů), rovnoměrně po obvodu"""
    b = p.exterior; out = []
    for i in range(k):
        q = b.interpolate((i + 0.5) / k, normalized=True); c = p.centroid
        dx, dy = q.x - c.x, q.y - c.y; d = math.hypot(dx, dy) or 1
        out.append((q.x + dx / d * ven, q.y + dy / d * ven))
    return out


def uvnitr(p, k, seed):
    """k bodů uvnitř plochy (aspoň 6 m od kraje), deterministicky"""
    vn = p.buffer(-6)
    if vn.is_empty: return []
    x0, y0, x1, y1 = vn.bounds; out = []; s = seed
    for _ in range(k * 40):
        s = (s * 1103515245 + 12345) & 0x7fffffff; a = s / 0x7fffffff
        s = (s * 1103515245 + 12345) & 0x7fffffff; b = s / 0x7fffffff
        x, y = x0 + a * (x1 - x0), y0 + b * (y1 - y0)
        if vn.contains(Point(x, y)): out.append((x, y))
        if len(out) >= k: break
    return out


S = {k: [] for k in ('rybar', 'otuzilci', 'brusleni', 'koupani', 'louka', 'park', 'houbar', 'carodejnice', 'hrbitov')}
for r, g, nm in nacti('water'):
    for p in polys(g):
        c = p.centroid
        if not v_mape(c.x, c.y): continue
        A = p.area
        if r['class'] in ('pond', 'reservoir', 'water', 'lake') and A > 2500:
            for x, y in breh(p, 2 if A < 15000 else 3): S['rybar'].append(ll(x, y) + [nm or '', round(math.atan2(c.y - y, c.x - x), 3)])   # úhel k vodě
            if A > 12000 and not (nm and 'koupal' in nm.lower()): S['brusleni'].append(ll(c.x, c.y) + [round(min(40, math.sqrt(A) * 0.3), 1), nm or ''])
        if nm and 'koupališt' in nm.lower(): S['koupani'].append(ll(c.x, c.y) + [round(min(30, math.sqrt(A) * 0.3), 1), nm])
# otužilci: největší pojmenovaný rybník blízko středu (do 3 km)
kand = [q for q in S['brusleni'] if q[-1] and not any(w in q[-1].lower() for w in ('hráz', 'koupal'))]
if kand:
    blizko = sorted(kand, key=lambda q: math.hypot(*geo.to_local(q[1], q[0])))[0]
    S['otuzilci'].append(blizko[:2] + [blizko[-1]])
for r, g, nm in nacti('land_use'):
    for p in polys(g):
        c = p.centroid
        if not v_mape(c.x, c.y): continue
        cl = r['class']
        if cl in ('park', 'recreation_ground', 'village_green') and p.area > 2500:
            for x, y in uvnitr(p, 1, int(abs(c.x * 7 + c.y))): S['park'].append(ll(x, y) + [nm or ''])
        if cl in ('meadow', 'grass') and p.area > 12000:
            for x, y in uvnitr(p, 1, int(abs(c.x * 3 + c.y * 5))): S['louka'].append(ll(x, y))
        if cl == 'cemetery' and p.area > 3000:
            S['hrbitov'].append(ll(c.x, c.y) + [round(math.sqrt(p.area) * 0.35, 1), nm or ''])
for r, g, nm in nacti('land_cover'):
    if r['subtype'] != 'forest': continue
    for p in polys(g):
        if p.area < 40000: continue
        b = p.exterior; n = int(min(6, b.length / 400))
        for i in range(n):
            q = b.interpolate((i + 0.3) / max(n, 1), normalized=True)
            # kousek dovnitř lesa
            c = p.centroid; dx, dy = c.x - q.x, c.y - q.y; d = math.hypot(dx, dy) or 1
            x, y = q.x + dx / d * 8, q.y + dy / d * 8
            if v_mape(x, y) and p.contains(Point(x, y)): S['houbar'].append(ll(x, y))
# čarodějnice: největší louka blízko středu města
if S['louka']:
    S['carodejnice'] = sorted(S['louka'], key=lambda q: math.hypot(*geo.to_local(q[1], q[0])))[:1]
# omezení počtu (výkon a hustota scének)
S['louka'] = S['louka'][:40]; S['houbar'] = S['houbar'][:60]; S['rybar'] = S['rybar'][:60]
up = json.load(open('assets/upresneni.json', encoding='utf-8')).get('scenky', {}) if os.path.exists('assets/upresneni.json') else {}
for k, v in up.items(): S[k] = v
json.dump(S, open('assets/scenky.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print({k: len(v) for k, v in S.items()})
