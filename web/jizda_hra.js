// Hra v 3D jízdě: mise (taxi, rozvoz, najdi místo), dopravní pravidla a skóre.
const KLIC = 'izo-3d-hra';
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const nahoda = (a) => a[Math.floor(Math.random() * a.length)];
const kc = (n) => Math.round(n).toLocaleString('cs-CZ') + ' Kč';

function nactiUlozeni() {
  const v = { kc: 0, pravidla: true, taxi: 0, rozvoz: 0, najdi: 0, pokuty: 0, pokutyKc: 0, hvezdy: 0 };
  try {
    const o = JSON.parse(localStorage.getItem(KLIC) || 'null');
    if (o && typeof o === 'object') for (const k in v) if (typeof o[k] === typeof v[k]) v[k] = o[k];
  } catch (e) { /* bez úložiště se hraje bez ukládání */ }
  return v;
}

function delkaTrasy(t) {
  let s = 0;
  for (let i = 1; i < t.length; i++) s += dist(t[i - 1][0], t[i - 1][1], t[i][0], t[i][1]);
  return s;
}

const CSS = `
.hra-sek { margin: 8px 0; font-size: 13px; }
.hra-sek h2 { font-size: 14px; margin: 0 0 4px; }
.hra-sek .hra-r { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px; }
.hra-sek button { font: inherit; font-weight: 700; padding: 5px 9px; border-radius: 4px; border: 1px solid #4a5670; background: #2a3449; color: var(--fg); cursor: pointer; flex: 1; }
.hra-sek button:focus-visible { outline: 2px solid #29c8ff; outline-offset: 1px; }
.hra-sek button:disabled { opacity: .55; cursor: default; }
.hra-sek .hra-st { color: var(--muted); font-size: 12px; margin-top: 4px; }
.hra-sek .hra-mise { margin-top: 6px; padding: 6px 8px; border-left: 3px solid #f2c66d; background: rgba(242, 198, 109, .1); font-weight: 600; }
.hra-sek label.hra-p { display: flex; gap: 6px; align-items: center; font-weight: 400; cursor: pointer; }
.hra-sek label.hra-p input { accent-color: var(--accent); }
#hraLimit { position: fixed; width: 54px; height: 54px; box-sizing: border-box; border-radius: 50%; background: #fff; border: 6px solid #d22; color: #111; font: 800 22px/42px system-ui, sans-serif; text-align: center; box-shadow: 0 2px 8px rgba(0, 0, 0, .35); pointer-events: none; }
`;

