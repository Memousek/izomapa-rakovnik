// Čerpací stanice a nabíječky ve 3D jízdě (nastroje/pumpy.py -> pumpy.json vedle jizda.html).
// U pumpy stojí cenový totem (barva podle značky, paliva a ceny, když jsou z ověřeného zdroje), u nabíječky stojan.
// Když hráč u pumpy nebo nabíječky zastaví (autem pod 1,5 m/s, pěšky kdykoli), ukáže se panel s cenami nebo konektory.
// Souřadnice: svět x východ, y sever, z nahoru; three pozice = (x, z, -y).
const PALIVO = { 95: 'Natural 95', 98: 'Natural 98', 100: 'Natural 100', nafta: 'Nafta', lpg: 'LPG', cng: 'CNG', lng: 'LNG', adblue: 'AdBlue', propan: 'Propan-butan' };
const KRATCE = { 95: '95', 98: '98', 100: '100', nafta: 'NAFTA', lpg: 'LPG', cng: 'CNG', lng: 'LNG', adblue: 'AdBlue', propan: 'PB' };
const KONEKTOR = { type2: 'Type 2', type2_cable: 'Type 2 (kabel)', type2_combo: 'CCS', chademo: 'CHAdeMO', type1: 'Type 1', type1_combo: 'CCS1', tesla_supercharger: 'Tesla', tesla_standard: 'Tesla', gb_dc: 'GB/T' };
const ZNACKA_BARVA = [[/orlen|benzina/i, '#c8102e'], [/euro ?oil|robin/i, '#0a7a3c'], [/prim/i, '#1d5fae'], [/shell/i, '#e8b400'], [/omv/i, '#0b3d7a'], [/mol/i, '#d6001c'], [/tank ?ono/i, '#f28c00'], [/globus|makro|tesco/i, '#2a6e2a']];
const BLIZKO = { pumpa: 28, ev: 14 };

