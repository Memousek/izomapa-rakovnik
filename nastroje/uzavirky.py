"""Uzavírky silnic automaticky z webu města.

Stáhne seznam oznámení (mesto.json "uzavirky_web": {"url": "...", "zdroj": "Město X"}), z textu každého oznámení
vybere platnou (a příští) etapu a úsek dopočítá po silniční síti Overture: hlavní ulice z textu nebo z nadpisu,
konce „od … po …“ jako křižovatka s jinou ulicí nebo silnicí (II/229), adresní bod (č. p. 2380) nebo místo z Overture
(STOP SHOP). Bez konců se uzavře celá ulice v mapě.

Výstup:
  assets/uzavirky_auto.json   stažené uzavírky (když web nejde stáhnout, zůstane poslední)
  site/uzavirky.json          ruční (assets/upresneni.json "uzavirky") + automatické, pro prohlížeč mapy
  site/jizda/uzavirky.json    totéž pro 3D jízdu (jen úplné uzavírky)
Ruční uzavírka se stejným "url" automatickou nahradí, "uzavirky_skryt": [url, …] v upresneni.json ji schová.
Render ani overlay.py není potřeba, prohlížeč si soubor načte sám. Nasazení dál jen na pokyn.

Použití: .venv/Scripts/python nastroje/uzavirky.py [--bez-stahovani] [--vypis]
Parser je naladěný na web mesto-rakovnik.cz (CMS GCM, obsah v div.editor_content); jiný web může potřebovat úpravu.
"""
import heapq, html, json, math, os, re, sys, time, unicodedata, urllib.parse, urllib.request
sys.path.insert(0, '.')
import geo

UA = 'izomapa-uzavirky/1.0 (+https://github.com/adamklatovsky/izomapa)'
AUTO = 'assets/uzavirky_auto.json'
DNES = time.strftime('%Y-%m-%d')
HLAVICKY = r'(Termín uzavírky|Rozsah uzavírky|Důvod uzavírky|Objízdná trasa|Objížďka|[Aa] nařizuje|Po celou dobu|DIO\b|Vyznačení|Zbývající jízdní pruh)'


# ---------------------------------------------------------------- sloučení a zápis (používá i overlay.py a jizda.py)
def sloucit():
    """platné a chystané uzavírky: ruční z upresneni.json mají přednost před automatickými se stejným url"""
    up = json.load(open('assets/upresneni.json', encoding='utf-8')) if os.path.exists('assets/upresneni.json') else {}
    rucni = [u for u in up.get('uzavirky') or [] if isinstance(u, dict) and len(u.get('line') or []) > 1]
    skryt = set(up.get('uzavirky_skryt') or []) | {u['url'] for u in rucni if u.get('url')}
    auto = json.load(open(AUTO, encoding='utf-8')).get('uzavirky', []) if os.path.exists(AUTO) else []
    vse = rucni + [u for u in auto if u.get('url') not in skryt]
    return [u for u in vse if not u.get('do') or str(u['do']) >= DNES]


