"""Názvy částí města a vesnic pro popisky při oddálení: základní sídelní jednotky (ZSJ) z RÚIAN ČÚZK (CC BY 4.0).

ZSJ jsou úřední pojmenované části obcí (Rakovník: Rakovník-střed, Vinohrady, Šamotka, Na Spravedlnosti, Huřviny…),
podobně jako čtvrti v Liberci. -> assets/zsj.json: {"zsj": [{nazev, kod, poly: [[[lat, lon], …], …]}], "obce": [názvy obcí]}
overlay.py z nich udělá popisky (doprostřed zástavby části podle adres), obce větším písmem. Skrýt název:
"skryte_casti" v mesto.json, přejmenovat: "prejmenuj_casti": {"Rakovník-střed": "Rakovník"}.
Použití: .venv/Scripts/python nastroje/zsj.py   (pak overlay.py a build_html.py, render není potřeba)
"""
import json, subprocess, sys, urllib.parse
sys.path.insert(0, '.')
import geo

BASE = 'https://ags.cuzk.gov.cz/arcgis/rest/services/RUIAN/Prohlizeci_sluzba_nad_daty_RUIAN/MapServer/'


def dotaz(vrstva, geometrie):
    x0, y0, x1, y1 = geo.extent(geo.MARGIN)
    lo0, la0 = geo.to_lonlat(x0, y0); lo1, la1 = geo.to_lonlat(x1, y1)
    q = urllib.parse.urlencode({'where': '1=1', 'geometry': f'{lo0},{la0},{lo1},{la1}', 'geometryType': 'esriGeometryEnvelope', 'inSR': 4326,
                                'outSR': 4326, 'spatialRel': 'esriSpatialRelIntersects', 'outFields': 'kod,nazev',
                                'returnGeometry': 'true' if geometrie else 'false', 'f': 'json'})
    t = subprocess.run(['curl', '-s', '-f', '-m', '120', '-A', 'izomapa-tools/1.0', BASE + f'{vrstva}/query?' + q],
                       check=True, capture_output=True, text=True, encoding='utf-8').stdout
    d = json.loads(t)
    if 'error' in d: raise SystemExit(f'ČÚZK: {d["error"]}')
    return d.get('features', [])


def main():
    zsj = []
    for f in dotaz(6, True):                                     # 6 = ZakladniSidelniJednotka
        a, g = f['attributes'], f.get('geometry') or {}
        rings = [[[round(la, 6), round(lo, 6)] for lo, la in r] for r in g.get('rings', [])]
        if a.get('nazev') and rings: zsj.append({'nazev': a['nazev'], 'kod': a['kod'], 'poly': rings})
    obce = sorted({f['attributes']['nazev'] for f in dotaz(12, False) if f['attributes'].get('nazev')})   # 12 = Obec
    json.dump({'zdroj': 'RÚIAN, ČÚZK (CC BY 4.0)', 'zsj': zsj, 'obce': obce}, open('assets/zsj.json', 'w', encoding='utf-8'), ensure_ascii=False)
    print('ZSJ', len(zsj), 'obcí', len(obce))


if __name__ == '__main__':
    main()
