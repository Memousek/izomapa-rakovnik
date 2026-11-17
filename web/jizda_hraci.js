// Multiplayer 3D jízdy: ostatní hráči ve městě jako „duchové“ (postava nebo auto v barvě hráče, jméno nad hlavou).
// Spojení se serverem multiplayer/worker.js (adresa z mesto.json "multiplayer"), zprávy v jizda/sit.js.
// Duchové zatím nekolidují s ničím: projedou autem i člověkem, nikdo nikoho nesrazí.
// Svět: x na východ, y na sever, z nahoru; three pozice = (x, z, -y).
import { zakodujStav, dekodujSnimek, REZIM, PRIZNAK, platneAuto } from './sit.js';

const KLIC = 'izo-3d-mp';
const ODESLAT = 200;            // ms mezi polohami (5× za s, server posílá stejně často)
const DRZET = 2000;             // stojí-li hráč, poloha se pošle aspoň jednou za 2 s (server po 5 s ticha hráče skryje)
const ZPOZDENI = 320;           // ms: duchové se kreslí trochu v minulosti, ať je mezi čím plynule interpolovat
const ZTRACEN = 3000;           // ms bez snímku = duch zmizí
const POPISEK_DO = 260;         // m: jméno nad hlavou jen zblízka
const uhel = (a) => Math.atan2(Math.sin(a), Math.cos(a));

const CSS = `
.mp-sek .mp-ja b { font-weight: 800; }
.mp-sek .mp-tecka { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 5px; vertical-align: -1px; box-shadow: 0 0 0 1px #0d1220; }
.mp-sek ul { list-style: none; margin: 4px 0 0; padding: 0; font-size: 12px; max-height: 120px; overflow: auto; }
.mp-sek li { padding: 1px 0; }
`;

