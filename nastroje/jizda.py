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


# vodorovné značení z podkladu pryč (ve 3D se kreslí ostře z dat silnic, web/jizda_znaceni.js): pixely barvy „marking“
# u asfaltu přebarvit asfaltem v plném rozlišení, před zmenšením (v shaderu by po něm zůstala šmouha). Barvy jsou
# z palety prep.py (SEASON_PAL): značení a silnice, v zimě jiné. Lajny hřišť dál od silnice zůstanou.
# Obrubník (curb, 0,35 m po stranách silnice) se v pixelu 0,6 m rozpadne na vlnitý světlý pás („štěrk“), proto je ve 3D asfaltem.
ZNACENI_BARVA = {'winter': ((190, 192, 196), (104, 106, 114), (226, 230, 236))}
ZNACENI_BARVA_LETO = ((236, 232, 214), (92, 92, 98), (176, 172, 162))


def bez_znaceni(img, obdobi):
    import numpy as np
    from scipy import ndimage
    mk_c, rd_c, kb_c = ZNACENI_BARVA.get(obdobi, ZNACENI_BARVA_LETO)
    a = np.asarray(img).copy()
    rd = np.all(np.abs(a.astype(np.int16) - rd_c) <= 8, axis=2)          # asfalt (i s drobným zrnem +8)
    mk = np.all(a == mk_c, axis=2) & ndimage.binary_dilation(rd, iterations=16)   # i široké zebry přechodů (kreslí je jizda/znacky.js z OSM)
    kb = np.all(np.abs(a.astype(np.int16) - kb_c) <= 6, axis=2) & ndimage.binary_dilation(rd, iterations=3)   # obrubník u silnice
    a[mk | kb] = rd_c
    return Image.fromarray(a)


