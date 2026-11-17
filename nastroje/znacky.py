# dopravní značky z OpenStreetMap (Overpass, ODbL, bez registrace) -> assets/znacky.json: [[x, y, druh, text], ...] v metrech mapy
# druh: 'stop' (P6), 'dej' (P4 dej přednost v jízdě), 'prechod' (IP6 a zebra; jen vyznačené přechody), 'obec' (IS12a/b, text = název obce)
# rychlostní limity a jednosměrky se neberou odsud: 3D jízda je odvodí z dat silnic (overlay: limit, jednosměrnost)
# spouštět z kořene repa: python nastroje/znacky.py; pak python nastroje/jizda.py --stranka (zkopíruje do site/jizda/)
import json, subprocess, sys, time; sys.path.insert(0, '.')

VYZNACENE = {'marked', 'zebra', 'uncontrolled', 'traffic_signals'}


def druh(tg):
    hw = tg.get('highway')
    if hw == 'stop': return 'stop'
    if hw == 'give_way': return 'dej'
    if hw == 'crossing':
        c = tg.get('crossing', '')
        if c in VYZNACENE or tg.get('crossing_ref') == 'zebra' or tg.get('crossing:markings') not in (None, 'no'): return 'prechod'
        return None
    if 'city_limit' in tg.get('traffic_sign', ''): return 'obec'
    return None


if __name__ == '__main__':
    import geo
    x0, y0, x1, y1 = geo.extent(geo.MARGIN + 20)
    lo0, la0 = geo.to_lonlat(x0, y0); lo1, la1 = geo.to_lonlat(x1, y1); b = f'{la0},{lo0},{la1},{lo1}'
    q = (f'[out:json][timeout:90];(node["highway"~"^(stop|give_way|crossing)$"]({b});'
         f'node["traffic_sign"~"city_limit"]({b}););out;')
    for pokus in range(4):                                  # Overpass občas odmítne (vytížení, limit dotazů): zkusit znovu
        r = subprocess.run(['curl', '-s', '-f', '-m', '120', '-A', 'izomapa-tools/1.0', '--data-urlencode', f'data={q}', 'https://overpass-api.de/api/interpreter'],
                           capture_output=True, text=True)
        if r.returncode == 0: break
        print(f'Overpass neodpověděl (curl {r.returncode}), zkouším znovu za {20 * (pokus + 1)} s'); time.sleep(20 * (pokus + 1))
    else: sys.exit('Overpass nedostupný, zkus to později.')
    t = r.stdout
    out, pocty = [], {}
    for e in json.loads(t)['elements']:
        tg = e.get('tags', {}); d = druh(tg)
        if not d: continue
        x, y = geo.to_local(e['lon'], e['lat'])
        text = (tg.get('name') or tg.get('city_limit:name') or geo.MESTO.get('nazev', '')) if d == 'obec' else ''
        out.append([round(float(x), 1), round(float(y), 1), d, text])
        pocty[d] = pocty.get(d, 0) + 1
    json.dump(out, open('assets/znacky.json', 'w', encoding='utf-8'), ensure_ascii=False)
    print('značky:', pocty)
