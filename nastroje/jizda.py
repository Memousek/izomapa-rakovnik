"""3D jízda po mapě (site/jizda.html): připraví data a modul, který staví svět stejným kódem jako render.html.

python nastroje/jizda.py            všechny čtverce, všechna roční období
python nastroje/jizda.py --rychle   jen léto (rychlejší první pokus)
python nastroje/jizda.py --stranka  jen stránka a svet.js, data čtverců se nemění

-> site/jizda/svet.js            stavba světa čtverce: kód render.html (terén, budovy s okny, střechy, stromy, rekvizity, mosty)
                                 bez izometrické kamery a dlaždic; render.html se nemění, kód se z něj vyřízne při každé stavbě
-> site/jizda/c<i>_<j>/          scene.json (jen objekty uvnitř čtverce, bez pásu sousedů), ground_<období>.webp, lightmap.webp
-> site/jizda/three.module.js    three.js z node_modules (bez CDN)
-> site/jizda.html               stránka z web/jizda.html (texty z mesto.json)
Spouštět z kořene repa po ./postav.sh (potřebuje build/**/scene.json a ground_*.png).
"""
import glob, html, json, os, shutil, sys, time
sys.path.insert(0, '.')
import geo
from PIL import Image
Image.MAX_IMAGE_PIXELS = None

RYCHLE = '--rychle' in sys.argv
JEN_STRANKA = '--stranka' in sys.argv     # jen site/jizda.html a svet.js (po úpravě web/jizda.html nebo render.html)
OBDOBI = ['summer'] if RYCHLE else ['spring', 'summer', 'autumn', 'winter']
GROUND_PX = 4096          # podklad terénu (originál 8000 px): ~0,56 m na pixel, pro pohled zblízka dost a stáhne se rychle
OUT = 'site/jizda'


ORTO_M = 0.4               # build/orto04: dlaždice ortofota ČÚZK po 0,4 m/px z nastroje/strechy.py (CC BY 4.0)


def orto_ctverec(c, dst):
    """letecký snímek pro čtverec c: stejný rozsah jako podklad terénu (sever nahoře), GROUND_PX; bez dlaždic nic"""
    o = f'{dst}/orto.webp'
    fs = glob.glob('build/orto04/*.jpg')
    if not fs or (os.path.exists(o) and os.path.getmtime(o) > max(os.path.getmtime(f) for f in fs)): return
    cx, cy = geo.chunk_center(c); H = geo.HALF; n = int(round(2 * H / ORTO_M))
    src = geo.chunk_dir(c)
    img = Image.open(f'{src}/ground_summer.png').convert('RGB').resize((n, n), Image.BILINEAR) if os.path.exists(f'{src}/ground_summer.png') else Image.new('RGB', (n, n))
    for f in fs:
        x, y, wh = os.path.basename(f)[:-4].split('_'); w, h = map(int, wh.split('x')); x, y = float(x), float(y)
        px, py = round((x - (cx - H)) / ORTO_M), round(((cy + H) - y) / ORTO_M)
        if px >= n or py >= n or px + w <= 0 or py + h <= 0: continue
        img.paste(Image.open(f).convert('RGB'), (px, py))
    img.resize((GROUND_PX, GROUND_PX), Image.LANCZOS).save(o, quality=80, method=4)