# výška nad nejbližší vodou (HAND) pro rozlití potoka podle skutečného vodního stavu (web/jizda.html: ČHMÚ, ?voda=cm):
# z podkladu (třídy voda, potok) a výšek terénu čtverce. Šedotón 1024 px, 1 = 2,5 cm, 255 = 6,35 m a víc nebo daleko od vody.
def voda_ctverec(c, src, dst):
    import numpy as np
    from scipy import ndimage
    o = f'{dst}/voda.png'; f = f'{src}/ground_summer.png'
    if not os.path.exists(f) or (os.path.exists(o) and os.path.getmtime(o) > os.path.getmtime(f)): return
    M = 1024
    g = np.asarray(Image.open(f).convert('RGB').resize((M, M), Image.NEAREST)).astype(np.int16)
    voda = (g[..., 2] - g[..., 0] > 50) & (g[..., 2] >= g[..., 1]) & (g[..., 2] > 115)   # voda, potok, bazén z palety prep.py
    sc = json.load(open(f'{src}/scene.json')); n = sc['n']; H = np.array(sc['heights'], dtype=np.float32).reshape(n, n)
    yy, xx = np.mgrid[0:M, 0:M].astype(np.float32) * ((n - 1) / (M - 1))
    h = ndimage.map_coordinates(H, [yy, xx], order=1)
    if not voda.any(): Image.fromarray(np.full((M, M), 255, np.uint8)).save(o); return
    d, (iy, ix) = ndimage.distance_transform_edt(~voda, return_indices=True)
    hand = h - h[iy, ix]                                  # výška nad hladinou nejbližší vody
    hand[(hand < 0) & ~voda] = 0.5                        # níž než nejbližší voda (údolí po proudu): zaplaví se až od +0,5 m
    hand[d * (2 * geo.HALF / M) > 400] = 99               # dál než 400 m od vody se nerozlévá
    Image.fromarray(np.clip(np.round(hand / 0.025), 0, 255).astype(np.uint8)).save(o)


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
    # vánoční strom, stánky a kluziště: ve 3D běžná tělesa, jen v období z assets/vanoce.json (O.vanoce určí stránka)
    kod = jednou(kod, '  if (XMAS) {\n    const ROOF', '  if (O.vanoce) {\n    const ROOF')
    kod = jednou(kod, 'new THREE.Mesh(geom(V), ovMat); m.userData.ov = true;', 'new THREE.Mesh(geom(V), solidMat); m.castShadow = true;')
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
  if (texO) { texO.magFilter = THREE.LinearFilter; texO.minFilter = THREE.LinearMipmapLinearFilter; texO.generateMipmaps = true; texO.anisotropy = 8; texO.needsUpdate = true; }
  O._texO = texO;   // pro mosty a násypy níž (texO je v bloku terénu)
  O._voda = O.vodaH ? await load(`${DIR}/voda.png`).catch(() => null) : null;
  if (O._voda) { O._voda.magFilter = O._voda.minFilter = THREE.LinearFilter; }''')
    kod = jednou(kod, '`${DIR}/lightmap.png`', '`${DIR}/lightmap.webp`')
    # mosty, násypy, zdi a ploty (buffer L): ve 3D s leteckým snímkem na plochách směřujících nahoru (mostovka, svah násypu,
    # vršek zdi či živého plotu), aby navazovaly na terén s ortofotem. Snímek se mapuje ze světa podle středu čtverce (O.cx, O.cy).
    kod = jednou(kod, '  world.add(new THREE.Mesh(geom(L), solidMat));', """  const mostMat = O._texO ? mat(`
  uniform sampler2D uTexO; uniform vec2 uC; uniform float uHalf;
  varying vec3 vC; varying vec3 vN; varying vec3 vW; varying vec4 vA;
  void main(){
    if (uLights > 0.5) { gl_FragColor = vec4(vA.x > 0.5 ? vec3(1.0, 0.86, 0.6) * vA.x : vec3(0.0), 1.0); return; }
    vec3 n = fn(normalize(vN));
    vec3 col = vC;
    if (n.y > 0.55) {
      vec2 uv = vec2((vW.x - uC.x + uHalf) / (2.0 * uHalf), (-vW.z - uC.y + uHalf) / (2.0 * uHalf));
      vec3 o = texture2D(uTexO, uv).rgb; float lu = dot(o, vec3(0.3, 0.59, 0.11));
      o = clamp(mix(vec3(lu), o, 1.3) * 1.08, 0.0, 1.0);
      col = mix(col, o, 0.92 * smoothstep(30.0, 170.0, length(cameraPosition - vW)) * smoothstep(0.55, 0.8, n.y));
    }
    if (winter() && vA.z > 0.5 && n.y > 0.6) col = SNOW;
    gl_FragColor = vec4(shade(col, n, vW), 1.0);
  }`, { uTexO: { value: O._texO }, uC: { value: new THREE.Vector2(O.cx || 0, O.cy || 0) }, uHalf: { value: HALF } }, THREE.DoubleSide) : null;
  world.add(new THREE.Mesh(geom(L), mostMat || solidMat));""")
    # pixelový rozptyl podle pixelů obrazovky (gl_FragCoord) je v mapě pixel-art, ve 3D z něj je šum, který se při pohybu třpytí
    kod = jednou(kod, 'l = floor(l * 5.0 + hash(floor(gl_FragCoord.xy)) * 0.9) / 5.0;', 'l = l * 0.92;')
    kod = jednou(kod, '&& hash(floor(gl_FragCoord.xy)) > 0.6) col *= 0.93;', '&& hash(floor(vW.xz * 4.0)) > 0.6) col *= 0.93;')
    # počasí ve 3D na terénu: mokrý asfalt po dešti (tmavší, v ostrém úhlu odráží nebe) a postupně bílá zem při sněžení
    kod = jednou(kod, '{ uTex: { value: tex }, uLmap: { value: lmap } }', '{ uTex: { value: tex }, uLmap: { value: lmap }, uMokro: O.uMokro || { value: 0 }, uSnih: O.uSnih || { value: 0 }, uTexO: { value: texO }, uOrto: { value: texO ? 1 : 0 }, uTA: { value: O.textury?.asfalt || null }, uTG: { value: O.textury?.trava || null }, uTP: { value: O.textury?.dlazba || null }, uTS: { value: O.textury?.sterk || null }, uSplat: { value: O.textury ? 1 : 0 }, uCasV: O.uCas || { value: 0 }, uVoda: { value: O._voda || null }, uVodaOK: { value: O._voda ? 1 : 0 }, uVodaH: O.vodaH || { value: 0 }, uVodaK: O.vodaK || { value: 0 } }')
    kod = jednou(kod, 'uniform sampler2D uTex, uLmap;', 'uniform sampler2D uTex, uLmap, uTexO, uTA, uTG, uTP, uTS; uniform float uMokro, uSnih, uOrto, uSplat, uCasV, uVodaH, uVodaK, uVodaOK; uniform sampler2D uVoda;')
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
    # stíny podle denní doby (Rakovník): předpečená mapa čtverce (shadowB) se přepočítá pro nové slunce (stinSlunce níž)
    # a kolem hráče je blízká stínová mapa three.js (stránka: O.stinN, světlo slunce) s auty, lidmi a stromy; na Ultra i s domy.
    # uSNon: 0 bez blízké mapy, 1 jen pohyblivé věci navíc k předpečené, 2 blízká mapa nahradí předpečenou (s plynulým okrajem).
    kod = jednou(kod, 'float shadow(vec3 wp, vec3 n){', 'float shadowB(vec3 wp, vec3 n){')
    kod = jednou(kod, 'vec3 shade(vec3 col, vec3 n, vec3 wp){', """uniform sampler2D uSN; uniform mat4 uSNM; uniform float uSNon; uniform vec2 uSNpx;
#include <packing>
float shadowN(vec3 wp, vec3 n, out float w){
  vec4 c = uSNM * vec4(wp + n * 0.06, 1.0); c.xyz /= c.w; w = 0.0;
  if (c.x < 0.0 || c.x > 1.0 || c.y < 0.0 || c.y > 1.0 || c.z > 1.0) return 1.0;
  vec2 e2 = min(c.xy, 1.0 - c.xy); w = smoothstep(0.0, 0.1, min(e2.x, e2.y));
  float z = c.z - 0.0004, s = 0.0;
  for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) s += z > unpackRGBAToDepth(texture2D(uSN, c.xy + vec2(float(i), float(j)) * uSNpx)) ? 0.0 : 1.0;
  return s / 9.0;
}
float shadow(vec3 wp, vec3 n){
  float b = shadowB(wp, n);
  if (uSNon < 0.5 || uLights > 0.5) return b;
  float w; float s = shadowN(wp, n, w);
  return uSNon > 1.5 ? mix(b, s, w) : min(b, mix(1.0, s, w));
}
vec3 shade(vec3 col, vec3 n, vec3 wp){""")
    kod = jednou(kod, 'uDet: O.uDet || { value: null }, uDetS: O.uDetS || { value: 0 }, uOkna: O.uOkna || { value: 1 }, ...extra,',
                 'uDet: O.uDet || { value: null }, uDetS: O.uDetS || { value: 0 }, uOkna: O.uOkna || { value: 1 }, uSN: O.stinN?.map || { value: null }, uSNM: O.stinN?.mat || { value: new THREE.Matrix4() }, uSNon: O.stinN?.on || { value: 0 }, uSNpx: O.stinN?.px || { value: new THREE.Vector2(1, 1) }, ...extra,')
    # předpečená stínová mapa jako funkce: stránka ji volá znovu, když se slunce posune (kde = scéna s díly čtverce v souřadnicích čtverce)
    kod = jednou(kod, '// ---------- stínová mapa ----------\n{', '// ---------- stínová mapa ----------\nconst stinSlunce = (SUN, kde = world) => {')
    kod = jednou(kod, "  world.overrideMaterial = new THREE.MeshDepthMaterial();\n  renderer.setRenderTarget(shadowRT); renderer.clear(); renderer.render(world, lc);\n  renderer.setRenderTarget(null); world.overrideMaterial = null;",
                 "  kde.overrideMaterial = new THREE.MeshDepthMaterial();\n  renderer.setRenderTarget(shadowRT); renderer.clear(); renderer.render(kde, lc);\n  renderer.setRenderTarget(null); kde.overrideMaterial.dispose(); kde.overrideMaterial = null;")
    kod = jednou(kod, '  for (const m of allMats) m.uniforms.uLightVP.value.copy(vp);\n}', '  for (const m of allMats) m.uniforms.uLightVP.value.copy(vp);\n};\nstinSlunce(O.slunce || SUN);')
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
        vec2 uv = vUv + ((vec2(d1.g, d1.a) - 0.5) * 0.05 + (vec2(d2.a, d2.g) - 0.5) * 0.06) * bl / tn;   // hrana ploch jen nepatrně rozhozená (víc vypadalo rozpitě)
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
        if (uSplat > 0.5) {                                        // skutečné textury povrchů (CC0): jas textury podle druhu plochy, barva zůstává z podkladu
          float dz = length(cameraPosition - vW), fz = 1.0 - smoothstep(25.0, 90.0, dz);
          if (fz > 0.01) {
            vec2 wp = vW.xz; vec3 W4 = vec3(0.3, 0.59, 0.11);
            float lA = dot(texture2D(uTA, wp * 0.28).rgb, W4) / max(dot(textureLod(uTA, vec2(0.5), 12.0).rgb, W4), 0.05);
            float lP = dot(texture2D(uTP, wp * 0.42).rgb, W4) / max(dot(textureLod(uTP, vec2(0.5), 12.0).rgb, W4), 0.05);
            vec3 tg = texture2D(uTG, wp * 0.55).rgb, tgm = textureLod(uTG, vec2(0.5), 12.0).rgb;
            float lS = dot(texture2D(uTS, wp * 0.4).rgb, W4) / max(dot(textureLod(uTS, vec2(0.5), 12.0).rgb, W4), 0.05);
            float sv = smoothstep(0.42, 0.55, dot(col, W4));             // světlá zpevněná plocha = dlažba, tmavá = asfalt
            float wA = zpev * (1.0 - sv), wP = zpev * sv, wS = (1.0 - zpev) * (1.0 - zel);
            float lum = wA * mix(1.0, lA, 0.9) + wP * mix(1.0, lP, 0.95) + wS * mix(1.0, lS, 0.9) + (1.0 - wA - wP - wS);
            vec3 trv = col * mix(vec3(1.0), tg / max(tgm, vec3(0.05)), 0.8);   // tráva: i odstín stébel
            col = mix(col, mix(col * lum, trv, zel * (1.0 - snih)), fz);
          }
        }
        col.rg += zel * trs * vec2(0.012, 0.02) * uDetS;                                       // tráva: trsy i v odstínu
      } else col = texture2D(uTex, vUv).rgb;
      if (uOrto > 0.5) {                                         // letecký snímek ČÚZK: zblízka ostrá kresba, do dálky skutečný povrch (pole, louky, plochy)
        vec3 o = texture2D(uTexO, vUv).rgb; float lu = dot(o, vec3(0.3, 0.59, 0.11));
        o = clamp(mix(vec3(lu), o, 1.3) * 1.08, 0.0, 1.0);
        col = mix(col, o, 0.92 * smoothstep(30.0, 170.0, length(cameraPosition - vW)));   // do 30 m jen ostrá kresba
      }
      {                                                          // voda (Rakovník): vlnky, odraz nebe podle úhlu pohledu, odlesk slunce; v zimě zamrzlá
        vec3 kv = texture2D(uTex, vUv).rgb;                      // třída z podkladu (před ortofotem a texturami)
        float voda = uSeason < 2.5 ? smoothstep(0.18, 0.3, kv.b - kv.r) * step(kv.g, kv.b) * step(0.45, kv.b) : 0.0;
        // rozlití podle skutečného vodního stavu (ČHMÚ): terén níž nad vodou, než o kolik hladina stoupla
        float hand = uVodaH > 0.0 && uVodaOK > 0.5 ? texture2D(uVoda, vUv).r * 6.375 : 99.0, zaplav = uSeason < 2.5 ? 1.0 - smoothstep(uVodaH - 0.08, uVodaH + 0.04, hand) : 0.0;
        voda = max(voda, zaplav * step(0.02, uVodaH));
        if (voda > 0.01) {
          float rych = 1.0 + uVodaK * 2.5;                         // velká voda teče rychleji
          vec2 q1 = vW.xz * 0.35 + vec2(uCasV * 0.05, uCasV * 0.03) * rych, q2 = vW.xz * 0.21 - vec2(uCasV * 0.035, -uCasV * 0.045) * rych;
          vec4 w1 = texture2D(uDet, q1), w2 = texture2D(uDet, q2);
          vec3 nw = normalize(vec3((w1.g - 0.5) * 0.5 + (w2.a - 0.5) * 0.5, 1.0, (w1.a - 0.5) * 0.5 + (w2.g - 0.5) * 0.5));
          vec3 vd = normalize(cameraPosition - vW), rf = reflect(-vd, nw);
          float fres = 0.06 + 0.94 * pow(1.0 - max(dot(nw, vd), 0.0), 4.0);
          vec3 nebe = mix(vec3(0.72, 0.8, 0.88), vec3(0.32, 0.5, 0.78), clamp(rf.y * 1.4, 0.0, 1.0));
          vec3 hloubka = mix(mix(vec3(0.07, 0.15, 0.17), col * 0.45, 0.35), vec3(0.32, 0.26, 0.16), uVodaK);   // kalná při velké vodě
          float lesk = pow(max(dot(rf, normalize(uSun)), 0.0), 180.0) * 2.2;
          col = mix(col, mix(hloubka, nebe, fres) + lesk, voda);
        }
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
    # fasády a střechy (Rakovník): struktura z fotografických textur CC0 (jizda/textury) podle stylu stavby, jen jas
    # (barva zůstává z dat a ortofota, takže zblízka i zdálky sedí s mapou); do dálky mizí
    kod = jednou(kod, 'const wallMat = mat(/* glsl */`', 'const wallMat = mat(/* glsl */`\n  uniform sampler2D uTO, uTC, uTB, uTK; uniform float uFas;')
    kod = jednou(kod, '}`, {}, THREE.DoubleSide);\nconst roofMat', '}`, { uTO: { value: O.textury?.omitka || null }, uTC: { value: O.textury?.cihly || null }, uTB: { value: O.textury?.beton || null }, uTK: { value: O.textury?.kamen || null }, uFas: { value: O.textury?.omitka ? 1 : 0 } }, THREE.DoubleSide);\nconst roofMat')
    kod = jednou(kod, 'if (door) col = vec3(0.52, 0.52, 0.54);', """if (uFas > 0.5 && !w && !door && v > -50.0) {
      float fz = 1.0 - smoothstep(35.0, 170.0, length(cameraPosition - vW));
      if (fz > 0.01) {
        vec2 tv = vec2(u, v); vec3 W5 = vec3(0.3, 0.59, 0.11);
        float hb = fract(sin(dot(vec2(len, st), vec2(12.9898, 78.233))) * 43758.5453);   // budova: náhodná volba omítka / cihla
        float L;
        if (st > 3.5 && st < 4.5) L = dot(texture2D(uTK, tv * 0.45).rgb, W5) / max(dot(textureLod(uTK, vec2(0.5), 12.0).rgb, W5), 0.05);
        else if ((st > 0.5 && st < 3.5) || (st > 14.5 && st < 19.5)) L = dot(texture2D(uTB, tv * 0.33).rgb, W5) / max(dot(textureLod(uTB, vec2(0.5), 12.0).rgb, W5), 0.05);
        else if (st < 0.5 && hb < 0.18) L = dot(texture2D(uTC, tv * 0.55).rgb, W5) / max(dot(textureLod(uTC, vec2(0.5), 12.0).rgb, W5), 0.05);
        else L = dot(texture2D(uTO, tv * 0.5).rgb, W5) / max(dot(textureLod(uTO, vec2(0.5), 12.0).rgb, W5), 0.05);
        if (v < 0.75 && st < 12.5) L = dot(texture2D(uTK, tv * 0.6).rgb, W5) / max(dot(textureLod(uTK, vec2(0.5), 12.0).rgb, W5), 0.05);   // kamenný sokl
        col *= mix(1.0, clamp(L, 0.55, 1.5), fz * 0.85);
      }
    }
    if (door) col = vec3(0.52, 0.52, 0.54);""")
    kod = jednou(kod, 'const roofMat = mat(/* glsl */`', 'const roofMat = mat(/* glsl */`\n  uniform sampler2D uTT, uTPl, uTSt; uniform float uFas;')
    kod = jednou(kod, '}`, {}, THREE.DoubleSide);\n// obecný materiál', '}`, { uTT: { value: O.textury?.tasky || null }, uTPl: { value: O.textury?.plech || null }, uTSt: { value: O.textury?.sterk || null }, uFas: { value: O.textury?.tasky ? 1 : 0 } }, THREE.DoubleSide);\n// obecný materiál')
    kod = jednou(kod, "    if (vA.x > 0.5) {\n      if (fract(vW.y / 0.6) < 0.3) col *= 0.88;", """    if (uFas > 0.5) {                                          // tašky na šikmé střeše, štěrk na ploché (do dálky mizí)
      float fz = 1.0 - smoothstep(35.0, 170.0, length(cameraPosition - vW)); vec3 W6 = vec3(0.3, 0.59, 0.11);
      if (fz > 0.01) {
        float L = vA.x > 0.5 ? dot(texture2D(uTT, vec2(vW.x + vW.z * 0.7, vW.y * 1.7) * 0.42).rgb, W6) / max(dot(textureLod(uTT, vec2(0.5), 12.0).rgb, W6), 0.05)
                             : dot(texture2D(uTSt, vW.xz * 0.35).rgb, W6) / max(dot(textureLod(uTSt, vec2(0.5), 12.0).rgb, W6), 0.05);
        col *= mix(1.0, clamp(L, 0.5, 1.5), fz * 0.8);
      }
    }
    if (vA.x > 0.5) {
      if (fract(vW.y / 0.6) < 0.3) col *= 0.88;""")
    return ('// VYGENEROVÁNO nastroje/jizda.py z render.html – neupravovat ručně (změny patří do render.html)\n'
            'export async function postavCtverec(THREE, renderer, O) {\n'
            "const PARAMS = {}, MPP = 0.2, TILE = 1024, PAD = 4, ALPHA = false, LIGHTS = !!O.svetla, SKIRT = 28;\n"
            'const SEASON = O.obdobi, SEASON_ID = { spring: 0, summer: 1, autumn: 2, winter: 3 }[SEASON], DIR = O.dir;\n'
            "let SKIRT_EDGES = 'nsew';\n"
            'const BG = [27 / 255, 35 / 255, 51 / 255];\n'
            + kod +
            '\nreturn { world, allMats, scene, camDir, stinSlunce };\n}\n')


def vnitrek(scene):
    """jen objekty uvnitř čtverce: pás sousedů u švu kreslí soused sám (ve 3D by se zdvojil)"""
    H = scene['half']
    uvnitr = lambda x, y: abs(x) <= H and abs(y) <= H
    def stred(p): return sum(q[0] for q in p) / len(p), sum(q[1] for q in p) / len(p)
    scene['buildings'] = [b for b in scene['buildings'] if uvnitr(*stred(b['p']))]
    scene['trees'] = [t for t in scene['trees'] if uvnitr(t[0], t[1])]
    scene['cars'] = [c for c in scene['cars'] if uvnitr(c[0], c[1])]   # zaparkovaná auta jen na parkovištích (mesto.json auta_u_krajnice)
    for k, v in scene['props'].items(): scene['props'][k] = [q for q in v if uvnitr(q[0], q[1])]
    for k in ('xmas', 'stalls', 'rinks'): scene[k] = [q for q in scene.get(k) or [] if uvnitr(q[0], q[1])]   # vánoční výzdoba
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
    if os.path.isdir('web/jizda_textury'): shutil.copytree('web/jizda_textury', f'{OUT}/textury', dirs_exist_ok=True)   # textury povrchů (CC0, ambientCG)
    if os.path.isdir('web/jizda_kenney'): shutil.copytree('web/jizda_kenney', f'{OUT}/kenney', dirs_exist_ok=True)   # postavy a pomůcky Kenney Mini Characters (CC0)
    for f in ('loaders/GLTFLoader.js', 'utils/BufferGeometryUtils.js', 'utils/SkeletonUtils.js'):
        os.makedirs(os.path.dirname(f'{OUT}/three/{f}'), exist_ok=True)
        shutil.copy(f'node_modules/three/examples/jsm/{f}', f'{OUT}/three/{f}')
    if os.path.exists('assets/custom_models.js'): shutil.copy('assets/custom_models.js', f'{OUT}/custom_models.js')
    else: open(f'{OUT}/custom_models.js', 'w').write('// město nemá vlastní modely (assets/custom_models.js)\nexport {};\n')
    if os.path.exists('assets/znacky.json'): shutil.copy('assets/znacky.json', f'{OUT}/znacky.json')
    if os.path.exists('assets/pruhy.json'): shutil.copy('assets/pruhy.json', f'{OUT}/pruhy.json')   # jízdní pruhy a šipky z OSM (nastroje/pruhy.py)   # dopravní značky z OSM (nastroje/znacky.py)
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
                bez_znaceni(Image.open(f).convert('RGB'), s).resize((GROUND_PX, GROUND_PX), Image.BOX)   # BOX: LANCZOS dělal u hran světlý a tmavý lem, šikmo vlnitý.save(o, quality=88, method=4)
        if os.path.exists(f'{src}/lightmap.png'): Image.open(f'{src}/lightmap.png').convert('RGB').save(f'{dst}/lightmap.webp', quality=80)
        orto_ctverec(c, dst)                                  # letecký snímek na terén (stránka: Grafika → Letecký snímek)
        voda_ctverec(c, src, dst)                             # výška nad vodou pro rozlití potoka podle vodního stavu
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
          .replace('{{VANOCE}}', json.dumps({k: v for k, v in json.load(open('assets/vanoce.json', encoding='utf-8')).items() if k in ('od', 'do')}
                                            if os.path.exists('assets/vanoce.json') else None))
          .replace('{{AUTOBUS}}', json.dumps(M.get('autobus', 'liberec')))
          .replace('{{LETISTE}}', json.dumps(json.load(open('assets/doplnky/letiste.json', encoding='utf-8'))   # letiště (doplněk letiste): ve 3D letadla a vrtulníky k pilotování
                                             if os.path.exists('assets/doplnky/letiste.json') else None, separators=(',', ':')))
          .replace('{{VLAK}}', json.dumps(M['vlak'] if isinstance(M.get('vlak'), dict) else {'vychozi': M['vlak'], 'linky': {}} if M.get('vlak') else None))
          .replace('{{MHD_ZDROJ}}', f', jízdní řády{" a polohy vozidel" if mhd.get("realtime") else ""} © <a href="{html.escape(mhd["zdroj_url"] or "")}" target="_blank" rel="noopener">{html.escape(mhd["zdroj"])}</a>'
                   if mhd.get('gtfs') and mhd.get('zdroj') else ''))
    if os.path.exists('web/jizda_rakovnik.css'):          # vlastní vzhled kopie (Rakovník): styly na konec <style>, písma do <head>
        t = t.replace('</style>', open('web/jizda_rakovnik.css', encoding='utf-8').read() + '</style>', 1).replace('</head>',
            '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700&family=DM+Mono:wght@500&family=Fraunces:opsz,wght@9..144,700;9..144,800&display=swap">\n</head>', 1)
    if os.path.exists('web/js/02-odkazy-ven.js'):         # odkazy na jiný web: šipka ↗ a text pro čtečku, stejně jako v mapě
        i = t.rindex('</body>')
        t = t[:i] + '<script>\n' + open('web/js/02-odkazy-ven.js', encoding='utf-8').read() + '</script>\n' + t[i:]
    open('site/jizda.html', 'w', encoding='utf-8').write(t)
    print('hotovo: site/jizda.html')


if __name__ == '__main__':
    main()
