"""Z web/app.html + web/css + web/js (složí web/sestav.py) a mesto.json vyrobí site/index.html (texty, meta, sitemap).
Pokud existuje složka obce/*.json, vyrobí pro každou obec i site/index_<obec>.html a site/obce/<obec>/og.jpg."""
import html, json, math, os, re, shutil
from urllib.parse import urljoin
from PIL import Image
import geo
from geo import MESTO


def og_obrazek(out='site/og.jpg', W=1200, H=630, dolu=None, latlon=None):
    """náhled pro sdílení (og:image) 1200×630: výřez středu města z letních dlaždic v 0,4 m/px (u základního rozlišení
    o úroveň menší než plné, u detailního o dvě, aby byl výřez stejně velký)"""
    t = json.load(open('site/tiles.json')); base = t['base']
    if dolu is None: dolu = 1 + round(math.log2(0.2 / base['mpp']))
    x, y = geo.to_local(latlon[1], latlon[0]) if latlon else (0, 0)
    c = geo.chunk_of(float(x), float(y)) if latlon else (0, 0)
    s = (t.get('chunks') or {}).get(f'c{c[0]}_{c[1]}', {}).get('summer') if c != (0, 0) else None
    s = s or t['summer']; I = s['Image']
    url = 'site/' + I['Url'].rstrip('/')
    T = int(I['TileSize']); SW, SH = int(I['Size']['Width']), int(I['Size']['Height'])
    lv = max(int(n) for n in os.listdir(url) if n.isdigit()) - dolu; k = 2 ** dolu
    vx, vy, _ = geo.view(x, y, 0)
    cx, cy = (vx - s.get('x0', base['x0'])) / base['mpp'] / k, (s.get('y1', base['y1']) - vy) / base['mpp'] / k
    lw, lh = -(-SW // k), -(-SH // k)
    x0 = int(min(max(cx - W / 2, 0), max(lw - W, 0))); y0 = int(min(max(cy - H / 2, 0), max(lh - H, 0)))
    img = Image.new('RGB', (W, H), (27, 33, 48))
    for i in range(x0 // T, (x0 + W) // T + 1):
        for j in range(y0 // T, (y0 + H) // T + 1):
            f = f'{url}/{lv}/{i}_{j}.webp'
            if os.path.exists(f):
                q = Image.open(f).convert('RGBA'); img.paste(q, (i * T - x0, j * T - y0), q)
    os.makedirs(os.path.dirname(out) or '.', exist_ok=True)
    img.save(out, quality=85)


import sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'web'))
import sestav
SABLONA = sestav.app('web')   # šablona web/app.html s vloženými web/css/*.css a web/js/*.js (ze složky města)


def ikony_a_manifest(M):
    """ikona (izometrická kostka), ikony pro přidání na plochu a manifest: mapu jde přidat na plochu jako aplikaci"""
    from PIL import ImageDraw
    os.makedirs('site', exist_ok=True)
    tvar = [('#6fa84a', [(36, 15), (61, 27.5), (36, 40), (11, 27.5)]), ('#8a6242', [(11, 27.5), (36, 40), (36, 63), (11, 50.5)]),
            ('#684832', [(36, 40), (61, 27.5), (61, 50.5), (36, 63)])]
    def ikona(size, maskable, out):
        S = size * 4; im = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
        if maskable: d.rectangle([0, 0, S, S], fill='#1b2333'); k = S / 72 * 0.72; o = S * 0.14   # maskable: obsah v bezpečné zóně
        else: d.rounded_rectangle([0, 0, S - 1, S - 1], radius=S * 10 / 72, fill='#1b2333'); k = S / 72; o = 0
        for barva, body in tvar: d.polygon([(o + x * k, o + y * k) for x, y in body], fill=barva)
        im.resize((size, size), Image.LANCZOS).save(out, optimize=True)
    if not os.path.exists('site/favicon.svg'):            # vlastní ikony města se nepřepisují
        open('site/favicon.svg', 'w').write('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72"><rect width="72" height="72" rx="10" fill="#1b2333"/>'
                                            + ''.join(f'<path d="M{"L".join(f"{x} {y}" for x, y in b)}z" fill="{c}"/>' for c, b in tvar) + '</svg>')
    for size, maskable, out in [(180, False, 'apple-touch-icon.png'), (192, False, 'icon-192.png'), (512, False, 'icon-512.png'),
                                (192, True, 'icon-maskable-192.png'), (512, True, 'icon-maskable-512.png')]:
        if not os.path.exists(f'site/{out}'): ikona(size, maskable, f'site/{out}')
    json.dump({'name': M['titulek'], 'short_name': M['nazev'], 'description': M['popis'], 'lang': 'cs', 'start_url': './', 'scope': './',
               'display': 'standalone', 'orientation': 'any', 'background_color': '#1b2333', 'theme_color': '#1b2333',
               'icons': [{'src': f'icon-{s}.png', 'sizes': f'{s}x{s}', 'type': 'image/png'} for s in (192, 512)]
                        + [{'src': f'icon-maskable-{s}.png', 'sizes': f'{s}x{s}', 'type': 'image/png', 'purpose': 'maskable'} for s in (192, 512)]},
              open('site/manifest.webmanifest', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
E = lambda t: html.escape(t or '', quote=True)


def postav_stranku(M, html_out='site/index.html', og_cesta='og.jpg', je_obec=False, page_url=None):
    site_url = (M.get('url') or '').rstrip('/')          # plná adresa webu (kvůli og:image a sitemap); prázdné = bez nich
    page_url = page_url or (site_url + '/' if site_url else '')
    obrazek_url = urljoin(site_url + '/', og_cesta) if site_url else ''
    mhd = M.get('mhd') or {}
    pohled = M.get('pohled')
    strom = M.get('vanocni_strom')
    if isinstance(strom, list) and strom and isinstance(strom[0], list): strom = strom[0]      # víc stromů: náhled podle prvního
    fill = {
        'TITULEK': E(M['titulek']), 'POPIS': E(M['popis']), 'MESTO': E(M['nazev']), 'H1_A': E(M['h1'][0]), 'H1_B': E(M['h1'][1]),
        'PODTITUL': E(M['podtitul']),
        'HLASENI': 'true' if M.get('hlaseni') else 'false',
        'VITR': 'true' if M.get('vitr') else 'false',
        'POCASI': 'true' if M.get('pocasi') else 'false',
        'ZPRAVY': 'true' if (M.get('zpravy_web') or {}).get('url') else 'false',   # aktuality z webu města (functions/api/zpravy.js)
        'VYSTRAHY_OBLASTI': json.dumps(M.get('vystrahy_oblasti') or [x for x in (M.get('nazev'), M.get('kraj') or (M.get('doprava') or {}).get('kraj')) if x], ensure_ascii=False),   # výstrahy ČHMÚ: ORP a kraj podle <areaDesc>
        'LETADLA': 'true' if M.get('letadla', False) else 'false',
        'JIZDA': 'true' if M.get('jizda') else 'false',
        'TRASY': 'true' if os.path.exists('assets/trasy.json') else 'false',
        'HISTORIE': 'true' if M.get('historie') else 'false',   # srovnání s leteckým snímkem z 50. let (site/srovnani.html)   # značené trasy z OSM (nastroje/trasy.py)          # 3D jízda (nastroje/jizda.py -> site/jizda.html)
        'PLUHY': 'true' if M.get('pluhy', False) else 'false',
        'NASTUPISTE': 'true' if M.get('nastupiste', False) else 'false',
        'MHD': 'true' if mhd.get('gtfs') or os.path.exists('site/mhd.json') else 'false',   # mhd.json vyrábí mhd.py jen s GTFS
        'POHLED': json.dumps(pohled if isinstance(pohled, list) and len(pohled) >= 2 else None),
        'DOMU_CELEK': 'true' if M.get('domu_celek') else 'false',
        'STROM': json.dumps(strom if isinstance(strom, list) and len(strom) == 2 else None),
        'XMAS_LL': json.dumps((lambda v: v if v and isinstance(v[0], list) else [v] if v else [])(M.get('vanocni_strom'))),   # vánoční stromy [[lat, lon], ...]
        'KLUZISTE': json.dumps(M.get('kluziste') or []),
        'STANKY': json.dumps(M.get('vanocni_stanky') or []),
        'NAMESTI_SEKTOR': json.dumps(M.get('namesti_sektor')),          # výseč náměstí u stromu pro dav [od, do] ve ° od východu (bez parkoviště a silnice)
        'MHD_ZDROJ_KRATKY': json.dumps((M.get('mhd') or {}).get('zdroj', 'dopravce').split(' (')[0]),   # PID do poznámky v kartě spoje
        'HYDRO': 'true' if (M.get('hydro') or {}).get('stanice') else 'false',          # vodní stav ČHMÚ (functions/api/hydro.js)
        'KALENDAR': 'true' if (M.get('kalendar_web') or {}).get('url') or os.path.exists('assets/zapasy.json') else 'false',   # akce z infocentra a zápasy
        'VYLUKY': 'true' if 'pid.cz' in json.dumps(M.get('mhd') or {}) else 'false',   # výluky PID (functions/api/vyluky.js)
        'AUTOBUS': json.dumps(M.get('autobus') or 'liberec'),            # nátěr autobusů: liberec (bílý se zeleným a žlutým pruhem), pid (šedo-červený PID)
        'VANOCE': json.dumps(M.get('vanoce') or None),                 # termín vánoční vrstvy {"od": "11-11", "do": "01-06"} (assets/vanoce.json)
        'OBEC': json.dumps(M.get('nazev') if je_obec else None, ensure_ascii=False),
        'VLAK': json.dumps({'vychozi': (M.get('vlak') or {}).get('vychozi', 'regionova') if isinstance(M.get('vlak'), dict) else M.get('vlak', 'regionova'), 'linky': M['vlak'].get('linky', {}) if isinstance(M.get('vlak'), dict) else {}}),
        'DOPRAVA_ZDROJ': ', intenzity dopravy © <a href="https://www.rsd.cz/silnice-a-dalnice/scitani-dopravy" target="_blank" rel="noopener">ŘSD ČR</a> (Celostátní sčítání dopravy)' if M.get('doprava') else '',
        'RUIAN_ZDROJ': ', typy budov z RÚIAN' if os.path.exists('assets/ruian_budovy.json') else '',
        'VITR_ZDROJ': ', ' + ('počasí a vítr' if M.get('pocasi') and M.get('vitr') else 'počasí' if M.get('pocasi') else 'vítr') + ' © <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a> (CC BY 4.0)' if M.get('vitr') or M.get('pocasi') else '',
        'PLUHY_ZDROJ': ', sypače zimní údržby © <a href="https://udrzba.rsd.cz/" target="_blank" rel="noopener">ŘSD ČR</a>' if M.get('pluhy', False) else '',
        'LETADLA_ZDROJ': ', letadla © <a href="https://adsb.lol/" target="_blank" rel="noopener">adsb.lol</a> (ODbL) a&nbsp;<a href="https://adsb.fi/" target="_blank" rel="noopener">adsb.fi</a>' if M.get('letadla', False) else '',
        'MHD_ZDROJ': f', jízdní řády MHD{" a polohy vozidel" if mhd.get("realtime") else ""} © <a href="{E(mhd["zdroj_url"])}" target="_blank" rel="noopener">{E(mhd["zdroj"])}</a>'
                     if mhd.get('gtfs') and mhd.get('zdroj') else '',
        'MHD_RT': json.dumps(mhd.get('realtime') if mhd.get('gtfs') else None),    # GTFS-RT vehicle_positions (functions/api/mhd.js)
    }
    app = re.sub(r'\{\{(\w+)\}\}', lambda m: fill[m.group(1)], SABLONA)
    og = f'''<meta property="og:image" content="{E(obrazek_url)}">
<meta property="og:url" content="{E(page_url)}">
<link rel="canonical" href="{E(page_url)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="{E(obrazek_url)}">
''' if site_url else ''
    LD = json.dumps({'@context': 'https://schema.org', '@type': 'WebApplication', 'name': M['titulek'], 'description': M['popis'],
                     'inLanguage': 'cs', 'applicationCategory': 'TravelApplication', 'operatingSystem': 'Web',
                     'spatialCoverage': {'@type': 'Place', 'name': M['nazev']},
                     'isBasedOn': ['https://www.openstreetmap.org/', 'https://overturemaps.org/', 'https://geoportal.cuzk.cz/']},
                    ensure_ascii=False)
    head = f'''<!doctype html>
<html lang="cs">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#1b2333">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<link rel="manifest" href="manifest.webmanifest">
<meta name="apple-mobile-web-app-title" content="{E(M['nazev'])}">
<meta property="og:title" content="{E(M['titulek'])}">
<meta property="og:description" content="{E(M['popis'])}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="{E(M['titulek'])}">
<meta property="og:locale" content="cs_CZ">
{og}<script type="application/ld+json">{LD}</script>
<style>:root{{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}}body{{margin:0;font:14px system-ui}}[hidden]{{display:none!important}}</style>
'''
    body_start = app.index('</style>') + len('</style>')
    page = head + app[:body_start] + '\n</head>\n<body>\n' + app[body_start:] + '\n</body>\n</html>\n'
    open(html_out, 'w', encoding='utf-8').write(page)
    print(html_out, len(page))
    # og:image: vyrobí se jednou ze středu města/obce; vlastní soubor (1200×630) se nepřepisuje
    og_out = f'site/{og_cesta}'
    latlon = (pohled[:2] if isinstance(pohled, list) and len(pohled) >= 2 else strom if isinstance(strom, list) and len(strom) == 2 else None)
    if (site_url or je_obec) and not os.path.exists(og_out) and os.path.exists('site/tiles.json'):
        og_obrazek(og_out, latlon=latlon); print(og_out)


ikony_a_manifest(MESTO)
postav_stranku(MESTO)
SITE_URL = (MESTO.get('url') or '').rstrip('/')
if os.path.exists('assets/trasy.json'): shutil.copy('assets/trasy.json', 'site/trasy.json')   # vrstva tras v prohlížeči
shutil.copy('web/ceny_paliv.js', 'site/ceny_paliv.js')
for _f in os.listdir('web'):                           # moduly prohlížeče (pohlednice, přelet, Wikipedie, deník, zvuky): web/mapa_*.js -> site/
    if _f.startswith('mapa_') and _f.endswith('.js'): shutil.copy(f'web/{_f}', f'site/{_f}')
if (MESTO.get('zpravy_web') or {}).get('url'):   # adresa seznamu aktualit pro functions/api/zpravy.js (funkce jinou nestáhne)
    json.dump({k: MESTO['zpravy_web'][k] for k in ('url', 'zdroj') if MESTO['zpravy_web'].get(k)}, open('site/zpravy_zdroj.json', 'w', encoding='utf-8'), ensure_ascii=False)
if (MESTO.get('hydro') or {}).get('stanice'):    # stanice ČHMÚ pro functions/api/hydro.js
    json.dump({'stanice': MESTO['hydro']['stanice']}, open('site/hydro_zdroj.json', 'w', encoding='utf-8'))
if (MESTO.get('kalendar_web') or {}).get('url'):   # adresa kalendáře akcí pro functions/api/kalendar.js
    json.dump({k: MESTO['kalendar_web'][k] for k in ('url', 'zdroj') if MESTO['kalendar_web'].get(k)}, open('site/kalendar_zdroj.json', 'w', encoding='utf-8'), ensure_ascii=False)
for _f in ('akce_mista.json', 'zapasy.json'):      # místa konání akcí (nastroje/akce_mista.py) a ručně vedené domácí zápasy
    if os.path.exists(f'assets/{_f}'): shutil.copy(f'assets/{_f}', f'site/{_f}')
if os.path.exists('site/mhd.json'):                # linky v mapě pro výluky PID (functions/api/vyluky.js)
    json.dump({'linky': sorted({r[0] for r in json.load(open('site/mhd.json', encoding='utf-8'))['routes']})}, open('site/vyluky_zdroj.json', 'w', encoding='utf-8'))
if os.path.exists('assets/sluzby.json'): shutil.copy('assets/sluzby.json', 'site/sluzby.json')   # pítka a WC (nastroje/sluzby.py)
if os.path.exists('assets/akce.json'): shutil.copy('assets/akce.json', 'site/akce.json')         # akce ve městě (program z webu města), web/mapa_akce.js
if os.path.exists('assets/hadanky.json'): shutil.copy('assets/hadanky.json', 'site/hadanky.json')   # hádanky v deníku (jen ověřené texty)   # ceny paliv z mBenzin.cz (functions/api/ceny.js) k pumpám, mapa i 3D jízda
shutil.copy('web/uzavirky.js', 'site/uzavirky.js')   # uzavírky: načtení a dopočet úseků z oznámení (mapa i 3D jízda)
shutil.copy('web/uzavirky_editor.js', 'site/uzavirky_editor.js')   # editor uzavírek pro správce (index.html?admin)


def srovnani():
    """site/srovnani.html: historická ortofotomapa z 50. let (CENIA, CC BY 4.0) proti dnešnímu ortofotu ČÚZK.
    Obě služby vydávají S-JTSK (EPSG:5514); prohlížeč přepočítává lat/lon afinně, koeficienty se tu napasují na území mapy."""
    import numpy as np
    from pyproj import Transformer
    lo0, lo1, la0, la1 = geo.bbox_lonlat(2000)
    lon, lat = np.meshgrid(np.linspace(lo0, lo1, 12), np.linspace(la0, la1, 12)); lon, lat = lon.ravel(), lat.ravel()
    X, Y = Transformer.from_crs(4326, 5514, always_xy=True).transform(lon, lat)
    M_ = np.c_[lon, lat, np.ones_like(lon)]
    a = np.linalg.lstsq(M_, X, rcond=None)[0]; d = np.linalg.lstsq(M_, Y, rcond=None)[0]
    chyba = float(np.max(np.hypot(M_ @ a - X, M_ @ d - Y)))
    stred = geo.to_lonlat(0.0, 0.0)
    t = (open('web/srovnani.html', encoding='utf-8').read().replace('{{MESTO}}', html.escape(MESTO['nazev'])).replace('{{TITULEK}}', html.escape(MESTO['titulek']))
         .replace('{{SJTSK}}', json.dumps([round(float(v), 4) for v in (*a, *d)])).replace('{{STRED}}', json.dumps([round(float(stred[1]), 6), round(float(stred[0]), 6)])))
    open('site/srovnani.html', 'w', encoding='utf-8').write(t)
    print('site/srovnani.html', f'(afinní S-JTSK, chyba do {chyba:.1f} m)')


if MESTO.get('historie'): srovnani()
open('site/robots.txt', 'w').write('User-agent: *\nAllow: /\n' + (f'Sitemap: {SITE_URL}/sitemap.xml\n' if SITE_URL else ''))
if SITE_URL:
    open('site/sitemap.xml', 'w').write(f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>{SITE_URL}/</loc></url></urlset>\n')
if MESTO.get('hlaseni'):                              # volitelná administrace hlášení (server v hlaseni/)
    open('site/admin.html', 'w', encoding='utf-8').write(open('hlaseni/admin.html', encoding='utf-8').read())

if os.path.isdir('obce'):
    for f in sorted(os.listdir('obce')):
        if not f.endswith('.json'): continue
        slug = f[:-5]
        obec = json.load(open(f'obce/{f}', encoding='utf-8'))
        obec_url = obec.get('url') or (urljoin(SITE_URL + '/', f'index_{slug}.html') if SITE_URL else None)
        postav_stranku({**MESTO, **obec, 'url': SITE_URL}, html_out=f'site/index_{slug}.html', og_cesta=f'obce/{slug}/og.jpg', je_obec=True, page_url=obec_url)