def svet_js():
    src = open('render.html', encoding='utf-8').read()

    def jednou(s, co, za):
        n = s.count(co)
        if n != 1: raise SystemExit(f'render.html se změnil: „{co[:60]}…“ nalezeno {n}× (uprav nastroje/jizda.py)')
        return s.replace(co, za)

    a = src.index('const scene = await (await fetch(`${DIR}/scene.json`)).json();')
    b = src.index('// ---------- rozsah obrázku ----------')
    kod = src[a:b]
    kod = 'const XMAS = false;   // vánoční vrstva dlaždic (render.html mode=xmas) ve 3D není' + chr(10) + kod
    r0 = kod.index('const renderer = new THREE.WebGLRenderer('); r1 = kod.index('document.body.appendChild(renderer.domElement);')
    kod = kod[:r0] + kod[r1 + len('document.body.appendChild(renderer.domElement);'):]           # renderer dodá stránka
    kod = jednou(kod, 'new THREE.WebGLRenderTarget(8192, 8192, { depthTexture: new THREE.DepthTexture(8192, 8192, THREE.FloatType) })',
                 'new THREE.WebGLRenderTarget(O.stin, O.stin, { depthTexture: new THREE.DepthTexture(O.stin, O.stin, THREE.FloatType) })')   # stínová mapa za běhu menší
    kod = jednou(kod, "await import('./assets/custom_models.js')",   # bez vlastních modelů žádný požadavek (jinak 404 / stará odpověď v mezipaměti)
                 "await import('./custom_models.js')" if os.path.exists('assets/custom_models.js') else 'await Promise.resolve({})')
    kod = jednou(kod, '`${DIR}/ground_${SEASON}.png`', '`${DIR}/ground_${SEASON}.webp`')
    # letecký snímek ČÚZK na terénu (orto.webp, viz orto_ctverec): jen mimo zimu (snímek je letní), plynulé filtrování
    kod = jednou(kod, 'const tex = await load(`${DIR}/ground_${SEASON}.webp`);', '''const tex = await load(`${DIR}/ground_${SEASON}.webp`);
  const texO = O.orto && SEASON !== 'winter' ? await load(`${DIR}/orto.webp`).catch(() => null) : null;
  if (texO) { texO.magFilter = THREE.LinearFilter; texO.minFilter = THREE.LinearMipmapLinearFilter; texO.generateMipmaps = true; texO.anisotropy = 8; texO.needsUpdate = true; }''')
    kod = jednou(kod, '`${DIR}/lightmap.png`', '`${DIR}/lightmap.webp`')
    # pixelový rozptyl podle pixelů obrazovky (gl_FragCoord) je v mapě pixel-art, ve 3D z něj je šum, který se při pohybu třpytí
    kod = jednou(kod, 'l = floor(l * 5.0 + hash(floor(gl_FragCoord.xy)) * 0.9) / 5.0;', 'l = l * 0.92;')
    kod = jednou(kod, '&& hash(floor(gl_FragCoord.xy)) > 0.6) col *= 0.93;', '&& hash(floor(vW.xz * 4.0)) > 0.6) col *= 0.93;')
    # počasí ve 3D na terénu: mokrý asfalt po dešti (tmavší, v ostrém úhlu odráží nebe) a postupně bílá zem při sněžení
    kod = jednou(kod, '{ uTex: { value: tex }, uLmap: { value: lmap } }', '{ uTex: { value: tex }, uLmap: { value: lmap }, uMokro: O.uMokro || { value: 0 }, uSnih: O.uSnih || { value: 0 }, uTexO: { value: texO }, uOrto: { value: texO ? 1 : 0 } }')
    kod = jednou(kod, 'uniform sampler2D uTex, uLmap;', 'uniform sampler2D uTex, uLmap, uTexO; uniform float uMokro, uSnih, uOrto;')
    # ---- kvalita obrazu zblízka (mapa je kreslená pro pohled shora po 0,2 m na pixel, chodec se dívá z 1,7 m) ----
    # detailní textura (stránka: O.uDet, dlaždicový šum s mipmapami; O.uDetS = 0 vše vypne) pro všechny materiály světa
    kod = jednou(kod, 'uniform float uLights; uniform vec2 uOff;', 'uniform float uLights; uniform vec2 uOff; uniform sampler2D uDet; uniform float uDetS; uniform float uOkna;')
    kod = jednou(kod, 'uOff: { value: new THREE.Vector2(OFFX, -OFFY) }, uClip: CLIP, ...extra,',   # uClip: upstream (ořez dlaždic), ve 3D nevadí
                 'uOff: { value: new THREE.Vector2(OFFX, -OFFY) }, uClip: CLIP, uDet: O.uDet || { value: null }, uDetS: O.uDetS || { value: 0 }, uOkna: O.uOkna || { value: 1 }, ...extra,')
    # okna v noci: podíl rozsvícených podle hodin (stránka: O.uOkna, 1 = jako v mapě, méně = k půlnoci zhasínají)
    kod = jednou(kod, 'if (hh > 0.52) e = vec3(1.0, 0.80, 0.46)', 'if (hh > 1.0 - 0.48 * uOkna) e = vec3(1.0, 0.80, 0.46)')
    kod = jednou(kod, 'else if (hh > 0.44) e = vec3(0.62, 0.74, 1.0)', 'else if (hh > 1.0 - 0.56 * uOkna) e = vec3(0.62, 0.74, 1.0)')
    # stíny: stínová mapa má texel přes půl metru, ostré porovnání dělá na hranách stínu zuby a trojúhelníky (hlavně na fasádách).
    # Čtyři vzorky s bilineární vahou a práh 0,5 dají hladký obrys; stín zůstane ostrý (pixel-art), jen bez schodů.
    kod = jednou(kod, 'return (c.z - 0.00025 > texture2D(uShadow, c.xy).r) ? 0.0 : 1.0;', '''if (uDetS < 0.01) return (c.z - 0.00025 > texture2D(uShadow, c.xy).r) ? 0.0 : 1.0;
  vec2 sz = vec2(textureSize(uShadow, 0)), t = c.xy * sz - 0.5, ti = floor(t), tf = t - ti, b = (ti + 0.5) / sz, e = 1.0 / sz;
  float z = c.z - 0.00025;
  float s00 = z > texture2D(uShadow, b).r ? 0.0 : 1.0, s10 = z > texture2D(uShadow, b + vec2(e.x, 0.0)).r ? 0.0 : 1.0;
  float s01 = z > texture2D(uShadow, b + vec2(0.0, e.y)).r ? 0.0 : 1.0, s11 = z > texture2D(uShadow, b + e).r ? 0.0 : 1.0;
  return mix(mix(s00, s10, tf.x), mix(s01, s11, tf.x), tf.y) > 0.5 ? 1.0 : 0.0;''')
    # terén: podklad má 0,56 m na pixel, zblízka je to rozmazaná šmouha. Kde se texel roztáhne přes víc pixelů obrazovky:
    # 1) ostřejší přechod mezi texely (hrana silnice, štěrk × asfalt) a jeho okraj rozhozený šumem, aby nebyl schodovitý,
    # 2) jemná kresba povrchu podle barvy: zrno asfaltu a dlažby, trsy trávy, kamínky štěrku. V dálce zmizí sama (mipmapy).
    # počasí ve 3D na terénu: mokrý asfalt po dešti (tmavší, v ostrém úhlu odráží nebe) a postupně bílá zem při sněžení
    kod = jednou(kod, 'vec3 col = texture2D(uTex, vUv).rgb;', '''vec3 col;
      if (uDetS > 0.01) {
        vec2 gx = dFdx(vUv), gy = dFdy(vUv), tn = vec2(textureSize(uTex, 0));
        float mag = min(length(gx * tn), length(gy * tn));         // texelů na pixel obrazovky (kratší osa); < 1 = zvětšení
        float bl = 1.0 - smoothstep(0.12, 0.6, mag);
        vec4 d1 = texture2D(uDet, vW.xz * 0.43), d2 = texture2D(uDet, vW.xz * 0.057 + 0.31);
        vec2 uv = vUv + ((vec2(d1.g, d1.a) - 0.5) * 0.14 + (vec2(d2.a, d2.g) - 0.5) * 0.16) * bl / tn;   // hrana ploch nepatrně rozhozená
        col = textureGrad(uTex, uv, gx, gy).rgb;
        if (bl > 0.01) {                                           // zvětšený podklad: hladký přechod mezi plochami stáhnout na úzkou hranu
          vec2 e = 0.75 / tn;                                      // (vrstevnice bilineárního pole je rovná, schody texelů nevzniknou)
          vec3 a0 = textureGrad(uTex, uv + e, gx, gy).rgb, a1 = textureGrad(uTex, uv - e, gx, gy).rgb;
          vec3 a2 = textureGrad(uTex, uv + vec2(e.x, -e.y), gx, gy).rgb, a3 = textureGrad(uTex, uv + vec2(-e.x, e.y), gx, gy).rgb;
          vec3 W = vec3(0.3, 0.59, 0.11), lo = a0, hi = a0;
          if (dot(a1, W) < dot(lo, W)) lo = a1; if (dot(a1, W) > dot(hi, W)) hi = a1;
          if (dot(a2, W) < dot(lo, W)) lo = a2; if (dot(a2, W) > dot(hi, W)) hi = a2;
          if (dot(a3, W) < dot(lo, W)) lo = a3; if (dot(a3, W) > dot(hi, W)) hi = a3;
          vec3 dh = hi - lo; float dd = dot(dh, dh);
          if (dd > 0.0008) {
            float q = clamp(dot(col - lo, dh) / dd, 0.0, 1.0), sw = mix(0.5, 0.1, bl);
            col = mix(col, mix(lo, hi, smoothstep(0.5 - sw, 0.5 + sw, q)), bl);
          }
        }
        float mx = max(max(col.r, col.g), col.b), sat = mx - min(min(col.r, col.g), col.b);
        float zel = step(col.r, col.g) * step(col.b, col.g) * smoothstep(0.05, 0.14, sat);   // tráva, louka, pole
        float zpev = 1.0 - smoothstep(0.07, 0.16, sat);                                        // asfalt, dlažba, beton
        float snih = smoothstep(0.78, 0.9, mx) * zpev;                                         // zasněžená zem: jen jemně
        float zrno = (d1.r - 0.5) * 2.0, flek = (d2.g - 0.5) * 2.0, trs = (d1.g - 0.5) * 2.0, kam = (d1.b - 0.5) * 2.0;
        float k = zpev * (zrno * 0.07 + flek * 0.045 + kam * 0.10) * (1.0 - snih * 0.7)
                + zel * (trs * 0.15 + zrno * 0.08 + flek * 0.045)
                + (1.0 - zpev) * (1.0 - zel) * (zrno * 0.10 + kam * 0.14 + flek * 0.05);     // štěrk, písek, hlína
        col *= 1.0 + k * uDetS;
        col.rg += zel * trs * vec2(0.012, 0.02) * uDetS;                                       // tráva: trsy i v odstínu
      } else col = texture2D(uTex, vUv).rgb;
      if (uOrto > 0.5) {                                         // letecký snímek ČÚZK: zblízka ostrá kresba, do dálky skutečný povrch (pole, louky, plochy)
        vec3 o = texture2D(uTexO, vUv).rgb; float lu = dot(o, vec3(0.3, 0.59, 0.11));
        o = clamp(mix(vec3(lu), o, 1.3) * 1.08, 0.0, 1.0);
        col = mix(col, o, 0.2 + 0.72 * smoothstep(14.0, 150.0, length(cameraPosition - vW)));
      }
      if (uMokro > 0.01) {                                       // šedé zpevněné plochy zmoknou nejvíc, tráva a pole málo
        float sat = max(max(col.r, col.g), col.b) - min(min(col.r, col.g), col.b), lum = dot(col, vec3(0.3, 0.59, 0.11));
        float asf = sat < 0.16 ? 1.0 : 0.25;                       // zpevněné plochy (asfalt, dlažba) zmoknou nejvíc
        float fr = pow(1.0 - clamp(normalize(cameraPosition - vW).y, 0.0, 1.0), 3.0);
        col = mix(col, col * 0.5 + vec3(0.6, 0.66, 0.75) * fr * 0.9, uMokro * asf);
      }
      if (uSnih > 0.01) col = mix(col, vec3(0.92, 0.94, 0.98), uSnih * smoothstep(0.6, 0.9, normalize(vN).y) * 0.9);   // sníh na rovině, svahy méně''')
    # fasády: jemná struktura omítky, okna s rámem, příčkami a světlejším sklem nahoře (odraz nebe). Rám se v dálce rozplyne (bez třpytu).
    kod = jednou(kod, 'float gWin;  ', 'float gWin, gU, gHW; vec3 gF;  ')
    kod = jednou(kod, '{ gWin = floor(q) + sp * 17.0; return 1.0; }', '{ gWin = floor(q) + sp * 17.0; gU = (fract(q) - 0.5) * sp; gHW = w * 0.5; return 1.0; }')
    kod = jednou(kod, 'gWin = -1.0;', 'gWin = -1.0; gU = 0.0; gHW = -1.0; gF = vec3(0.0, -1.0, 0.0);\n    if (uDetS > 0.01) { vec4 dw = texture2D(uDet, vec2(vA.x, vW.y) * 0.83); col *= 1.0 + uDetS * ((dw.r - 0.5) * 0.07 + (dw.g - 0.5) * 0.04); }')
    for co, f in [('w = win(u, len, 3.0, 1.2) > 0.5 && f > 0.9 && f < 2.2 && v > 0.6;', 'f, 0.9, 2.2'),      # rodinný dům
                  ('w = win(u, len, 2.4, 1.5) > 0.5 && f > 0.8 && f < 2.2 && v > 2.0;', 'f, 0.8, 2.2'),      # panelák
                  ('w = win(u, len, 3.4, 2.3) > 0.5 && v > 0.45 && v < 2.8;', 'v, 0.45, 2.8'),               # činžák: výlohy
                  ('w = win(u, len, 2.3, 1.05) > 0.5 && f > 0.95 && f < 2.5;', 'f, 0.95, 2.5')]:             # činžák: patra
        kod = jednou(kod, co, co + f' gF = vec3({f});')
    kod = jednou(kod, 'if (w) col = vec3(0.30, 0.38, 0.50) + (hh > 0.85 ? vec3(0.30, 0.28, 0.14) : vec3(0.0));',
                 '''if (w) col = vec3(0.30, 0.38, 0.50) + (hh > 0.85 ? vec3(0.30, 0.28, 0.14) : vec3(0.0));
    if (w && gHW > 0.0 && uDetS > 0.01) {
      bool sv = gF.y >= 0.0;
      float ex = gHW - abs(gU), ey = sv ? min(gF.x - gF.y, gF.z - gF.x) : 1.0, fy = sv ? (gF.x - gF.y) / (gF.z - gF.y) : 0.5;
      col *= 0.84 + 0.34 * fy;
      bool ram = min(ex, ey) < 0.075 || (gHW > 0.5 && abs(gU) < 0.03) || (sv && gF.z - gF.y > 1.25 && abs(fy - 0.64) < 0.03 / (gF.z - gF.y));
      float vid = clamp(0.045 / max(fwidth(u) + fwidth(v), 1e-4), 0.0, 1.0);    // rám užší než pixel se rozplyne
      if (ram) col = mix(col, vec3(0.93, 0.92, 0.89), vid);
    }''')
    return ('// VYGENEROVÁNO nastroje/jizda.py z render.html – neupravovat ručně (změny patří do render.html)\n'
            'export async function postavCtverec(THREE, renderer, O) {\n'
            "const PARAMS = {}, MPP = 0.2, TILE = 1024, PAD = 4, ALPHA = false, LIGHTS = !!O.svetla, SKIRT = 28;\n"
            'const SEASON = O.obdobi, SEASON_ID = { spring: 0, summer: 1, autumn: 2, winter: 3 }[SEASON], DIR = O.dir;\n'
            "let SKIRT_EDGES = 'nsew';\n"
            'const BG = [27 / 255, 35 / 255, 51 / 255];\n'
            + kod +
            '\nreturn { world, allMats, scene, camDir };\n}\n')


