"""Fotky budov z Wikimedia Commons pro kartu domu (web/mapa_fotky.js).
Zdroj: Wikidata, položky se souřadnicí (P625) a obrázkem (P18) v obdélníku mapy. Wikidata mají souřadnici stavby samotné
(památky ÚSKP, kostely, brány), ne místa, odkud se fotilo, takže se fotka v prohlížeči přiřadí jen domu, v jehož obrysu bod leží.
Vynechá obce a části obcí (mají počet obyvatel P1082) a ulice, náměstí, řeky a podobné (`NE_DRUHY`).
Autor a licence z Commons (extmetadata) se ukládají ke každé fotce, karta je musí uvést.
-> assets/fotky.json [{q, nazev, lat, lon, soubor, nahled, autor, licence, licence_url}]
Ruční skrytí špatné fotky: "fotky_skryt": ["Q123", "Soubor.jpg"] v mesto.json.
Použití: .venv/bin/python nastroje/fotky.py   (pak build_html.py, render není potřeba)
"""
import html, json, re, subprocess, sys, time, urllib.parse
sys.path.insert(0, '.')
import geo

UA = 'izomapa-tools/1.0 (https://github.com/adamklatovsky/izomapa)'
NE_DRUHY = {'Q79007', 'Q174782', 'Q4022', 'Q47521', 'Q23397', 'Q34442', 'Q3957', 'Q123705', 'Q1549591', 'Q515', 'Q2983893',
            'Q5153359', 'Q3257686', 'Q55488', 'Q644371', 'Q22698', 'Q1076486', 'Q4421'}   # ulice, náměstí, řeka, potok, rybník, silnice, městečko, čtvrť, město, obec, část obce, nádraží, letiště, park, sport. areál, les


def curl(url, *data):
    a = ['curl', '-s', '-m', '120', '-A', UA, '-H', 'Accept: application/json']
    for d in data: a += ['--data-urlencode', d]
    for pokus in range(3):
        t = subprocess.run(a + [url], capture_output=True, text=True, encoding='utf-8').stdout
        if t.startswith('{'): return json.loads(t)
        time.sleep(10 + 10 * pokus)
    raise SystemExit(f'{url} neodpověděl')


def bez_html(s):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', s or ''))).strip()


def autor(artist, nahral):
    # Artist bývá s poznámkou ze šablony („I would appreciate being notified…“) nebo „ŠJů ( cs:ŠJů )“: pak jméno toho, kdo nahrál
    a = re.sub(r'\s*\(\s*\w+:[^)]*\)', '', bez_html(artist)).strip()
    if not a or len(a) > 60 or re.search(r'appreciate|available under|^this file|creative commons', a, re.I): a = nahral or ''
    return a


def main():
    x0, y0, x1, y1 = geo.extent(geo.MARGIN)
    lo0, la0 = geo.to_lonlat(x0, y0); lo1, la1 = geo.to_lonlat(x1, y1)
    q = f'''SELECT ?item ?itemLabel ?coord ?image (GROUP_CONCAT(DISTINCT ?druh) AS ?druhy) (SAMPLE(?pop) AS ?obyv) WHERE {{
  SERVICE wikibase:box {{ ?item wdt:P625 ?coord.
    bd:serviceParam wikibase:cornerSouthWest "Point({min(lo0, lo1)} {min(la0, la1)})"^^geo:wktLiteral.
    bd:serviceParam wikibase:cornerNorthEast "Point({max(lo0, lo1)} {max(la0, la1)})"^^geo:wktLiteral. }}
  ?item wdt:P18 ?image.
  OPTIONAL {{ ?item wdt:P31 ?druh. }}
  OPTIONAL {{ ?item wdt:P1082 ?pop. }}
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "cs,en". }}
}} GROUP BY ?item ?itemLabel ?coord ?image'''
    r = curl('https://query.wikidata.org/sparql?format=json', 'query=' + q)
    skryt = set(geo.MESTO.get('fotky_skryt', []))
    pol, vynech = {}, []
    for b in r['results']['bindings']:
        qid = b['item']['value'].rsplit('/', 1)[1]
        druhy = {d.rsplit('/', 1)[1] for d in b.get('druhy', {}).get('value', '').split() if d}
        nazev = b['itemLabel']['value']
        if 'obyv' in b or druhy & NE_DRUHY: vynech.append(nazev); continue
        m = re.match(r'Point\(([-\d.]+) ([-\d.]+)\)', b['coord']['value'])
        soubor = urllib.parse.unquote(b['image']['value'].rsplit('/', 1)[1])
        if not m or qid in skryt or soubor in skryt or qid in pol: continue   # víc obrázků u položky: první
        pol[qid] = {'q': qid, 'nazev': nazev, 'lat': round(float(m[2]), 6), 'lon': round(float(m[1]), 6), 'soubor': soubor}
    # autor a licence z Commons, po 40 souborech
    P = list(pol.values())
    for i in range(0, len(P), 40):
        kus = P[i:i + 40]
        d = curl('https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo&iiprop=url|user|extmetadata&iiurlwidth=640&format=json&formatversion=2',
                 'titles=' + '|'.join('File:' + p['soubor'] for p in kus))
        info = {}
        for pg in d['query']['pages']:
            if not pg.get('imageinfo'): continue
            ii = pg['imageinfo'][0]; em = ii.get('extmetadata', {})
            info[pg['title'][5:]] = {'nahled': (ii.get('thumburl') or '').split('?')[0], 'stranka': ii.get('descriptionurl'),
                                    'autor': autor(em.get('Artist', {}).get('value'), ii.get('user')),
                                    'licence': bez_html(em.get('LicenseShortName', {}).get('value')),
                                    'licence_url': em.get('LicenseUrl', {}).get('value', '')}
        for p in kus:
            it = info.get(p['soubor']) or info.get(p['soubor'].replace('_', ' '))
            if it and it['nahled'] and it['licence']: p.update(it)
        time.sleep(1)
    out = [p for p in P if p.get('nahled')]
    json.dump(out, open('assets/fotky.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f'fotek {len(out)} (vynecháno obcí, ulic a podobně: {len(vynech)}; bez metadat: {len(P) - len(out)})')
    for p in out: print(f"  {p['q']:>11}  {p['nazev']}  [{p['licence']}, {p['autor'][:40]}]")


if __name__ == '__main__':
    main()
