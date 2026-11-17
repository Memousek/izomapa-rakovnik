// Garáž 3D jízdy: konfigurátor vlastního auta (karoserie, lak, vzor, kola, podvozek, doplňky) s otočným náhledem.
// Auto se pamatuje v prohlížeči a v multiplayeru ho ostatní vidí stejně (jizda/hraci.js posílá konfiguraci).
// Model staví jizda/vozidla.js (autoHrace / prestavAuto), volby a jejich kontrola jsou v jizda/sit.js.
import { AUTO_VOLBY, AUTO_VYCHOZI, platneAuto } from './sit.js';

const KLIC = 'izo-3d-auto';
const LAKY = ['#c0392b', '#e8443a', '#ff7a1a', '#ffb020', '#e0c400', '#9ccc2a', '#2fbf71', '#14a38b', '#00c2c7', '#2f8cff',
  '#1f3f8f', '#5b6cff', '#b65cff', '#ff6fb1', '#f2f2ee', '#b3b8bf', '#62666d', '#2a2c31', '#6b4a2f', '#cdbd99'];

export function nactiAuto() {
  try { return platneAuto(JSON.parse(localStorage.getItem(KLIC) || 'null')) || { ...AUTO_VYCHOZI }; } catch { return { ...AUTO_VYCHOZI }; }
}

const CSS = `
.gar { display: grid; gap: 10px; }
.gar-nahled { width: 100%; height: 210px; display: block; border-radius: 6px; background: linear-gradient(#3a4660, #1b2333); cursor: grab; touch-action: none; }
.gar-nahled:active { cursor: grabbing; }
.gar-r { display: grid; gap: 4px; }
.gar-r .lbl { font-weight: 700; font-size: 13px; }
.gar-volby { display: flex; flex-wrap: wrap; gap: 4px; }
.gar-volby .px-btn { padding: 5px 9px; font-size: 13px; }
.gar-volby .px-btn[aria-pressed="true"] { outline: 2px solid #29c8ff; outline-offset: 1px; }
.gar-barvy { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
.gar-barvy button { width: 24px; height: 24px; border-radius: 50%; border: 2px solid #0d1220; padding: 0; cursor: pointer; }
.gar-barvy button[aria-pressed="true"] { box-shadow: 0 0 0 2px #fff, 0 0 0 4px #29c8ff; }
.gar-barvy button:focus-visible, .gar-volby .px-btn:focus-visible { outline: 2px solid #29c8ff; outline-offset: 2px; }
.gar-barvy input[type=color] { width: 34px; height: 26px; padding: 0; border: 1px solid #4a5670; background: none; cursor: pointer; }
.gar-dopl { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 13px; }
.gar-dopl label { display: flex; gap: 6px; align-items: center; cursor: pointer; }
.gar-tl { display: flex; gap: 6px; flex-wrap: wrap; }
.gar-pozn { margin: 0; font-size: 12px; color: var(--muted); }
`;

