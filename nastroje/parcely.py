# parcely z katastru (RÚIAN, ČÚZK, CC BY 4.0) pro odhad plotů v prep.py: jen zahrady (druh pozemku 5) a zastavěné plochy
# a nádvoří (13), tj. pozemky domů. Kde ploty skutečně stojí, katastr neříká: prep.py je dopočítá podél ulice a mezi sousedy.
# -> assets/parcely.json [[druh, [[lat, lon], ...]], ...] (zjednodušené na 0,3 m); bez souboru prep.py dopočítané ploty nekreslí.
# spouštět z kořene repa: .venv/bin/python nastroje/parcely.py   (stahuje se po čtvercích 1 km do build/parcely/, po přerušení pokračuje)
import json, os, subprocess, sys, time, urllib.parse
sys.path.insert(0, '.')
import geo, shapely

URL = 'https://ags.cuzk.gov.cz/arcgis/rest/services/RUIAN/Prohlizeci_sluzba_nad_daty_RUIAN/MapServer/5/query?'
D = 'build/parcely/'
KROK = 1000
DRUHY = (5, 13)          # zahrada, zastavěná plocha a nádvoří


def stahni(x0, y0, x1, y1):
    f = f'{D}{round(x0)}_{round(y0)}.json'
    if not os.path.exists(f):
        lo0, la0 = geo.to_lonlat(x0, y0); lo1, la1 = geo.to_lonlat(x1, y1)
        out, off = [], 0
        while True:                                  # stránkování (služba vrací nejvýš 1000 nebo 2000 objektů naráz)
            q = urllib.parse.urlencode({'geometry': f'{lo0},{la0},{lo1},{la1}', 'geometryType': 'esriGeometryEnvelope', 'inSR': 4326, 'outSR': 4326,
                                        'spatialRel': 'esriSpatialRelIntersects', 'where': f'druhpozemkukod IN ({",".join(map(str, DRUHY))})',
                                        'outFields': 'id,druhpozemkukod', 'resultOffset': off, 'resultRecordCount': 1000, 'f': 'json'})
            r = subprocess.run(['curl', '-s', '-f', '-m', '180', '-A', 'izomapa-tools/1.0', URL + q], check=True, capture_output=True, text=True).stdout
            d = json.loads(r)
            if 'features' not in d: raise SystemExit(f'RÚIAN nevrátil parcely pro {f}: {r[:200]}')
            out += d['features']; off += len(d['features'])
            if not d.get('exceededTransferLimit') or not d['features']: break
            time.sleep(0.5)
        json.dump(out, open(f + '.tmp', 'w')); os.replace(f + '.tmp', f)
        time.sleep(0.5)
    return json.load(open(f))


if __name__ == '__main__':
    os.makedirs(D, exist_ok=True)
    X0, Y0, X1, Y1 = geo.extent(geo.MARGIN)
    vse, n = {}, 0
    x = X0
    while x < X1:
        y = Y0
        while y < Y1:
            # jen kousky mapy, kde je aspoň část čtverce
            if any(abs(x + KROK / 2 - cx) <= geo.HALF + KROK and abs(y + KROK / 2 - cy) <= geo.HALF + KROK for cx, cy in map(geo.chunk_center, geo.CHUNKS)):
                for o in stahni(x, y, min(x + KROK, X1), min(y + KROK, Y1)):
                    a = o['attributes']; g = o.get('geometry')
                    if not g or not g.get('rings') or a['id'] in vse: continue
                    p = shapely.Polygon(g['rings'][0]).simplify(0.000003)
                    if p.is_empty or p.area <= 0: continue
                    vse[a['id']] = [a['druhpozemkukod'], [[round(la, 6), round(lo, 6)] for lo, la in p.exterior.coords[:-1]]]
                n += 1
                if n % 20 == 0: print('kousků', n, 'parcel', len(vse), flush=True)
            y += KROK
        x += KROK
    json.dump(list(vse.values()), open('assets/parcely.json', 'w'), separators=(',', ':'))
    print('parcel', len(vse), 'MB', round(os.path.getsize('assets/parcely.json') / 1e6, 1))