// api: url, VOZ (jizda/vozidla.js: autoHrace, prestavAuto, uvolniAuto), mojeAuto() -> konfigurace z garáže, jenVeDne, panel, toast,
//      doba(), stav() -> { rezim, x, y, z, yaw, v, flags }
export function vytvorHrace(THREE, scene, api) {
  const prazdne = { update() {}, mapa: () => [], pocet: () => 0, zmenaAuta() {} };
  if (!api.url) return prazdne;

  let zapnuto = true;
  try { zapnuto = localStorage.getItem(KLIC) !== '0'; } catch { /* bez úložiště výchozí */ }
  let ws = null, pripojeno = false, ja = null, pokus = 0, znovuT = null, skrytoT = null;
  let posledni = null, posledniT = 0, stavText = 'připojuji…';
  const duchove = new Map();     // id -> { id, jmeno, barva, vzorky: [{ t, x, y, z, yaw, v, rezim, flags }], g, postava, auto, popisek, videnT }
  const znami = new Map();       // id -> { jmeno, barva } (i ti mimo dosah: seznam v panelu)

  // ---------- modely ----------
  const mat = (barva) => new THREE.MeshLambertMaterial({ color: barva });
  const kuze = mat(0xe8b896), kalhoty = mat(0x2e3445), boty = mat(0x1d1f24);
  const gTrup = new THREE.BoxGeometry(0.26, 0.62, 0.44), gHlava = new THREE.SphereGeometry(0.13, 12, 9);
  const gNoha = new THREE.BoxGeometry(0.15, 0.82, 0.16).translate(0, -0.41, 0), gRuka = new THREE.BoxGeometry(0.11, 0.6, 0.11).translate(0, -0.3, 0);
  const gBota = new THREE.BoxGeometry(0.26, 0.09, 0.15).translate(0.05, -0.82, 0);
  function postava(barva) {                                 // člověk čelem k +x (jako auta), 1,75 m
    const g = new THREE.Group(), triko = mat(barva), dily = [];
    const d = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); g.add(o); dily.push(o); return o; };
    d(gTrup, triko, 0, 1.17, 0);
    d(gHlava, kuze, 0, 1.62, 0);
    const nohy = [-1, 1].map((s) => { const n = d(gNoha, kalhoty, 0, 0.86, s * 0.11), b = new THREE.Mesh(gBota, boty); n.add(b); dily.push(b); return n; });
    const ruce = [-1, 1].map((s) => d(gRuka, triko, 0, 1.44, s * 0.29));
    return { g, nohy, ruce, dily, triko };
  }
  function popisek(text, barva) {
    const c = document.createElement('canvas'); c.width = 384; c.height = 72;
    const x = c.getContext('2d');
    x.font = '700 34px system-ui, sans-serif';
    const w = Math.min(384, x.measureText(text).width + 44);
    x.fillStyle = 'rgba(20,26,39,.85)'; x.fillRect((384 - w) / 2, 6, w, 60);
    x.fillStyle = barva; x.fillRect((384 - w) / 2, 6, 10, 60);
    x.fillStyle = '#eef1f5'; x.textBaseline = 'middle'; x.textAlign = 'center'; x.fillText(text, 192 + 5, 37, 340);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, sizeAttenuation: false, transparent: true }));
    sp.scale.set(0.16, 0.03, 1); sp.center.set(0.5, 0); sp.renderOrder = 10;
    return sp;
  }

  function novyDuch(id) {
    const z = znami.get(id) || { jmeno: 'Hráč', barva: '#cccccc' };
    const g = new THREE.Group(), p = postava(z.barva), a = api.VOZ.autoHrace(z.auto || z.barva), pop = popisek(z.jmeno, z.barva);
    g.add(p.g, a, pop);
    a.visible = false;
    const tela = [...p.dily, ...telaAuta(a)];
    api.jenVeDne.push(...tela);
    scene.add(g);
    const d = { id, ...z, vzorky: [], g, postava: p, auto: a, popisek: pop, tela, videnT: performance.now(), faze: 0 };
    duchove.set(id, d);
    return d;
  }
  const telaAuta = (a) => a.children.filter((o) => !o.userData.svetlo && !o.userData.brzda && o.userData.blinkr === undefined);
  function prestavDucha(d, cfg) {                         // hráč si v garáži změnil auto
    const stara = new Set(telaAuta(d.auto));
    for (let i = api.jenVeDne.length - 1; i >= 0; i--) if (stara.has(api.jenVeDne[i])) api.jenVeDne.splice(i, 1);
    api.VOZ.prestavAuto(d.auto, cfg);
    const nova = telaAuta(d.auto);
    d.tela = d.tela.filter((o) => !stara.has(o)).concat(nova);
    api.jenVeDne.push(...nova);
  }
  function smazDucha(d) {
    scene.remove(d.g);
    for (const o of d.tela) { const i = api.jenVeDne.indexOf(o); if (i >= 0) api.jenVeDne.splice(i, 1); }
    d.popisek.material.map.dispose(); d.popisek.material.dispose();
    d.postava.triko.dispose(); api.VOZ.uvolniAuto(d.auto);   // vlastní barva trička a tvary auta; ostatní materiály jsou sdílené
    duchove.delete(d.id);
  }
  const smazVse = () => { for (const d of [...duchove.values()]) smazDucha(d); };

  // ---------- spojení ----------
  function pripoj() {
    clearTimeout(znovuT); znovuT = null;
    if (!zapnuto || ws || document.hidden) return;
    stavText = 'připojuji…'; ukazPanel();
    try { ws = new WebSocket(api.url); } catch { naplanuj(); return; }
    ws.binaryType = 'arraybuffer';
    ws.onmessage = (e) => {
      if (typeof e.data === 'string') { zprava(e.data); return; }
      const sn = dekodujSnimek(e.data);
      if (sn) prijmiSnimek(sn);
    };
    ws.onclose = (e) => {
      ws = null; pripojeno = false; ja = null; smazVse(); znami.clear();
      stavText = e.code === 1008 ? 'odpojeno: příliš mnoho zpráv' : zapnuto ? 'spojení přerušeno, zkouším znovu…' : 'vypnuto';
      ukazPanel();
      naplanuj();
    };
    ws.onerror = () => {};
  }
  function naplanuj() {
    if (!zapnuto || znovuT || document.hidden) return;
    const za = Math.min(30000, 1000 * 2 ** pokus++) * (0.75 + Math.random() * 0.5);   // 1, 2, 4… až 30 s, rozházené
    znovuT = setTimeout(pripoj, za);
  }
  let autoT = null;
  function posliAuto() {
    const a = platneAuto(api.mojeAuto());
    if (a && pripojeno && ws && ws.readyState === 1) try { ws.send(JSON.stringify({ t: 'auto', a })); } catch { /* zavírá se */ }
  }
  function odpoj() { clearTimeout(znovuT); znovuT = null; if (ws) { const w = ws; ws = null; w.onclose = null; w.close(1000); } pripojeno = false; ja = null; smazVse(); znami.clear(); }

  function zprava(text) {
    let m; try { m = JSON.parse(text); } catch { return; }
    if (m.t === 'ahoj') {
      pripojeno = true; pokus = 0; ja = { id: m.id, jmeno: String(m.jmeno), barva: String(m.barva) };
      for (const h of m.hraci || []) znami.set(h.id, { jmeno: String(h.jmeno), barva: String(h.barva), auto: platneAuto(h.auto) });
      stavText = ''; posledni = null; ukazPanel();
      posliAuto();
    } else if (m.t === 'novy') {
      znami.set(m.id, { jmeno: String(m.jmeno), barva: String(m.barva) });
      if (pripojeno) api.toast?.(`${m.jmeno} přijel do města`, 'info');
      ukazPanel();
    } else if (m.t === 'auto') {
      const z = znami.get(m.id), a = platneAuto(m.a);
      if (!z || !a) return;
      z.auto = a;
      const d = duchove.get(m.id); if (d) prestavDucha(d, a);
    } else if (m.t === 'pryc') {
      const d = duchove.get(m.id); if (d) smazDucha(d);
      znami.delete(m.id); ukazPanel();
    }
  }
  function prijmiSnimek(sn) {
    const t = performance.now(), vSnimku = new Set();
    for (const z of sn) {
      if (ja && z.id === ja.id) continue;
      vSnimku.add(z.id);
      const d = duchove.get(z.id) || novyDuch(z.id);
      d.vzorky.push({ t, x: z.x, y: z.y, z: z.z, yaw: z.yaw, v: z.v, rezim: z.rezim, flags: z.flags });
      if (d.vzorky.length > 12) d.vzorky.shift();
      d.videnT = t;
    }
    for (const d of [...duchove.values()]) if (!vSnimku.has(d.id)) smazDucha(d);   // mimo dosah (prázdný snímek nebo už není mezi blízkými)
  }

  function odesli(now) {
    if (!pripojeno || !ws || ws.readyState !== 1 || now - posledniT < ODESLAT) return;
    const s = api.stav();
    const stejne = posledni && Math.abs(s.x - posledni.x) < 0.05 && Math.abs(s.y - posledni.y) < 0.05 && Math.abs(uhel(s.yaw - posledni.yaw)) < 0.01
      && s.rezim === posledni.rezim && s.flags === posledni.flags;
    if (stejne && now - posledniT < DRZET) return;
    try { ws.send(zakodujStav(s)); posledni = s; posledniT = now; } catch { /* zavírá se */ }
  }

  // karta schovaná déle než minutu: odpojit (server neplatí za nikoho, kdo nehraje), po návratu zase připojit
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { skrytoT = setTimeout(() => { odpoj(); stavText = 'pozastaveno (karta na pozadí)'; ukazPanel(); }, 60000); }
    else { clearTimeout(skrytoT); if (zapnuto && !ws) { pokus = 0; pripoj(); } }
  });

  // ---------- kreslení ----------
  function poloha(d, t) {                                  // interpolace mezi vzorky v čase t (bez extrapolace dál než 0,5 s)
    const V = d.vzorky; if (!V.length) return null;
    if (t <= V[0].t) return V[0];
    for (let k = V.length - 1; k > 0; k--) {
      const a = V[k - 1], b = V[k];
      if (t < a.t) continue;
      if (t > b.t) {                                        // za posledním vzorkem: kousek dopředu podle rychlosti (auto), jinak stát
        const dt = Math.min(0.5, (t - b.t) / 1000), v = b.rezim === REZIM.auto ? b.v : 0;
        return { ...b, x: b.x + Math.cos(b.yaw) * v * dt, y: b.y + Math.sin(b.yaw) * v * dt };
      }
      const u = (t - a.t) / ((b.t - a.t) || 1);
      return { ...b, x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u, yaw: a.yaw + uhel(b.yaw - a.yaw) * u,
        vp: Math.hypot(b.x - a.x, b.y - a.y) / Math.max(0.05, (b.t - a.t) / 1000) };
    }
    return V[V.length - 1];
  }
  function update(dt, now, kamera) {
    odesli(now);
    if (!duchove.size) return;
    const t = now - ZPOZDENI, noc = api.doba() > 0.3, blik = Math.floor(now / 400) % 2 === 0;
    const cx = kamera ? kamera.position.x : 0, cy = kamera ? -kamera.position.z : 0;
    for (const d of [...duchove.values()]) {
      if (now - d.videnT > ZTRACEN) { smazDucha(d); continue; }
      const p = poloha(d, t); if (!p) continue;
      const auto = p.rezim === REZIM.auto, bus = p.rezim === REZIM.bus;
      d.g.position.set(p.x, p.z, -p.y);
      d.postava.g.visible = !auto && !bus;                   // v autobuse sedí uvnitř: vidět je jen jméno
      d.auto.visible = auto;
      if (auto) {
        d.auto.rotation.set(0, p.yaw, 0);
        for (const o of d.auto.children) {
          if (o.userData.brzda) o.visible = !!(p.flags & PRIZNAK.brzda);
          else if (o.userData.blinkr !== undefined) o.visible = blik && !!(p.flags & (o.userData.blinkr < 0 ? PRIZNAK.vlevo : PRIZNAK.vpravo));
          else if (o.userData.svetlo || o.material?.isMeshBasicMaterial) o.visible = noc && !!(p.flags & PRIZNAK.svetla);
          if (o.userData.kolo) o.rotation.z -= (p.v || 0) * dt / 0.32;
        }
      } else if (!bus) {                                     // chůze: nohy a ruce podle rychlosti
        const v = p.vp || 0;
        d.postava.g.rotation.set(0, p.yaw, 0);
        d.faze += dt * Math.min(9, v * 4.2);
        const sw = Math.min(0.6, v * 0.35) * Math.sin(d.faze);
        d.postava.nohy[0].rotation.z = sw; d.postava.nohy[1].rotation.z = -sw;
        d.postava.ruce[0].rotation.z = -sw * 0.8; d.postava.ruce[1].rotation.z = sw * 0.8;
      }
      d.popisek.position.y = auto ? 2.1 : bus ? 3.6 : 2.0;
      d.popisek.visible = Math.hypot(p.x - cx, p.y - cy) < POPISEK_DO;
      d.posledni = p;
    }
  }

  // ---------- panel v menu (sekce Hra) ----------
  if (api.panel) {
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  }
  const sek = document.createElement('div'); sek.className = 'hra-sek mp-sek';
  const h2 = document.createElement('h2'); h2.textContent = 'Hráči ve městě';
  const jaEl = document.createElement('div'); jaEl.className = 'mp-ja';
  const lbl = document.createElement('label'); lbl.className = 'hra-p';
  const chk = document.createElement('input'); chk.type = 'checkbox'; chk.checked = zapnuto;
  lbl.append(chk, document.createTextNode(' Hrát s ostatními'));
  const stEl = document.createElement('div'); stEl.className = 'hra-st';
  const ul = document.createElement('ul');
  sek.append(h2, jaEl, lbl, ul, stEl);
  api.panel?.append(sek);
  chk.addEventListener('change', () => {
    zapnuto = chk.checked;
    try { localStorage.setItem(KLIC, zapnuto ? '1' : '0'); } catch { /* nic */ }
    if (zapnuto) { pokus = 0; pripoj(); } else { odpoj(); stavText = 'vypnuto'; }
    ukazPanel();
  });
  const tecka = (barva) => { const s = document.createElement('span'); s.className = 'mp-tecka'; s.style.background = barva; return s; };
  function ukazPanel() {
    jaEl.replaceChildren();
    if (ja) { const b = document.createElement('b'); b.textContent = ja.jmeno; b.style.color = ja.barva; jaEl.append(tecka(ja.barva), 'Jsi ', b); }
    ul.replaceChildren(...[...znami.values()].map((h) => { const li = document.createElement('li'); li.append(tecka(h.barva), h.jmeno); return li; }));
    const n = znami.size, kolik = n === 1 ? 'je ještě 1 hráč' : n < 5 ? `jsou ještě ${n} hráči` : `je ještě ${n} hráčů`;
    stEl.textContent = stavText || (n ? `Ve městě ${kolik}.` : 'Zatím tu jezdíš sám.');
  }
  ukazPanel();
  pripoj();

  return {
    update,
    // pro minimapu a velkou mapu: kde jsou duchové (poslední vykreslená poloha)
    mapa: () => [...duchove.values()].filter((d) => d.posledni).map((d) => ({ x: d.posledni.x, y: d.posledni.y, barva: d.barva, jmeno: d.jmeno })),
    pocet: () => znami.size,
    zmenaAuta() { clearTimeout(autoT); autoT = setTimeout(posliAuto, 400); },   // z garáže: posílá se až po chvilce klidu
  };
}
