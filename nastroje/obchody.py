"""Cedule obchodů na fasádách (assets/obchody.json) z Overture Places ve stažených datech (data*/places.parquet).

Řetězce se známým vzhledem dostanou barvy značky (klíč "z", tabulka CEDULE v assets/custom_models.js), místní obchody
s vysokou jistotou dat obecnou ceduli ("z": "g"). Obchody uvnitř hal s vlastním modelem (dominanty.json, "lm": "znacka")
a v nákupních parcích se vynechají. Polohu na uliční stěně domu dopočítá assets/custom_prep.py (fáze props).
  .venv/bin/python nastroje/obchody.py [--vypis]
"""
import glob, json, re, sys
import pandas as pd, shapely

ZNACKY = [(r'rossmann', 'rossmann'), (r'\bdm\b.*drogerie|drogerie markt', 'dm'), (r'\bpepco\b', 'pepco'), (r'planeo', 'planeo'),
          (r'česká spořitelna', 'cs'), (r'\bčsob\b', 'csob'), (r'komerční banka', 'kb'), (r'unicredit', 'unicredit'),
          (r'\bbenu\b', 'benu'), (r'česká pošta', 'posta')]
KATEGORIE = ('store', 'shop', 'pharmac', 'bank', 'post', 'market', 'grocer', 'bakery', 'butcher', 'optic', 'book', 'florist', 'fashion',
             'food_and_bev', 'hardware', 'electronics', 'drug', 'sporting', 'toys', 'office_supply', 'flowers', 'animal_and_pet', 'specialty')
MISTNI_JISTOTA = 0.85
NE_OBCHOD = re.compile(r'škola|agentura|vzdělávací|ústavní|truhlářství|altany|s\.r\.o', re.I)   # služby a dílny bez výlohy


def main():
    hal = [shapely.Point(d['lon'], d['lat']).buffer(0.0009) for d in json.load(open('assets/dominanty.json', encoding='utf-8'))
           if d['spec'].get('lm') == 'znacka' and d['spec'].get('mp', {}).get('t') == 'obchod']
    out, seen = [], set()
    for f in sorted(glob.glob('data*/places.parquet')):
        if 'data_all' in f: continue
        for _, r in pd.read_parquet(f).iterrows():
            if r.id in seen: continue
            seen.add(r.id)
            bc = str(r.basic_category)
            posta = 'shipping' in bc and 'Pošta' in str(r.brand)
            if not posta and (not any(k in bc for k in KATEGORIE) or 'coffee' in bc or 'restaurant' in bc): continue
            g = shapely.from_wkb(r.geometry) if isinstance(r.geometry, bytes) else r.geometry
            nm = (r.names or {}).get('primary') or ''
            br = ''
            try: br = r.brand['names']['primary'] or ''
            except Exception: pass
            z = 'posta' if posta else next((k for p, k in ZNACKY if re.search(p, f'{nm} {br}', re.I)), None)
            if NE_OBCHOD.search(nm): continue
            if z is None and (r.confidence or 0) < MISTNI_JISTOTA: continue
            if any(h.contains(g) for h in hal): continue            # obchod v hale s vlastním modelem (Kaufland, Tesco, Stop Shop…)
            if bc == 'shopping_mall': continue
            out.append({'nazev': nm, 'lat': round(g.y, 6), 'lon': round(g.x, 6), 'z': z or 'g'})
    out.sort(key=lambda q: (q['z'] == 'g', q['nazev']))
    json.dump(out, open('assets/obchody.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('obchodů', len(out), '(řetězců', sum(q['z'] != 'g' for q in out), ')')
    if '--vypis' in sys.argv:
        for q in out: print(f"  {q['z']:10} {q['nazev']}")


if __name__ == '__main__':
    main()
