"""Chmelnice ze ZABAGED (ČÚZK, CC BY 4.0) pro celou mapu -> assets/chmelnice.json [[[lat, lon], …] vnější kruh, …].
Rakovnicko je chmelařská oblast: assets/custom_prep.py z nich udělá konstrukci (sloupy 7 m, dráty, v létě révy) a render ji
kreslí podle ročního období (assets/custom_models.js). Zvlášť od nastroje/zabaged.py, aby se nepřepsala rozdělená pole.
Použití: .venv/Scripts/python nastroje/chmelnice.py   (pak ./postav.sh render, dotčené čtverce se vykreslí znovu)
"""
import json, os, re, subprocess, sys, urllib.parse
sys.path.insert(0, '.')
import geo
from pyproj import Transformer

URL = 'https://ags.cuzk.gov.cz/arcgis/services/ZABAGED_POLOHOPIS/MapServer/WFSServer?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature'
T = Transformer.from_crs(4326, 5514, always_xy=True); B = Transformer.from_crs(5514, 4326, always_xy=True)


def main():
    a, b, c, d = geo.bbox_lonlat(100); xs, ys = T.transform([a, b, a, b], [c, c, d, d])
    X0, Y0, X1, Y1 = min(xs), min(ys), max(xs), max(ys)
    polys, seen, start = [], set(), 0
    while True:
        q = f'&TYPENAMES={urllib.parse.quote("ZABAGED_POLOHOPIS:Chmelnice")}&BBOX={X0},{Y0},{X1},{Y1},urn:ogc:def:crs:EPSG::5514&COUNT=500&STARTINDEX={start}'
        s = subprocess.run(['curl', '-s', '-f', '-m', '180', URL + q], check=True, capture_output=True, text=True, encoding='utf-8').stdout
        members = s.split('<wfs:member>')[1:]
        for m in members:
            fid = re.search(r'<ZABAGED_POLOHOPIS:FID_ZBG>(\d+)<', m)
            if fid and fid.group(1) in seen: continue
            if fid: seen.add(fid.group(1))
            for poly in re.findall(r'<gml:Polygon.*?</gml:Polygon>', m, re.S):
                rings = []
                for r in re.findall(r'<gml:posList[^>]*>([^<]*)<', poly):
                    v = list(map(float, r.split())); lo, la = B.transform(v[0::2], v[1::2])
                    rings.append([[round(y, 6), round(x, 6)] for x, y in zip(lo, la)])
                if rings: polys.append(rings)
        if len(members) < 500: break
        start += 500
    os.makedirs('assets', exist_ok=True)
    json.dump(polys, open('assets/chmelnice.json', 'w', encoding='utf-8'), separators=(',', ':'))
    print('chmelnic', len(polys))


if __name__ == '__main__':
    main()
