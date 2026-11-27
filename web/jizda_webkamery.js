// Webkamery ve 3D jízdě: menu Webkamery vybere kameru a kamera 3D scény se postaví na její místo (střecha domu, směr,
// sklon a zorné pole z jizda/kamery.js, data společná s 2D mapou), aby pohled odpovídal skutečnému záběru. V rohu obraz v obraze: aktuální snímek
// s odkazem zpět (jen kde to provozovatel dovoluje, jinak jen odkaz na jeho stránku). Esc nebo tlačítko = zpět do jízdy.
// Hráč mezitím stojí; čtverce, auta a lidé se načítají kolem kamery (hráč se na dobu pohledu přesune pod ni).
// Sdílení: v adrese je po dobu pohledu ?kamera=<id> (jizda.html?kamera=husovo otevře 3D rovnou v pohledu kamery),
// tlačítko Sdílet pohled ho pošle přes nabídku sdílení zařízení, jinak zkopíruje do schránky.
import { KAMERY, snimekUrl } from './kamery.js';

export function vytvorWebkamery(THREE, { CAM, gz, hrac, panel, start, konec }) {
  const seznam = KAMERY.filter((k) => k.pohled);
  const st = { on: false, k: null, ulozeno: null, t: 0 };
  const kratky = (k) => { const s = k.nazev.replace(/^Webkamera:\s*/, ''); return s[0].toUpperCase() + s.slice(1); };   // Centrum Rakovníka
  const svet = (lat, lon) => [(lon - CAM.lon0) * CAM.kx, (lat - CAM.lat0) * CAM.ky];

  // ---------- obraz v obraze ----------
  const pip = document.createElement('aside');
  pip.id = 'webkam'; pip.hidden = true; pip.setAttribute('aria-label', 'Skutečný záběr webkamery');
  pip.innerHTML = '<header><b></b><button type="button" class="px-btn" data-zpet>Zpět do jízdy <kbd>Esc</kbd></button></header><div class="wk-obr"></div><p class="wk-zdroj"></p><div class="wk-sdilet"><button type="button" class="px-btn" data-sdilet>Sdílet pohled</button><span role="status" aria-live="polite"></span></div><nav class="wk-dalsi" aria-label="Další webkamery"></nav>';
  document.body.appendChild(pip);
  pip.querySelector('[data-zpet]').addEventListener('click', () => vypni());
  // adresa pohledu: stejná stránka s ?kamera=<id>, bez polohy hráče v # (tu dopočítá kamera)
  const adresa = (k) => { const u = new URL(location.href); u.hash = ''; if (k) u.searchParams.set('kamera', k.id); else u.searchParams.delete('kamera'); return u; };
  const stav = pip.querySelector('[role="status"]');
  pip.querySelector('[data-sdilet]').addEventListener('click', async () => {
    const k = st.k; if (!k) return;
    const url = adresa(k).href, titulek = `${kratky(k)} ve 3D`;
    try {
      if (navigator.share) { await navigator.share({ title: titulek, url }); return; }
      await navigator.clipboard.writeText(url); stav.textContent = 'Odkaz zkopírován';
    } catch (e) {
      if (e?.name === 'AbortError') return;                  // sdílení zavřel uživatel
      stav.textContent = `Odkaz: ${url}`;                    // bez schránky aspoň ukázat adresu
    }
    setTimeout(() => { stav.textContent = ''; }, 4000);
  });
  let obnova = 0;
  function vyplnPip(k) {
    pip.querySelector('b').textContent = kratky(k);
    const box = pip.querySelector('.wk-obr'), z = pip.querySelector('.wk-zdroj');
    box.style.aspectRatio = k.obrazek ? String(k.pohled.pomer || 16 / 9) : '';   // jen odkaz: nízký rámeček
    const a = document.createElement('a'); a.href = k.odkaz; a.target = '_blank'; a.rel = 'noopener';
    if (k.obrazek) {                                         // vložení dovoleno: snímek a pod ním odkaz zpět
      const im = document.createElement('img'); im.alt = `Aktuální snímek: ${k.nazev}`; im.referrerPolicy = 'no-referrer'; im.src = snimekUrl(k);
      box.replaceChildren(im);                                // snímek sám odkazem není, odkaz ven je v popisku pod ním
      z.innerHTML = ''; const l = document.createElement('a'); l.href = k.odkaz; l.target = '_blank'; l.rel = 'noopener'; l.textContent = `Webkamera: ${k.zdroj} ↗`;
      z.append('Snímek: ', l, ' · obnova po 2 min');
      clearInterval(obnova); obnova = setInterval(() => { im.src = snimekUrl(k); }, 120000);
    } else {                                                 // bez souhlasu provozovatele snímek nevkládat, jen odkaz
      a.className = 'wk-odkaz'; a.innerHTML = '<span>Aktuální snímek je na webu provozovatele</span>';
      const s = document.createElement('strong'); s.textContent = `Otevřít ${k.zdroj.split(',').pop().trim()}`;
      const sip = document.createElement('span'); sip.className = 'ven-sipka'; sip.setAttribute('aria-hidden', 'true'); sip.textContent = '↗'; s.append(sip); a.append(s);   // šipka jako u odkazů ven (web/js/02-odkazy-ven.js), ať se nezdvojí
      box.replaceChildren(a); z.textContent = `Zdroj: ${k.zdroj}`;
      clearInterval(obnova);
    }
    const dalsi = pip.querySelector('.wk-dalsi'); dalsi.replaceChildren();
    for (const o of seznam) if (o !== k) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'px-btn'; b.textContent = kratky(o);
      b.addEventListener('click', () => zapni(o)); dalsi.append(b);
    }
  }

  // ---------- menu ----------
  if (panel) {
    const ul = document.createElement('ul'); ul.className = 'wk-seznam';
    for (const k of seznam) {
      const li = document.createElement('li'), b = document.createElement('button');
      b.type = 'button'; b.innerHTML = '<b></b><small></small>';
      b.querySelector('b').textContent = kratky(k);
      b.querySelector('small').textContent = `${k.text.split('. ')[0]}. ${k.obrazek ? 'Se živým snímkem.' : 'Snímek na webu provozovatele.'}`;
      b.addEventListener('click', () => zapni(k));
      li.append(b); ul.append(li);
    }
    const p = document.createElement('p'); p.className = 'wk-pozn';
    p.textContent = 'Kamera 3D scény se postaví tam, kde je skutečná webkamera, se stejným výřezem a zkreslením širokého objektivu, a vedle se ukáže její aktuální záběr. Domy a stromy ve 3D jsou z dat, takže drobné rozdíly zůstanou.';
    panel.replaceChildren(ul, p);
  }

  function zapni(k) {
    if (!st.on) st.ulozeno = { x: hrac.x, y: hrac.y, z: hrac.z };
    st.on = true; st.k = k;
    const [x, y] = svet(k.pohled.lat, k.pohled.lon);
    hrac.x = x; hrac.y = y; hrac.z = gz(x, y);              // čtverce, auta a chodci kolem kamery
    vyplnPip(k); pip.hidden = false; document.body.classList.add('webkamera'); stav.textContent = '';
    history.replaceState(null, '', adresa(k));
    start?.(k);
  }
  function vypni() {
    if (!st.on) return;
    st.on = false; st.k = null; clearInterval(obnova);
    pip.hidden = true; document.body.classList.remove('webkamera');
    history.replaceState(null, '', adresa(null));
    if (st.ulozeno) Object.assign(hrac, st.ulozeno);
    konec?.();
  }
  // ---------- objektiv: stejný výřez a zkreslení jako skutečná kamera ----------
  // Model kamery (stejný jako při kalibraci): bod v souřadnicích kamery (x doprava, y nahoru, z dopředu) → xn = x/z, yn = y/z,
  // natočení kolem osy pohledu o naklon, soudkové zkreslení dané obráceně: r = r_d(1 + k1 r_d² + k2 r_d⁴) (k1, k2 ≥ 0 = soudek;
  // na rozích širokého objektivu stabilní, kde model r_d = r(1 + k1 r²) už nemá řešení), pixel = střed + F · (xd, -yd) · šířka snímku,
  // kde F = 0,5 / tan(fov / 2) (fov = vodorovné zorné pole bez zkreslení). Scéna se vykreslí pravoúhle do textury o něco
  // širší, než je potřeba, a průchod níž ji na obrazovku přenese se zkreslením a ořízne na poměr stran snímku (rámeček).
  const ob = { rt: null, Tx: 1, Ty: 1 };
  const deg = Math.PI / 180, Fw = (p) => 0.5 / Math.tan(p.fov * deg / 2);
  // poloměr bez zkreslení z poloměru na snímku a zpět (Newton; pro k1, k2 ≥ 0 je funkce rostoucí)
  const rozbal = (rd, k1, k2) => rd * (1 + k1 * rd * rd + k2 * rd ** 4);
  const zabal = (ru, k1, k2) => { let r = ru; for (let i = 0; i < 12; i++) { const r2 = r * r, f = r * (1 + k1 * r2 + k2 * r2 * r2) - ru, d = 1 + 3 * k1 * r2 + 5 * k2 * r2 * r2; r -= f / d; } return r; };
  // rozsah pravoúhlého záběru, který pokryje celý snímek (rohy a středy stran po rozbalení zkreslení a natočení)
  function rozsah(p) {
    const F = Fw(p), hx = 0.5 / F, hy = 0.5 / (p.pomer || 16 / 9) / F, k1 = p.k1 || 0, k2 = p.k2 || 0, R = (p.naklon || 0) * deg;
    let Tx = 0, Ty = 0;
    for (const [sx, sy] of [[1, 0], [0, 1], [1, 1], [1, -1], [-1, 1], [-1, -1], [-1, 0], [0, -1]]) {
      const xd = sx * hx, yd = sy * hy, rd = Math.hypot(xd, yd), ru = rozbal(rd, k1, k2), q = rd > 0 ? ru / rd : 1;
      const xr = xd * q, yr = yd * q, xn = xr * Math.cos(R) + yr * Math.sin(R), yn = -xr * Math.sin(R) + yr * Math.cos(R);
      Tx = Math.max(Tx, Math.abs(xn)); Ty = Math.max(Ty, Math.abs(yn));
    }
    return [Tx * 1.01, Ty * 1.01];
  }
  const prenos = new THREE.ShaderMaterial({
    uniforms: { tObr: { value: null }, uOkno: { value: new THREE.Vector2(1, 1) }, uPomer: { value: 16 / 9 }, uF: { value: 1 }, uK: { value: new THREE.Vector2() },
                uNaklon: { value: 0 }, uT: { value: new THREE.Vector2(1, 1) } },
    vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: /* glsl */`
      uniform sampler2D tObr; uniform vec2 uOkno, uK, uT; uniform float uPomer, uF, uNaklon;
      void main() {
        // rámeček snímku uprostřed okna (celý snímek vidět, zbytek tmavý)
        float sirka = min(uOkno.x, uOkno.y * uPomer);
        vec2 p = (gl_FragCoord.xy - 0.5 * uOkno) / sirka;            // x ∈ ⟨-0,5; 0,5⟩, y nahoru
        if (abs(p.x) > 0.5 || abs(p.y) > 0.5 / uPomer) { gl_FragColor = vec4(0.05, 0.055, 0.065, 1.0); return; }
        vec2 d = p / uF; float r2 = dot(d, d);
        vec2 u = d * (1.0 + uK.x * r2 + uK.y * r2 * r2);                 // bez zkreslení
        float c = cos(uNaklon), s = sin(uNaklon);
        vec2 n = vec2(u.x * c + u.y * s, -u.x * s + u.y * c);
        gl_FragColor = texture2D(tObr, clamp(0.5 + 0.5 * n / uT, 0.0, 1.0));
      }`,
    depthTest: false, depthWrite: false });
  const prenosScena = new THREE.Scene(), prenosCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  prenosScena.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), prenos));
  // kam kreslit složený obraz: v režimu webkamery do textury (pak prenes), jinak null = obrazovka
  function cil(renderer) {
    if (!st.on) return null;
    const v = renderer.getDrawingBufferSize(new THREE.Vector2());
    if (!ob.rt) ob.rt = new THREE.WebGLRenderTarget(v.x, v.y);
    else if (ob.rt.width !== v.x || ob.rt.height !== v.y) ob.rt.setSize(v.x, v.y);
    return ob.rt;
  }
  function prenes(renderer) {
    if (!st.on || !ob.rt) return;
    const p = st.k.pohled, u = prenos.uniforms, v = renderer.getDrawingBufferSize(new THREE.Vector2());
    u.tObr.value = ob.rt.texture; u.uOkno.value.copy(v); u.uPomer.value = p.pomer || 16 / 9; u.uF.value = Fw(p);
    u.uK.value.set(p.k1 || 0, p.k2 || 0); u.uNaklon.value = (p.naklon || 0) * deg; u.uT.value.set(ob.Tx, ob.Ty);
    renderer.setRenderTarget(null); renderer.render(prenosScena, prenosCam);
  }
  // kamera 3D scény: poloha, směr a sklon; zorné pole a poměr tak, aby pravoúhlý záběr pokryl celý (zkreslený) snímek
  function kamera(camera, fwd) {
    const p = st.k.pohled, [x, y] = svet(p.lat, p.lon), z = gz(x, y) + p.vyska;
    const a = p.smer * deg, s = p.sklon * deg;
    camera.position.set(x, z, -y);
    fwd.set(Math.sin(a) * Math.cos(s), Math.sin(s), -Math.cos(a) * Math.cos(s));
    camera.up.set(0, 1, 0); camera.lookAt(camera.position.clone().add(fwd));
    [ob.Tx, ob.Ty] = rozsah(p);
    const v = 2 * Math.atan(ob.Ty) / deg, asp = ob.Tx / ob.Ty;
    if (Math.abs(camera.fov - v) > 0.001 || Math.abs(camera.aspect - asp) > 0.0001) { camera.fov = v; camera.aspect = asp; camera.updateProjectionMatrix(); }
    return v;
  }
  // kde je bod světa na snímku kamery (0..1 zleva a shora), stejným modelem jako průchod výš: kontrola kalibrace
  function naSnimku(camera, X, Y, Z) {
    const p = st.k.pohled, c = new THREE.Vector3(X, Z, -Y).applyMatrix4(camera.matrixWorldInverse);
    if (c.z >= 0) return null;
    const xn = c.x / -c.z, yn = c.y / -c.z, R = (p.naklon || 0) * deg;
    const xr = xn * Math.cos(R) - yn * Math.sin(R), yr = xn * Math.sin(R) + yn * Math.cos(R), ru = Math.hypot(xr, yr);
    const q = ru > 0 ? zabal(ru, p.k1 || 0, p.k2 || 0) / ru : 1, F = Fw(p);
    return [0.5 + F * xr * q, 0.5 - F * yr * q * (p.pomer || 16 / 9)];   // pixel = střed + F · šířka · (x, −y)
  }
  return { get on() { return st.on; }, get kamera_() { return st.k; }, seznam, zapni, vypni, kamera, svet, cil, prenes, naSnimku };
}
