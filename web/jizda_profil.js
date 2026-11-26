// Postava hráče (menu → Postava): výběr postavičky Kenney Mini Characters s velkým otočným náhledem a mřížkou karet
// se snímkem každé postavy. Volba se pamatuje v prohlížeči a v multiplayeru ji ostatní vidí (posílá se s autem jako klíč p,
// kontrola v jizda/sit.js platneAuto). Jméno ve hře sem vkládá jizda/hraci.js (prvek api.jmeno).
import { AUTO_VOLBY } from './sit.js';

const SKUPINY = [['Muži', (k) => k.includes('-male-')], ['Ženy', (k) => k.includes('-female-')], ['Další', (k) => !/-(fe)?male-/.test(k)]];
const VYCHOZI = 'character-male-a';
const CSS = `
.prof { display: grid; gap: 14px; }
.prof-hl { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; }
.prof-nahled { width: 100%; height: 260px; display: block; border-radius: 14px; cursor: grab; touch-action: none;
  background: radial-gradient(ellipse at 50% 85%, #f3efe7 0 28%, #ddd6ca 29% 30%, transparent 31%), linear-gradient(#e9e4da, #cfc7ba); }
.prof-nahled:active { cursor: grabbing; }
.prof-jm { font: 700 1.1rem var(--serif, serif); margin: 0; }
.prof-sk { display: grid; gap: 6px; }
.prof-sk > span { font: 600 .78rem var(--sans, sans-serif); letter-spacing: .06em; text-transform: uppercase; color: var(--muted, #78716c); }
.prof-mriz { display: grid; grid-template-columns: repeat(auto-fill, minmax(76px, 1fr)); gap: 8px; }
.prof-karta { all: unset; box-sizing: border-box; cursor: pointer; display: grid; justify-items: center; gap: 2px; padding: 6px 4px 5px; border-radius: 12px;
  background: #fff; box-shadow: 0 1px 3px rgba(41, 37, 36, .14); font: 600 .8rem var(--sans, sans-serif); color: #292524; }
.prof-karta img { width: 64px; height: 64px; image-rendering: auto; }
.prof-karta:hover { box-shadow: 0 2px 8px rgba(41, 37, 36, .22); }
.prof-karta:focus-visible { outline: 3px solid #29c8ff; outline-offset: 2px; }
.prof-karta[aria-checked="true"] { box-shadow: 0 0 0 3px var(--red, #c40006); }
.prof-pozn { margin: 0; font-size: 12px; color: var(--muted, #78716c); }
`;

