// Multiplayer 3D jízdy: ostatní hráči ve městě jako „duchové“ (postava nebo auto v barvě hráče, jméno nad hlavou).
// Spojení se serverem multiplayer/worker.js (adresa z mesto.json "multiplayer"), zprávy v jizda/sit.js.
// Duchové zatím nekolidují s ničím: projedou autem i člověkem, nikdo nikoho nesrazí.
// Svět: x na východ, y na sever, z nahoru; three pozice = (x, z, -y).
import { zakodujStav, dekodujSnimek, REZIM, PRIZNAK, platneAuto, platneJmeno, vymyslJmeno } from './sit.js';

const KLIC = 'izo-3d-mp', KLIC_JMENO = 'izo-3d-jmeno', KLIC_POPISKY = 'izo-3d-mp-jmena', KLIC_PRICHODY = 'izo-3d-mp-prichody';
const ODESLAT = 200;            // ms mezi polohami (5× za s, server posílá stejně často)
const DRZET = 2000;             // stojí-li hráč, poloha se pošle aspoň jednou za 2 s (server po 15 s ticha hráče skryje)
const NA_POZADI = 240000;       // karta na pozadí: 4 min ji ostatní vidí stát s „pryč“, pak se odpojí (Chrome po 5 min časovače skoro zastaví)
const ZPOZDENI = 320;           // ms: duchové se kreslí trochu v minulosti, ať je mezi čím plynule interpolovat
const ZTRACEN = 3000;           // ms bez snímku = duch zmizí
const POPISEK_DO = 260;         // m: jméno nad hlavou jen zblízka
const uhel = (a) => Math.atan2(Math.sin(a), Math.cos(a));

const CSS = `
.mp-sek .mp-ja b { font-weight: 800; }
.mp-sek .mp-tecka { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 5px; vertical-align: -1px; box-shadow: 0 0 0 1px #0d1220; }
.mp-sek ul { list-style: none; margin: 4px 0 0; padding: 0; font-size: 12px; max-height: 120px; overflow: auto; }
.mp-sek li { padding: 1px 0; }
.mp-sek .mp-jm { display: flex; gap: 4px; margin-top: 6px; }
.mp-sek .mp-jm input { flex: 1; min-width: 0; font: inherit; padding: 4px 6px; border-radius: 4px; border: 1px solid #4a5670; background: #1b2333; color: var(--fg); }
.mp-sek .mp-jm input:focus-visible { outline: 2px solid #29c8ff; outline-offset: 1px; }
.mp-sek .mp-jm button { flex: 0 0 auto; }
.mp-sek .mp-chyba { color: #ff8a7a; font-size: 12px; min-height: 0; }
.mp-sek .mp-ok { color: #2f8f4a; }
.mp-sek .mp-h { margin: 6px 0 0; font: 700 1rem var(--serif, serif); }
.mp-sek .mp-r { display: flex; gap: 6px; align-items: center; margin-top: 6px; font-size: 13px; flex-wrap: wrap; }
.mp-sek .mp-r select { font: inherit; padding: 3px 4px; border-radius: 4px; border: 1px solid #4a5670; background: #1b2333; color: var(--fg); }
.mp-sek li button { all: unset; cursor: pointer; display: flex; gap: 4px; align-items: center; width: 100%; padding: 2px 3px; border-radius: 3px; }
.mp-sek li button:hover, .mp-sek li button:focus-visible { background: rgba(41,200,255,.15); outline: none; }
.mp-sek li .mp-kde { margin-left: auto; color: var(--muted); font-size: 11px; }
`;