export function vytvorPumpy(THREE, scene, api) {
  const skupina = new THREE.Group(); skupina.name = 'pumpy'; scene.add(skupina);
  let seznam = [], zdroj = {};
  const nazev = (p) => p.nazev || p.znacka || p.provozovatel || (p.druh === 'pumpa' ? 'Čerpací stanice' : 'Nabíječka elektromobilů');
  const stari = (p) => (p.cas ? (Date.now() - new Date(p.cas).getTime()) / 3600000 : Infinity);
  const maCeny = (p) => p.ceny && stari(p) < 168 && Object.keys(p.ceny).length;
  const kc = (v) => v.toFixed(2).replace('.', ',');
  const barva = (p) => (ZNACKA_BARVA.find(([re]) => re.test(`${p.znacka || ''} ${p.nazev || ''}`)) || [0, '#1f6f8b'])[1];

  fetch('pumpy.json').then((r) => (r.ok ? r.json() : null)).catch(() => null).then((d) => {
    zdroj = (d && d.zdroj) || {};
    seznam = ((d && d.stanice) || []).filter((p) => p.druh !== 'kolo').map((p) => ({ ...p, x: (p.lon - api.CAM.lon0) * api.CAM.kx, y: (p.lat - api.CAM.lat0) * api.CAM.ky, g: null }));
  });

  // ---------- umístění: mimo budovy, kousek od silnice, čelem k ní ----------
  function silniceU(x, y) {
    let best = null;
    for (const r of api.roads) {
      if (Math.abs(r.w[0][0] - x) > 700 || Math.abs(r.w[0][1] - y) > 700) continue;
      for (let i = 1; i < r.w.length; i++) {
        const a = r.w[i - 1], b = r.w[i], ex = b[0] - a[0], ey = b[1] - a[1], l2 = ex * ex + ey * ey || 1;
        const t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (y - a[1]) * ey) / l2)), px = a[0] + ex * t, py = a[1] + ey * t, d = Math.hypot(px - x, py - y);
        if (!best || d < best.d) best = { d, px, py };
      }
    }
    return best;
  }
  function misto(p, r) {
    for (let d = 0; d <= 30; d += 2) for (let a = 0; a < 6.28; a += d ? 0.5 : 7) {
      const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
      if (api.hitBuilding(x, y, r)) continue;
      const s = silniceU(x, y);
      if (s && s.d < 5) continue;                               // ne na vozovku
      return { x, y, s };
    }
    return { x: p.x, y: p.y, s: silniceU(p.x, p.y) };
  }

  // ---------- totem pumpy ----------
  function texTotem(p) {
    const W = 160, H = 560, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    g.fillStyle = '#20242c'; g.fillRect(0, 0, W, H);
    g.fillStyle = barva(p); g.fillRect(0, 0, W, 120);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const jm = (p.znacka || nazev(p)).toUpperCase();
    let f = 34; do { g.font = `700 ${f}px system-ui, sans-serif`; f -= 2; } while (g.measureText(jm).width > W - 14 && f > 12);
    g.fillText(jm, W / 2, 60);
    const radky = maCeny(p) ? Object.entries(p.ceny).slice(0, 5) : (p.paliva || []).filter((k) => k !== 'adblue').slice(0, 5).map((k) => [k, null]);
    radky.forEach(([k, v], i) => {
      const y = 150 + i * 78;
      g.fillStyle = '#e8e8e8'; g.fillRect(10, y, W - 20, 64);
      g.fillStyle = '#20242c'; g.font = '700 22px system-ui, sans-serif'; g.textAlign = 'left'; g.fillText(KRATCE[k] || k, 18, y + 18);
      if (v !== null) { g.fillStyle = '#111'; g.fillRect(18, y + 32, W - 36, 28); g.fillStyle = '#ff4a3a'; g.font = '700 24px "Courier New", monospace'; g.textAlign = 'right'; g.fillText(kc(v), W - 24, y + 47); }
    });
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  }
  function texNabijecka() {
    const c = document.createElement('canvas'); c.width = 64; c.height = 128; const g = c.getContext('2d');
    g.fillStyle = '#f2f4f0'; g.fillRect(0, 0, 64, 128); g.fillStyle = '#2c9a4b'; g.fillRect(0, 0, 64, 22); g.fillRect(0, 110, 64, 18);
    g.fillStyle = '#16202a'; g.fillRect(12, 34, 40, 26);                                       // displej
    g.fillStyle = '#2c9a4b'; g.beginPath(); g.moveTo(36, 66); g.lineTo(22, 88); g.lineTo(31, 88); g.lineTo(27, 104); g.lineTo(42, 82); g.lineTo(33, 82); g.closePath(); g.fill();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  const matBok = new THREE.MeshLambertMaterial({ color: 0x2a2f38 });
  const matNoha = new THREE.MeshLambertMaterial({ color: 0x5b6068 });
  let texEv = null;

  function postav(p) {
    const ev = p.druh === 'ev', m = misto(p, ev ? 0.6 : 1.2);
    const z = api.gz(m.x, m.y), g = new THREE.Group();
    g.position.set(m.x, z, -m.y);
    if (m.s) g.rotation.y = Math.atan2(m.s.px - m.x, -(m.s.py - m.y));   // čelo (místní +z) k silnici: three (dx, 0, -dy)
    if (ev) {
      texEv = texEv || texNabijecka();
      const lic = new THREE.MeshBasicMaterial({ map: texEv }), bok = new THREE.MeshLambertMaterial({ color: 0xe6e9e4 });
      const n = Math.max(1, Math.min(3, p.stojanu || ((p.konektory || []).length > 1 ? 2 : 1)));
      for (let i = 0; i < n; i++) {
        const s = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.7, 0.35), [bok, bok, bok, bok, lic, lic]);
        s.position.set((i - (n - 1) / 2) * 1.6, 0.85, 0); g.add(s); api.jenVeDne.push(s);
      }
    } else {
      const tex = texTotem(p), lic = new THREE.MeshBasicMaterial({ map: tex, color: 0xdddddd });
      const deska = new THREE.Mesh(new THREE.BoxGeometry(1.5, 5.25, 0.3), [matBok, matBok, matBok, matBok, lic, lic]);
      deska.position.y = 0.55 + 5.25 / 2; g.add(deska);
      const noha = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.45), matNoha); noha.position.y = 0.275; g.add(noha); api.jenVeDne.push(noha);
    }
    skupina.add(g); p.g = g; p.mx = m.x; p.my = m.y;
  }

  // ---------- panel při zastavení ----------
  const panel = document.createElement('section');
  panel.id = 'pumpaPanel'; panel.hidden = true; panel.setAttribute('aria-live', 'polite');
  panel.style.cssText = 'position:fixed;z-index:5;right:16px;top:30%;width:min(290px,calc(100vw - 32px));box-sizing:border-box;padding:12px 14px;' +
    'background:var(--panel);color:var(--ink);border:2px solid var(--edge);border-left:6px solid #1f6f8b;box-shadow:var(--stin);font:400 .92rem/1.4 var(--body);pointer-events:none';
  document.body.appendChild(panel);
  let aktivni = null;
  function vyplnPanel(p) {
    panel.replaceChildren();
    panel.style.borderLeftColor = p.druh === 'ev' ? '#2c9a4b' : barva(p);
    const h = document.createElement('h2'); h.style.cssText = 'margin:0 0 6px;font:500 1.1rem var(--display)'; h.textContent = nazev(p);
    const dl = document.createElement('dl'); dl.style.cssText = 'display:grid;grid-template-columns:auto 1fr;gap:2px 12px;margin:0';
    const radek = (k, v, siln) => { const dt = document.createElement('dt'); dt.textContent = k; dt.style.color = 'var(--muted)'; const dd = document.createElement('dd'); dd.style.margin = '0'; dd.textContent = v; if (siln) dd.style.fontWeight = '700'; dl.append(dt, dd); };
    if (p.druh === 'pumpa') {
      if (maCeny(p)) for (const [k, v] of Object.entries(p.ceny)) radek(PALIVO[k] || k, kc(v) + ' Kč', true);
      else radek('Paliva', (p.paliva || []).map((k) => PALIVO[k] || k).join(', ') || 'neuvedeno');
    } else {
      radek('Konektory', (p.konektory || []).map(([s, n, v]) => `${n > 1 ? n + '× ' : ''}${KONEKTOR[s] || s}${v ? ' ' + v : ''}`).join(', ') || 'neuvedeno');
      if (p.placene !== undefined) radek('Nabíjení', p.placene ? 'placené' : 'zdarma');
      const nb = p.nabijeni;
      if (nb) for (const q of nb.pasma) {                         // ceník provozovatele: bez registrace, v noci, s registrací
        const pas = q.do_kw != null ? (q.od_kw ? `${q.od_kw + 1}–${q.do_kw} kW` : `do ${q.do_kw} kW`) : `nad ${q.od_kw} kW`;
        radek(pas, `${kc(q.cena)} Kč/kWh${q.noc != null ? ' (noc ' + kc(q.noc) + ')' : ''}${q.reg != null ? ', s reg. ' + kc(q.reg) : ''}`, true);
      }
    }
    if (p.oteviraci) radek('Otevřeno', p.oteviraci === '24/7' ? 'nonstop' : p.oteviraci.replace(/Mo/g, 'po').replace(/Tu/g, 'út').replace(/We/g, 'st').replace(/Th/g, 'čt').replace(/Fr/g, 'pá').replace(/Sa/g, 'so').replace(/Su/g, 'ne').replace(/PH/g, 'svátky').replace(/;\s*/g, ', '));
    panel.append(h, dl);
    if (p.druh === 'ev' && p.nabijeni) {
      const s = document.createElement('p'); s.style.cssText = 'margin:8px 0 0;font-size:.8rem;color:var(--muted)';
      s.textContent = `Ceník ${p.nabijeni.nazev || ''}${p.nabijeni.noc ? ' · noc ' + p.nabijeni.noc : ''}`; panel.append(s);
    }
    if (p.druh === 'pumpa' && maCeny(p)) {
      const s = document.createElement('p'); s.style.cssText = 'margin:8px 0 0;font-size:.8rem;color:var(--muted)';
      const h_ = stari(p); s.textContent = `Ceny ${h_ < 1 ? 'před chvílí' : h_ < 24 ? 'před ' + Math.round(h_) + ' h' : 'před ' + Math.round(h_ / 24) + ' d'} · zdroj ${zdroj.zdroj || 'ceník'}`;
      panel.append(s);
    }
  }

  function update() {
    if (!seznam.length) return;
    const ja = api.hrac.vAuto && api.hrac.car ? api.hrac.car : api.hrac, v = api.hrac.vAuto && api.hrac.car ? Math.abs(api.hrac.car.v || 0) : 0;
    let blizko = null, bd = Infinity;
    for (const p of seznam) {
      const d = Math.hypot(p.x - ja.x, p.y - ja.y);
      if (!p.g && d < 450 && api.roads.length) postav(p);
      if (p.g) p.g.visible = d < 900;
      const dm = p.g ? Math.min(d, Math.hypot(p.mx - ja.x, p.my - ja.y)) : d;
      if (dm < BLIZKO[p.druh] && dm < bd) { bd = dm; blizko = p; }
    }
    if (aktivni) {                                             // odjel (dál než o 12 m za dosah) nebo se rozjel: panel pryč
      const da = Math.min(Math.hypot(aktivni.x - ja.x, aktivni.y - ja.y), aktivni.g ? Math.hypot(aktivni.mx - ja.x, aktivni.my - ja.y) : Infinity);
      if (da > BLIZKO[aktivni.druh] + 12 || v > 5) { aktivni = null; panel.hidden = true; }
    }
    if (!aktivni && blizko && v < 1.5) { aktivni = blizko; vyplnPanel(blizko); panel.hidden = false; }
  }

  return {
    update, skupina,
    get seznam() { return seznam; },
    nazev,
  };
}