// api: postavy (jizda/kenney.js), panel (Element), aktualni() -> klíč modelu | undefined, nastav(klic)
export function vytvorProfil(THREE, api) {
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const el = (tag, tr, text) => { const e = document.createElement(tag); if (tr) e.className = tr; if (text) e.textContent = text; return e; };
  const koren = el('div', 'prof');
  const hl = el('div', 'prof-hl');
  const cv = el('canvas', 'prof-nahled'); cv.setAttribute('aria-label', 'Náhled postavičky, tažením ji otočíš');
  const jmeno = el('p', 'prof-jm');
  hl.append(cv, jmeno);
  koren.append(hl);
  const karty = new Map();                                   // klíč -> [tlačítko, obrázek]
  const vyber = () => api.aktualni() || VYCHOZI;
  for (const [nadpis, f] of SKUPINY) {
    const sk = el('div', 'prof-sk'), mr = el('div', 'prof-mriz');
    mr.setAttribute('role', 'radiogroup'); mr.setAttribute('aria-label', nadpis);
    for (const [k, txt] of Object.entries(AUTO_VOLBY.p).filter(([k]) => f(k))) {
      const b = el('button', 'prof-karta'); b.type = 'button'; b.setAttribute('role', 'radio');
      const img = el('img'); img.alt = ''; img.width = img.height = 64;
      b.append(img, txt);
      b.addEventListener('click', () => { api.nastav(k); obnov(); mavni = 1.6; });
      b.addEventListener('keydown', (e) => {                 // šipkami po kartách (radiogroup)
        if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
        e.preventDefault(); e.stopPropagation();
        const vse = [...karty.values()].map((q) => q[0]), i = vse.indexOf(b), n = vse[(i + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1) + vse.length) % vse.length];
        n.focus(); n.click();
      });
      mr.append(b); karty.set(k, [b, img]);
    }
    sk.append(el('span', '', nadpis), mr); koren.append(sk);
  }
  if (api.jmeno) koren.append(api.jmeno);
  koren.append(el('p', 'prof-pozn', 'Postavička se uloží v tomhle prohlížeči a ve hře s ostatními ji všichni vidí. Postavy: Kenney Mini Characters (kenney.nl, CC0).'));
  api.panel.append(koren);

  function obnov() {
    const k = vyber();
    jmeno.textContent = AUTO_VOLBY.p[k] || '';
    for (const [kk, [b]] of karty) { const on = kk === k; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; }
  }
  obnov();

  // ---------- náhled a snímky karet: jedno malé plátno, postava v samostatné scéně ----------
  let r3 = null, scena, kam, lt = null, ltK = '', uhel = 0.5, tah = null, bezi = false, posledni = 0, mavni = 0, snimky = false;
  function priprav() {
    if (r3) return true;
    try { r3 = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, preserveDrawingBuffer: true }); } catch { return false; }
    r3.outputColorSpace = THREE.LinearSRGBColorSpace;
    r3.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    scena = new THREE.Scene();
    scena.add(new THREE.HemisphereLight(0xf4f1ea, 0x8a8170, 1.15));
    const sl = new THREE.DirectionalLight(0xffffff, 1.1); sl.position.set(0.5, 0.8, 0.9); scena.add(sl);
    kam = new THREE.PerspectiveCamera(28, 1, 0.1, 30);
    return true;
  }
  function postava(k) {
    if (lt && ltK === k) return lt;
    lt?.zrus(); lt = api.postavy.nova({ model: k, bez: true }, scena); ltK = k;
    return lt;
  }
  // snímky karet: každá postava jednou zepředu (hlava a ramena), pak se náhled vrátí k vybrané
  function udelejSnimky() {
    const w = 128, h = 128, puv = [cv.width, cv.height];
    r3.setPixelRatio(1); r3.setSize(w, h, false); kam.aspect = 1; kam.updateProjectionMatrix();
    for (const [k, [, img]] of karty) {
      const l = postava(k); l.poloha(0, 0, 0, -Math.PI / 2 + 0.35); l.nastav('stoji', 0, 0.5);
      kam.position.set(0, 1.25, 2.6); kam.lookAt(0, 1.05, 0);
      r3.render(scena, kam); img.src = cv.toDataURL('image/png');
    }
    r3.setPixelRatio(Math.min(2, devicePixelRatio || 1)); cv.width = puv[0]; cv.height = puv[1];
    snimky = true;
  }
  function krok(t) {
    if (!bezi) return;
    if (cv.offsetParent === null) { bezi = false; return; }
    if (!api.postavy.pripraveno) { api.postavy.nacti(); requestAnimationFrame(krok); return; }
    if (!snimky) udelejSnimky();
    const dt = Math.min(0.05, (t - (posledni || t)) / 1000); posledni = t;
    if (!tah) uhel += dt * 0.35;
    const w = cv.clientWidth, h = cv.clientHeight, pr = r3.getPixelRatio();
    if (cv.width !== Math.round(w * pr) || cv.height !== Math.round(h * pr)) { r3.setSize(w, h, false); kam.aspect = w / h; kam.updateProjectionMatrix(); }
    const l = postava(vyber());
    l.poloha(0, 0, 0, uhel);
    mavni = Math.max(0, mavni - dt);
    l.nastav(mavni > 0 ? 'emote-yes' : 'stoji', 0, dt);
    kam.position.set(0, 1.35, 5.2); kam.lookAt(0, 0.85, 0);
    r3.render(scena, kam);
    requestAnimationFrame(krok);
  }
  function spust() { obnov(); if (bezi || cv.offsetParent === null || !priprav()) return; bezi = true; posledni = 0; requestAnimationFrame(krok); }
  new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) spust(); }).observe(cv);
  cv.addEventListener('pointerdown', (e) => { tah = { x: e.clientX, u: uhel }; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', (e) => { if (tah) uhel = tah.u + (e.clientX - tah.x) * 0.012; });
  const pust = () => { tah = null; };
  cv.addEventListener('pointerup', pust); cv.addEventListener('pointercancel', pust);
  return { obnov, spust };
}
