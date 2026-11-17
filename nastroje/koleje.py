# Koleje vlaků ve stanicích podle skutečnosti -> assets/koleje.json (mhd.py podle něj vede vlak ve stanici po jeho koleji)
#   vlaky:  {číslo vlaku: {stanice: kolej}} z celostátního jízdního řádu (CZPTT XML, LocationSubsidiaryCode typu 1 = staniční kolej)
#   koleje: [{ref, line: [[lat, lon], …]}] očíslované koleje z OpenStreetMap (railway:track_ref, Overpass, ODbL)
# Vstup: build/vlaky/JR*.zip z portal.cisjr.cz (/pub/draha/celostatni/szdc/<rok>/JR<rok>.zip, ~25 MB).
# Spouštět z kořene repa: python nastroje/koleje.py   (pak mhd.py a build_html.py; render není potřeba)
import collections, glob, json, math, re, subprocess, sys, time, zipfile
sys.path.insert(0, '.')

PRECHOD = 35.0      # délka přechodu z hlavní koleje na staniční (výhybky), m
DOSAH = 30.0        # trasa dál než DOSAH od koleje se nepřesouvá (jiná část stanice)


def po_koleji(body, kolej):
    """body: [(x, y)] trasa vlaku v metrech, kolej: [(x, y)] osa staniční koleje.
    Vrátí trasu, která podél koleje jede po ní; na koncích koleje (výhybky) plynule přejde z původní trasy během PRECHOD metrů.
    Mění jen body, které leží podél koleje (průmět uvnitř koleje, do DOSAH metrů, směr rovnoběžně)."""
    from shapely.geometry import LineString, Point
    K = LineString(kolej); L = K.length
    if L < 5 or len(body) < 2: return list(body)
    hust = []                                          # zhustit po 2 m, ať přechod nemá zuby
    for i in range(1, len(body)):
        (ax, ay), (bx, by) = body[i - 1], body[i]
        n = max(1, int(math.hypot(bx - ax, by - ay) / 2))
        hust += [(ax + (bx - ax) * k / n, ay + (by - ay) * k / n) for k in range(n)]
    hust.append(tuple(body[-1]))
    out = []
    for i, (x, y) in enumerate(hust):
        p = Point(x, y); s = K.project(p)
        if s <= 0 or s >= L: out.append((x, y)); continue
        q = K.interpolate(s); d = math.hypot(q.x - x, q.y - y)
        if d > DOSAH: out.append((x, y)); continue
        a, b = hust[max(0, i - 1)], hust[min(len(hust) - 1, i + 1)]
        k0, k1 = K.interpolate(max(0, s - 2)), K.interpolate(min(L, s + 2))
        tx, ty, kx, ky = b[0] - a[0], b[1] - a[1], k1.x - k0.x, k1.y - k0.y
        if abs(tx * kx + ty * ky) < 0.85 * (math.hypot(tx, ty) * math.hypot(kx, ky) or 1): out.append((x, y)); continue
        u = min(1.0, min(s, L - s) / PRECHOD); w = u * u * (3 - 2 * u)      # smoothstep: na konci koleje 0, za přechodem 1
        out.append((x + (q.x - x) * w, y + (q.y - y) * w))
    return out


def jizdni_rad(z, stanice):
    """{číslo vlaku: {stanice: kolej}} pro stanice, jejichž název začíná některým z `stanice` (nejčastější kolej ze všech variant vlaku)"""
    import xml.etree.ElementTree as ET
    hledat = re.compile('|'.join(map(re.escape, stanice)))
    klice = {s.split()[0][:6].encode(k) for s in stanice for k in ('utf-8', 'cp1250')}   # rychlé předběžné hledání v bajtech
    hlasy = collections.defaultdict(collections.Counter)
    for n in z.namelist():
        b = z.read(n)
        if not any(k in b for k in klice): continue
        try: r = ET.fromstring(b)                         # soubory bývají v UTF-8 bez deklarace, starší v cp1250
        except ET.ParseError: r = ET.fromstring(b.decode('cp1250'))
        i = r.find('CZPTTInformation')
        if i is None: continue
        cislo = None
        for l in i.findall('CZPTTLocation'):
            cislo = cislo or l.findtext('OperationalTrainNumber')
            nm = l.findtext('Location/PrimaryLocationName') or ''
            kod = l.find('Location/LocationSubsidiaryIdentification/LocationSubsidiaryCode')
            if kod is None or kod.get('LocationSubsidiaryTypeCode') != '1' or not hledat.match(nm): continue
            if cislo: hlasy[(cislo, nm)][kod.text.strip()] += 1
    out = collections.defaultdict(dict)
    for (cislo, nm), c in hlasy.items(): out[cislo][nm] = c.most_common(1)[0][0]
    return dict(out)


def koleje_osm():
    import geo
    lo0, lo1, la0, la1 = geo.bbox_lonlat(300)
    q = f'[out:json][timeout:90];way["railway"~"^(rail|light_rail)$"]["railway:track_ref"]({la0},{lo0},{la1},{lo1});out tags geom;'
    for pokus in range(4):
        r = subprocess.run(['curl', '-s', '-f', '-m', '120', '-A', 'izomapa-tools/1.0', '--data-urlencode', f'data={q}', 'https://overpass-api.de/api/interpreter'],
                           capture_output=True, text=True)
        if r.returncode == 0: break
        time.sleep(20 * (pokus + 1))
    else: sys.exit('Overpass nedostupný, zkus to později')
    return [{'ref': e['tags']['railway:track_ref'], 'id': e['id'], 'line': [[round(g['lat'], 7), round(g['lon'], 7)] for g in e['geometry']]}
            for e in json.loads(r.stdout)['elements'] if len(e.get('geometry', [])) > 1]


if __name__ == '__main__':
    import geo
    jr = sorted(glob.glob('build/vlaky/JR*.zip'))
    if not jr: sys.exit('chybí build/vlaky/JR<rok>.zip (portal.cisjr.cz, /pub/draha/celostatni/szdc/<rok>/)')
    stanice = geo.MESTO.get('vlaky_stanice') or [geo.MESTO['nazev']]
    vlaky = jizdni_rad(zipfile.ZipFile(jr[-1]), stanice)
    koleje = koleje_osm()
    json.dump({'vlaky': vlaky, 'koleje': koleje}, open('assets/koleje.json', 'w', encoding='utf-8'), ensure_ascii=False)
    c = collections.Counter((st, k) for v in vlaky.values() for st, k in v.items())
    print('vlaků s kolejí', len(vlaky), 'očíslovaných kolejí v OSM', len(koleje), '| nejčastější:', c.most_common(8))