def zapsat():
    uz = sloucit()
    pole = ('line', 'od', 'do', 'nazev', 'popis', 'objizdka', 'zdroj', 'url', 'castecna', 'auto', 'puvod')
    data = [{k: u[k] for k in pole if u.get(k)} for u in uz]
    os.makedirs('site/jizda', exist_ok=True)
    json.dump(data, open('site/uzavirky.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    json.dump([u for u in data if not u.get('castecna')], open('site/jizda/uzavirky.json', 'w', encoding='utf-8'), ensure_ascii=False)
    return data


# ---------------------------------------------------------------- stažení
def stahni(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    b = urllib.request.urlopen(req, timeout=30).read()
    m = re.search(rb'charset=["\']?([\w-]+)', b[:3000])
    return b.decode(m.group(1).decode() if m else 'utf-8', 'replace')


def text_html(s):
    t = re.sub(r'<br\s*/?>|</p>|</li>|</h\d>|</div>', '\n', s)
    t = re.sub(r'<[^>]+>', '', t)
    t = html.unescape(t).replace('\xa0', ' ')
    t = re.sub(r'[ \t]+', ' ', t)
    return '\n'.join(l.strip() for l in t.split('\n') if l.strip())


def oznameni(url_seznamu):
    s = stahni(url_seznamu)
    cesta = urllib.parse.urlparse(url_seznamu).path.rstrip('/') + '/'
    odkazy = []
    for h in re.findall(r'href="([^"#?]+)"', s):
        u = urllib.parse.urljoin(url_seznamu, h)
        p = urllib.parse.urlparse(u).path
        if p.startswith(cesta) and p != cesta and u not in odkazy: odkazy.append(u)
    for u in odkazy:
        time.sleep(3)                                              # robots.txt: Crawl-Delay 3
        d = stahni(u)
        h1 = re.search(r'<h1[^>]*>(.*?)</h1>', d, re.S)
        tel = re.search(r'<div class="editor_content[^"]*">(.*?)<div class="cleaner"', d, re.S) or re.search(r'<main[^>]*>(.*?)</main>', d, re.S)
        if not h1 or not tel: print('  nečitelné:', u); continue
        yield u, ' '.join(text_html(h1.group(1)).split()), text_html(tel.group(1))


# ---------------------------------------------------------------- text oznámení
def bez_diakritiky(s):
    return ''.join(c for c in unicodedata.normalize('NFD', s) if not unicodedata.combining(c)).lower()


def sekce(radky):
    """{hlavička: [řádky]}: obsah za dvojtečkou a následující řádky až do další hlavičky"""
    out, cur = {'': []}, ''
    for l in radky:
        m = re.match(HLAVICKY + r'[^:]{0,40}:?\s*(.*)', l)
        if m:
            cur = m.group(1).split()[0].lower(); out.setdefault(cur, [])
            if m.group(2).strip(): out[cur].append(m.group(2).strip())
        else: out[cur].append(l)
    return out


DATUM = r'(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})?'
def rozsahy(txt):
    r = []
    for m in re.finditer(DATUM + r'\s*[–—-]\s*' + DATUM, txt):
        a, b, c, d, e, f = m.groups()
        if not f: continue
        r.append((f'{c or f}-{int(b):02d}-{int(a):02d}', f'{f}-{int(e):02d}-{int(d):02d}', m.start()))
    if not r:
        m = re.search(r'\bod\b\D{0,30}?' + DATUM + r'\D{0,40}?\bdo\b\D{0,30}?' + DATUM, txt)
        if m and m.group(6):
            a, b, c, d, e, f = m.groups(); r.append((f'{c or f}-{int(b):02d}-{int(a):02d}', f'{f}-{int(e):02d}-{int(d):02d}', m.start()))
    return [(od, do) for od, do, _ in r]


ETAPA = re.compile(r'^(?:([0-9]+|[IVX]+)\.\s*)?(etapa|fáze)\b\s*[-–:]?\s*(.*)$', re.I)
def etapy(rozsah):
    """řádky rozsahu rozdělené na etapy: [(název, [úseky])]"""
    out = []
    for l in rozsah:
        m = ETAPA.match(l)
        if m:
            out.append([f'{m.group(1) or len(out) + 1}. {m.group(2).lower()}', []])
            if m.group(3).strip(): out[-1][1].append(m.group(3).strip())
        else:
            if not out: out.append(['', []])
            out[-1][1].append(l)
    return [(n, u) for n, u in out if u]


# ---------------------------------------------------------------- silniční síť
class Sit:
    def __init__(self):
        import pandas as pd
        from shapely import wkb
        src = 'data_all' if os.path.exists('data_all/segment.parquet') else 'data'
        df = pd.read_parquet(f'{src}/segment.parquet', columns=['subtype', 'class', 'names', 'routes', 'geometry'])
        df = df[(df.subtype == 'road') & ~df['class'].isin(['footway', 'steps', 'path', 'cycleway', 'pedestrian', 'track', 'bridleway'])]
        x0, y0, x1, y1 = geo.extent(400)
        self.adj, self.xy, self.ulice = {}, {}, {}
        for _, r in df.iterrows():
            g = wkb.loads(r['geometry']); c = list(g.coords)
            xs, ys = geo.to_local([p[0] for p in c], [p[1] for p in c])
            if max(xs) < x0 or min(xs) > x1 or max(ys) < y0 or min(ys) > y1: continue
            nm = r['names'].get('primary') if isinstance(r['names'], dict) else None
            refs = {q.get('ref') for q in (r['routes'] if r['routes'] is not None else []) if q.get('ref')}
            ids = []
            for (lo, la), x, y in zip(c, xs, ys):
                k = (round(lo, 6), round(la, 6)); self.xy[k] = (float(x), float(y)); ids.append(k)
            for a, b in zip(ids, ids[1:]):
                if a == b: continue
                L = math.dist(self.xy[a], self.xy[b]); e = (nm, frozenset(refs), L)
                self.adj.setdefault(a, []).append((b, e)); self.adj.setdefault(b, []).append((a, e))
            if nm: self.ulice.setdefault(nm, set()).update(ids)
        self.ref = {}
        for a, es in self.adj.items():
            for b, (nm, refs, L) in es:
                for f in refs: self.ref.setdefault(f, set()).update((a, b))
        self.vzory = {nm: self._vzor(nm) for nm in self.ulice}
        # kruhové objezdy (stejné pravidlo jako prep.py): kompaktní prstenec do 250 m obvodu -> uzel: číslo prstence
        import shapely.ops
        from shapely.geometry import LineString
        hrany = {tuple(sorted((a, b))) for a, es in self.adj.items() for b, _ in es}
        self.kruh = {}
        for i, pg in enumerate(shapely.ops.polygonize([LineString([self.xy[a], self.xy[b]]) for a, b in hrany])):
            if pg.length < 250 and 4 * math.pi * pg.area / pg.length ** 2 > 0.85 and len(pg.exterior.coords) >= 8:
                body = {(round(x, 3), round(y, 3)) for x, y in pg.exterior.coords}
                for k, (x, y) in self.xy.items():
                    if (round(x, 3), round(y, 3)) in body: self.kruh[k] = i

    @staticmethod
    def _vzor(nm):
        """název ulice v textu i ve skloňovaném tvaru (Vackova / Vackovy), bez diakritiky"""
        slova = bez_diakritiky(nm).replace('.', ' ').split()
        return re.compile(r'\b' + r'\s+'.join(re.escape(w[:-2]) + r'\w{0,4}' if len(w) >= 6 else re.escape(w) + r'\b' for w in slova))

    def uzly(self, nm=None, ref=None):
        return self.ulice.get(nm, set()) if nm else self.ref.get(ref, set())

    def cesta(self, A, B, hlavni):
        """nejkratší cesta z množiny uzlů A do B; mimo hlavní ulici 4× dražší"""
        dist, prev, q = {}, {}, []
        for a in A: dist[a] = 0; heapq.heappush(q, (0, a))
        while q:
            d, u = heapq.heappop(q)
            if d > dist.get(u, 1e18): continue
            if u in B:
                out = [u]
                while out[-1] in prev: out.append(prev[out[-1]])
                return out[::-1]
            for v, (nm, refs, L) in self.adj.get(u, []):
                nd = d + L * (1 if hlavni(nm, refs) else 4)
                if nd < dist.get(v, 1e18): dist[v] = nd; prev[v] = u; heapq.heappush(q, (nd, v))
        return None

    def nejblizsi(self, uzly, x, y, maxd):
        best = min(uzly, key=lambda k: math.dist(self.xy[k], (x, y)), default=None)
        return best if best and math.dist(self.xy[best], (x, y)) <= maxd else None


def zminky(sit, txt):
    """ulice v textu: [(pozice, konec, název, s 'ul.' před)]; delší název má přednost"""
    t = bez_diakritiky(txt); out = []
    for nm, vz in sit.vzory.items():
        for m in vz.finditer(t):
            pred = t[max(0, m.start() - 8):m.start()]
            out.append((m.start(), m.end(), nm, bool(re.search(r'\bul(\.|ic[ei])\s*$|\bul\.\s*\w*\s*$', pred))))
    out.sort(key=lambda z: (z[0], -(z[1] - z[0])))
    res, konec = [], -1
    for z in out:
        if z[0] >= konec: res.append(z); konec = z[1]
    for i in range(1, len(res)):                                    # „s ul. Budovcova a Na Studánkách“: druhý název taky jako ulice
        if not res[i][3] and res[i - 1][3] and re.fullmatch(r'\s*(a|,)\s*', t[res[i - 1][1]:res[i][0]]): res[i] = res[i][:3] + (True,)
    return res


def kotva(sit, fraze, hlavni_nm, hlavni_uzly, adresy, mista):
    """jeden konec úseku jako množina uzlů hlavní ulice, nebo None"""
    m = re.search(r'č\.?\s*p\.?\s*(\d+)', fraze)
    if m:
        kand = [a for a in adresy if a[0] == m.group(1)]
        kand.sort(key=lambda a: a[1] != hlavni_nm)
        for _, _, x, y in kand:
            k = sit.nejblizsi(hlavni_uzly, x, y, 90)
            if k: return {k}
    for p, e, nm, ul in zminky(sit, fraze):
        if ul and nm != hlavni_nm:
            s = hlavni_uzly & sit.uzly(nm)
            if s: return s
    m = re.search(r'\b(I{1,3})/(\d+)', fraze)
    if m:
        s = hlavni_uzly & sit.uzly(ref=m.group(2))
        if s: return s
    f = bez_diakritiky(fraze)
    for nm, x, y in mista:
        if nm and len(nm) >= 5 and nm in f:
            k = sit.nejblizsi(hlavni_uzly, x, y, 200)
            if k: return {k}
    return None


def konce(sit, p):
    """cesta -> [[lat, lon]]: kusy po prstenci kruhového objezdu na koncích pryč (zábrana patří na odbočku ulice,
    ne napříč okruhem) a krajní bod o 5 m dovnitř uzavřené ulice"""
    k = sit.kruh
    while len(p) > 2 and p[0] in k and k[p[0]] == k.get(p[1]): p = p[1:]
    while len(p) > 2 and p[-1] in k and k[p[-1]] == k.get(p[-2]): p = p[:-1]
    xy = [list(sit.xy[q]) for q in p]
    for i, j in ((0, 1), (-1, -2)):
        if p[i] not in k and len(sit.adj.get(p[i], [])) < 3: continue       # konec mimo křižovatku nechat
        dx, dy = xy[j][0] - xy[i][0], xy[j][1] - xy[i][1]; d = math.hypot(dx, dy)
        if d > 4: t = min(5, d * 0.4) / d; xy[i] = [xy[i][0] + dx * t, xy[i][1] + dy * t]
    lo, la = geo.to_lonlat([q[0] for q in xy], [q[1] for q in xy])
    return [[round(float(a), 6), round(float(b), 6)] for a, b in zip(la, lo)]


def usek(sit, radek, nadpis_ulice, adresy, mista):
    """jeden řádek rozsahu -> (ulice, [[lat, lon], …] nebo celé ulice [[…], …], odhad)"""
    zm = [z for z in zminky(sit, radek) if z[3]]
    hl = zm[0][2] if zm else nadpis_ulice
    if not hl:
        m = re.search(r'\b(I{1,3})/(\d+)', radek)
        if not m or not sit.uzly(ref=m.group(2)): return None
        hl_ref = m.group(2); hl_uzly = sit.uzly(ref=hl_ref); hlavni = lambda nm, refs: hl_ref in refs; jmeno = f'{m.group(1)}/{hl_ref}'
    else:
        hl_uzly = sit.uzly(hl); hlavni = lambda nm, refs: nm == hl; jmeno = hl
    zbytek = radek[zm[0][1]:] if zm and zm[0][2] == hl else radek
    m = (re.search(r'\bod\b(.*?)\b(až\s+po|až\s+ke?|po)\b(.*)', zbytek, re.S)          # „po“ má přednost před „k“ (od vjezdu k domu č. p. … po …)
         or re.search(r'\bod\b(.*?)\b(směrem\s+ke?|ke?)\b(.*)', zbytek, re.S))
    if m:
        A = kotva(sit, m.group(1), hl, hl_uzly, adresy, mista)
        B = kotva(sit, re.split(r'[,(;]', m.group(3))[0], hl, hl_uzly, adresy, mista)
        if A and B and A & B: return None                       # oba konce v jedné křižovatce: text je moc obecný, radši nic
        if A and B:
            p = sit.cesta(A, B, hlavni)
            if p and len(p) > 1:
                return jmeno, [konce(sit, p)], False
    # bez konců (nebo nenalezené): celá ulice v mapě
    hrany = set()
    for a in hl_uzly:
        for b, (nm, refs, L) in sit.adj.get(a, []):
            if hlavni(nm, refs): hrany.add(tuple(sorted((a, b))))
    if not hrany: return None
    from shapely.geometry import MultiLineString
    from shapely.ops import linemerge
    g = linemerge(MultiLineString([list(e) for e in hrany]))
    car = list(g.geoms) if hasattr(g, 'geoms') else [g]
    return jmeno, [[[round(la, 6), round(lo, 6)] for lo, la in c.coords] for c in car], not (m is None)


def v_mape(line):
    xs, ys = geo.to_local([p[1] for p in line], [p[0] for p in line])
    uvnitr = sum(geo.chunk_of(float(x), float(y)) in geo.CHUNKS for x, y in zip(xs, ys))
    return uvnitr >= 0.5 * len(line)


def zpracuj(sit, url, nadpis, text, obce, zdroj, adresy, mista):
    nf = bez_diakritiky(nadpis + ' ' + text.split('\n')[0])          # obec v nadpisu nebo v prvním řádku („ve městě Rakovník“)
    if not any(re.search(r'\b' + re.escape(bez_diakritiky(o)) + r'\b', nf) for o in obce): return [], 'mimo mapu'
    radky = text.split('\n'); S = sekce(radky)
    termin = ' '.join(S.get('termín', [])) or text
    R = rozsahy(termin)
    if not R: return [], 'bez termínu'
    E = etapy(S.get('rozsah', [])) or [('', [radky[0]])]
    if len(E) == len(R): par = list(zip(E, R))
    elif len(R) == 1 or len(E) == 1: par = [(e, R[0] if len(R) == 1 else (min(r[0] for r in R), max(r[1] for r in R))) for e in E]
    else: par = list(zip(E, R))
    ted = [p for p in par if p[1][0] <= DNES <= p[1][1]]
    pristi = sorted([p for p in par if p[1][0] > DNES], key=lambda p: p[1][0])[:1]
    vyber = ted + pristi
    if not vyber: return [], 'prošlá'
    castecna = bool(re.match(r'\s*částečn', text, re.I))
    zm_nadpis = [z for z in zminky(sit, nadpis) if z[3]]
    nadpis_ulice = zm_nadpis[0][2] if zm_nadpis else None
    duvod = ' '.join(S.get('důvod', []))[:200]
    obj = ' '.join(S.get('objízdná', []) or S.get('objížďka', []) or S.get('a', []))
    obj = re.split(r'(?<=\w{4}\.)\s(?=[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ])', obj)[0][:220] if obj else None      # první věta (ne za zkratkou „ul.“, „č.“)
    out, pozn = [], []
    for (et, useky), (od, do) in vyber:
        for radek in useky:
            for cast in re.split(r';\s*', radek):
                r = usek(sit, cast, nadpis_ulice, adresy, mista)
                if not r: pozn.append(f'nenalezeno: {cast[:70]}'); continue
                jmeno, cary, odhad = r
                for line in cary:
                    if len(line) < 2 or not v_mape(line): continue
                    popis = ('Částečná' if castecna else 'Úplná') + ' uzavírka' + (f', {et}' if et else '') + ': ' + cast.rstrip('.') + (f'. Důvod: {duvod}' if duvod else '')
                    out.append({'nazev': jmeno, 'line': line, 'od': od, 'do': do, 'popis': popis, 'objizdka': obj, 'zdroj': zdroj, 'url': url,
                                'auto': 'odhad' if odhad else 1, **({'castecna': True} if castecna else {})})
    return out, '; '.join(pozn) or 'ok'


# ---------------------------------------------------------------- úseky jako GeoJSON (mapa KSÚS Středočeského kraje)
# mesto.json "uzavirky_geojson": [{"url": "…/useky.json", "zdroj": "KSÚS …", "odkaz": "stránka s mapou"}]; vlastnosti
# úseku name, dateStart, dateEnd (RRRR-MM-DD), description. Bez konce platnosti (stavba v přípravě) se nebere, úsek, který
# už je mezi uzavírkami z webu města, taky ne. Stejné pravidlo je v web/uzavirky.js (zGeojson).
ISO = re.compile(r'^\d{4}-\d{2}-\d{2}$')


def prekryva(line, jine, tol=15):
    """leží čára (lat, lon) aspoň z 60 % do tol metrů od některé z jiných čar?"""
    if not jine: return False
    def loc(l):
        xs, ys = geo.to_local([q[1] for q in l], [q[0] for q in l])
        return [(float(x), float(y)) for x, y in zip(xs, ys)]
    S = [(a, b) for j in jine for P in [loc(j)] for a, b in zip(P, P[1:])]
    P = loc(line); body = []
    for a, b in zip(P, P[1:]):
        n = max(1, int(math.dist(a, b) / 10))
        body += [(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n) for k in range(n)]
    body.append(P[-1])
    def d(p, a, b):
        ex, ey = b[0] - a[0], b[1] - a[1]; l2 = ex * ex + ey * ey or 1
        t = max(0, min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / l2))
        return math.hypot(a[0] + ex * t - p[0], a[1] + ey * t - p[1])
    blizko = sum(1 for p in body if any(d(p, a, b) < tol for a, b in S))
    return blizko >= 0.6 * len(body)


def z_geojson(d, i, cfg, jine, dnes=None):
    dnes = dnes or DNES; out = []
    for f in (d or {}).get('features', []):
        p = f.get('properties') or {}; g = f.get('geometry') or {}
        od, do = p.get('dateStart'), p.get('dateEnd')
        if not isinstance(do, str) or not ISO.match(do) or do < dnes: continue
        cary = [g.get('coordinates') or []] if g.get('type') == 'LineString' else (g.get('coordinates') or []) if g.get('type') == 'MultiLineString' else []
        for c in cary:
            line = [[round(float(q[1]), 6), round(float(q[0]), 6)] for q in c[:2000]]
            if len(line) < 2 or not v_mape(line) or prekryva(line, jine): continue
            text = (p.get('name') or '') + ' ' + (p.get('description') or '')
            out.append({'nazev': (p.get('name') or 'Uzavírka').strip()[:120], 'line': line, 'od': od if isinstance(od, str) and ISO.match(od) else None, 'do': do,
                        'popis': (p.get('description') or '').strip()[:500], 'zdroj': cfg.get('zdroj') or urllib.parse.urlparse(cfg['url']).netloc,
                        'url': cfg.get('odkaz') or cfg['url'], 'auto': 1, 'puvod': 'geo%d' % i, **({'castecna': True} if re.search('částečn', text, re.I) else {})})
    return out


def export_sit(sit, adresy, mista, obce, cfg):
    """síť ulic, adresy a místa pro prohlížeč (web/uzavirky.js počítá úseky stejně jako tenhle skript)
    a adresa webu města pro functions/api/uzavirky.js"""
    klice = list(sit.adj); idx = {k: i for i, k in enumerate(klice)}
    ulice = sorted(sit.ulice); ui = {nm: i for i, nm in enumerate(ulice)}
    refy = sorted({f for es in sit.adj.values() for _, (nm, refs, L) in es for f in refs}); ri = {f: i for i, f in enumerate(refy)}
    hrany = []
    for a, es in sit.adj.items():
        for b, (nm, refs, L) in es:
            if idx[a] < idx[b]: hrany += [idx[a], idx[b], ui.get(nm, -1), '|'.join(str(ri[f]) for f in sorted(refs))]
    up = json.load(open('assets/upresneni.json', encoding='utf-8')) if os.path.exists('assets/upresneni.json') else {}
    x0, y0, x1, y1 = geo.extent(400)
    out = {'cam': {'lon0': geo.LON0, 'lat0': geo.LAT0, 'kx': geo.KX, 'ky': geo.KY, 'half': geo.HALF}, 'ctverce': [list(c) for c in geo.CHUNKS],
           'obce': obce, 'geojson': [{'zdroj': z.get('zdroj'), 'odkaz': z.get('odkaz') or z['url']} for z in geo.MESTO.get('uzavirky_geojson') or []], 'zdroj': cfg.get('zdroj') or urllib.parse.urlparse(cfg['url']).netloc, 'skryt': up.get('uzavirky_skryt') or [],
           **({'kraj': {k: geo.MESTO['uzavirky_kraj'][k] for k in ('zdroj', 'odkaz') if geo.MESTO['uzavirky_kraj'].get(k)}} if (geo.MESTO.get('uzavirky_kraj') or {}).get('url') else {}),
           'uzly': [v for k in klice for v in (round(sit.xy[k][0], 2), round(sit.xy[k][1], 2))], 'ulice': ulice, 'refy': refy, 'hrany': hrany,
           'kruh': [v for k_, r in sit.kruh.items() for v in (idx[k_], r)],
           'adresy': [[n, ui.get(s_, -1), round(x, 1), round(y, 1)] for n, s_, x, y in adresy if x0 <= x <= x1 and y0 <= y <= y1],
           'mista': [[n, round(x, 1), round(y, 1)] for n, x, y in mista if n and len(n) >= 5 and x0 <= x <= x1 and y0 <= y <= y1]}
    json.dump(out, open('site/uzavirky_sit.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    (lo0, lo1), (la0, la1) = geo.to_lonlat([x0, x1], [y0, y1])          # mapa + 400 m: co z JSDI (functions/api/jsdi.js) ukládat
    json.dump({'url': cfg['url'], 'geojson': [z['url'] for z in geo.MESTO.get('uzavirky_geojson') or []],
               'bbox': [round(float(la0), 5), round(float(lo0), 5), round(float(la1), 5), round(float(lo1), 5)],
               **({'kraj': geo.MESTO['uzavirky_kraj']} if (geo.MESTO.get('uzavirky_kraj') or {}).get('url') else {})},   # dopravní události kraje (functions/api/udalosti.js)
              open('site/uzavirky_zdroj.json', 'w', encoding='utf-8'), ensure_ascii=False)
    print('síť pro prohlížeč:', len(klice), 'uzlů,', len(hrany) // 4, 'hran,', os.path.getsize('site/uzavirky_sit.json') // 1000, 'kB')


def nacti_podklady():
    import pandas as pd
    from shapely import wkb
    print('načítám síť silnic…'); sit = Sit()
    src = 'data_all' if os.path.exists('data_all/address.parquet') else 'data'
    a = pd.read_parquet(f'{src}/address.parquet', columns=['street', 'number', 'geometry'])
    adresy = []
    for _, r in a.iterrows():
        g = wkb.loads(r['geometry']); x, y = geo.to_local(g.x, g.y)
        adresy.append((str(r['number']).split('/')[0], r['street'], float(x), float(y)))
    mista = []
    if os.path.exists('data/places.parquet'):
        p = pd.read_parquet('data/places.parquet', columns=['names', 'geometry'])
        mesta = [bez_diakritiky(geo.MESTO['nazev'])]
        for _, r in p.iterrows():
            nm = r['names'].get('primary') if isinstance(r['names'], dict) else None
            if not nm: continue
            nm = bez_diakritiky(nm)
            for m in mesta: nm = re.sub(r'\b' + re.escape(m) + r'\b\s*-?\s*', '', nm).strip(' -')
            g = wkb.loads(r['geometry']); x, y = geo.to_local(g.x, g.y); mista.append((nm, float(x), float(y)))
    obce = [geo.MESTO['nazev']] + [json.load(open(f'obce/{f}', encoding='utf-8')).get('nazev', '') for f in (os.listdir('obce') if os.path.isdir('obce') else []) if f.endswith('.json')]
    return sit, adresy, mista, [o for o in obce if o]


def main():
    vypis = '--vypis' in sys.argv
    cfg = geo.MESTO.get('uzavirky_web') or {}
    if '--bez-stahovani' not in sys.argv:
        if not cfg.get('url'): sys.exit('v mesto.json chybí "uzavirky_web": {"url": "…", "zdroj": "…"}')
        sit, adresy, mista, obce = nacti_podklady()
        export_sit(sit, adresy, mista, obce, cfg)
        zdroj = cfg.get('zdroj') or urllib.parse.urlparse(cfg['url']).netloc
        stare = json.load(open(AUTO, encoding='utf-8')).get('uzavirky', []) if os.path.exists(AUTO) else []
        web = [u for u in stare if u.get('puvod', 'web') == 'web']
        try:
            vse, ozn = [], []
            for url, nadpis, text in oznameni(cfg['url']):
                ozn.append({'url': url, 'nadpis': nadpis, 'text': text})
                u, stav = zpracuj(sit, url, nadpis, text, obce, zdroj, adresy, mista)
                print(f'  {nadpis}: {len(u)} úseků ({stav})')
                if vypis:
                    for q in u: print('     ', q['nazev'], q['od'], '–', q['do'], len(q['line']), 'bodů', 'ODHAD (celá ulice)' if q['auto'] == 'odhad' else '')
                vse += u
            web = [{**u, 'puvod': 'web'} for u in vse]
            os.makedirs('build', exist_ok=True)
            json.dump({'oznameni': ozn}, open('build/uzavirky_oznameni.json', 'w', encoding='utf-8'), ensure_ascii=False)   # vstup pro kontrolu web/uzavirky.js
        except OSError as e:
            print('web nejde stáhnout, zůstávají poslední uzavírky:', e)
        geojson = []
        for i, z in enumerate(geo.MESTO.get('uzavirky_geojson') or []):
            try:
                d = json.loads(stahni(z['url']))
                u = z_geojson(d, i, z, [q['line'] for q in web])
                print(f"  {z.get('zdroj') or z['url']}: {len(d.get('features', []))} úseků, v mapě platných {len(u)}")
                if vypis:
                    for q in u: print('     ', q['nazev'], q['od'], '–', q['do'], len(q['line']), 'bodů')
                geojson += u
                os.makedirs('build', exist_ok=True)
                json.dump(d, open(f'build/uzavirky_geojson{i}.json', 'w', encoding='utf-8'), ensure_ascii=False)   # vstup pro kontrolu web/uzavirky.js
            except (OSError, ValueError) as e:
                print(f"  {z['url']} nejde stáhnout, zůstávají poslední:", e)
                geojson += [q for q in stare if q.get('puvod') == f'geo{i}']
        json.dump({'stazeno': time.strftime('%Y-%m-%d %H:%M'), 'zdroj': cfg['url'], 'uzavirky': web + geojson}, open(AUTO, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    data = zapsat()
    print('platných a chystaných uzavírek:', len(data), '-> site/uzavirky.json, site/jizda/uzavirky.json')


if __name__ == '__main__':
    main()
