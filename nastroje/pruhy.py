# jízdní pruhy a směrové šipky z OpenStreetMap (Overpass, ODbL, bez registrace) -> assets/pruhy.json
# Silnice s tagy turn:lanes (turn:lanes:forward / :backward) a lanes. 3D jízda (web/jizda_znaceni.js) z nich u konce
# silnice před křižovatkou nakreslí dělicí čáry pruhů a šipky (V9a). Overture tyhle tagy nepřebírá, proto zvlášť z OSM.
# Formát: [{"p": [[lat, lon], …], "f": "left|through;right" (ve směru kreslení čáry), "b": "…" (proti), "o": 1 jednosměrka,
#           "n": počet pruhů}]
# spouštět z kořene repa: python nastroje/pruhy.py
import json, subprocess, sys; sys.path.insert(0, '.')

SERVERY = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']


def stahni(q):
    for url in SERVERY:
        for _ in range(2):
            r = subprocess.run(['curl', '-s', '-f', '-m', '180', '-A', 'izomapa-tools/1.0', '--data-urlencode', f'data={q}', url],
                               capture_output=True, text=True)
            if r.returncode == 0 and r.stdout.strip().startswith('{'): return json.loads(r.stdout)
    raise SystemExit('Overpass neodpovídá, zkus to později')


if __name__ == '__main__':
    import geo
    x0, y0, x1, y1 = geo.extent(geo.MARGIN + 20)
    lo0, la0 = geo.to_lonlat(x0, y0); lo1, la1 = geo.to_lonlat(x1, y1); b = f'{la0},{lo0},{la1},{lo1}'
    q = (f'[out:json][timeout:120];(way["highway"]["turn:lanes"]({b});way["highway"]["turn:lanes:forward"]({b});'
         f'way["highway"]["turn:lanes:backward"]({b}););out geom;')
    d = stahni(q)
    out = []
    for e in d['elements']:
        t = e.get('tags', {}); g = e.get('geometry') or []
        if len(g) < 2: continue
        jedn = t.get('oneway') in ('yes', '1', 'true') or t.get('junction') == 'roundabout'
        f = t.get('turn:lanes:forward') or (t.get('turn:lanes') if jedn or 'turn:lanes:backward' not in t else None) or t.get('turn:lanes')
        bk = t.get('turn:lanes:backward')
        if t.get('oneway') == '-1':                          # jednosměrka proti směru kreslení
            g = g[::-1]
        try: n = int(t.get('lanes', '0'))
        except ValueError: n = 0
        out.append({'p': [[round(q_['lat'], 7), round(q_['lon'], 7)] for q_ in g], 'f': f or '', 'b': bk or '', 'o': 1 if jedn else 0, 'n': n})
    json.dump(out, open('assets/pruhy.json', 'w'), ensure_ascii=False, separators=(',', ':'))
    print('silnic s pruhy', len(out))
