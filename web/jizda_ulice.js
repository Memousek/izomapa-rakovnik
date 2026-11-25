// Pouliční režim 3D jízdy: přežití na ulici (hlad, zima, hygiena, zdraví), popelnice a lahve, žebrání, večerky,
// rvačky s výtržníky a opilci, krádeže aut, poškození auta, hledanost a policie, která honí autem i pěšky.
// Souřadnice: svět x východ, y sever, z nahoru; three pozice = (x, z, -y).
const KLIC = 'izo-3d-ulice';
const mez = (v, a, b) => (v < a ? a : v > b ? b : v);
const uhel = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const hash = (x, y) => { const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return v - Math.floor(v); };
const hashS = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
const kc = (n) => Math.round(n).toLocaleString('cs-CZ') + ' Kč';

const ZBRANE = { pesti: { nazev: 'Pěsti', sila: 1, dosah: 1.7 }, lahev: { nazev: 'Lahev', sila: 2, dosah: 1.8 }, palka: { nazev: 'Pálka', sila: 2, dosah: 2.1 } };
const OBCHOD = [
  { k: 'Digit1', nazev: 'Rohlík', cena: 5, hlad: 12 },
  { k: 'Digit2', nazev: 'Párek v rohlíku', cena: 35, hlad: 35, teplo: 6 },
  { k: 'Digit3', nazev: 'Krabicové víno', cena: 69, teplo: 25, opilost: 60, zdravi: -4 },
  { k: 'Digit4', nazev: 'Vrátit lahve', lahve: true },
  { k: 'Digit5', nazev: 'Umýt se na WC', cena: 20, umyt: true },
  { k: 'Digit6', nazev: 'Baseballová pálka', cena: 299, zbran: 'palka' },
];
const TRIDY = new Set(['residential', 'living_street', 'tertiary', 'secondary', 'primary', 'unclassified']);
const BOK = { residential: 4.5, living_street: 4.5, unclassified: 4.5, tertiary: 5.5, secondary: 6.5, primary: 6.5 };

const CSS = `
#uHud { position: fixed; z-index: 3; right: 16px; top: 206px; width: 180px; display: grid; gap: 4px; pointer-events: none; font-family: system-ui, sans-serif; }
#uHud .u-hv { font: 900 26px/1 system-ui, sans-serif; text-align: right; letter-spacing: 2px; color: #f2f2f2; text-shadow: 0 0 2px #000, 2px 2px 0 #000; }
#uHud .u-hv b { color: #ffd23a; font-weight: 900; }
#uHud .u-hv.blik b { animation: uBlik .5s steps(2) infinite; }
@keyframes uBlik { 50% { color: #3a8bff; } }
#uHud .u-pat { font: 800 12px system-ui, sans-serif; text-align: right; color: #8fc4ff; text-shadow: 1px 1px 0 #000, 0 0 2px #000; min-height: 14px; }
#uHud .u-pat.vidi { color: #ff6a5a; }
#uHud .u-kc { font: italic 900 24px/1 system-ui, sans-serif; text-align: right; color: #7ee36e; text-shadow: 0 0 2px #000, 2px 2px 0 #000; }
#uHud .u-kc.minus { color: #ff6a5a; }
#uHud .u-bar { position: relative; height: 12px; background: rgba(0, 0, 0, .6); border: 1px solid #000; }
#uHud .u-bar i { position: absolute; inset: 0 auto 0 0; display: block; }
#uHud .u-bar span { position: absolute; right: 4px; top: -1px; font: 700 10px/14px system-ui, sans-serif; color: #fff; text-shadow: 1px 1px 0 #000; }
#uHud .u-zbr { font: 800 13px system-ui, sans-serif; text-align: right; color: #fff; text-shadow: 1px 1px 0 #000, 0 0 2px #000; }
#uTip { position: fixed; z-index: 3; left: 50%; bottom: 72px; transform: translateX(-50%); max-width: calc(100vw - 32px); padding: 6px 12px; background: rgba(10, 12, 18, .82); color: #fff; border-left: 4px solid #ffd23a; font: 700 14px/1.35 system-ui, sans-serif; text-align: center; }
#uTip button { font: inherit; font-size: 13px; margin: 3px 2px 0; padding: 4px 8px; border: 1px solid #5a6680; background: #2a3449; color: #fff; cursor: pointer; }
#uTip button:focus-visible { outline: 2px solid #ffd23a; }
#uVelky { position: fixed; z-index: 6; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; pointer-events: none; background: rgba(0, 0, 0, .45); }
#uVelky b { font: italic 900 clamp(48px, 11vw, 120px)/1 system-ui, sans-serif; letter-spacing: 2px; text-shadow: 0 0 3px #000, 4px 4px 0 #000; }
#uVelky span { font: 700 18px/1.4 system-ui, sans-serif; color: #fff; text-shadow: 1px 1px 0 #000; max-width: 90vw; text-align: center; }
#uRana { position: fixed; z-index: 2; inset: 0; pointer-events: none; opacity: 0; background: radial-gradient(ellipse at center, rgba(160, 0, 0, 0) 45%, rgba(170, 0, 0, .75) 100%); }
.hra-sek .u-ovl { font-size: 12px; color: var(--muted); margin-top: 4px; line-height: 1.45; }
.hra-sek .u-ovl kbd { font: 700 11px system-ui, sans-serif; padding: 0 4px; border: 1px solid #4a5670; border-bottom-width: 2px; border-radius: 3px; color: var(--fg); }
@media (max-width: 700px) { #uHud { top: 128px; right: 10px; width: 130px; } #uHud .u-hv { font-size: 20px; } #uHud .u-kc { font-size: 18px; } #uTip { bottom: 230px; } }
`;