// api: url, VOZ (jizda/vozidla.js: autoHrace, prestavAuto, uvolniAuto), mojeAuto() -> konfigurace z garáže, jenVeDne, panel, toast,
//      doba(), stav() -> { rezim, x, y, z, yaw, v, flags }
export function vytvorHrace(THREE, scene, api) {
  const prazdne = { update() {}, mapa: () => [], pocet: () => 0, zmenaAuta() {} };
  if (!api.url) return prazdne;

  let zapnuto = true;
  try { zapnuto = localStorage.getItem(KLIC) !== '0'; } catch { /* bez úložiště výchozí */ }
  let ws = null, pripojeno = false, ja = null, pokus = 0, znovuT = null, skrytoT = null;
  let posledni = null, posledniT = 0, stavText = 'připojuji…', jmenoChyba = '', zeZalohy = null, zkousky = 0;
  const ulozeneJmeno = () => { try { return localStorage.getItem(KLIC_JMENO) || ''; } catch { return ''; } };
  const duchove = new Map();     // id -> { id, jmeno, barva, vzorky: [{ t, x, y, z, yaw, v, rezim, flags }], g, postava, auto, popisek, videnT }
  const znami = new Map();       // id -> { jmeno, barva } (i ti mimo dosah: seznam v panelu)
  const volba = (k, vych) => { try { const v = localStorage.getItem(k); return v === null ? vych : v === '1'; } catch { return vych; } };
  let popisky = volba(KLIC_POPISKY, true), prichody = volba(KLIC_PRICHODY, true);

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
  function popisek(text, barva, pryc) {
    const c = document.createElement('canvas'); c.width = 384; c.height = 72;
    const x = c.getContext('2d');
    x.font = '700 34px system-ui, sans-serif';
    const s = pryc ? `${text} · pryč` : text;
    const w = Math.min(384, x.measureText(s).width + 44);
    x.fillStyle = 'rgba(20,26,39,.85)'; x.fillRect((384 - w) / 2, 6, w, 60);
    x.fillStyle = barva; x.fillRect((384 - w) / 2, 6, 10, 60);
    x.fillStyle = pryc ? '#9aa3b2' : '#eef1f5'; x.textBaseline = 'middle'; x.textAlign = 'center'; x.fillText(s, 192 + 5, 37, 340);
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
    poNacteni(d, z.auto);
    return d;
  }
  function obnovPopisek(d) {                                // nové jméno nebo příznak „pryč“
    const stary = d.popisek, novy = popisek(d.jmeno, d.barva, d.pryc);
    novy.position.copy(stary.position); novy.visible = stary.visible;
    d.g.remove(stary); stary.material.map.dispose(); stary.material.dispose();
    d.g.add(novy); d.popisek = novy;
  }
  const telaAuta = (a) => a.children.filter((o) => !o.userData.svetlo && !o.userData.brzda && o.userData.blinkr === undefined);
  function prestavDucha(d, cfg) {                         // hráč si v garáži změnil auto
    const stara = new Set(telaAuta(d.auto));
    for (let i = api.jenVeDne.length - 1; i >= 0; i--) if (stara.has(api.jenVeDne[i])) api.jenVeDne.splice(i, 1);
    api.VOZ.prestavAuto(d.auto, cfg);
    const nova = telaAuta(d.auto);
    d.tela = d.tela.filter((o) => !stara.has(o)).concat(nova);
    api.jenVeDne.push(...nova);
    poNacteni(d, cfg);
  }
  function poNacteni(d, cfg) {                              // hotový model (jizda/vozidla.js HOTOVE) se stahuje: pak duchovi přestavět auto
    d.cfg = cfg;
    if (!cfg || api.VOZ.pripraveno(cfg)) return;
    api.VOZ.nactiModel(cfg.k).then((t) => { if (t && duchove.get(d.id) === d && d.cfg === cfg) prestavDucha(d, cfg); });
  }
  function smazDucha(d) {
    scene.remove(d.g);
    for (const o of d.tela) { const i = api.jenVeDne.indexOf(o); if (i >= 0) api.jenVeDne.splice(i, 1); }
    d.popisek.material.map.dispose(); d.popisek.material.dispose();
    d.postava.triko.dispose(); api.VOZ.uvolniAuto(d.auto); d.lt?.zrus();   // vlastní barva trička a tvary auta; ostatní materiály jsou sdílené
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
      const j = ulozeneJmeno();                            // jméno, které si hráč dřív zvolil
      zkousky = 0;
      if (j && j !== ja.jmeno) { zeZalohy = j; posliJmeno(j); }
    } else if (m.t === 'novy') {
      znami.set(m.id, { jmeno: String(m.jmeno), barva: String(m.barva) });
      if (pripojeno && prichody) api.toast?.(`${m.jmeno} přijel do města`, 'info');
      ukazPanel();
    } else if (m.t === 'auto') {
      const z = znami.get(m.id), a = platneAuto(m.a);
      if (!z || !a) return;
      z.auto = a;
      const d = duchove.get(m.id); if (d) prestavDucha(d, a);
    } else if (m.t === 'jmeno') {
      const j = platneJmeno(m.j); if (!j) return;
      if (ja && m.id === ja.id) {
        ja.jmeno = j; jmenoChyba = ''; zeZalohy = null;
        try { localStorage.setItem(KLIC_JMENO, j); } catch { /* jen do zavření */ }
        if (document.activeElement !== jmIn) jmIn.value = j;
      } else {
        const z = znami.get(m.id); if (z) z.jmeno = j;
        const d = duchove.get(m.id); if (d) { d.jmeno = j; obnovPopisek(d); }
      }
      ukazPanel();
    } else if (m.t === 'chyba' && m.co === 'jmeno') {
      // uložené jméno po znovunačtení stránky: staré spojení ho může chvíli držet (dokud server nepozná, že je pryč)
      if (zeZalohy && m.k === 'obsazene' && zkousky++ < 4) { const j = zeZalohy; setTimeout(() => { if (ja && ja.jmeno !== j) posliJmeno(j); }, 5000); return; }
      zeZalohy = null;
      jmenoChyba = String(m.d || 'Jméno nejde použít.'); ukazPanel();
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

  function posliJmeno(j) {
    if (pripojeno && ws && ws.readyState === 1) try { ws.send(JSON.stringify({ t: 'jmeno', j })); } catch { /* zavírá se */ }
  }
  function odesli(now) {
    if (!pripojeno || !ws || ws.readyState !== 1 || now - posledniT < ODESLAT) return;
    const s = { ...api.stav() };
    if (document.hidden) s.flags |= PRIZNAK.pryc;
    const stejne = posledni && Math.abs(s.x - posledni.x) < 0.05 && Math.abs(s.y - posledni.y) < 0.05 && Math.abs(uhel(s.yaw - posledni.yaw)) < 0.01
      && s.rezim === posledni.rezim && s.flags === posledni.flags;
    if (stejne && now - posledniT < DRZET) return;
    try { ws.send(zakodujStav(s)); posledni = s; posledniT = now; } catch { /* zavírá se */ }
  }

  // karta na pozadí: prohlížeč zastaví vykreslování, tak polohu drží časovač (aspoň za 2 s) a ostatní hráče vidí stát
  // s „pryč“; po 4 min odpojit (server neplatí za nikoho, kdo nehraje), po návratu zase připojit
  setInterval(() => { if (document.hidden) odesli(performance.now()); }, 1000);
  addEventListener('pagehide', () => { if (ws) try { ws.close(1000); } catch { /* nic */ } });   // znovunačtení, odchod: hned pryč
  document.addEventListener('visibilitychange', () => {
    posledniT = 0; odesli(performance.now());               // příznak „pryč“ hned
    if (document.hidden) { clearTimeout(skrytoT); skrytoT = setTimeout(() => { odpoj(); stavText = 'pozastaveno (karta na pozadí)'; ukazPanel(); }, NA_POZADI); }
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
      // postava Kenney (jizda/kenney.js) podle id hráče; než se načte, jednoduchá postava v barvě hráče
      const P = api.postavy;
      const pm = znami.get(d.id)?.auto?.p;                  // postavička z garáže hráče, jinak podle id
      if (d.lt && (d.ltP || '') !== (pm || '')) { d.lt.zrus(); d.lt = null; }
      if (P && !d.lt) { if (P.pripraveno) { const h = [...String(d.id)].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7); d.lt = P.nova({ model: pm, n: (h % 1000) / 1000, zena: (h >> 10) % 2 === 1, bez: true }); d.ltP = pm; } else P.nacti(); }
      d.postava.g.visible = !auto && !bus && !d.lt;          // v autobuse sedí uvnitř: vidět je jen jméno
      if (d.lt) d.lt.skryj(auto || bus);
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
        if (d.lt) { d.lt.poloha(p.x, p.y, p.z, p.yaw); d.lt.nastav(v > 4.5 ? 'bezi' : v > 2.2 ? 'klus' : v > 0.3 ? 'jde' : 'stoji', v, dt); }
      }
      const pryc = !!(p.flags & PRIZNAK.pryc);
      if (pryc !== !!d.pryc) { d.pryc = pryc; obnovPopisek(d); }
      d.popisek.position.y = auto ? 2.1 : bus ? 3.6 : 2.0;
      d.popisek.visible = popisky && Math.hypot(p.x - cx, p.y - cy) < POPISEK_DO;
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
  // vlastní jméno: 2–20 znaků, kontrola tady i na serveru (jizda/sit.js platneJmeno), pamatuje se v prohlížeči
  const jmForm = document.createElement('form'); jmForm.className = 'mp-jm';
  const jmIn = document.createElement('input'); jmIn.type = 'text'; jmIn.maxLength = 20; jmIn.autocomplete = 'off'; jmIn.spellcheck = false;
  jmIn.setAttribute('aria-label', 'Tvoje jméno ve hře'); jmIn.placeholder = 'Tvoje jméno';
  const jmBt = document.createElement('button'); jmBt.type = 'submit'; jmBt.textContent = 'Uložit'; jmBt.className = 'px-btn';
  const jmNah = document.createElement('button'); jmNah.type = 'button'; jmNah.className = 'px-btn'; jmNah.textContent = 'Náhodné'; jmNah.title = 'Vymyslet jméno';
  jmNah.addEventListener('click', () => { jmIn.value = vymyslJmeno(Math.random(), new Set([...znami.values()].map((h) => h.jmeno))); kontrolaJmena(); });
  jmForm.append(jmIn, jmNah, jmBt);
  // kontrola při psaní: hned je vidět, jestli jméno projde (sprostá slova, délka, znaky) a jestli ho nemá jiný hráč
  function kontrolaJmena() {
    const v = jmIn.value.trim(), j = platneJmeno(v);
    if (!v) { jmErr.textContent = ''; jmErr.className = 'mp-chyba'; return; }
    if (!j) { jmErr.textContent = '2–20 znaků: písmena, číslice, mezera, . - _ (ne sprostá slova).'; jmErr.className = 'mp-chyba'; return; }
    const obs = [...znami.values()].some((h) => h.jmeno.toLowerCase() === j.toLowerCase());
    jmErr.textContent = obs ? 'Tohle jméno už má jiný hráč.' : ja && j === ja.jmeno ? '' : 'Jméno je volné, ulož ho.';
    jmErr.className = obs ? 'mp-chyba' : 'mp-chyba mp-ok';
  }
  jmIn.addEventListener('input', kontrolaJmena);
  const jmErr = document.createElement('div'); jmErr.className = 'mp-chyba'; jmErr.setAttribute('role', 'alert');
  jmForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const j = platneJmeno(jmIn.value);
    if (!j) { jmenoChyba = 'Jméno musí mít 2–20 znaků (písmena, číslice, mezera, . - _) a nesmí být sprosté.'; ukazPanel(); return; }
    if (ja && j === ja.jmeno) { jmenoChyba = ''; ukazPanel(); return; }
    try { localStorage.setItem(KLIC_JMENO, j); } catch { /* jen do zavření */ }   // i bez spojení: pošle se po připojení
    jmenoChyba = ''; zeZalohy = null;
    if (pripojeno) posliJmeno(j); else { jmErr.className = 'mp-chyba mp-ok'; jmErr.textContent = 'Uloženo, použije se po připojení.'; return; }
    ukazPanel();
  });
  for (const ev of ['keydown', 'keyup']) jmIn.addEventListener(ev, (e) => { if (e.key !== 'Escape') e.stopPropagation(); });   // psaní neřídí auto
  // jméno: v menu Postava (api.jmenoBox), jinak tady v sekci hráčů
  const jmBox = api.jmenoBox || document.createElement('div');
  { const h = document.createElement('h3'); h.className = 'mp-h'; h.textContent = 'Jméno ve hře'; const p = document.createElement('p'); p.className = 'gar-pozn';
    p.textContent = 'Ostatní hráči ho vidí nad tvou hlavou. Uloží se v tomhle prohlížeči.'; jmBox.classList.add('mp-sek'); jmBox.append(h, jmForm, jmErr, p); }
  // přepínače
  const prepinac = (text, hodnota, klic, f) => {
    const l = document.createElement('label'); l.className = 'hra-p'; const c = document.createElement('input'); c.type = 'checkbox'; c.checked = hodnota;
    c.addEventListener('change', () => { f(c.checked); try { localStorage.setItem(klic, c.checked ? '1' : '0'); } catch { /* nic */ } });
    l.append(c, text); return l;
  };
  const rPop = prepinac('Jména nad hlavou', popisky, KLIC_POPISKY, (v) => { popisky = v; });
  const rPri = prepinac('Hlásit příchody hráčů', prichody, KLIC_PRICHODY, (v) => { prichody = v; });
  const ulP = document.createElement('p'); ulP.className = 'gar-pozn'; ulP.textContent = 'Klikni na hráče poblíž: navigace k němu.';
  sek.append(h2, jaEl, ...(api.jmenoBox ? [] : [jmBox]), lbl, rPop, rPri, ul, ulP, stEl);
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
    if (jmenoChyba) { jmErr.textContent = jmenoChyba; jmErr.className = 'mp-chyba'; }
    if (document.activeElement !== jmIn && !jmIn.value) jmIn.value = ja ? ja.jmeno : ulozeneJmeno();
    const kde = api.ja?.();
    const CO = { [REZIM.auto]: 'v autě', [REZIM.bus]: 'v autobuse' };
    ul.replaceChildren(...[...znami.entries()].map(([id, h]) => {
      const li = document.createElement('li'), d = duchove.get(id), p = d?.posledni;
      if (!p || !kde) { li.append(tecka(h.barva), h.jmeno); return li; }
      const b = document.createElement('button'), m = Math.round(Math.hypot(p.x - kde.x, p.y - kde.y));
      const s = document.createElement('span'); s.className = 'mp-kde'; s.textContent = `${CO[p.rezim] || 'pěšky'} · ${m < 1000 ? m + ' m' : (m / 1000).toFixed(1).replace('.', ',') + ' km'}`;
      b.append(tecka(h.barva), h.jmeno, s); b.addEventListener('click', () => api.naviguj?.(`Hráč ${h.jmeno}`, p.x, p.y));
      li.append(b); return li;
    }));
    ulP.hidden = !duchove.size;
    const n = znami.size, kolik = n === 1 ? 'je ještě 1 hráč' : n < 5 ? `jsou ještě ${n} hráči` : `je ještě ${n} hráčů`;
    stEl.textContent = stavText || (n ? `Ve městě ${kolik}.` : 'Zatím tu jezdíš sám.');
  }
  ukazPanel();
  setInterval(() => { if (sek.offsetParent) ukazPanel(); }, 2000);   // vzdálenosti hráčů v otevřeném menu
  pripoj();

  return {
    update,
    // pro minimapu a velkou mapu: kde jsou duchové (poslední vykreslená poloha)
    mapa: () => [...duchove.values()].filter((d) => d.posledni).map((d) => ({ x: d.posledni.x, y: d.posledni.y, barva: d.barva, jmeno: d.jmeno })),
    pocet: () => znami.size,
    zmenaAuta() { clearTimeout(autoT); autoT = setTimeout(posliAuto, 400); },   // z garáže: posílá se až po chvilce klidu
  };
}