def vnitrek(scene):
    """jen objekty uvnitř čtverce: pás sousedů u švu kreslí soused sám (ve 3D by se zdvojil)"""
    H = scene['half']
    uvnitr = lambda x, y: abs(x) <= H and abs(y) <= H
    def stred(p): return sum(q[0] for q in p) / len(p), sum(q[1] for q in p) / len(p)
    scene['buildings'] = [b for b in scene['buildings'] if uvnitr(*stred(b['p']))]
    scene['trees'] = [t for t in scene['trees'] if uvnitr(t[0], t[1])]
    scene['cars'] = [c for c in scene['cars'] if uvnitr(c[0], c[1])]   # zaparkovaná auta jen na parkovištích (mesto.json auta_u_krajnice)
    for k, v in scene['props'].items(): scene['props'][k] = [q for q in v if uvnitr(q[0], q[1])]
    scene['ms'] = 0; scene.pop('hext', None)        # bez neviditelného terénu sousedů
    return scene


def main():
    os.makedirs(OUT, exist_ok=True)
    open(f'{OUT}/svet.js', 'w', encoding='utf-8').write(svet_js())
    shutil.copy('node_modules/three/build/three.module.min.js', f'{OUT}/three.module.js')
    for f in os.listdir('web'):                               # moduly 3D režimu (vozidla, lidé…): web/jizda_*.js -> site/jizda/
        if f.startswith('jizda_') and f.endswith('.js'): shutil.copy(f'web/{f}', f'{OUT}/{f[6:]}')
    # hotové modely aut do garáže (glTF, jizda/vozidla.js HOTOVE) a jejich načítání (GLTFLoader z three, cesty jako v examples/jsm)
    shutil.copytree('web/jizda_modely', f'{OUT}/modely', dirs_exist_ok=True)
    for f in ('loaders/GLTFLoader.js', 'utils/BufferGeometryUtils.js'):
        os.makedirs(os.path.dirname(f'{OUT}/three/{f}'), exist_ok=True)
        shutil.copy(f'node_modules/three/examples/jsm/{f}', f'{OUT}/three/{f}')
    if os.path.exists('assets/custom_models.js'): shutil.copy('assets/custom_models.js', f'{OUT}/custom_models.js')
    else: open(f'{OUT}/custom_models.js', 'w').write('// město nemá vlastní modely (assets/custom_models.js)\nexport {};\n')
    if os.path.exists('assets/znacky.json'): shutil.copy('assets/znacky.json', f'{OUT}/znacky.json')   # dopravní značky z OSM (nastroje/znacky.py)
    # zajímavá místa pro mapu (klávesa M): dominanty, příběhy míst, obce; jen název a poloha
    mista = []
    if os.path.exists('assets/dominanty.json'):
        mista += [{'nazev': d['name'], 'lat': d['lat'], 'lon': d['lon'], 'druh': 'dominanta'} for d in json.load(open('assets/dominanty.json', encoding='utf-8')) if d.get('name') and d.get('lat')]
    if os.path.exists('mista.json'):
        mista += [{'nazev': d['nazev'], 'lat': d['lat'], 'lon': d['lon'], 'druh': 'misto'} for d in json.load(open('mista.json', encoding='utf-8')) if d.get('nazev')]
    if os.path.isdir('obce'):
        for f in sorted(os.listdir('obce')):
            if not f.endswith('.json'): continue
            o = json.load(open(f'obce/{f}', encoding='utf-8'))
            if o.get('pohled') and o.get('nazev'): mista.append({'nazev': o['nazev'], 'lat': o['pohled'][0], 'lon': o['pohled'][1], 'druh': 'obec'})
    json.dump(mista, open(f'{OUT}/mista.json', 'w', encoding='utf-8'), ensure_ascii=False)
    # uzavírky silnic: ruční + automatické z webu města (nastroje/uzavirky.py), prošlé se sem nedostanou, platnost hlídá i prohlížeč
    sys.path.append('nastroje')
    import uzavirky as _uz
    uz = _uz.zapsat()
    if uz: print('uzavírek', len(uz))
    for c in [] if JEN_STRANKA else sorted(geo.CHUNKS):
        src, dst = geo.chunk_dir(c), f'{OUT}/c{c[0]}_{c[1]}'
        if not os.path.exists(f'{src}/scene.json'): print('chybí scéna', c); continue
        os.makedirs(dst, exist_ok=True)
        sc = vnitrek(json.load(open(f'{src}/scene.json')))
        json.dump(sc, open(f'{dst}/scene.json', 'w'), separators=(',', ':'))
        for s in OBDOBI:
            f, o = f'{src}/ground_{s}.png', f'{dst}/ground_{s}.webp'
            if os.path.exists(f) and (not os.path.exists(o) or os.path.getmtime(o) < os.path.getmtime(f)):
                Image.open(f).convert('RGB').resize((GROUND_PX, GROUND_PX), Image.LANCZOS).save(o, quality=88, method=4)
        if os.path.exists(f'{src}/lightmap.png'): Image.open(f'{src}/lightmap.png').convert('RGB').save(f'{dst}/lightmap.webp', quality=80)
        orto_ctverec(c, dst)                                  # letecký snímek na terén (stránka: Grafika → Letecký snímek)
        # chodníky a stezky (prep.py walks: footway, path, pedestrian, cycleway) ve světových souřadnicích pro chodce
        cx, cy = geo.chunk_center(c); info = json.load(open(f'{src}/info_src.json'))
        H = geo.HALF
        walks = [[[round(x + cx, 1), round(y + cy, 1), z] for x, y, z in l] for l in info.get('walks', [])
                 if len(l) > 1 and any(abs(x) <= H and abs(y) <= H for x, y, _ in l)]
        json.dump({'walks': walks}, open(f'{dst}/chodci.json', 'w'), separators=(',', ':'))
        print('čtverec', c, 'budov', len(sc['buildings']), 'stromů', len(sc['trees']), 'kB', os.path.getsize(f'{dst}/scene.json') // 1000)
    M = geo.MESTO
    t = open('web/jizda.html', encoding='utf-8').read()
    mhd = M.get('mhd') or {}
    t = (t.replace('{{TITULEK}}', html.escape(M['titulek'])).replace('{{MESTO}}', html.escape(M['nazev'])).replace('{{OBDOBI}}', json.dumps(OBDOBI))
          .replace('{{MHD_RT}}', json.dumps(mhd.get('realtime') if mhd.get('gtfs') else None))
          .replace('{{MULTIPLAYER}}', json.dumps(M.get('multiplayer') or None))   # adresa místnosti multiplayeru (multiplayer/worker.js)
          .replace('{{VLAK}}', json.dumps(M['vlak'] if isinstance(M.get('vlak'), dict) else {'vychozi': M['vlak'], 'linky': {}} if M.get('vlak') else None))
          .replace('{{MHD_ZDROJ}}', f', jízdní řády{" a polohy vozidel" if mhd.get("realtime") else ""} © <a href="{html.escape(mhd["zdroj_url"] or "")}" target="_blank" rel="noopener">{html.escape(mhd["zdroj"])}</a>'
                   if mhd.get('gtfs') and mhd.get('zdroj') else ''))
    if os.path.exists('web/jizda_rakovnik.css'):          # vlastní vzhled kopie (Rakovník): styly na konec <style>, písma do <head>
        t = t.replace('</style>', open('web/jizda_rakovnik.css', encoding='utf-8').read() + '</style>', 1).replace('</head>',
            '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700&family=DM+Mono:wght@500&family=Fraunces:opsz,wght@9..144,700;9..144,800&display=swap">\n</head>', 1)
    open('site/jizda.html', 'w', encoding='utf-8').write(t)
    print('hotovo: site/jizda.html')


if __name__ == '__main__':
    main()