export function vytvorUlici(THREE, scene, api) {
  const { hrac, cars, roads, LIDE } = api;
  const U = api.stav;                                        // sdílený stav pro jizda.html (U.on čtou AI auta a krokAuto)
  const s = {
    on: false, zdravi: 100, hlad: 80, teplo: 80, smrad: 20, lahve: 0, zbran: 'pesti', opilost: 0,
  };
  try {
    const o = JSON.parse(localStorage.getItem(KLIC) || 'null');
    if (o && typeof o === 'object') for (const k in s) if (typeof o[k] === typeof s[k]) s[k] = o[k];
  } catch (e) { /* bez úložiště */ }
  const ulozit = () => { try { localStorage.setItem(KLIC, JSON.stringify(s)); } catch (e) { /* nic */ } };
  // zvuk v místě (x, y světa; z výška terénu, jinak dopočítá): bez polohy hraje „v hlavě“ (HUD, odměny)
  const zvuk = (n, x, y, z) => { try { api.zvuk.hraj(n, x === undefined ? null : [x, (z ?? api.gz(x, y)) + 1, -y]); } catch (e) { /* bez zvuku */ } };
  const penize = () => api.hra.penize.stav();
  const plat = (castka) => api.hra.penize.pridej(castka);
  let vidi = false, vidiT = 0, znama = null, schovany = false;   // policie hráče vidí / kde ho viděla naposled / úkryt v kontejneru
  const motory = [];                                         // prostorové motory nejbližších aut v provozu
  const limitHledani = () => 10 + 6 * hvezdy;                // s bez dohledu, než pátrání skončí
  let t = 0, hvezdy = 0, ztrata = 0, pouta = 0, klid = 0, cekaHlaseni = [], uderCd = 0, uderAnim = 0, zebra = false, zebraT = 0;
  let varovani = {}, konec = null, rana = 0, klakT = 0, ulozT = 0;
  let skokZ = 0, skokV = 0;                                  // skok: výška nad terénem (na střeše auta 1,52 m)
  let pozice = [];                                           // AI auta do 60 m: [auto, poloha] (obnova každý snímek)
  const STRECHA = 1.52;
  const vObdelniku = (x, y, o, h, d, s, m) => { const dx = x - o.x, dy = y - o.y, c = Math.cos(h), sn = Math.sin(h); return Math.abs(dx * c + dy * sn) < d + m && Math.abs(-dx * sn + dy * c) < s + m; };
  const vParkovanem = (x, y, o, m) => vObdelniku(x, y, o, o.h, 2.1, 0.88, m);
  const naStrese = (x, y) => api.parkovana(x, y, 4).some((o) => vParkovanem(x, y, o, 0));
  function prekazka(x, y) {                                  // pěšky: auta (zaparkovaná i v provozu) nejdou projít, jen přeskočit
    if (schovany) return true;
    if (skokZ > 1.1) return false;                           // auta jsou překážka v obou režimech
    const ven = (o, uvnitr) => uvnitr && Math.hypot(x - o.x, y - o.y) > Math.hypot(hrac.x - o.x, hrac.y - o.y);   // kdo už v obrysu stojí, smí ven
    for (const o of api.parkovana(x, y, 4)) if (vParkovanem(x, y, o, 0.25) && !ven(o, vParkovanem(hrac.x, hrac.y, o, 0.25))) return true;
    for (const [a, p] of pozice) {
      if (Math.abs(p.x - x) > 6 || Math.abs(p.y - y) > 6) continue;
      const L = a.T.len / 2, W = a.T.wid / 2;
      if (vObdelniku(x, y, p, p.h, L, W, 0.25) && !ven(p, vObdelniku(hrac.x, hrac.y, p, p.h, L, W, 0.25))) return true;
    }
    return false;
  }
  function alarm(o) {
    if (t - (o.alarmT || -99) < 8) return false;
    o.alarmT = t; zvuk('alarm', o.x, o.y, o.z);
    return true;
  }

  // ---------- UI ----------
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt) e.textContent = txt; return e; };
  const hud = el('div'); hud.id = 'uHud'; hud.hidden = true; hud.setAttribute('aria-live', 'polite');
  const hvEl = el('div', 'u-hv'), kcEl = el('div', 'u-kc'), patEl = el('div', 'u-pat');
  const bar = (barva, popis) => { const b = el('div', 'u-bar'), i = el('i'), sp = el('span', '', popis); i.style.background = barva; b.append(i, sp); b.title = popis; return i; };
  const bZdr = bar('#e23b3b', 'Zdraví'), bHlad = bar('#e8952e', 'Hlad'), bTep = bar('#3a9bff', 'Teplo'), bHyg = bar('#4fc25a', 'Hygiena');
  const zbrEl = el('div', 'u-zbr');
  hud.append(hvEl, patEl, kcEl, bZdr.parentNode, bHlad.parentNode, bTep.parentNode, bHyg.parentNode, zbrEl);
  const tip = el('div'); tip.id = 'uTip'; tip.hidden = true;
  const velky = el('div'); velky.id = 'uVelky'; velky.hidden = true;
  const ranaEl = el('div'); ranaEl.id = 'uRana';
  document.body.append(hud, tip, velky, ranaEl);

  const sek = el('div', 'hra-sek');
  const h2 = el('h2', '', 'Ulice');
  const lab = el('label', 'hra-p'), chk = document.createElement('input');
  chk.type = 'checkbox'; chk.checked = s.on;
  lab.append(chk, document.createTextNode(' Pouliční režim: přežij na ulici'));
  const ovl = el('div', 'u-ovl');
  ovl.innerHTML = '<kbd>Mezerník</kbd> skok (i na auto) · <kbd>F</kbd> / klik úder, u auta rozbít okno · <kbd>E</kbd> u auta ukrást · <kbd>R</kbd> prohrabat popelnici, nakoupit · <kbd>G</kbd> žebrat · <kbd>H</kbd> klakson · <kbd>Mezerník</kbd> v autě ruční brzda (smyk) · <kbd>1</kbd>–<kbd>6</kbd> nákup ve večerce<br><b>Útěk před policií:</b> zmiz jí z dohledu (za roh, mezi domy; v noci a v mlze vidí méně), s hvězdami se schovej do kontejneru (<kbd>R</kbd>) nebo vyměň auto. Když tě nevidí, odpočítává se čas pátrání.';
  const rada = el('div', 'hra-r');
  const bVec = el('button', '', 'Nejbližší večerka'), bVrak = el('button', '', 'Vrakoviště'), bReset = el('button', '', 'Začít znovu');
  for (const b of [bVec, bVrak, bReset]) b.type = 'button';
  rada.append(bVec, bVrak, bReset);
  sek.append(h2, lab, ovl, rada);
  api.panel.appendChild(sek);
  const ukazOvl = () => { ovl.hidden = rada.hidden = !s.on; };
  ukazOvl();

  // ---------- model hráče (třetí osoba): bezdomovec v kabátě a kulichu ----------
  const hracG = new THREE.Group();
  const lam = (c) => new THREE.MeshLambertMaterial({ color: c });
  const dil = (w, h, d, c, x, y, z, hore) => {
    const g = new THREE.BoxGeometry(w, h, d); if (hore) g.translate(0, -h / 2, 0);
    const m = new THREE.Mesh(g, lam(c)); m.position.set(x, y, z); hracG.add(m); api.jenVeDne.push(m); return m;
  };
  const pNohaA = dil(0.15, 0.84, 0.17, 0x3a3a40, 0, 0.84, 0.1, true), pNohaB = dil(0.15, 0.84, 0.17, 0x3a3a40, 0, 0.84, -0.1, true);
  const pTorzo = dil(0.3, 0.66, 0.48, 0x5b4a36, 0, 1.13, 0);
  const pKabat = dil(0.32, 0.3, 0.5, 0x4e3f2e, 0, 0.72, 0);          // šos kabátu
  const pRukaA = dil(0.13, 0.62, 0.13, 0x5b4a36, 0, 1.42, -0.31, true), pRukaB = dil(0.13, 0.62, 0.13, 0x5b4a36, 0, 1.42, 0.31, true);
  const pHlava = dil(0.24, 0.26, 0.24, 0xe2b896, 0, 1.6, 0);
  const pKulich = dil(0.27, 0.12, 0.27, 0x8a2a2a, 0, 1.76, 0);          // kulich (v běžné mapě vlasy)
  const pVousy = dil(0.06, 0.12, 0.2, 0x4a3a2a, 0.11, 1.5, 0);          // vousy
  const lahevM = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.3, 8), lam(0x2f7a3a));
  lahevM.position.set(0, -0.62, 0); pRukaA.add(lahevM);
  const palkaM = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.85, 8), lam(0xb08a52));
  palkaM.position.set(0.25, -0.65, 0); palkaM.rotation.z = -1.2; pRukaA.add(palkaM);
  hracG.visible = false; scene.add(hracG);
  let modelH = 0, krokF = 0, pxL = null, pyL = null, vzhled = null;

  // ---------- popelnice u chodníků (deterministicky podle polohy) ----------
  const MAXP = 70;
  const popGeo = new THREE.BoxGeometry(0.75, 1.05, 0.9).translate(0, 0.52, 0), vikGeo = new THREE.BoxGeometry(0.8, 0.09, 0.95).translate(0, 1.09, 0);
  const popM = new THREE.InstancedMesh(popGeo, lam(0xffffff), MAXP), vikM = new THREE.InstancedMesh(vikGeo, lam(0xffffff), MAXP);
  for (const m of [popM, vikM]) { m.count = 0; m.frustumCulled = false; m.setColorAt(0, new THREE.Color(0xffffff)); scene.add(m); api.jenVeDne.push(m); }
  const POP_BARVY = [[0x2c2f33, 0x1c1e21, 'smesny'], [0x2c2f33, 0x1c1e21, 'smesny'], [0xe7c21c, 0xc9a514, 'plast'], [0x2a5fb8, 0x214c94, 'papir'], [0x2f7a3a, 0x24602d, 'sklo']];
  const popelnice = new Map();      // klíč → {x, y, z, h, druh, prazdna}
  let popBlizko = [], popT = -9;
  function obnovPopelnice() {
    popBlizko = [];
    for (const r of roads) {
      if (!TRIDY.has(r.c) || r.L < 20) continue;
      const m = r.w[r.w.length >> 1];
      if (Math.abs(m[0] - hrac.x) > 220 + r.L / 2 || Math.abs(m[1] - hrac.y) > 220 + r.L / 2) continue;
      for (let sd = 25; sd < r.L - 10; sd += 60) {
        const o = api.along(r, sd), kx = Math.round(o.x), ky = Math.round(o.y), q = kx + ',' + ky;
        let p = popelnice.get(q);
        if (p === undefined) {
          p = null;
          if (hash(kx, ky) < 0.55) {
            const L = Math.hypot(o.dx, o.dy) || 1, str = hash(ky, kx) < 0.5 ? 1 : -1, off = (BOK[r.c] || 4.5) + 0.9;
            const x = o.x - o.dy / L * off * str, y = o.y + o.dx / L * off * str;
            if (!api.hitBuilding(x, y, 0.8) && api.hitBuilding(x, y, 30)) p = { x, y, z: api.gz(x, y), h: Math.atan2(o.dy, o.dx), druh: POP_BARVY[Math.floor(hash(kx + 7, ky) * POP_BARVY.length)], prazdna: -1 };
          }
          popelnice.set(q, p);
        }
        if (p && Math.hypot(p.x - hrac.x, p.y - hrac.y) < 220) popBlizko.push(p);
      }
    }
    popBlizko.sort((a, b) => Math.hypot(a.x - hrac.x, a.y - hrac.y) - Math.hypot(b.x - hrac.x, b.y - hrac.y));
    popBlizko.length = Math.min(popBlizko.length, MAXP);
    const mx = new THREE.Matrix4(), q4 = new THREE.Quaternion(), osa = new THREE.Vector3(0, 1, 0), jedna = new THREE.Vector3(1, 1, 1), c = new THREE.Color();
    popBlizko.forEach((p, i) => {
      q4.setFromAxisAngle(osa, p.h); mx.compose(new THREE.Vector3(p.x, p.z, -p.y), q4, jedna);
      popM.setMatrixAt(i, mx); vikM.setMatrixAt(i, mx);
      popM.setColorAt(i, c.setHex(p.druh[0])); vikM.setColorAt(i, c.setHex(p.druh[1]));
    });
    for (const m of [popM, vikM]) { m.count = s.on ? popBlizko.length : 0; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  }

  // ---------- večerky a vrakoviště (z adres: deterministický výběr) ----------
  let adresy = null, obchody = [], vrak = null;
  async function nactiMista() {
    if (adresy) return;
    adresy = [];
    try { adresy = (await api.navigace.adresy()) || []; } catch (e) { adresy = []; }
    const ad = adresy.filter((a) => a.kind === 'adresa');
    obchody = ad.filter((a) => hashS(a.label) < 0.012);
    // vrakoviště: adresa 500–1600 m od středu mapy s nejmenším otiskem (stálé místo na okraji města)
    let best = null, bh = 2;
    for (const a of ad) { const d = Math.hypot(a.x, a.y), h = hashS('vrak' + a.label); if (d > 500 && d < 1600 && h < bh) { bh = h; best = a; } }
    vrak = best || ad[0] || null;
  }
  const texCedule = (text, bg, fg) => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const g = c.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, 256, 64); g.strokeStyle = '#000'; g.lineWidth = 4; g.strokeRect(2, 2, 252, 60);
    g.fillStyle = fg; g.font = 'italic 900 34px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 34);
    const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; return tx;
  };
  const cedVec = texCedule('VEČERKA', '#1f8a3a', '#fff'), cedVrak = texCedule('VRAKOVIŠTĚ', '#3a3a3a', '#ffd23a');
  const cedule = [];
  for (let i = 0; i < 7; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: cedVec, depthTest: true, fog: false }));
    sp.scale.set(6, 1.5, 1); sp.visible = false; scene.add(sp); cedule.push(sp);
  }
  const kruhGeo = new THREE.RingGeometry(2.6, 3.2, 32).rotateX(-Math.PI / 2);
  const kruhy = cedule.map(() => { const m = new THREE.Mesh(kruhGeo, new THREE.MeshBasicMaterial({ color: 0x3be07a, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false })); m.visible = false; scene.add(m); return m; });
  let obchodBlizko = null;
  function obnovCedule() {
    const vid = [];
    if (vrak && Math.hypot(vrak.x - hrac.x, vrak.y - hrac.y) < 700) vid.push([vrak, cedVrak, 0xffd23a]);
    const ob = obchody.map((o) => [o, Math.hypot(o.x - hrac.x, o.y - hrac.y)]).filter(([, d]) => d < 260).sort((a, b) => a[1] - b[1]);
    for (const [o] of ob) if (vid.length < cedule.length) vid.push([o, cedVec, 0x3be07a]);
    cedule.forEach((sp, i) => {
      const v = s.on && vid[i];
      sp.visible = !!v; kruhy[i].visible = !!v;
      if (!v) return;
      const [o, tx, barva] = v, z = api.gz(o.x, o.y);
      if (sp.material.map !== tx) { sp.material.map = tx; sp.material.needsUpdate = true; sp.scale.set(tx === cedVrak ? 9 : 6, tx === cedVrak ? 2.2 : 1.5, 1); }
      sp.position.set(o.x, z + (tx === cedVrak ? 9 : 5), -o.y);
      kruhy[i].position.set(o.x, z + 0.15, -o.y); kruhy[i].material.color.setHex(barva);
    });
  }

  // ---------- sbírání: peníze z kapes složených protivníků ----------
  const sbirky = [];
  const bankGeo = new THREE.BoxGeometry(0.42, 0.12, 0.24), bankMat = new THREE.MeshBasicMaterial({ color: 0x5fe07a });
  function upustPenize(x, y, castka) {
    if (sbirky.length > 12) { const o = sbirky.shift(); scene.remove(o.m); }
    const m = new THREE.Mesh(bankGeo, bankMat); m.position.set(x, api.gz(x, y) + 0.4, -y); scene.add(m);
    sbirky.push({ x, y, kc: castka, m, t: 60 });
  }

  // ---------- částice: kouř z motoru, oheň, výbuch ----------
  const castice = [];
  const kourMat = new THREE.SpriteMaterial({ color: 0x777777, transparent: true, opacity: 0.5, depthWrite: false });
  const ohenMat = new THREE.SpriteMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.85, depthWrite: false, fog: false });
  function castice1(x, y, z, ohen) {
    if (castice.length > 60) return;
    const sp = new THREE.Sprite((ohen ? ohenMat : kourMat).clone()); sp.position.set(x, z, -y); sp.scale.setScalar(0.6); scene.add(sp);
    castice.push({ sp, t: 0, life: ohen ? 0.6 : 1.8, vz: ohen ? 2.2 : 1.4, ohen });
  }
  let vybuchM = null, vybuchT = 0;
  function vybuch(x, y, z) {
    if (!vybuchM) { vybuchM = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffa020, transparent: true, fog: false, depthWrite: false })); scene.add(vybuchM); }
    vybuchM.position.set(x, z + 1, -y); vybuchM.visible = true; vybuchT = 0;
    zvuk('vybuch', x, y, z);
    for (const p of LIDE._lide) { const d = Math.hypot(p.x - x, p.y - y); if (d < 9 && p.stav !== 'lezi') LIDE.srazen(p, (p.x - x) / (d || 1), (p.y - y) / (d || 1), 14); }
    for (const pc of policie) { const d = Math.hypot(pc.x - x, pc.y - y); if (d < 8) pc.hp -= 60; }
  }

  // ---------- hledanost a policie ----------
  const policie = [];
  const stripeGeo = new THREE.BoxGeometry(3.9, 0.16, 1.82), stripe2Geo = new THREE.BoxGeometry(3.9, 0.07, 1.82), majakGeo = new THREE.BoxGeometry(0.28, 0.13, 0.5);
  function policejniAuto() {
    const g = new THREE.Group();
    const p1 = new THREE.Mesh(stripeGeo, lam(0x1d4fd6)); p1.position.y = 0.72; g.add(p1);
    const p2 = new THREE.Mesh(stripe2Geo, lam(0xf2d21b)); p2.position.y = 0.58; g.add(p2);
    api.jenVeDne.push(p1, p2);
    const ram = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 1.15), lam(0x222222)); ram.position.set(-0.2, 1.47, 0); g.add(ram); api.jenVeDne.push(ram);
    const maj = [0.3, -0.3].map((z) => { const m = new THREE.Mesh(majakGeo, new THREE.MeshBasicMaterial({ color: 0x0a0a30, fog: false })); m.position.set(-0.2, 1.56, z); g.add(m); return m; });
    scene.add(g);
    return { g, maj };
  }
  // dohled: dosah ve dne 85 m, v noci 45 m, v mlze méně; budova mezi = nevidí
  function dohled(ox, oy, x, y, dosah) {
    const dx = x - ox, dy = y - oy, d = Math.hypot(dx, dy);
    if (d < 5) return true;
    if (d > dosah) return false;
    const n = Math.floor(d / 2.5);
    for (let i = 1; i < n; i++) if (api.hitBuilding(ox + dx * i / n, oy + dy * i / n, 0)) return false;
    return true;
  }
  const dosahPolicie = () => (api.doba() > 0.6 ? 45 : 85) * (1 - 0.55 * ((api.pocasi() || {}).mlha || 0)) * (hrac.vAuto ? 1.25 : 1);
  function jednotky() {
    const u = policie.map((pc) => [pc.x, pc.y]);
    for (const p of LIDE._lide) if (p.typ === 3 && p.stav !== 'lezi') u.push([p.x, p.y]);
    return u;
  }
  function policieVidiBod(x, y) { const D = dosahPolicie(); return jednotky().some(([ox, oy]) => dohled(ox, oy, x, y, D)) || hlidkyVidiBod(x, y); }
  function vidiHrace() {
    if (schovany) return false;
    return policieVidiBod(hrac.x, hrac.y);
  }
  function vymenaAuta() {                                    // nové auto, když tě nevidí: policie hledá to staré
    if (hvezdy && !vidi) { ztrata += limitHledani() * 0.35; api.toast('Jiné auto. Policie hledá to staré.', 'odmena'); }
  }
  function nejblizsiPolicie(x, y) {
    let d = 1e9;
    for (const pc of policie) d = Math.min(d, Math.hypot(pc.x - x, pc.y - y));
    for (const p of LIDE._lide) if (p.typ === 3 && p.stav !== 'lezi') d = Math.min(d, Math.hypot(p.x - x, p.y - y));
    return d;
  }
  function pridejHvezdy(n, proc, x, y) {
    if (!s.on) return;
    const pred = hvezdy;
    hvezdy = mez(hvezdy + n, 0, 5); ztrata = 0;
    if (x !== undefined) znama = { x: x + (Math.random() - 0.5) * 20, y: y + (Math.random() - 0.5) * 20 };   // hlášení: místo činu, zhruba
    if (hvezdy > pred) { zvuk('hvezda'); api.toast((proc ? proc + ' ' : '') + 'Hledanost ' + '★'.repeat(hvezdy), 'pokuta'); }
  }
  function zlocin(vaha, x, y, proc, dosah) {
    if (policieVidiBod(x, y)) { pridejHvezdy(vaha, proc ? proc + ', policie to viděla!' : 'Policie to viděla!', x, y); return; }
    if (hvezdy > 0) { pridejHvezdy(vaha >= 2 ? 1 : 0, proc); return; }
    if (LIDE.svedci(x, y, dosah || 35) > 0) cekaHlaseni.push({ t: 3 + Math.random() * 5, vaha, proc, x, y });
  }
  function spawnPolicie() {
    for (let k = 0; k < 80; k++) {
      const r = roads[Math.floor(Math.random() * roads.length)];
      if (!r || r.c === 'service' || r.L < 15) continue;
      const o = api.along(r, Math.random() * r.L), d = Math.hypot(o.x - hrac.x, o.y - hrac.y);
      if (d < 140 || d > 320 || api.hitBuilding(o.x, o.y, 1.6)) continue;
      let h = Math.atan2(o.dy, o.dx); if (Math.cos(h - Math.atan2(hrac.y - o.y, hrac.x - o.x)) < 0) h += Math.PI;
      const pc = { x: o.x, y: o.y, z: o.z, h, v: 8, trasa: null, ti: 0, tTrasa: Math.random() * 2, couva: 0, zasek: 0, dustojnik: null, hp: 100, odjezd: 0, ...policejniAuto() };
      policie.push(pc);
      return;
    }
  }
  function odstranPolicii(pc) {
    scene.remove(pc.g);
    for (const z of [pc.sir, pc.mot]) if (z) z.konec();
    const i = policie.indexOf(pc); if (i >= 0) policie.splice(i, 1);
  }
  const zivy = (p) => p && !p.mrtvy && LIDE._lide.includes(p);
  function krokPolicie(dt) {
    const chci = hvezdy ? Math.min(5, hvezdy + (hvezdy >= 3 ? 1 : 0)) : 0;
    const aktivni = policie.filter((p) => !p.odjezd).length;
    if (aktivni < chci && (aktivni === 0 || Math.random() < dt * 0.8)) spawnPolicie();
    const pesky = !hrac.vAuto && hrac.bus === null;
    for (const pc of policie.slice()) {
      const dx = hrac.x - pc.x, dy = hrac.y - pc.y, d = Math.hypot(dx, dy);
      if (!hvezdy && !pc.odjezd) pc.odjezd = 1;
      if (pc.odjezd) { pc.odjezd += dt; if (pc.odjezd > 25 || d > 260) { odstranPolicii(pc); continue; } }
      if (d > 600 || pc.hp <= 0) { if (pc.hp <= 0) { vybuch(pc.x, pc.y, pc.z); pridejHvezdy(1, 'Zničené policejní auto!', pc.x, pc.y); } odstranPolicii(pc); continue; }
      // cíl: hráč, když ho policie vidí (vysílačkou to vědí všichni); jinak místo, kde ho viděli naposled, a okolí
      let cx = hrac.x, cy = hrac.y;
      if (!vidi && znama) {
        if (!pc.hledej || Math.hypot(pc.hledej.x - pc.x, pc.hledej.y - pc.y) < 18) {
          const r = pc.hledej ? 40 + Math.min(110, ztrata * 6) : 0, a = Math.random() * 6.28;
          pc.hledej = { x: znama.x + Math.cos(a) * r, y: znama.y + Math.sin(a) * r }; pc.tTrasa = 0;
        }
        cx = pc.hledej.x; cy = pc.hledej.y;
      } else pc.hledej = null;
      const dc = Math.hypot(cx - pc.x, cy - pc.y), honi = vidi && !pc.odjezd;
      pc.tTrasa -= dt;
      if (!pc.odjezd && pc.tTrasa <= 0 && dc > 30) {
        pc.tTrasa = 2.5 + Math.random();
        try { pc.trasa = api.navigace.trasa(pc.x, pc.y, cx, cy, true); pc.ti = 0; } catch (e) { pc.trasa = null; }
      }
      let tx = cx, ty = cy, naKonci = false;
      if (pc.odjezd) { tx = pc.x - dx; ty = pc.y - dy; }
      else if (dc > 30 && pc.trasa && pc.trasa.length > 1) {
        while (pc.ti < pc.trasa.length - 1 && Math.hypot(pc.trasa[pc.ti][0] - pc.x, pc.trasa[pc.ti][1] - pc.y) < 7) pc.ti++;
        [tx, ty] = pc.trasa[pc.ti];
        naKonci = pc.ti >= pc.trasa.length - 1 && Math.hypot(tx - pc.x, ty - pc.y) < 12;   // dál po silnici nejde (hráč ve dvoře, v parku)
      }
      let dh = uhel(Math.atan2(ty - pc.y, tx - pc.x) - pc.h);
      // auto v provozu před policií: zpomalit a objet vlevo
      const vp = vozidloPred(pc, true), prekazi = vp.f < 12;
      if (prekazi && pc.couva <= 0) dh += 0.45;
      let vc;
      if (pc.couva > 0) { pc.couva -= dt; vc = -5; }
      else {
        vc = (honi && d < 30 ? mez(d * 0.9, 0, 30) : vidi || pc.odjezd ? 25 : 17) * (1 - Math.min(0.75, Math.abs(dh) / 1.4));
        if (prekazi) vc = Math.min(vc, 6, Math.max(0, (vp.f - 1.2) * 1.8));
        if (pesky && honi && (d < 15 || naKonci)) vc = 0;   // u pěšího (nebo na konci silnice) zastaví, vystoupí policista
        else if (naKonci || (!vidi && dc < 10)) vc = 0;
        if (hvezdy >= 3 && hrac.vAuto && honi && d < 30) vc = Math.max(vc, 18);   // od 3 hvězd taran
      }
      pc.v += mez(vc - pc.v, -16 * dt, 9 * dt);
      const tr = 2.4 * Math.min(1, Math.abs(pc.v) / 4);
      pc.h += mez(dh, -tr * dt, tr * dt) * (pc.v < 0 ? -0.5 : 1);
      const nx = pc.x + Math.cos(pc.h) * pc.v * dt, ny = pc.y + Math.sin(pc.h) * pc.v * dt;
      const pred = pc.v >= 0 ? 2.2 : -2.2;
      if (api.hitBuilding(nx + Math.cos(pc.h) * pred, ny + Math.sin(pc.h) * pred, 0.9) || !api.inMap(nx, ny)) {
        pc.zasek += dt; pc.v *= -0.2;
        if (pc.zasek > 0.6) { pc.couva = 1.1; pc.zasek = 0; pc.tTrasa = 0; }
      } else if (obsazeno(pc, nx, ny, pc.h, true)) { pc.v = 0; pc.zasek += dt; if (pc.zasek > 3) { pc.couva = 1.0; pc.zasek = 0; pc.tTrasa = 0; } }
      else { pc.x = nx; pc.y = ny; pc.zasek = Math.max(0, pc.zasek - dt * 0.5); }
      pc.z = api.vyska(pc.x, pc.y, pc.z).z;
      // srážka s autem hráče
      if (hrac.vAuto && hrac.car) {
        const c = hrac.car, ex = c.x - pc.x, ey = c.y - pc.y, ed = Math.hypot(ex, ey);
        if (ed < 3.4 && ed > 0.01) {
          const nxx = ex / ed, nyy = ey / ed, push = (3.4 - ed) / 2;
          c.x += nxx * push; c.y += nyy * push; pc.x -= nxx * push; pc.y -= nyy * push;
          const rel = Math.abs(pc.v - c.v * Math.cos(c.h - pc.h));
          if (rel > 3) { poskodAuto(rel * 1.6); pc.hp -= rel * 1.2; zvuk('naraz', pc.x, pc.y, pc.z); if (hvezdy < 2) pridejHvezdy(1, 'Naboural jsi policii!', hrac.x, hrac.y); }
          pc.v *= 0.3;
        }
      }
      // policista vystoupí k pěšímu hráči
      if (pesky && hvezdy && (honi && (d < 18 || naKonci && d < 160) || !vidi && naKonci && dc < 160) && Math.abs(pc.v) < 1 && !zivy(pc.dustojnik)) {
        const bx = pc.x - Math.sin(pc.h) * 1.6, by = pc.y + Math.cos(pc.h) * 1.6;
        pc.dustojnik = LIDE.zrodNa(bx, by, 3, 'honi');
      }
      // zatčení v autě: stojíš a policie je u tebe
      if (hrac.vAuto && hrac.car && honi && d < 7 && Math.abs(hrac.car.v) < 1.5) pouta += dt * 0.4;
      // siréna a motor v místě vozu (Doppler podle přibližování ke kameře)
      if (api.zvuk.bezi) {
        if (!pc.sir) { pc.sir = api.zvuk.zdroj('sirena'); pc.mot = api.zvuk.zdroj('motor'); }
        const cp = api.camera.position, dk = Math.hypot(pc.x - cp.x, pc.y + cp.z, pc.z - cp.y), k = pc.dk === undefined ? 0 : (pc.dk - dk) / Math.max(dt, 1e-3);
        pc.dk = dk;
        pc.sir.nastav(pc.x, pc.z + 1.6, -pc.y, k, !pc.odjezd);
        pc.mot.nastav(pc.x, pc.z + 0.6, -pc.y, k, pc.v);
      }
      // vykreslení
      pc.g.position.set(pc.x, pc.z, -pc.y); pc.g.rotation.y = pc.h;
      const blik = Math.floor(t * 6) % 2;
      pc.maj[0].material.color.setHex(blik ? 0x2a5cff : 0x0a0a30); pc.maj[1].material.color.setHex(blik ? 0x0a0a30 : 0x2a5cff);
      if (pc.hp < 35 && Math.random() < dt * 8) castice1(pc.x + Math.cos(pc.h) * 1.6, pc.y + Math.sin(pc.h) * 1.6, pc.z + 1.2, pc.hp < 15);
    }
    // policisté pěšky: při nulové hledanosti odchází
    for (const p of LIDE._lide) if (p.typ === 3 && !hvezdy && (p.stav === 'honi')) { p.stav = 'utika'; p.vytrv = 5; }
  }


  // ---------- záchranné složky: hlídky policie a sanitky v běžném provozu, výjezd záchranky ke zraněnému ----------
  // v provozu: část aut jsou policejní hlídky (bílé s modrým pruhem) a sanitky (žluté se zeleným pruhem), majáky vypnuté;
  // v režimu přežití hlídka vidí jako policie (přestupky, honička) a k zmláceným nebo sraženým lidem vyjíždí záchranka:
  // nejvýš 2 naráz a mezi výjezdy aspoň 40 s; kdo se záchranky nedočká do 2 minut, zvedne se sám
  const MAX_ZACHRANEK = 2, ODSTUP_VYJEZDU = 40;
  const zachranky = [], ranenych = [];
  let posledniVyjezd = -1e9;
  const zelenaGeo = new THREE.BoxGeometry(5.2, 0.3, 2.04), ramZzs = new THREE.BoxGeometry(0.3, 0.1, 1.5);
  function zachrankaAuto() {
    const g = new THREE.Group();
    const pr = new THREE.Mesh(zelenaGeo, lam(0x2e9e4a)); pr.position.y = 1.05; g.add(pr); api.jenVeDne.push(pr);
    const ram = new THREE.Mesh(ramZzs, lam(0x222222)); ram.position.set(1.6, 2.33, 0); g.add(ram); api.jenVeDne.push(ram);
    const maj = [0.45, -0.45].map((z) => { const m = new THREE.Mesh(majakGeo, new THREE.MeshBasicMaterial({ color: 0x0a0a30, fog: false })); m.position.set(1.6, 2.42, z); g.add(m); return m; });
    g.visible = false; scene.add(g);
    return { g, maj };
  }
  // overlaye (pruhy, majáky) pro hlídky a sanitky v provozu: pool, přiřazuje se nejbližším
  const poolPol = [], poolZzs = [];
  function oznacSluzby() {
    for (const c of cars) {
      if (c.sl !== undefined) continue;
      const r = Math.random();
      c.sl = c.t === 'car' && r < 0.025 ? 'pol' : c.t === 'van' && r < 0.1 ? 'zzs' : null;
      if (c.sl === 'pol') c.col = '#e9ecef'; else if (c.sl === 'zzs') c.col = '#f2cf1d';
    }
  }
  function overlayeSluzeb() {
    const bl = { pol: [], zzs: [] };
    for (const c of cars) {
      if (!c.sl) continue;
      const q = api.carPose(c), d = Math.hypot(q.x - hrac.x, q.y - hrac.y);
      if (d < 320) bl[c.sl].push([d, q, c]);
    }
    for (const [druh, pool, tvor] of [['pol', poolPol, () => { const o = policejniAuto(); o.g.visible = false; return o; }], ['zzs', poolZzs, zachrankaAuto]]) {
      const a = bl[druh].sort((u, w) => u[0] - w[0]).slice(0, 8);
      while (pool.length < a.length) pool.push(tvor());
      pool.forEach((o, i) => {
        const u = a[i]; o.g.visible = !!u;
        if (!u) return;
        const q = u[1];
        o.g.position.set(q.x, q.z, -q.y); o.g.rotation.y = q.h;
        for (const m of o.maj) m.material.color.setHex(0x0a0a30);   // běžná jízda: majáky nesvítí
      });
    }
  }
  // hlídka v provozu uvidí hledaného hráče: odbočí z provozu a začne honičku
  function hlidkyVProvozu() {
    if (!hvezdy) return;
    const D = dosahPolicie();
    for (const c of cars) {
      if (c.sl !== 'pol') continue;
      const q = api.carPose(c);
      if (Math.abs(q.x - hrac.x) > D || Math.abs(q.y - hrac.y) > D || schovany || !dohled(q.x, q.y, hrac.x, hrac.y, D)) continue;
      cars.splice(cars.indexOf(c), 1);
      policie.push({ x: q.x, y: q.y, z: q.z, h: q.h, v: 8, trasa: null, ti: 0, tTrasa: 0, couva: 0, zasek: 0, dustojnik: null, hp: 100, odjezd: 0, ...policejniAuto() });
      api.toast('Hlídka v ulici tě poznala!', 'pokuta');
      return;
    }
  }
  function hlidkyVidiBod(x, y) {
    const D = dosahPolicie();
    for (const c of cars) {
      if (c.sl !== 'pol') continue;
      const q = api.carPose(c);
      if (Math.abs(q.x - x) < D && Math.abs(q.y - y) < D && dohled(q.x, q.y, x, y, D)) return true;
    }
    return false;
  }
  // zraněný (složený pěstí, sražený autem): čeká na záchranku
  function zraneny(p) {
    if (!s.on || !p || ranenych.length >= 4 || ranenych.some((z) => z.p === p)) return;
    p.lezi = 600;                                            // leží, dokud nepřijede záchranka (nebo nevyprší čekání)
    ranenych.push({ p, t: 0, sanitka: null });
  }
  function bodNaSilnici(cx, cy, dmin, dmax) {
    for (let k = 0; k < 80; k++) {
      const r = roads[Math.floor(Math.random() * roads.length)];
      if (!r || r.c === 'service' || r.L < 15) continue;
      const o = api.along(r, Math.random() * r.L), d = Math.hypot(o.x - cx, o.y - cy);
      if (d < dmin || d > dmax || api.hitBuilding(o.x, o.y, 1.8)) continue;
      let h = Math.atan2(o.dy, o.dx); if (Math.cos(h - Math.atan2(cy - o.y, cx - o.x)) < 0) h += Math.PI;
      return { x: o.x, y: o.y, z: o.z, h };
    }
    return null;
  }
  // jízda vozidla po trase k cíli (sanitka): vrátí true, když dál po silnici nejde nebo je u cíle
  function ridit(v, tx, ty, vmax, dt, zastav) {
    const dc = Math.hypot(tx - v.x, ty - v.y);
    v.tTrasa -= dt;
    if (v.tTrasa <= 0 && dc > 25) { v.tTrasa = 3 + Math.random(); try { v.trasa = api.navigace.trasa(v.x, v.y, tx, ty, true); v.ti = 0; } catch (e) { v.trasa = null; } }
    let cx = tx, cy = ty, naKonci = false;
    if (dc > 25 && v.trasa && v.trasa.length > 1) {
      while (v.ti < v.trasa.length - 1 && Math.hypot(v.trasa[v.ti][0] - v.x, v.trasa[v.ti][1] - v.y) < 7) v.ti++;
      [cx, cy] = v.trasa[v.ti];
      naKonci = v.ti >= v.trasa.length - 1 && Math.hypot(cx - v.x, cy - v.y) < 12;
    }
    let dh = uhel(Math.atan2(cy - v.y, cx - v.x) - v.h);
    const vp = vozidloPred(v);
    const prekazi = vp.f < 12;
    if (prekazi && v.couva <= 0 && v.zasek > 2) dh += 0.45;   // dlouho stojí za překážkou: zkusit objet
    let vc;
    if (v.couva > 0) { v.couva -= dt; vc = -4; }
    else {
      vc = vmax * (1 - Math.min(0.75, Math.abs(dh) / 1.4));
      if (prekazi) vc = Math.min(vc, Math.max(0, (vp.f - 1.2) * 1.6));   // zastavit kus před vozidlem
      if (zastav && (dc < zastav || naKonci)) vc = 0;
    }
    v.v += mez(vc - v.v, -12 * dt, 6 * dt);
    const tr = 2.2 * Math.min(1, Math.abs(v.v) / 4);
    v.h += mez(dh, -tr * dt, tr * dt) * (v.v < 0 ? -0.5 : 1);
    const nx = v.x + Math.cos(v.h) * v.v * dt, ny = v.y + Math.sin(v.h) * v.v * dt, pred = v.v >= 0 ? 2.8 : -2.8;
    if (api.hitBuilding(nx + Math.cos(v.h) * pred, ny + Math.sin(v.h) * pred, 1.0) || !api.inMap(nx, ny)) {
      v.zasek += dt; v.v *= -0.2;
      if (v.zasek > 0.6) { v.couva = 1.2; v.zasek = 0; v.tTrasa = 0; }
    } else if (obsazeno(v, nx, ny, v.h)) { v.v = 0; v.zasek += dt; if (v.zasek > 5) { v.couva = 1.0; v.zasek = 0; v.tTrasa = 0; } }   // vozidla se neprolínají
    else { v.x = nx; v.y = ny; v.zasek = Math.max(0, v.zasek - dt * 0.5); }
    v.z = api.vyska(v.x, v.y, v.z).z;
    return zastav && Math.abs(v.v) < 0.5 && (dc < zastav || naKonci);
  }

  // ---------- drobné nehody v provozu: dvě auta se ťuknou, stojí s výstražnými světly, přijede hlídka, za nimi kolona ----------
  // v obou režimech; jedna nehoda naráz, další nejdřív za 2–5 minut; místo 80–280 m od hráče, ať je vidět, ale nevznikne před ním
  let nehoda = null, nehodaT = 60 + Math.random() * 90;
  function krokNehod(dt) {
    if (nehoda) {
      nehoda.t += dt;
      if (nehoda.t > 160) nehoda.konec();                    // pojistka, kdyby hlídka nedojela
      return;
    }
    nehodaT -= dt;
    if (nehodaT > 0) return;
    nehodaT = 120 + Math.random() * 180;
    const kand = [];
    for (const a of cars) {
      if (a.sl || a.nehoda || a.hold || (a.t !== 'car' && a.t !== 'van')) continue;
      const q = api.carPose(a), d = Math.hypot(q.x - hrac.x, q.y - hrac.y);
      if (d < 60 || d > 350) continue;
      const b = cars.find((o) => o !== a && o.r === a.r && o.dir === a.dir && !o.sl && (o.t === 'car' || o.t === 'van') && a.p - o.p > 3 && a.p - o.p < 30);   // zadní dojede a ťukne se
      kand.push([a, b || null, q]);
    }
    if (!kand.length) return;
    let [a, b, q] = kand.find((k) => k[1]) || kand[Math.floor(Math.random() * kand.length)];
    const mistoHlidky = { x: q.x + Math.cos(q.h) * (a.T.len / 2 + 7), y: q.y + Math.sin(q.h) * (a.T.len / 2 + 7) };   // před předním autem, kolona je za nimi
    if (!b) {                                                  // nikdo za ním nejede: přidat auto, které do něj zezadu najelo
      const r = roads[a.r], s0 = a.s - a.dir * 6.5;
      if (s0 < 0 || s0 > r.L) return;
      b = { r: a.r, dir: a.dir, s: s0, f: a.f, truck: false, t: 'car', T: a.t === 'car' ? a.T : { len: 4.2, wid: 1.76, h: 1.45, vmax: 130, gap: 8 }, pr: -1, drzy: false,
        col: ['#ecebe6', '#b3b8bf', '#2a2c31', '#b8291f', '#33529e', '#62666d'][Math.floor(Math.random() * 6)], sl: null };
      cars.push(b);
    }
    a.nehoda = b.nehoda = true; a.cekej = b.cekej = 1e4;
    zvuk('naraz', q.x, q.y, q.z);
    if (s.on) for (let i = 0; i < 6; i++) castice1(q.x - Math.cos(q.h) * 2.2, q.y - Math.sin(q.h) * 2.2, q.z + 0.6, false);   // kouř (částice běží v režimu přežití)
    nehoda = { t: 0, konec() { for (const c of [a, b]) { c.nehoda = false; c.cekej = 0; } nehoda = null; } };
    if (Math.hypot(q.x - hrac.x, q.y - hrac.y) < 250) api.toast('Kousek odsud se ťukla dvě auta. Tvoří se kolona.', 'info');
    const start = bodNaSilnici(q.x, q.y, 180, 320);
    if (start) {
      const h = { ...start, druh: 'pol', v: 8, trasa: null, ti: 0, tTrasa: 0, couva: 0, zasek: 0, stav: 'jede', cas: 0, mista: mistoHlidky, hotovo: () => nehoda && nehoda.konec(), ...policejniAuto() };
      zachranky.push(h);
    }
  }
  function krokZachranky(dt) {
    // čekající zranění: kdo se nedočká, zvedne se sám
    for (const z of ranenych.slice()) {
      z.t += dt;
      if (!zivy(z.p) || z.p.stav !== 'lezi' || (!z.sanitka && z.t > 120)) {
        if (zivy(z.p) && z.p.stav === 'lezi') z.p.lezi = 3;
        ranenych.splice(ranenych.indexOf(z), 1);
      }
    }
    // výjezd: nejvýš MAX_ZACHRANEK naráz, mezi výjezdy ODSTUP_VYJEZDU s
    const ceka = ranenych.find((z) => !z.sanitka);
    krokNehod(dt);
    if (ceka && zachranky.filter((a) => a.stav !== 'odjezd').length < MAX_ZACHRANEK && t - posledniVyjezd > ODSTUP_VYJEZDU) {
      const b = bodNaSilnici(ceka.p.x, ceka.p.y, 160, 320);
      if (b) {
        const a = { ...b, druh: 'zzs', v: 8, trasa: null, ti: 0, tTrasa: 0, couva: 0, zasek: 0, stav: 'jede', cas: 0, zr: ceka, ...zachrankaAuto() };
        a.g.visible = true; ceka.sanitka = a; zachranky.push(a); posledniVyjezd = t;
        if (Math.hypot(ceka.p.x - hrac.x, ceka.p.y - hrac.y) < 200) api.toast('Někdo volal záchranku.', 'info');
      }
    }
    for (const a of zachranky.slice()) {
      a.cas += dt;
      const d = Math.hypot(a.x - hrac.x, a.y - hrac.y);
      if (a.druh === 'pol') {                                   // hlídka u nehody: dojede, 35 s sepisuje, auta se pak rozjedou
        if (a.stav === 'jede') { if (ridit(a, a.mista.x, a.mista.y, 20, dt, 5) || a.cas > 90) { a.stav = 'na_miste'; a.cas = 0; } }
        else if (a.stav === 'na_miste') { a.v = 0; if (a.cas > 35) { a.hotovo(); a.stav = 'odjezd'; a.cas = 0; a.tTrasa = 0; a.cil = null; } }
        else {
          if (!a.cil) a.cil = bodNaSilnici(a.x, a.y, 300, 600) || { x: a.x + 400, y: a.y };
          ridit(a, a.cil.x, a.cil.y, 16, dt, 0);
          if (a.cas > 30 || (d > 350 && a.cas > 5)) { scene.remove(a.g); if (a.sir) a.sir.konec(); zachranky.splice(zachranky.indexOf(a), 1); continue; }
        }
      } else if (a.stav === 'jede') {
        const p = a.zr.p;
        if (!zivy(p) || p.stav !== 'lezi') { a.stav = 'odjezd'; a.cas = 0; }
        else if (ridit(a, p.x, p.y, 22, dt, 14) || a.cas > 100) { a.stav = 'naklada'; a.cas = 0; a.nakladka = 9 + Math.min(50, Math.hypot(a.x - p.x, a.y - p.y) * 2 / 1.5); }   // dál od silnice: záchranáři jdou pěšky s nosítky
      } else if (a.stav === 'naklada') {
        a.v = 0;
        if (a.cas > (a.nakladka || 9)) {
          const p = a.zr.p;
          if (zivy(p)) p.mrtvy = true;                           // naložen a odvezen
          const i = ranenych.indexOf(a.zr); if (i >= 0) ranenych.splice(i, 1);
          if (d < 150) api.toast('Záchranka odvezla zraněného.', 'info');
          a.stav = 'odjezd'; a.cas = 0; a.tTrasa = 0;
          a.cil = bodNaSilnici(a.x, a.y, 300, 600) || { x: a.x + 400, y: a.y };
        }
      } else {                                                  // odjezd
        if (!a.cil) a.cil = bodNaSilnici(a.x, a.y, 300, 600) || { x: a.x + 400, y: a.y };
        ridit(a, a.cil.x, a.cil.y, 16, dt, 0);
        if (a.cas > 30 || (d > 350 && a.cas > 5)) {
          scene.remove(a.g); if (a.sir) a.sir.konec();
          zachranky.splice(zachranky.indexOf(a), 1);
          continue;
        }
      }
      a.g.position.set(a.x, a.z, -a.y); a.g.rotation.y = a.h;
      const sviti = a.stav !== 'odjezd', blik = Math.floor(t * 5 + 0.5) % 2;   // u nehody majáky svítí i na místě
      a.maj[0].material.color.setHex(sviti && blik ? 0x2a5cff : 0x0a0a30); a.maj[1].material.color.setHex(sviti && !blik ? 0x2a5cff : 0x0a0a30);
      if (api.zvuk.bezi) {                                     // siréna jen cestou k zraněnému
        if (!a.sir) a.sir = api.zvuk.zdroj('sirena');
        const cp = api.camera.position, dk = Math.hypot(a.x - cp.x, a.y + cp.z, a.z - cp.y), k = a.dk === undefined ? 0 : (a.dk - dk) / Math.max(dt, 1e-3);
        a.dk = dk; a.sir.nastav(a.x, a.z + (a.druh === 'pol' ? 1.6 : 2.3), -a.y, k, a.stav === 'jede');
      }
    }
  }

  // ---------- zásahy do hráče ----------
  function zraneni(n, proc) {
    if (konec) return;
    s.zdravi -= n; rana = Math.min(1, rana + 0.25 + n / 40);
    if (s.zdravi <= 0) ko(proc);
  }
  const B = {
    on: false,
    utok(p, d) {
      if (konec) return;
      if (hrac.vAuto && hrac.car) {                        // kope do auta
        if (Math.abs(hrac.car.v) < 2) { poskodAuto(3); zvuk('zasah', hrac.car.x, hrac.car.y); }
        return;
      }
      if (schovany) return;
      if (p.typ === 3) {
        pouta += hvezdy >= 3 ? 0.22 : 0.4;
        if (hvezdy >= 3) { zraneni(6, 'Obušek'); zvuk('zasah', p.x, p.y); }
        return;
      }
      zvuk('zasah', p.x, p.y);
      zraneni((p.typ === 1 ? 9 : p.typ === 2 ? 5 : 7) * (0.8 + Math.random() * 0.4), 'Rvačka');
    },
    drzi: (p) => p.typ === 3 && hvezdy > 0,
    terc(p) {                                                // policista hráče nevidí: jde tam, kde ho naposled viděli, a prohledává okolí
      if (p.typ !== 3 || !hvezdy || vidi || !znama) { p._hl = null; return null; }
      if (!p._hl || Math.hypot(p._hl[0] - p.x, p._hl[1] - p.y) < 2.5) {
        const a = Math.random() * 6.28, r = p._hl ? 8 + Math.random() * 30 : 0;
        p._hl = [znama.x + Math.cos(a) * r, znama.y + Math.sin(a) * r]; p._tr = null;
      }
      return p._hl;
    },
    cil(p, d, tx, ty) {                                      // pronásledovatel dál než 12 m od cíle: po pěší trase
      if (d < 12) { p._tr = null; return null; }
      if (!p._tr || t - p._tt > 2.5) {
        p._tt = t + Math.random() * 0.5;
        try { p._tr = api.navigace.trasa(p.x, p.y, tx, ty, false); } catch (e) { p._tr = null; }
        p._ti = 0;
      }
      const R = p._tr; if (!R || R.length < 2) return null;
      const E = R[R.length - 1];
      if (Math.hypot(E[0] - tx, E[1] - ty) > d - 3) return null;   // trasa končí dál od cíle, než stojí policista: rovnou
      while (p._ti < R.length - 1 && Math.hypot(R[p._ti][0] - p.x, R[p._ti][1] - p.y) < 2.5) p._ti++;
      if (p._ti >= R.length - 1 && Math.hypot(R[p._ti][0] - p.x, R[p._ti][1] - p.y) < 2.5) return null;   // konec cesty: dál vzdušnou čarou
      return R[p._ti];
    },
    provokace: (p) => (p.typ === 1 ? 0.25 : 0.1) * (api.doba() > 0.6 ? 2 : 1) * (s.smrad > 60 ? 1.6 : 1) * (s.on ? 1 : 0),
  };
  api.lideBoj.boj = B;

  function uder() {
    if (konec || hrac.vAuto || hrac.bus !== null || uderCd > 0) return;   // rána jde i v běžné mapě (bez policie a rvaček)
    uderCd = 0.45; uderAnim = 0.3; zebra = false;
    modelH = hrac.yaw;
    const Z = ZBRANE[s.zbran] || ZBRANE.pesti, c = Math.cos(hrac.yaw), sn = Math.sin(hrac.yaw);
    const p = LIDE.blizky(hrac.x, hrac.y, Z.dosah + 0.4, (q) => {
      if (q.stav === 'lezi') return false;
      const dx = q.x + q.ex - hrac.x, dy = q.y + q.ey - hrac.y, d = Math.hypot(dx, dy) || 1;
      return (dx * c + dy * sn) / d > 0.35;
    });
    if (!p) {
      // rána do auta před sebou: zaparkované = rozbité okno a vykradení, v provozu = řidič vystoupí
      const px = hrac.x + c * 1.3, py = hrac.y + sn * 1.3;
      const o = api.parkovana(px, py, 4).find((q) => vParkovanem(px, py, q, 0.35));
      if (o) {
        zvuk('zasah', o.x, o.y, o.z);
        if (o.okno) return api.toast('Okno je už rozbité, nic tu není.', 'info');
        o.okno = true; const zvoni = Math.random() < 0.7 && alarm(o);
        const r = Math.random();
        if (r < 0.45) { const k = 10 + Math.floor(Math.random() * 190); plat(k); api.toast(`Rozbil jsi okno: v přihrádce ${kc(k)}${zvoni ? ' · ALARM!' : ''}`, 'odmena'); }
        else if (r < 0.6) { s.hlad = mez(s.hlad + 20, 0, 100); api.toast(`Rozbil jsi okno: svačina na sedadle, hlad +20${zvoni ? ' · ALARM!' : ''}`, 'odmena'); }
        else if (r < 0.72) { s.lahve += 2; api.toast(`Rozbil jsi okno: 2 lahve pod sedadlem${zvoni ? ' · ALARM!' : ''}`, 'odmena'); }
        else api.toast(`Rozbil jsi okno: jen parkovací lístky${zvoni ? ' · ALARM!' : ''}`, 'info');
        zlocin(1, o.x, o.y, 'Vykradené auto', zvoni ? 70 : 25);
        return;
      }
      for (const [a, q] of pozice) {
        if (!vObdelniku(px, py, q, q.h, a.T.len / 2, a.T.wid / 2, 0.35)) continue;
        zvuk('zasah', q.x, q.y, q.z); a.cekej = 4;
        if (!a.rr && kradeTyp(a)) { a.rr = true; LIDE.zrodNa(q.x - Math.sin(q.h) * 2.2, q.y + Math.cos(q.h) * 2.2, 4, 'utoci'); api.toast('Bouchl jsi do auta. Řidič jde ven!', 'pokuta'); }
        return;
      }
      zvuk('uder'); return;
    }
    const dx = p.x + p.ex - hrac.x, dy = p.y + p.ey - hrac.y, d = Math.hypot(dx, dy) || 1;
    const bylAgresor = p.stav === 'utoci' || p.stav === 'honi' && p.typ !== 3, typ = p.typ;
    const r = LIDE.zasah(p, Z.sila, dx / d, dy / d);
    zvuk('zasah', p.x, p.y);
    if (s.zbran === 'lahev' && Math.random() < 0.25) { s.zbran = 'pesti'; api.toast('Lahev se rozbila.', 'info'); }
    LIDE.panika(hrac.x, hrac.y, 16);
    if (r === 'ko') {
      if (typ !== 3 && Math.random() < 0.75) upustPenize(p.x, p.y, Math.round(20 + Math.random() * (typ === 1 ? 400 : 250)));
      if (typ !== 3) zraneny(p);
      if (typ === 3) zlocin(2, p.x, p.y, 'Složil jsi policistu!');
      else if (!bylAgresor) zlocin(1, p.x, p.y, 'Napadení');
    } else if (typ === 3) zlocin(1, p.x, p.y, 'Útok na policistu');
    else if (!bylAgresor && typ === 0) zlocin(1, p.x, p.y, 'Napadení');
  }

  // ---------- auto: poškození, krádež, srážky ----------
  function poskodAuto(n) {
    const c = hrac.car; if (!c || !s.on) return;
    if (c.hp === undefined) c.hp = 100;
    c.hp -= n;
  }
  function kradeTyp(c) { return c.t === 'car' || c.t === 'van'; }
  function ukradni() {
    if (!s.on || hrac.vAuto || hrac.bus !== null) return null;
    let best = null, bd = 4.8;
    for (const c of cars) {
      if (!kradeTyp(c)) continue;
      const p = api.carPose(c), d = Math.hypot(p.x - hrac.x, p.y - hrac.y);
      if (d < bd) { bd = d; best = [c, p]; }
    }
    // zaparkované auto: vypáčit zámek (občas se rozječí alarm)
    let park = null, pd = Math.min(bd, 3.8);
    for (const o of api.parkovana(hrac.x, hrac.y, 5)) { const d = Math.hypot(o.x - hrac.x, o.y - hrac.y); if (d < pd) { pd = d; park = o; } }
    if (park) {
      api.skryjParkovane(park);
      const zvoni = Math.random() < 0.4 && alarm(park);
      if (zvoni) api.toast('Spustil se alarm!', 'pokuta');
      zlocin(1, park.x, park.y, 'Krádež auta', zvoni ? 70 : 20);
      try { api.mojeAuto.children[0].material.color.set(park.col); } catch (e) { /* nic */ }
      vymenaAuta();
      return { x: park.x, y: park.y, z: park.z, most: false, h: park.h, v: 0, steer: 0, kradene: true, hp: park.okno ? 90 : 100, typ: 'car', col: park.col };
    }
    if (!best) return null;
    const [c, p] = best;
    cars.splice(cars.indexOf(c), 1);
    const bx = p.x - Math.sin(p.h) * 2.2, by = p.y + Math.cos(p.h) * 2.2;
    const r = Math.random();
    const ridic = LIDE.zrodNa(bx, by, 4, r < 0.35 ? 'utoci' : 'utika');
    if (ridic && r < 0.35) api.toast('Řidič se nedá!', 'pokuta');
    zlocin(c.sl ? 2 : 1, p.x, p.y, c.sl === 'pol' ? 'Krádež policejního auta' : c.sl === 'zzs' ? 'Krádež sanitky' : 'Krádež auta');
    try { api.mojeAuto.children[0].material.color.set(c.col); } catch (e) { /* nic */ }
    zvuk('naraz', p.x, p.y, p.z);
    vymenaAuta();
    return { x: p.x, y: p.y, z: p.z, most: false, h: p.h, v: 0, steer: 0, kradene: true, hp: 100, typ: c.t, col: c.col };
  }

  // ---------- vozidla se neprolínají: hlídky, sanitky, auta v provozu, zaparkovaná a hráčovo auto ----------
  const rozmery = (o) => (o.druh === 'zzs' || o.zr ? [2.7, 1.05] : [2.25, 0.9]);   // poloviční délka a šířka
  function obsazeno(v, nx, ny, nh, bezHrace) {                // vjelo by vozidlo v do jiného? (z překryvu ven smí)
    const [L, W] = rozmery(v);
    const vadi = (bx, by, bh, bl, bw) => {
      if (Math.abs(bx - nx) > 14 || Math.abs(by - ny) > 14 || !prekryv(nx, ny, nh, L, W, bx, by, bh, bl, bw)) return false;
      return !(prekryv(v.x, v.y, v.h, L, W, bx, by, bh, bl, bw) && Math.hypot(bx - nx, by - ny) >= Math.hypot(bx - v.x, by - v.y));
    };
    for (const a of cars) { const p = api.carPose(a); if (vadi(p.x, p.y, p.h, a.T.len / 2, a.T.wid / 2)) return true; }
    for (const o of policie) if (o !== v && vadi(o.x, o.y, o.h, ...rozmery(o))) return true;
    for (const o of zachranky) if (o !== v && vadi(o.x, o.y, o.h, ...rozmery(o))) return true;
    if (!bezHrace && hrac.vAuto && hrac.car && vadi(hrac.car.x, hrac.car.y, hrac.car.h, 2.15, 0.9)) return true;
    for (const o of api.parkovana(nx, ny, 8)) if (vadi(o.x, o.y, o.h, 2.1, 0.88)) return true;
    return false;
  }
  function vozidloPred(v, bezHrace) {                         // nejbližší vozidlo v jízdním pruhu před v: { f } vzdálenost mezi čely
    const [L, W] = rozmery(v), ch = Math.cos(v.h), sh = Math.sin(v.h);
    let f = Infinity;
    const zkus = (bx, by, bl, bw) => {
      const ex = bx - v.x, ey = by - v.y; if (Math.abs(ex) > 30 || Math.abs(ey) > 30) return;
      const a = ex * ch + ey * sh, b = -ex * sh + ey * ch;
      if (a > 0 && Math.abs(b) < W + bw + 0.3) f = Math.min(f, a - L - bl);
    };
    if (Math.abs(v.x - hrac.x) < 30 && Math.abs(v.y - hrac.y) < 30) { for (const [a, p] of pozice) zkus(p.x, p.y, a.T.len / 2, a.T.wid / 2); }
    else for (const a of cars) { const p = api.carPose(a); zkus(p.x, p.y, a.T.len / 2, a.T.wid / 2); }
    for (const o of policie) if (o !== v) zkus(o.x, o.y, ...rozmery(o));
    for (const o of zachranky) if (o !== v) zkus(o.x, o.y, ...rozmery(o));
    if (!bezHrace && hrac.vAuto && hrac.car) zkus(hrac.car.x, hrac.car.y, 2.15, 0.9);
    return { f };
  }
  // pro auta v provozu (jizda.html): samostatně jezdící vozidla jako překážky [x, y, h, poloviční délka, poloviční šířka]
  function samostatna() { return [...policie, ...zachranky].map((o) => [o.x, o.y, o.h, ...rozmery(o)]); }
  // osa auta hráče × AI auto (SAT dvou obdélníků)
  function prekryv(ax, ay, ah, al, aw, bx, by, bh, bl, bw) {
    const osy = [ah, ah + Math.PI / 2, bh, bh + Math.PI / 2], dx = bx - ax, dy = by - ay;
    for (const o of osy) {
      const ux = Math.cos(o), uy = Math.sin(o);
      const ra = Math.abs(al * Math.cos(ah - o)) + Math.abs(aw * Math.sin(ah - o));
      const rb = Math.abs(bl * Math.cos(bh - o)) + Math.abs(bw * Math.sin(bh - o));
      if (Math.abs(dx * ux + dy * uy) > ra + rb) return false;
    }
    return true;
  }
  function kolizeAuta(c, nx, ny, nh) {
    for (const o of [...policie, ...zachranky]) {              // hlídky a sanitky (v běžné mapě jen pevná překážka)
      const [ol, ow] = rozmery(o);
      if (Math.abs(o.x - nx) > 12 || Math.abs(o.y - ny) > 12 || !prekryv(nx, ny, nh, 2.15, 0.9, o.x, o.y, o.h, ol, ow)) continue;
      if (prekryv(c.x, c.y, c.h, 2.15, 0.9, o.x, o.y, o.h, ol, ow) && Math.hypot(o.x - nx, o.y - ny) >= Math.hypot(o.x - c.x, o.y - c.y)) continue;
      return true;
    }
    for (const a of cars) {
      const p = api.carPose(a);
      if (Math.abs(p.x - nx) > 12 || Math.abs(p.y - ny) > 12) continue;
      if (!prekryv(nx, ny, nh, 2.15, 0.9, p.x, p.y, p.h, a.T.len / 2, a.T.wid / 2)) continue;
      // už se překrývají (AI auto vjelo do hráče): vzdalovat se jde
      if (prekryv(c.x, c.y, c.h, 2.15, 0.9, p.x, p.y, p.h, a.T.len / 2, a.T.wid / 2) && Math.hypot(p.x - nx, p.y - ny) >= Math.hypot(p.x - c.x, p.y - c.y)) continue;
      const rel = Math.abs(c.v);
      if (rel > 2 && !s.on) { zvuk('naraz', p.x, p.y, p.z); a.cekej = Math.max(a.cekej || 0, 1.5); }
      if (rel > 2 && s.on) {
        poskodAuto(rel * 1.4); zvuk('naraz', p.x, p.y, p.z);
        a.cekej = 2 + Math.random() * 3;
        if (!a.rr && rel < 18 && kradeTyp(a) && Math.random() < 0.35) {
          a.rr = true;
          const bx = p.x - Math.sin(p.h) * 2.2, by = p.y + Math.cos(p.h) * 2.2;
          LIDE.zrodNa(bx, by, 4, 'utoci');
          api.toast('Naštvaný řidič vystupuje!', 'pokuta');
        }
        if (policieVidiBod(nx, ny)) pridejHvezdy(hvezdy ? 0 : 1, 'Bouračka před policií!', nx, ny);
      }
      return true;
    }
    for (const o of api.parkovana(nx, ny, 7)) {               // zaparkovaná auta stojí pevně
      if (!prekryv(nx, ny, nh, 2.15, 0.9, o.x, o.y, o.h, 2.1, 0.88)) continue;
      if (prekryv(c.x, c.y, c.h, 2.15, 0.9, o.x, o.y, o.h, 2.1, 0.88) && Math.hypot(o.x - nx, o.y - ny) >= Math.hypot(o.x - c.x, o.y - c.y)) continue;
      const rel = Math.abs(c.v);
      if (rel > 2) { if (s.on) poskodAuto(rel * 1.4); zvuk('naraz', o.x, o.y, o.z); if (rel > 5) alarm(o); }
      return true;
    }
    return false;
  }
  function naraz(v) { if (s.on && v > 3) { poskodAuto((v - 3) * 2.2); zvuk('naraz', hrac.car.x, hrac.car.y, hrac.car.z); } }
  function blokuje(c, dt) {                                  // AI auto stojí kvůli hráči: troubí, pak vystoupí
    if (!s.on) return;
    c.troubi = (c.troubi || 0) + dt;
    if (c.troubi > 2.5 && t - klakT > 2.2) { klakT = t; const q = api.carPose(c); zvuk('klakson', q.x, q.y, q.z); }
    if (c.troubi > 9 && !c.rr && kradeTyp(c) && Math.random() < dt * 0.15) {
      c.rr = true;
      const p = api.carPose(c);
      LIDE.zrodNa(p.x - Math.sin(p.h) * 2.2, p.y + Math.cos(p.h) * 2.2, 4, 'utoci');
      api.toast('Řidiči došla trpělivost!', 'pokuta');
    }
  }
  function prejeti(dt) {
    const c = hrac.car; if (!c) return;
    const v = Math.abs(c.v), ch = Math.cos(c.h), sh = Math.sin(c.h);
    for (const p of LIDE._lide) {
      if (p.stav === 'lezi') continue;
      const dx = p.x + p.ex - c.x, dy = p.y + p.ey - c.y;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) continue;
      const f = dx * ch + dy * sh, b = -dx * sh + dy * ch;
      if (Math.abs(f) > 2.5 || Math.abs(b) > 1.2) continue;
      if (v < 2.5) continue;
      const typ = p.typ, bs = Math.sign(b) || 1;
      LIDE.srazen(p, ch * Math.sign(c.v) - sh * bs * 0.6, sh * Math.sign(c.v) + ch * bs * 0.6, v);
      zvuk('zasah', p.x, p.y); poskodAuto(2);
      LIDE.panika(p.x, p.y, 20);
      if (typ !== 3) zraneny(p);
      if (typ === 3) zlocin(2, p.x, p.y, 'Srazil jsi policistu!');
      else if (typ === 0 || typ === 4) zlocin(1, p.x, p.y, 'Sražený chodec');
    }
  }
  function stavAuta(dt) {
    const c = hrac.car;
    if (!c || c.hp === undefined) return;
    const hz = api.gz(c.x, c.y) + 1.1, px = c.x + Math.cos(c.h) * 1.7, py = c.y + Math.sin(c.h) * 1.7;
    if (c.hp < 35 && Math.random() < dt * (c.hp < 15 ? 14 : 6)) castice1(px, py, hz, false);
    if (c.hp <= 0) {
      c.hori = (c.hori || 0) + dt;
      if (Math.random() < dt * 20) castice1(px + (Math.random() - 0.5), py + (Math.random() - 0.5), hz, true);
      if (c.hori === dt) api.toast('Auto hoří! Vystup (E)!', 'pokuta');
      if (c.hori > 4) {
        vybuch(c.x, c.y, c.z);
        if (hrac.vAuto && hrac.car === c) { api.nastoupit(); zraneni(55, 'Výbuch'); }
        else if (Math.hypot(hrac.x - c.x, hrac.y - c.y) < 7) zraneni(35, 'Výbuch');
        hrac.car = null;
      }
    }
  }

  // ---------- interakce R: popelnice, večerka ----------
  function prohrabej(p) {
    p.prazdna = t + 180;
    s.smrad = mez(s.smrad + 3, 0, 100);
    const r = Math.random();
    zvuk('sebrat');
    if (p.druh[2] === 'sklo') {
      if (r < 0.55) { const n = 1 + Math.floor(Math.random() * 3); s.lahve += n; return api.toast(`Lahve: +${n} (máš ${s.lahve})`, 'odmena'); }
      if (r < 0.75 && s.zbran === 'pesti') { s.zbran = 'lahev'; return api.toast('Našel jsi pevnou lahev. Dobrá zbraň.', 'odmena'); }
      return api.toast('Samé střepy.', 'info');
    }
    if (r < 0.35) { const n = 1 + Math.floor(Math.random() * 3); s.lahve += n; return api.toast(`Vratné lahve: +${n} (máš ${s.lahve})`, 'odmena'); }
    if (r < 0.6) {
      s.hlad = mez(s.hlad + 15, 0, 100); s.smrad = mez(s.smrad + 4, 0, 100);
      if (Math.random() < 0.2) { zraneni(6, 'Zkažené jídlo'); return api.toast('Zbytek jídla. Bylo zkažené…', 'pokuta'); }
      return api.toast('Zbytek jídla: hlad +15', 'odmena');
    }
    if (r < 0.7) { const k = 5 + Math.floor(Math.random() * 36); plat(k); return api.toast(`Drobné na dně: +${kc(k)}`, 'odmena'); }
    if (r < 0.78 && s.zbran === 'pesti') { s.zbran = 'lahev'; return api.toast('Našel jsi lahev. Do ruky se hodí.', 'odmena'); }
    if (r < 0.83) { s.teplo = mez(s.teplo + 25, 0, 100); return api.toast('Starý svetr! Teplo +25', 'odmena'); }
    api.toast('Jen smetí.', 'info');
  }
  function kup(pol) {
    if (!obchodBlizko) return;
    if (pol.lahve) {
      if (!s.lahve) return api.toast('Nemáš žádné lahve.', 'info');
      const k = s.lahve * 3; plat(k); api.toast(`Vráceno ${s.lahve} lahví: +${kc(k)}`, 'odmena'); s.lahve = 0; zvuk('odmena'); return;
    }
    if (penize() < pol.cena) return api.toast(`Na ${pol.nazev.toLowerCase()} nemáš (${kc(pol.cena)}).`, 'pokuta');
    if (pol.zbran && s.zbran === pol.zbran) return api.toast('Pálku už máš.', 'info');
    if (s.smrad > 85 && !pol.umyt && Math.random() < 0.5) return api.toast('Prodavačka: „Takhle smradlavej sem nelez!“ Umyj se.', 'pokuta');
    plat(-pol.cena);
    if (pol.hlad) s.hlad = mez(s.hlad + pol.hlad, 0, 100);
    if (pol.teplo) s.teplo = mez(s.teplo + pol.teplo, 0, 100);
    if (pol.opilost) s.opilost += pol.opilost;
    if (pol.zdravi) s.zdravi = mez(s.zdravi + pol.zdravi, 1, 100);
    if (pol.umyt) s.smrad = 0;
    if (pol.zbran) s.zbran = pol.zbran;
    zvuk('sebrat');
    api.toast(`${pol.nazev}: −${kc(pol.cena)}`, 'odmena');
  }
  function prodejAuto() {
    const c = hrac.car;
    if (hvezdy) return api.toast('Vrakoviště: „S policií v zádech? Zmiz!“', 'pokuta');
    const cena = Math.round((c.typ === 'van' ? 2600 : 1800) * Math.max(0.15, c.hp / 100) + Math.random() * 900);
    api.nastoupit();                                         // vystoupit
    hrac.car = null;
    plat(cena); zvuk('mise');
    api.toast(`Vrakoviště koupilo auto za ${kc(cena)}`, 'odmena');
  }

  // ---------- konec: K.O. nebo zatčení ----------
  function respawn() {
    if (hrac.vAuto) api.nastoupit();
    hrac.car = null; hrac.bus = null;
    const [x, y] = api.volneMisto(api.start.x + (Math.random() - 0.5) * 20, api.start.y + (Math.random() - 0.5) * 20, 0.5);
    hrac.x = x; hrac.y = y; hrac.z = api.gz(x, y); hrac.most = false;
    hvezdy = 0; ztrata = 0; pouta = 0; cekaHlaseni = []; schovany = false; znama = null; vidi = false;
    for (const pc of policie.slice()) odstranPolicii(pc);
    for (const p of LIDE._lide) if (p.stav && p.stav !== 'lezi') p.mrtvy = true;
  }
  function ukazKonec(nadpis, barva, text, cas) {
    velky.replaceChildren();
    const b = el('b', '', nadpis); b.style.color = barva;
    velky.append(b, el('span', '', text)); velky.hidden = false;
    konec = { t: cas || 3.5 };
  }
  function ko(proc) {
    if (konec) return;
    const ztr = Math.max(0, Math.round(penize() * 0.2));
    plat(-ztr);
    ukazKonec('K.O.', '#e23b3b', `${proc ? proc + '. ' : ''}Probral ses v nemocnici. Ošetření stálo ${kc(ztr)}.`);
    zvuk('zatcen');
    konec.po = () => { respawn(); s.zdravi = 100; s.hlad = Math.max(s.hlad, 45); s.teplo = Math.max(s.teplo, 60); s.opilost = 0; };
  }
  function zatcen() {
    if (konec) return;
    const ma = Math.max(0, penize()), pok = Math.min(ma, Math.max(500, Math.round(ma * 0.3)) * Math.max(1, hvezdy));   // zabaví hotovost, dluh nedělá
    plat(-pok);
    ukazKonec('ZATČEN', '#3a8bff', `Noc v cele${pok ? `, zabavili ti ${kc(pok)}` : ''}. Aspoň tě osprchovali a dali ti najíst.`);
    zvuk('zatcen');
    konec.po = () => { respawn(); s.smrad = 0; s.hlad = Math.max(s.hlad, 70); s.zbran = 'pesti'; s.opilost = 0; };
  }

  // ---------- ovládání ----------
  addEventListener('keydown', (e) => {
    if (e.repeat || e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (e.code === 'Space') { if (schovany) akce(); else skok(); return; }   // skok a rána i v běžné mapě
    if (e.code === 'KeyF') { uder(); return; }
    if (e.code === 'KeyH' && hrac.vAuto && hrac.car) { zvuk('klakson'); if (s.on) LIDE.panika(hrac.x + Math.cos(hrac.car.h) * 8, hrac.y + Math.sin(hrac.car.h) * 8, 8); return; }   // klakson i v běžné mapě
    if (!s.on) return;
    if (e.code === 'KeyR') akce();
    else if (e.code === 'KeyG') { if (!hrac.vAuto && hrac.bus === null) { zebra = !zebra; zebraT = 0; api.toast(zebra ? 'Sedíš s kelímkem a žebráš…' : 'Přestal jsi žebrat.', 'info'); } }
    else { const pol = OBCHOD.find((o) => o.k === e.code); if (pol && obchodBlizko && !hrac.vAuto) kup(pol); }
  });
  api.canvas.addEventListener('mousedown', (e) => { if (e.button === 0 && document.pointerLockElement === api.canvas) uder(); });
  function skok() {
    if (konec || hrac.vAuto || hrac.bus !== null) return;
    const zem = naStrese(hrac.x, hrac.y) ? STRECHA : 0;
    if (skokV !== 0 || skokZ > zem + 0.05) return;            // ve vzduchu znovu neskočí
    skokV = 7.6; zebra = false;                               // výskok ~1,7 m: na střechu auta se dá vyskočit
  }
  function krokSkoku(dt) {
    if (hrac.vAuto || hrac.bus !== null) { skokZ = 0; skokV = 0; return; }
    const zem = naStrese(hrac.x, hrac.y) ? STRECHA : 0;
    if (skokV === 0 && skokZ <= zem + 0.01) { skokZ = zem; return; }
    skokV -= 17 * dt; skokZ += skokV * dt;
    if (skokZ <= zem) {
      if (skokV < -9) zraneni((-skokV - 9) * 4, 'Pád');
      skokZ = zem; skokV = 0;
    }
  }
  function akce() {
    if (konec || hrac.bus !== null) return;
    if (hrac.vAuto) { if (hrac.car && hrac.car.kradene && vrak && Math.hypot(vrak.x - hrac.x, vrak.y - hrac.y) < 14 && Math.abs(hrac.car.v) < 1) prodejAuto(); return; }
    if (schovany) { schovany = false; api.toast('Vylezl jsi z kontejneru.', 'info'); return; }
    const p = popBlizko.find((q) => Math.hypot(q.x - hrac.x, q.y - hrac.y) < 2.3);
    if (p && hvezdy) {                                       // honí tě policie: kontejner = úkryt
      schovany = true; zebra = false; hrac.x = p.x; hrac.y = p.y;
      api.toast(vidi ? 'Schoval ses do kontejneru… ale viděli tě!' : 'Schoval ses do kontejneru. Nehýbej se.', vidi ? 'pokuta' : 'info');
      return;
    }
    if (p) { if (p.prazdna > t) api.toast('Tuhle už jsi prohrabal.', 'info'); else prohrabej(p); return; }
    if (obchodBlizko) api.toast('Vyber zboží klávesou 1–6.', 'info');
  }
  // dotykové ovládání: Úder, Akce, Žebrat
  let dotykB = [];
  function dotykTlacitka() {
    const box = document.getElementById('tlacitka');
    if (!api.dotyk || !box) return;
    if (s.on && !dotykB.length) {
      for (const [txt, code] of [['Úder', 'KeyF'], ['Skok', 'Space'], ['Akce (R)', 'KeyR'], ['Žebrat', 'KeyG']]) {
        const b = el('button', '', txt); b.type = 'button';
        b.addEventListener('click', () => { dispatchEvent(new KeyboardEvent('keydown', { code })); dispatchEvent(new KeyboardEvent('keyup', { code })); });
        box.appendChild(b); dotykB.push(b);
      }
    } else if (!s.on) { for (const b of dotykB) b.remove(); dotykB = []; }
  }

  function zapni(on) {
    s.on = on; U.on = on; B.on = on; ulozit(); ukazOvl(); dotykTlacitka();
    hud.hidden = !on; tip.hidden = true;
    for (const m of [popM, vikM]) m.count = on ? popBlizko.length : 0;
    if (!on) {
      hvezdy = 0; for (const pc of policie.slice()) odstranPolicii(pc);
      for (const o of sbirky) scene.remove(o.m); sbirky.length = 0;
      zebra = false; hracG.visible = false; schovany = false;
      for (const z of zachranky.slice()) if (z.druh === 'zzs') { scene.remove(z.g); if (z.sir) z.sir.konec(); zachranky.splice(zachranky.indexOf(z), 1); }   // sanitky patří k přežití, hlídky u nehod jezdí dál
      for (const z of ranenych) if (zivy(z.p)) z.p.lezi = 3; ranenych.length = 0;
      for (const m of motory) m.z.konec(); motory.length = 0;
      return;
    }
    nactiMista();
    popT = -9;
    if (hrac.car && !hrac.car.kradene && hrac.car.hp === undefined) hrac.car.hp = 100;
    ukazKonec(api.mesto.toUpperCase() + ': ULICE', '#ffd23a', 'Nemáš nic. Jen kabát a kulich. Přežij.', 2.6);
  }
  chk.addEventListener('change', () => zapni(chk.checked));
  bVec.addEventListener('click', async () => {
    await nactiMista();
    let best = null, bd = 1e12;
    for (const o of obchody) { const d = Math.hypot(o.x - hrac.x, o.y - hrac.y); if (d < bd) { bd = d; best = o; } }
    if (best) api.navigace.zvol({ label: 'Večerka: ' + best.label, x: best.x, y: best.y });
  });
  bVrak.addEventListener('click', async () => { await nactiMista(); if (vrak) api.navigace.zvol({ label: 'Vrakoviště: ' + vrak.label, x: vrak.x, y: vrak.y }); });
  bReset.addEventListener('click', () => {
    Object.assign(s, { zdravi: 100, hlad: 80, teplo: 80, smrad: 20, lahve: 0, zbran: 'pesti', opilost: 0 });
    plat(-penize()); respawn(); ulozit(); api.toast('Nový začátek s prázdnou kapsou.', 'info');
  });

  // ---------- třetí osoba: kamera přes rameno ----------
  const T3 = new THREE.Vector3(), W3 = new THREE.Vector3(), L3 = new THREE.Vector3();
  let snapK = true;
  const tretiOsoba = () => !hrac.vAuto && hrac.bus === null && !hrac.zOci;   // pěšky výchozí pohled zezadu (V: z očí), i v běžné mapě
  function kamera(camera, fwd, dt) {
    // kamera obíhá bod nad pravým ramenem a míří na něj: postava je v záběru celá, myš nahoru/dolů mění výšku kamery
    const yaw = hrac.yaw, e = mez(0.32 - hrac.pitch, -0.15, 1.2), D = zebra ? 3.6 : 4.8;
    const sway = s.opilost > 0 ? Math.sin(t * 1.3) * 0.25 * Math.min(1, s.opilost / 20) : 0;
    const rx = Math.sin(yaw) * 0.45, ry = -Math.cos(yaw) * 0.45;    // posun doprava (přes pravé rameno)
    const hz = hrac.z + skokZ + (zebra ? 0.9 : 1.35);
    T3.set(hrac.x + rx, hz, -(hrac.y + ry));
    // dům mezi ramenem a kamerou (i s výškou domu): kamera před zeď, nejméně 0,6 m od postavy
    const px = hrac.x + rx - Math.cos(yaw + sway) * Math.cos(e) * D, py = hrac.y + ry - Math.sin(yaw + sway) * Math.cos(e) * D, pz = hz + Math.sin(e) * D;
    const vol = api.ramenoVolne(hrac.x + rx, hrac.y + ry, hz, px, py, pz, 0.35);
    const k = vol < 1 ? Math.max(0.12, vol - 0.3 / D) : 1;
    const cx = hrac.x + rx + (px - hrac.x - rx) * k, cy = hrac.y + ry + (py - hrac.y - ry) * k;
    const cz = Math.max(hz + (pz - hz) * k, api.gz(cx, cy) + 0.5);
    W3.set(cx, cz, -cy);
    const kTer = Math.hypot(camera.position.x - hrac.x, camera.position.z + hrac.y);
    if (snapK || (vol < 1 && Math.hypot(cx - hrac.x, cy - hrac.y) < kTer - 0.05)) { camera.position.copy(W3); snapK = false; }
    else camera.position.lerp(W3, 1 - Math.exp(-dt * 16));
    L3.set(hrac.x + rx + Math.cos(yaw) * 2.5, hz + 0.15, -(hrac.y + ry + Math.sin(yaw) * 2.5));
    camera.lookAt(L3);
    if (sway) camera.rotateZ(sway * 0.3);
    fwd.copy(L3).sub(camera.position).normalize();
  }
  function modelHrace(dt) {
    const v = tretiOsoba();
    hracG.visible = v && !schovany;
    if (vzhled !== s.on) {                                   // pouliční režim: bezdomovec v kabátě a kulichu, jinak chodec v bundě
      vzhled = s.on;
      const telo = s.on ? 0x5b4a36 : 0x2f5fa8;
      for (const m of [pTorzo, pRukaA, pRukaB]) m.material.color.setHex(telo);
      pKabat.visible = s.on; pVousy.visible = s.on;
      pKulich.material.color.setHex(s.on ? 0x8a2a2a : 0x3a2616);
    }
    if (!v) { pxL = null; snapK = true; return; }
    const dx = pxL === null ? 0 : hrac.x - pxL, dy = pyL === null ? 0 : hrac.y - pyL, rych = Math.hypot(dx, dy) / Math.max(dt, 1e-3);
    pxL = hrac.x; pyL = hrac.y;
    if (rych > 0.3) { zebra = false; modelH += uhel(Math.atan2(dy, dx) - modelH) * Math.min(1, dt * 12); }
    krokF += rych * dt * 3.4;
    const a = rych > 0.3 ? Math.sin(krokF) * Math.min(0.7, 0.3 + rych * 0.06) : 0;
    pNohaA.rotation.z = a; pNohaB.rotation.z = -a;
    pRukaB.rotation.z = a * 0.8;
    pRukaA.rotation.z = uderAnim > 0 ? 1.5 * Math.sin(Math.PI * uderAnim / 0.3) : -a * 0.8;
    lahevM.visible = s.zbran === 'lahev'; palkaM.visible = s.zbran === 'palka';
    if (zebra) { hracG.scale.set(1, 0.62, 1); pNohaA.rotation.z = pNohaB.rotation.z = 1.4; } else hracG.scale.set(1, 1, 1);
    const bob = rych > 0.3 ? Math.abs(Math.sin(krokF)) * 0.04 : 0;
    if (skokV !== 0) { pNohaA.rotation.z = 0.7; pNohaB.rotation.z = -0.2; pRukaB.rotation.z = -1.2; if (uderAnim <= 0) pRukaA.rotation.z = -1.2; }   // ve vzduchu
    hracG.position.set(hrac.x, hrac.z + skokZ + bob, -hrac.y);
    hracG.rotation.y = modelH;
  }

  // ---------- průběžně ----------
  function update(dt) {
    if (!(dt > 0)) return;
    dt = Math.min(dt, 0.1);
    t += dt;
    uderCd -= dt; uderAnim = Math.max(0, uderAnim - dt);
    pozice = [];
    for (const a of cars) { const p = api.carPose(a); if (Math.abs(p.x - hrac.x) < 60 && Math.abs(p.y - hrac.y) < 60) pozice.push([a, p]); }
    krokSkoku(dt);
    krokZachranky(dt);                                         // sanitky a nehody v provozu: i v běžné mapě
    if (!s.on) { modelHrace(dt); return; }
    if (konec) {
      konec.t -= dt;
      if (konec.t <= 0) { velky.hidden = true; const po = konec.po; konec = null; if (po) po(); }
    }
    // přežití
    const venku = !hrac.vAuto && hrac.bus === null, noc = api.doba() > 0.6, poc = api.pocasi();
    const ob = { summer: 0.12, spring: -0.04, autumn: -0.08, winter: -0.22 }[api.obdobi] ?? -0.05;
    s.hlad = mez(s.hlad - dt / 7, 0, 100);
    const dTep = venku ? ob - (noc ? 0.12 : 0) - 0.15 * (poc.dest || 0) - 0.2 * (poc.snih || 0) + (zebra ? -0.03 : 0) : 1.2;
    s.teplo = mez(s.teplo + dTep * dt, 0, 100);
    s.smrad = mez(s.smrad + dt / 25 - (venku ? 0.03 * (poc.dest || 0) * dt : 0), 0, 100);
    s.opilost = Math.max(0, s.opilost - dt);
    if (s.hlad <= 0) zraneni(0.6 * dt, 'Hlad');
    if (s.teplo <= 0) zraneni(0.6 * dt, 'Podchlazení');
    if (s.hlad > 40 && s.teplo > 30) s.zdravi = Math.min(100, s.zdravi + 0.25 * dt);
    for (const [k, v, txt] of [['hlad', s.hlad, 'Máš hlad. Najdi jídlo (popelnice, večerka).'], ['teplo', s.teplo, 'Je ti zima. Zahřej se v autě nebo v autobuse.'], ['zdravi', s.zdravi, 'Jsi na tom zle!']]) {
      if (v < 25 && !varovani[k]) { varovani[k] = true; api.toast(txt, 'pokuta'); } else if (v > 35) varovani[k] = false;
    }
    if (s.opilost > 0 && hrac.vAuto && hrac.car) hrac.car.steer += Math.sin(t * 1.7) * 0.012 * Math.min(1, s.opilost / 20);
    // žebrání
    if (zebra && venku) {
      zebraT += dt;
      if (zebraT > 1) {
        zebraT = 0;
        const p = LIDE.blizky(hrac.x, hrac.y, 6, (q) => !q.typ && !q.stav && q.krok === 1);
        if (p && Math.random() < 0.09 * (1 - s.smrad / 140) * (noc ? 0.5 : 1)) {
          const k = 1 + Math.floor(Math.random() * 20); plat(k); zvuk('sebrat');
          api.toast(s.smrad > 70 ? `+${kc(k)} (s ohrnutým nosem)` : `Někdo ti hodil ${kc(k)}`, 'odmena');
        }
      }
    }
    // hlášení svědků
    for (const h of cekaHlaseni.slice()) {
      h.t -= dt;
      if (h.t <= 0) { cekaHlaseni.splice(cekaHlaseni.indexOf(h), 1); pridejHvezdy(h.vaha, (h.proc ? h.proc + '. ' : '') + 'Někdo zavolal policii!', h.x, h.y); }
    }
    // policie a hledanost
    krokPolicie(dt);
    hlidkyVProvozu();
    if (hvezdy && !znama) znama = { x: hrac.x, y: hrac.y };
    vidiT -= dt;
    if (vidiT <= 0) { vidiT = 0.2; vidi = hvezdy > 0 && vidiHrace(); }
    if (hvezdy) {
      if (vidi) { ztrata = 0; znama = { x: hrac.x, y: hrac.y }; }
      else ztrata += dt * (znama && Math.hypot(znama.x - hrac.x, znama.y - hrac.y) < 40 && !schovany ? 0.5 : 1);   // blízko místa, kde tě viděli, hledají pečlivěji
      if (ztrata > limitHledani()) { hvezdy = 0; ztrata = 0; znama = null; schovany = false; api.toast('Policie tě ztratila.', 'odmena'); zvuk('odmena'); }
      if (schovany) {                                        // policista u kontejneru tě může najít
        for (const p of LIDE._lide) if (p.typ === 3 && p.stav !== 'lezi' && Math.hypot(p.x - hrac.x, p.y - hrac.y) < 2.2 && Math.random() < dt * 0.5) { schovany = false; vidi = true; api.toast('Našli tě v kontejneru!', 'pokuta'); break; }
      }
    } else { vidi = false; schovany = false; }
    pouta = Math.max(0, pouta - dt * 0.15);
    if (pouta >= 1) zatcen();
    zvukyAut(dt);
    // auto
    if (hrac.vAuto) prejeti(dt);
    stavAuta(dt);
    // sbírky
    for (const o of sbirky.slice()) {
      o.t -= dt; o.m.rotation.y += dt * 3;
      if (Math.hypot(o.x - hrac.x, o.y - hrac.y) < (hrac.vAuto ? 2.5 : 1.4)) { plat(o.kc); zvuk('sebrat'); api.toast(`+${kc(o.kc)}`, 'odmena'); o.t = 0; }
      if (o.t <= 0) { scene.remove(o.m); sbirky.splice(sbirky.indexOf(o), 1); }
    }
    // částice
    for (const c of castice.slice()) {
      c.t += dt; const u = c.t / c.life;
      c.sp.position.y += c.vz * dt; c.sp.scale.setScalar(0.6 + u * (c.ohen ? 0.8 : 2.4)); c.sp.material.opacity = (c.ohen ? 0.85 : 0.5) * (1 - u);
      if (u >= 1) { scene.remove(c.sp); c.sp.material.dispose(); castice.splice(castice.indexOf(c), 1); }
    }
    if (vybuchM && vybuchM.visible) { vybuchT += dt; vybuchM.scale.setScalar(1 + vybuchT * 14); vybuchM.material.opacity = Math.max(0, 1 - vybuchT / 0.7); if (vybuchT > 0.7) vybuchM.visible = false; }
    // svět kolem
    if (t - popT > 2) { popT = t; obnovPopelnice(); obnovCedule(); }
    obchodBlizko = !hrac.vAuto && obchody.find((o) => Math.hypot(o.x - hrac.x, o.y - hrac.y) < 8) || null;
    modelHrace(dt);
    rana = Math.max(0, rana - dt * 0.8);
    ranaEl.style.opacity = String(Math.max(rana, s.zdravi < 25 ? 0.35 + 0.15 * Math.sin(t * 5) : 0));
    hudKresli(dt);
    ulozT += dt; if (ulozT > 5) { ulozT = 0; ulozit(); }
  }

  // posluchač = kamera; motory tří nejbližších aut v provozu v jejich místě
  function zvukyAut(dt) {
    const Z = api.zvuk, cp = api.camera.position;
    if (!Z.bezi) return;
    api.camera.getWorldDirection(W3);
    Z.poslech(cp.x, cp.y, cp.z, W3.x, W3.y, W3.z);
    const bl = pozice.map(([a, q]) => [a, q, Math.hypot(q.x - cp.x, q.y + cp.z)]).filter((u) => u[2] < 70).sort((u, w) => u[2] - w[2]).slice(0, 3);
    while (motory.length < 3) motory.push({ z: Z.zdroj('motor'), a: null, dk: 0 });
    motory.forEach((m, i) => {
      const u = bl[i];
      if (!u) { m.z.ticho(); m.a = null; return; }
      const [a, q, dk] = u, k = m.a === a ? (m.dk - dk) / Math.max(dt, 1e-3) : 0;
      m.a = a; m.dk = dk;
      m.z.nastav(q.x, q.z + 0.6, -q.y, k, a.cekej > 0 || a.hold ? 0 : 9);
    });
  }
  let tipText = '', hudT = 0;
  function hudKresli(dt) {
    hudT -= dt; if (hudT > 0) return; hudT = 0.15;
    hvEl.innerHTML = '<b>' + '★'.repeat(hvezdy) + '</b>' + '☆'.repeat(5 - hvezdy);
    hvEl.classList.toggle('blik', hvezdy > 0 && !vidi);
    patEl.textContent = !hvezdy ? '' : vidi ? 'POLICIE TĚ VIDÍ' : `Hledají tě · ještě ${Math.ceil(limitHledani() - ztrata)} s${schovany ? ' · schovaný' : ''}`;
    patEl.classList.toggle('vidi', vidi);
    const k = penize(); kcEl.textContent = kc(k); kcEl.classList.toggle('minus', k < 0);
    bZdr.style.width = s.zdravi + '%'; bHlad.style.width = s.hlad + '%'; bTep.style.width = s.teplo + '%'; bHyg.style.width = (100 - s.smrad) + '%';
    const auto = hrac.vAuto && hrac.car && hrac.car.hp !== undefined ? ` · auto ${Math.max(0, Math.round(hrac.car.hp))} %` : '';
    zbrEl.textContent = `${(ZBRANE[s.zbran] || ZBRANE.pesti).nazev} · lahve ${s.lahve}${s.opilost > 0 ? ' · opilý' : ''}${auto}`;
    // nápověda u věcí
    let txt = '', obch = false;
    if (!konec && hrac.bus === null) {
      if (hrac.vAuto) {
        if (hrac.car && hrac.car.kradene && vrak && Math.hypot(vrak.x - hrac.x, vrak.y - hrac.y) < 30) txt = hvezdy ? 'Vrakoviště: nejdřív setřes policii.' : 'R – prodat auto na vrakovišti (zastav)';
      } else if (obchodBlizko) { txt = 'Večerka'; obch = true; }
      else {
        const p = popBlizko.find((q) => Math.hypot(q.x - hrac.x, q.y - hrac.y) < 2.3);
        if (p) txt = hvezdy ? 'R – schovat se do kontejneru' : p.prazdna > t ? 'Popelnice (prohrabaná)' : 'R – prohrabat popelnici';
        else {
          let auto = false;
          for (const [c, q] of pozice) { if (kradeTyp(c) && Math.hypot(q.x - hrac.x, q.y - hrac.y) < 4.8) { auto = true; break; } }
          const park = !auto && skokZ < 1 && api.parkovana(hrac.x, hrac.y, 4).some((o) => Math.hypot(o.x - hrac.x, o.y - hrac.y) < 3.8);
          if (auto) txt = 'E – ukrást auto · F – bouchnout do auta';
          else if (park) txt = 'E – vypáčit a ukrást · F – rozbít okno · Mezerník – vyskočit na střechu';
          else if (skokV === 0 && skokZ >= 1 && naStrese(hrac.x, hrac.y)) txt = 'Stojíš na autě';
          else if (zebra) txt = 'Žebráš… (G přestat)';
        if (schovany) txt = 'Schovaný v kontejneru · R nebo mezerník vylézt';
        }
      }
    }
    const klic = txt + (obch ? '|o' : '');
    if (klic === tipText) return;
    tipText = klic; tip.replaceChildren();
    if (!txt) { tip.hidden = true; return; }
    tip.hidden = false; tip.append(el('div', '', txt));
    if (obch) {
      const r = el('div');
      for (const [i, pol] of OBCHOD.entries()) {
        const b = el('button', '', `${i + 1} ${pol.nazev}${pol.cena ? ' ' + kc(pol.cena) : pol.lahve ? ' (3 Kč/ks)' : ''}`);
        b.type = 'button'; b.addEventListener('click', () => kup(pol)); r.append(b);
      }
      tip.append(r);
    }
  }

  U.prestupek = (druh) => {                                  // dopravní přestupek: počítá se jen před policií
    if (!s.on || hvezdy) return;
    if (policieVidiBod(hrac.x, hrac.y)) pridejHvezdy(1, druh === 'cervena' ? 'Červená před policií!' : 'Rychlost před policií!', hrac.x, hrac.y);
  };
  if (s.on) setTimeout(() => zapni(true), 0);
  function vozidla(VOZ) {                                    // karoserie policejních aut a sanitek (pruhy a majáky jsou vlastní tělesa)
    oznacSluzby(); overlayeSluzeb();
    for (const pc of policie) VOZ.pridej('car', pc.x, pc.y, pc.z, pc.h, '#e9ecef');
    for (const a of zachranky) VOZ.pridej(a.druh === 'pol' ? 'car' : 'van', a.x, a.y, a.z, a.h, a.druh === 'pol' ? '#e9ecef' : '#f2cf1d', undefined, a.stav === 'na_miste' || a.stav === 'naklada' ? 6 : 0);
  }
  return {
    get on() { return s.on; }, update, vozidla, prekazka, samostatna, prekryv, kamera, tretiOsoba, ukradni, kolizeAuta, naraz, blokuje,
    get hvezdy() { return hvezdy; }, set hvezdy(v) { hvezdy = mez(v, 0, 5); }, _s: s, _policie: policie, _zachranky: zachranky, _ranenych: ranenych, _nehoda: () => nehoda, _nehodaHned: () => { nehodaT = 0; }, zraneny, _mista: () => ({ popelnice: popBlizko, obchody, vrak }),
  };
}