export function vytvorHru(THREE, scene, api) {
  const hrac = api.hrac;
  const ul = nactiUlozeni();
  const ulozit = () => { try { localStorage.setItem(KLIC, JSON.stringify(ul)); } catch (e) { /* nic */ } };
  let t = 0;
  let adr = null;       // načtené adresy
  let nacitam = false;
  let mise = null;      // aktivní mise
  let znacky = [];      // { g, ring, id }

  // ---------- značky ----------
  const poz = () => (hrac.vAuto && hrac.car ? hrac.car : hrac);
  function znacka(x, y, barva, druh) {
    const g = new THREE.Group();
    g.position.set(x, api.gz(x, y), -y);
    const mat = (o) => new THREE.MeshBasicMaterial(Object.assign({ color: barva, fog: false }, o));
    const sloup = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 45, 16, 1, true),
      mat({ transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }));
    sloup.position.y = 22.5;
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.4, 3.1, 32).rotateX(-Math.PI / 2),
      mat({ transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
    ring.position.y = 0.2;
    g.add(sloup, ring);
    if (druh === 'osoba') {
      const telo = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 1.1, 10), mat({ color: 0x2b6fd6, fog: true }));
      telo.position.y = 0.6;
      const hlava = new THREE.Mesh(new THREE.SphereGeometry(0.23, 12, 8), mat({ color: 0xf0c9a0, fog: true }));
      hlava.position.y = 1.4;
      const ruka = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.8, 6), mat({ color: 0x2b6fd6, fog: true }));
      ruka.position.set(0.3, 1.3, 0); ruka.rotation.z = -0.5; // mává
      g.add(telo, hlava, ruka);
    } else if (druh === 'balik') {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.9), mat({ color: 0xc8934d, fog: true }));
      box.position.y = 0.45;
      g.add(box);
    }
    scene.add(g);
    const z = { g, ring };
    znacky.push(z);
    return z;
  }
  function smazZnacku(z) {
    if (!z) return;
    scene.remove(z.g);
    z.g.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    const i = znacky.indexOf(z);
    if (i >= 0) znacky.splice(i, 1);
  }
  function smazVsechnyZnacky() { for (const z of znacky.slice()) smazZnacku(z); }

  // ---------- UI: panel ----------
  const st = document.createElement('style');
  st.textContent = CSS;
  document.head.appendChild(st);
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt) e.textContent = txt; return e; };
  const sek = el('div', 'hra-sek');
  const h2 = el('h2', '', 'Hra');
  const zustatek = el('div', '', '');
  zustatek.style.fontWeight = '700';
  const statistiky = el('div', 'hra-st');
  const prLabel = el('label', 'hra-p');
  const prChk = document.createElement('input');
  prChk.type = 'checkbox'; prChk.checked = ul.pravidla;
  prLabel.append(prChk, document.createTextNode(' Dopravní pravidla a pokuty'));
  prChk.addEventListener('change', () => { ul.pravidla = prChk.checked; ulozit(); });
  const radaMise = el('div', 'hra-r');
  const bTaxi = el('button', '', 'Taxi');
  const bRozvoz = el('button', '', 'Rozvoz');
  const bNajdi = el('button', '', 'Najdi místo');
  for (const b of [bTaxi, bRozvoz, bNajdi]) b.type = 'button';
  radaMise.append(bTaxi, bRozvoz, bNajdi);
  const miseBox = el('div', 'hra-mise');
  miseBox.hidden = true;
  miseBox.setAttribute('role', 'status');
  const miseTxt = el('div');
  const bZrus = el('button', '', 'Zrušit misi');
  bZrus.type = 'button';
  bZrus.style.marginTop = '4px'; bZrus.style.width = '100%';
  miseBox.append(miseTxt, bZrus);
  sek.append(h2, zustatek, statistiky, prLabel, radaMise, miseBox);
  api.panel.appendChild(sek);

  function obnovPanel() {
    zustatek.textContent = 'Zůstatek: ' + kc(ul.kc);
    const hv = ul.taxi ? ' · ø ' + (ul.hvezdy / ul.taxi).toFixed(1) + ' ★' : '';
    statistiky.textContent = `Taxi ${ul.taxi}×${hv} · rozvoz ${ul.rozvoz}× · nalezeno ${ul.najdi}× · pokuty ${ul.pokuty}× (${kc(ul.pokutyKc)})`;
  }
  obnovPanel();

  // ---------- tabule s omezením rychlosti ----------
  const tab = el('div');
  tab.id = 'hraLimit';
  tab.hidden = true;
  document.body.appendChild(tab);
  let tabLimit = null, tabCas = 0;
  function umistiTabuli() {
    try {
      const r = api.tacho.getBoundingClientRect();
      tab.style.right = Math.round(window.innerWidth - r.left + 10) + 'px';
      tab.style.bottom = Math.round(window.innerHeight - r.bottom + (r.height - 54) / 2) + 'px';
    } catch (e) { /* bez rozložení */ }
  }

  // ---------- skóre a hlášky ----------
  function pridej(castka) { ul.kc += castka; ulozit(); obnovPanel(); }

  function prestupek(druh, info) {
    info = info || {};
    const castka = info.castka != null ? info.castka : (druh === 'cervena' ? 2500 : 300);
    const text = info.text || (druh === 'cervena' ? 'Červená! Pokuta ' + kc(castka)
      : druh === 'rychlost' ? 'Překročení rychlosti, pokuta ' + kc(castka) : 'Přestupek, pokuta ' + kc(castka));
    ul.kc -= castka; ul.pokuty++; ul.pokutyKc += castka;
    if (mise && mise.typ === 'taxi' && mise.faze === 'jizda') mise.hvezdy = Math.max(1, mise.hvezdy - 1);
    ulozit(); obnovPanel();
    api.toast(text, 'pokuta');
    if (api.zvuk) api.zvuk('pokuta');
  }

  // ---------- mise ----------
  async function nactiAdresy() {
    if (adr) return adr;
    if (nacitam) return null;
    nacitam = true;
    try { adr = (await api.adresy()) || []; } catch (e) { adr = []; }
    nacitam = false;
    return adr;
  }
  // náhodné místo daného druhu 'od' až 'do' metrů vzdušnou čarou, jinak postupně volněji
  function vyber(druhy, x, y, od, doo, vyjma) {
    let zdroj = adr.filter((a) => druhy.includes(a.kind) && (!vyjma || !vyjma.includes(a)));
    if (!zdroj.length) zdroj = adr.filter((a) => !vyjma || !vyjma.includes(a));
    for (let k = 0; k < 5; k++) {
      const lo = od / (1 + k), hi = doo * (1 + k);
      const ok = zdroj.filter((a) => { const d = dist(a.x, a.y, x, y); return d >= lo && d <= hi; });
      if (ok.length) return nahoda(ok);
    }
    return zdroj.length ? nahoda(zdroj) : null;
  }
  const nejblizsi = (druhy, x, y) => {
    let best = null, bd = 1e12;
    for (const a of adr) {
      if (!druhy.includes(a.kind)) continue;
      const d = dist(a.x, a.y, x, y);
      if (d < bd) { bd = d; best = a; }
    }
    return best || adr[0] || null;
  };
  const zastaveno = (limit) => hrac.vAuto && hrac.car && Math.abs(hrac.car.v) < (limit || 0.6);
  function navig(e) { try { api.navigace.zvol({ label: e.label, x: e.x, y: e.y }); } catch (err) { /* nic */ } }
  function navKonec() { try { api.navigace.konec(); } catch (err) { /* nic */ } }

  function konecMise(dobrovolne) {
    if (!mise) return;
    smazVsechnyZnacky();
    navKonec();
    mise = null;
    if (dobrovolne) api.toast('Mise zrušena.', 'info');
    zobrazMise();
  }

  function zobrazMise() {
    radaMise.hidden = !!mise;
    miseBox.hidden = !mise;
    if (!mise) return;
    const m = mise;
    const cas = (s) => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
    const auto = !hrac.vAuto && m.typ !== 'najdi' ? ' Nasedni do auta (E).' : '';
    let s = '';
    if (m.typ === 'taxi') {
      if (m.faze === 'vyzvednuti') s = `Taxi: vyzvedni cestujícího (${m.cil.label}), ${Math.round(dist(poz().x, poz().y, m.cil.x, m.cil.y))} m.`;
      else s = `Taxi: odvez cestujícího (${m.cil.label}), ${Math.round(dist(poz().x, poz().y, m.cil.x, m.cil.y))} m. Čas ${cas(m.zbyva)}. ${'★'.repeat(m.hvezdy)}${'☆'.repeat(5 - m.hvezdy)}`;
    } else if (m.typ === 'rozvoz') {
      if (m.faze === 'depo') s = `Rozvoz: vyzvedni balíky ve skladu (${m.cil.label}).`;
      else s = `Rozvoz: doruč ${m.zbyvaji.length} z 3 balíků. Čas ${cas(m.zbyva)}.`;
    } else {
      s = `Najdi místo: ${m.cil.label}. ${m.napoveda || 'Nápověda za chvíli…'}`;
    }
    miseTxt.textContent = s + auto;
  }

  function startTaxi() {
    const p = poz();
    const z = vyber(['adresa'], p.x, p.y, 150, 700);
    if (!z) return api.toast('Nemám žádné adresy.', 'info');
    mise = { typ: 'taxi', faze: 'vyzvednuti', cil: z, hvezdy: 5, znacka: znacka(z.x, z.y, 0xffd23a, 'osoba') };
    navig({ label: 'Nástup: ' + z.label, x: z.x, y: z.y });
    api.toast('Taxi: cestující čeká na adrese ' + z.label + '.', 'info');
    zobrazMise();
  }
  function taxiNastup() {
    const m = mise, p = m.cil;
    smazZnacku(m.znacka);
    const z = vyber(['adresa'], p.x, p.y, 800, 3000, [p]);
    const trasa = api.trasa(p.x, p.y, z.x, z.y, true);
    const delka = trasa && trasa.length > 1 ? delkaTrasy(trasa) : dist(p.x, p.y, z.x, z.y) * 1.35;
    m.faze = 'jizda'; m.cil = z; m.delka = delka;
    m.limit = delka / 9 + 60; m.zbyva = m.limit;
    m.znacka = znacka(z.x, z.y, 0x3be07a, 'bez');
    navig({ label: 'Cíl: ' + z.label, x: z.x, y: z.y });
    if (api.zvuk) api.zvuk('nastup');
    api.toast(`Cestující nastoupil, jedeme na ${z.label} (${(delka / 1000).toFixed(1)} km).`, 'info');
  }
  function taxiDojezd() {
    const m = mise;
    let zaklad = 30 + 22 * (m.delka / 1000), bonus = 0;
    if (m.zbyva < 0) zaklad *= 0.5;
    else bonus = zaklad * 0.3 * Math.min(1, (m.zbyva / m.limit) * 2) * (m.hvezdy / 5);
    const vyplata = Math.round(zaklad + bonus);
    pridej(vyplata);
    ul.taxi++; ul.hvezdy += m.hvezdy; ulozit(); obnovPanel();
    api.toast(`Dojeli jsme: +${kc(vyplata)}${m.zbyva < 0 ? ' (pozdě, poloviční jízdné)' : ''} · ${m.hvezdy} ★`, 'odmena');
    if (api.zvuk) api.zvuk('odmena');
    konecMise(false);
  }

  function startRozvoz() {
    const p = poz();
    const d = nejblizsi(['adresa'], p.x, p.y);
    if (!d) return api.toast('Nemám žádné adresy.', 'info');
    mise = { typ: 'rozvoz', faze: 'depo', cil: d, znacka: znacka(d.x, d.y, 0xff9a2e, 'balik') };
    navig({ label: 'Sklad: ' + d.label, x: d.x, y: d.y });
    api.toast('Rozvoz: najeď do skladu pro balíky.', 'info');
    zobrazMise();
  }
  function rozvozNalozeno() {
    const m = mise, d = m.cil;
    smazZnacku(m.znacka);
    const cile = [];
    for (let i = 0; i < 3; i++) {
      let c = null;
      for (let k = 0; k < 8 && !c; k++) {
        const kand = vyber(['adresa'], d.x, d.y, 300, 1800, cile.concat([d]));
        if (kand && cile.every((o) => dist(o.x, o.y, kand.x, kand.y) > 150)) c = kand;
      }
      cile.push(c || vyber(['adresa'], d.x, d.y, 100, 3000, cile.concat([d])));
    }
    let s = 0, px = d.x, py = d.y;
    for (const c of cile.slice()) { s += dist(px, py, c.x, c.y) * 1.35; px = c.x; py = c.y; }
    m.faze = 'rozvoz'; m.zbyvaji = cile.filter(Boolean);
    m.limit = s / 8 + 90; m.zbyva = m.limit;
    m.zn = new Map(m.zbyvaji.map((c) => [c, znacka(c.x, c.y, 0xff9a2e, 'balik')]));
    rozvozNavig();
    if (api.zvuk) api.zvuk('nastup');
    api.toast('Balíky naloženy, rozvez je na 3 adresy.', 'info');
  }
  function rozvozNavig() {
    const p = poz();
    let best = null, bd = 1e12;
    for (const c of mise.zbyvaji) { const d = dist(p.x, p.y, c.x, c.y); if (d < bd) { bd = d; best = c; } }
    mise.cil = best;
    if (best) navig({ label: 'Doruč: ' + best.label, x: best.x, y: best.y });
  }

  function startNajdi() {
    const p = poz();
    const z = vyber(['ulice', 'zastávka'], p.x, p.y, 200, 1500);
    if (!z) return api.toast('Nemám žádná místa.', 'info');
    mise = { typ: 'najdi', cil: z, cas: 0, hint: 0, posledni: dist(p.x, p.y, z.x, z.y), napoveda: '' };
    api.toast('Najdi: ' + z.label, 'info');
    zobrazMise();
  }

  async function spust(fn) {
    if (mise) return;
    for (const b of [bTaxi, bRozvoz, bNajdi]) b.disabled = true;
    const prvni = !adr;
    if (prvni) miseTxt.textContent = '';
    if (prvni) { statistiky.textContent = 'Načítám adresy…'; }
    await nactiAdresy();
    for (const b of [bTaxi, bRozvoz, bNajdi]) b.disabled = false;
    obnovPanel();
    if (!mise && adr && adr.length) fn(); else if (!adr || !adr.length) api.toast('Adresy se nepodařilo načíst.', 'info');
  }
  bTaxi.addEventListener('click', () => spust(startTaxi));
  bRozvoz.addEventListener('click', () => spust(startRozvoz));
  bNajdi.addEventListener('click', () => spust(startNajdi));
  bZrus.addEventListener('click', () => konecMise(true));

  // ---------- pravidla ----------
  let nad = 0, pokutaDo = 0, cervenaDo = 0, px = null, py = null, tp = 0;
  // v pouličním režimu pokuty nechodí poštou: přestupek se počítá, jen když u toho je policie (hledanost)
  const ulice = () => api.ulice && api.ulice.on;
  function poruseni(druh, info) {
    if (ulice()) { if (api.ulice.prestupek) api.ulice.prestupek(druh); return; }
    prestupek(druh, info);
  }
  function pravidla(dt) {
    const c = hrac.vAuto ? hrac.car : null;
    if (!c) { nad = 0; px = null; return; }
    const hlidat = ul.pravidla || ulice();
    const lim = api.limit();
    const kmh = Math.abs(c.v) * 3.6;
    if (hlidat && lim != null && kmh > lim + 5) {
      nad += dt;
      if (nad >= 2 && t >= pokutaDo) {
        poruseni('rychlost', { castka: kmh > lim + 20 ? 1500 : 500,
          text: `Rychlost ${Math.round(kmh)} km/h místo ${lim}: pokuta ${kmh > lim + 20 ? '1 500' : '500'} Kč` });
        pokutaDo = t + 10; nad = 0;
      }
    } else nad = 0;
    if (hlidat && px != null && t >= cervenaDo && dist(px, py, c.x, c.y) < 40 && api.cervenaNaTrase(px, py, c.x, c.y)) {
      poruseni('cervena');
      cervenaDo = t + 3;
    }
    px = c.x; py = c.y;
  }

  function aktualizujMisi(dt) {
    const m = mise;
    if (!m) return;
    const p = poz();
    if (m.typ === 'taxi') {
      if (m.faze === 'vyzvednuti') {
        if (zastaveno() && dist(p.x, p.y, m.cil.x, m.cil.y) < 12) taxiNastup();
      } else {
        m.zbyva -= dt;
        if (zastaveno() && dist(p.x, p.y, m.cil.x, m.cil.y) < 15) taxiDojezd();
      }
    } else if (m.typ === 'rozvoz') {
      if (m.faze === 'depo') {
        if (zastaveno() && dist(p.x, p.y, m.cil.x, m.cil.y) < 12) rozvozNalozeno();
      } else {
        m.zbyva -= dt;
        for (const c of m.zbyvaji.slice()) {
          if (hrac.vAuto && zastaveno(2.5) && dist(p.x, p.y, c.x, c.y) < 12) {
            smazZnacku(m.zn.get(c));
            m.zbyvaji.splice(m.zbyvaji.indexOf(c), 1);
            pridej(120);
            if (api.zvuk) api.zvuk('odmena');
            if (m.zbyvaji.length) { api.toast('Balík doručen: +120 Kč', 'odmena'); rozvozNavig(); }
          }
        }
        if (!m.zbyvaji.length) {
          const bonus = Math.min(300, Math.round(Math.max(0, m.zbyva) * 0.5));
          pridej(bonus); ul.rozvoz++; ulozit(); obnovPanel();
          api.toast(`Rozvoz hotov: 3× 120 Kč${bonus ? ' + bonus ' + kc(bonus) : ' (bez bonusu, pozdě)'}`, 'odmena');
          if (api.zvuk) api.zvuk('mise');
          konecMise(false);
        }
      }
    } else {
      m.cas += dt; m.hint += dt;
      const d = dist(p.x, p.y, m.cil.x, m.cil.y);
      if (d < 25) {
        const odm = Math.round(Math.max(50, 300 - m.cas * 0.6));
        pridej(odm); ul.najdi++; ulozit(); obnovPanel();
        api.toast(`Našel jsi: ${m.cil.label}, +${kc(odm)}`, 'odmena');
        if (api.zvuk) api.zvuk('odmena');
        konecMise(false);
      } else if (m.hint >= 5) {
        m.hint = 0;
        const delta = d - m.posledni;
        m.napoveda = d < 100 ? 'Horko!' : delta < -8 ? 'Teplo' : delta > 8 ? 'Zima' : 'Pořád stejně daleko';
        m.posledni = d;
        api.toast(m.napoveda, 'info');
      }
    }
  }

  function update(dt, now) {
    if (!(dt > 0)) dt = 0;
    if (dt > 0.5) dt = 0.5;
    t += dt;
    pravidla(dt);
    aktualizujMisi(dt);
    // tabule s limitem
    const lim = hrac.vAuto ? api.limit() : null;
    const chce = lim != null && !api.tacho.hidden;
    if (chce && lim !== tabLimit) { tab.textContent = String(lim); tabLimit = lim; }
    if (tab.hidden === chce) tab.hidden = !chce;
    if (!chce) tabLimit = null;
    tabCas -= dt;
    if (chce && tabCas <= 0) { umistiTabuli(); tabCas = 0.5; }
    // značky: pulzování
    for (const z of znacky) z.ring.scale.setScalar(1 + 0.15 * Math.sin(t * 3));
    // text panelu
    if (mise) { mise.txtCas = (mise.txtCas || 0) - dt; if (mise.txtCas <= 0) { mise.txtCas = 0.25; zobrazMise(); } }
  }

  zobrazMise();
  const penize = { stav: () => ul.kc, pridej: (castka) => pridej(castka) };
  return { update, prestupek, penize };
}