// api: VOZ (jizda/vozidla.js), panel (Element), zmena(a) po každé změně
export function vytvorGaraz(THREE, api) {
  let a = nactiAuto();
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const el = (tag, tr, text) => { const e = document.createElement(tag); if (tr) e.className = tr; if (text) e.textContent = text; return e; };
  const koren = el('div', 'gar');
  const cv = el('canvas', 'gar-nahled'); cv.setAttribute('aria-label', 'Náhled auta, tažením otočíš');
  koren.append(cv);

  // ---------- ovládání ----------
  const prvky = [];                                          // funkce, které podle `a` nastaví stav tlačítek
  const jenVlastni = [];                                     // řádky, které u hotového modelu nemají smysl (vzor, kola, doplňky)
  function radek(nadpis, obsah, vlastni) { const r = el('div', 'gar-r'); r.append(el('span', 'lbl', nadpis), obsah); koren.append(r); if (vlastni) jenVlastni.push(r); return r; }
  function volby(klic, nadpis, vlastni, filtr = () => true) {
    const box = el('div', 'gar-volby'); box.setAttribute('role', 'group'); box.setAttribute('aria-label', nadpis);
    const bt = Object.entries(AUTO_VOLBY[klic]).filter(([k]) => filtr(k)).map(([k, txt]) => {
      const b = el('button', 'px-btn', txt); b.type = 'button';
      b.addEventListener('click', () => zmen({ [klic]: k }));
      box.append(b); return [k, b];
    });
    prvky.push(() => { for (const [k, b] of bt) b.setAttribute('aria-pressed', String(a[klic] === k)); });
    return radek(nadpis, box, vlastni);
  }
  function barvy(klic, nadpis, jenVl) {
    const box = el('div', 'gar-barvy'); box.setAttribute('role', 'group'); box.setAttribute('aria-label', nadpis);
    const bt = LAKY.map((c) => {
      const b = el('button'); b.type = 'button'; b.style.background = c; b.title = c; b.setAttribute('aria-label', `${nadpis} ${c}`);
      b.addEventListener('click', () => zmen({ [klic]: c }));
      box.append(b); return [c, b];
    });
    const vlastni = el('input'); vlastni.type = 'color'; vlastni.title = 'Vlastní barva'; vlastni.setAttribute('aria-label', `${nadpis}: vlastní barva`);
    vlastni.addEventListener('input', () => zmen({ [klic]: vlastni.value }));
    box.append(vlastni);
    prvky.push(() => { for (const [c, b] of bt) b.setAttribute('aria-pressed', String(a[klic] === c)); vlastni.value = a[klic]; });
    return radek(nadpis, box, jenVl);
  }
  const hotovy = (k) => k.startsWith('m_');                 // hotové modely z jizda/vozidla.js HOTOVE
  volby('k', 'Karoserie', false, (k) => !hotovy(k));
  volby('k', 'Hotové modely (Kenney, CC0)', false, hotovy);
  const rLak = barvy('b1', 'Barva laku');
  const pLak = el('p', 'gar-pozn', 'Tenhle model má vlastní barvy.'); rLak.append(pLak);
  volby('v', 'Vzor', true);
  barvy('b2', 'Barva vzoru, spoileru a doplňků', true);
  volby('kola', 'Kola', true);
  volby('vys', 'Podvozek');
  prvky.push(() => {
    const m = hotovy(a.k), lak = !m || api.VOZ.HOTOVE?.[a.k]?.lak;
    for (const r of jenVlastni) r.hidden = m;
    rLak.querySelector('.gar-barvy').hidden = !lak; pLak.hidden = !!lak;
  });
  {
    const box = el('div', 'gar-dopl');
    const ch = Object.entries(AUTO_VOLBY.dopl).map(([k, txt]) => {
      const l = el('label'), c = el('input'); c.type = 'checkbox';
      c.addEventListener('change', () => zmen({ dopl: c.checked ? [...a.dopl, k] : a.dopl.filter((d) => d !== k) }));
      l.append(c, txt); box.append(l); return [k, c];
    });
    prvky.push(() => { for (const [k, c] of ch) c.checked = a.dopl.includes(k); });
    radek('Doplňky', box, true);
  }
  const tl = el('div', 'gar-tl');
  const bNahoda = el('button', 'px-btn', 'Náhodné auto'), bVychozi = el('button', 'px-btn', 'Výchozí');
  bNahoda.type = bVychozi.type = 'button';
  const vyber = (o) => { const k = Object.keys(o); return k[Math.floor(Math.random() * k.length)]; };
  bNahoda.addEventListener('click', () => zmen({
    k: vyber(AUTO_VOLBY.k), v: vyber(AUTO_VOLBY.v), kola: vyber(AUTO_VOLBY.kola), vys: vyber(AUTO_VOLBY.vys),
    b1: LAKY[Math.floor(Math.random() * LAKY.length)], b2: LAKY[Math.floor(Math.random() * LAKY.length)],
    dopl: Object.keys(AUTO_VOLBY.dopl).filter(() => Math.random() < 0.3),
  }));
  bVychozi.addEventListener('click', () => zmen({ ...AUTO_VYCHOZI }));
  tl.append(bNahoda, bVychozi);
  koren.append(tl, el('p', 'gar-pozn', 'Auto se uloží v tomhle prohlížeči. Ve hře s ostatními ho všichni vidí přesně takhle.'));
  const kredit = el('p', 'gar-pozn', 'Hotové modely: Kenney Car Kit (');
  const odkaz = el('a', '', 'kenney.nl'); odkaz.href = 'https://kenney.nl/assets/car-kit'; odkaz.target = '_blank'; odkaz.rel = 'noopener';
  kredit.append(odkaz, ', licence CC0).');
  koren.append(kredit);
  api.panel.append(koren);

  // ---------- náhled: vlastní malé plátno, auto se pomalu otáčí, tažením ho otočíš ----------
  let r3 = null, scena, kam, auto, uhel = -0.6, tah = null, bezi = false, posledni = 0;
  function pripravNahled() {
    if (r3) return true;
    try { r3 = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true }); } catch { return false; }
    r3.outputColorSpace = THREE.LinearSRGBColorSpace;   // barvy bez převodu jako ve hře
    r3.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    scena = new THREE.Scene();
    scena.add(new THREE.HemisphereLight(0xe6eef7, 0x5c5444, 1.05));
    const sl = new THREE.DirectionalLight(0xffffff, 1.25); sl.position.set(0.38, 0.62, 0.68); scena.add(sl);
    const zem = new THREE.Mesh(new THREE.CircleGeometry(3.6, 40).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x59606c }));
    scena.add(zem);
    kam = new THREE.PerspectiveCamera(32, 2, 0.1, 50);
    auto = api.VOZ.autoHrace(a); scena.add(auto); svetlaPryc();
    if (!api.VOZ.pripraveno(a)) { const cil = a; api.VOZ.nactiModel(a.k).then((t) => { if (t && a === cil) { api.VOZ.prestavAuto(auto, a); svetlaPryc(); } }); }
    return true;
  }
  function svetlaPryc() { for (const o of auto.children) if (o.userData.svetlo || o.userData.brzda || o.userData.blinkr !== undefined) o.visible = false; }
  function krok(t) {
    if (!bezi) return;
    if (cv.offsetParent === null) { bezi = false; return; }   // menu zavřené nebo jiná záložka
    const dt = Math.min(0.05, (t - (posledni || t)) / 1000); posledni = t;
    if (!tah) uhel += dt * 0.45;
    const w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.round(w * r3.getPixelRatio()) || cv.height !== Math.round(h * r3.getPixelRatio())) { r3.setSize(w, h, false); kam.aspect = w / h; kam.updateProjectionMatrix(); }
    auto.rotation.y = uhel;
    kam.position.set(7.4, 2.6, 0); kam.lookAt(0, 0.75, 0);
    r3.render(scena, kam);
    requestAnimationFrame(krok);
  }
  function spust() { if (bezi || cv.offsetParent === null || !pripravNahled()) return; bezi = true; posledni = 0; requestAnimationFrame(krok); }
  new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) spust(); }).observe(cv);
  cv.addEventListener('pointerdown', (e) => { tah = { x: e.clientX, u: uhel }; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', (e) => { if (tah) uhel = tah.u + (e.clientX - tah.x) * 0.012; });
  const pust = () => { tah = null; };
  cv.addEventListener('pointerup', pust); cv.addEventListener('pointercancel', pust);

  function zmen(o) {
    const n = platneAuto({ ...a, ...o });
    if (!n) return;
    a = n;
    try { localStorage.setItem(KLIC, JSON.stringify(a)); } catch { /* bez úložiště jen do zavření */ }
    for (const f of prvky) f();
    if (auto) { api.VOZ.prestavAuto(auto, a); svetlaPryc(); }
    api.zmena(a);
    if (!api.VOZ.pripraveno(a)) {                            // hotový model se teprve stahuje: zatím náhradní karoserie, pak znovu
      const cil = a;
      api.VOZ.nactiModel(a.k).then((t) => { if (t && a === cil) { if (auto) { api.VOZ.prestavAuto(auto, a); svetlaPryc(); } api.zmena(a); } });
    }
  }
  for (const f of prvky) f();

  return { auto: () => a, spust };
}
