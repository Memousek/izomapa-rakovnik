# světelné signalizace z OpenStreetMap (Overpass, ODbL, bez registrace) -> assets/semafory.json: [[lat, lon, druh], ...]
# druh 'k' = křižovatka (highway=traffic_signals), 'p' = přechod se světly (crossing=traffic_signals bez křižovatky)
# prep.py je přiřadí kusům silnic (stop čára), web/app.html je přepíná podle cyklu a auta před červenou čekají ve frontě
# spouštět z kořene repa: python nastroje/semafory.py
import json, math, subprocess, sys; sys.path.insert(0, '.')

DOSAH_M = 7           # jak daleko od osy kusu silnice může uzel semaforu ležet
KONEC_M = 18          # semafor blíž konci kusu než tohle patří ke křižovatce na tom konci


def na_kusu(p, body):
    """p: [[x, y, …], …] lomená čára kusu silnice, body: [(x, y, druh, řadič)] semafory v metrech;
    vrátí [[metry od začátku, x, y, druh, směr, řadič]] seřazené, bez dvojic blíž než 3 m.
    směr: 1 = stojí auta jedoucí k vyššímu staničení (ke konci kusu), -1 = k začátku, 0 = oba směry (přechod uprostřed)."""
    out, acc, L = [], 0.0, 0.0
    for i in range(1, len(p)): L += math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1])
    for i in range(1, len(p)):
        ax, ay, bx, by = p[i - 1][0], p[i - 1][1], p[i][0], p[i][1]
        dx, dy = bx - ax, by - ay; l2 = dx * dx + dy * dy; seg = math.sqrt(l2)
        for x, y, k, *rd in body:
            t = max(0.0, min(1.0, ((x - ax) * dx + (y - ay) * dy) / l2)) if l2 else 0.0
            qx, qy = ax + dx * t, ay + dy * t
            if math.hypot(x - qx, y - qy) > DOSAH_M: continue
            s = acc + seg * t
            if s > L - 4: s = max(L / 2, L - 8)                          # uzel ve středu křižovatky: stop čára ~8 m před ní, ne uprostřed
            elif s < 4: s = min(L / 2, 8)
            if any(abs(s - o[0]) < 3 for o in out): continue
            if k == 'p' and KONEC_M < s < L - KONEC_M: smer = 0            # přechod uprostřed úseku: stojí oba směry
            else: smer = 1 if s > L / 2 else -1                            # u křižovatky: jen auta, která do ní vjíždějí
            out.append([round(s, 1), round(qx, 1), round(qy, 1), k, smer, rd[0] if rd else 0])
        acc += seg
    return sloucit(sorted(out))


def sloucit(out):
    """OSM má semafor jedné křižovatky často na několika uzlech (nájezd i střed): stejný směr do 12 m = jedna stop čára.
    Zůstane ta, ke které auto dojede dřív (směr 1: menší staničení, směr -1: větší)."""
    res = []
    for o in out:
        i = next((k for k, q in enumerate(res) if q[4] == o[4] and abs(q[0] - o[0]) < 12), None)
        if i is None: res.append(o)
        elif o[4] == -1: res[i] = o
    return res


if __name__ == '__main__':
    import geo
    x0, y0, x1, y1 = geo.extent(geo.MARGIN + 20)
    lo0, la0 = geo.to_lonlat(x0, y0); lo1, la1 = geo.to_lonlat(x1, y1); b = f'{la0},{lo0},{la1},{lo1}'
    q = f'[out:json][timeout:60];(node["highway"="traffic_signals"]({b});node["crossing"="traffic_signals"]({b});node["crossing:signals"="yes"]({b}););out;'
    t = subprocess.run(['curl', '-s', '-f', '-m', '120', '-A', 'izomapa-tools/1.0', '--data-urlencode', f'data={q}', 'https://overpass-api.de/api/interpreter'],
                       check=True, capture_output=True, text=True).stdout
    uzly = {}
    for e in json.loads(t)['elements']:
        tg = e.get('tags', {})
        k = 'k' if tg.get('highway') == 'traffic_signals' and tg.get('traffic_signals') not in ('crossing', 'pedestrian_crossing') else 'p'
        uzly[(e['lat'], e['lon'])] = 'k' if uzly.get((e['lat'], e['lon'])) == 'k' else k
    xy = {q: geo.to_local(q[1], q[0]) for q in uzly}
    kriz = [xy[q] for q, k in uzly.items() if k == 'k']
    for q, k in list(uzly.items()):     # přechod se světly přímo u řízené křižovatky je součást křižovatky (jinak by auta stála dvakrát)
        if k == 'p' and any(math.hypot(xy[q][0] - a, xy[q][1] - b) < 40 for a, b in kriz): del uzly[q]
    # řadič: uzly do 60 m od sebe (řetězově) přepínají společně, jinak by na jedné křižovatce svítila zelená proti sobě
    body = sorted(uzly); radic = {}
    for q in body:
        if q in radic: continue
        radic[q] = len(set(radic.values())); fronta = [q]
        while fronta:
            a = fronta.pop()
            for b in body:
                if b not in radic and math.hypot(xy[a][0] - xy[b][0], xy[a][1] - xy[b][1]) < 60: radic[b] = radic[q]; fronta.append(b)
    json.dump([[la, lo, k, radic[(la, lo)]] for (la, lo), k in sorted(uzly.items())], open('assets/semafory.json', 'w'))
    print('řadičů', len(set(radic.values())))
    print('semaforů', len(uzly), 'z toho na křižovatkách', sum(1 for k in uzly.values() if k == 'k'))
