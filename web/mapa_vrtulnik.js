// Řízení vrtulníku nad mapou (inspirace doplňkem vrtulník na izomapa.fun, kód vlastní): tlačítko v záložce Objevuj.
// Šipky nebo WASD: dopředu, couvání, otáčení; Q / E (PageUp / PageDown) výš a níž; Esc přistání. Na dotykovém displeji
// tlačítka v pruhu dole. Kamera mapy jede za vrtulníkem. Vrtulník je kreslený v izometrii ze světových bodů
// (stejná projekce jako mapa), stín na terénu, točící se rotor. Jen ilustrace, žádná data.
const KLAVESY = { ArrowUp: 'w', ArrowDown: 's', ArrowLeft: 'a', ArrowRight: 'd', w: 'w', s: 's', a: 'a', d: 'd', q: 'q', e: 'e', PageUp: 'q', PageDown: 'e' };

export function spust() {
  const I = window.Izomapa; if (!I) return;
  const pane = document.getElementById('pane-objevuj'); if (!pane) return;
  // tlačítko s pixelovou ikonou 9 × 9 (jako záložky); do skupiny her, když ji stránka má (#hryBox), jinak na konec záložky
  const btn = document.createElement('button'); btn.className = 'px-btn hra-btn'; btn.type = 'button'; btn.id = 'vrtulnikBtn';
  btn.innerHTML = '<svg class="ico px" viewBox="0 0 9 9" aria-hidden="true" shape-rendering="crispEdges"><path fill="currentColor" fill-rule="evenodd" d="M0 0h9v1H0zM4 1h1v1H4zM2 2h4v1H2zM1 3h6v1H1zM1 4h7v1H1zM0 4h1v1H0zM2 5h4v1H2zM8 2h1v3H8zM2 7h5v1H2zM3 6h1v1H3zM5 6h1v1H5z"/></svg><span>Vrtulník</span>';
  const skupina = pane.querySelector('.hry-btns');
  if (skupina) skupina.appendChild(btn); else { const p = document.createElement('p'); p.appendChild(btn); pane.appendChild(p); }
  const hud = document.createElement('div');
  hud.id = 'vrtulnikHud'; hud.hidden = true;
  hud.setAttribute('role', 'region'); hud.setAttribute('aria-label', 'Řízení vrtulníku');
  hud.style.cssText = 'position:fixed;left:50%;bottom:84px;transform:translateX(-50%);z-index:30;display:flex;gap:6px;align-items:center;padding:6px 8px;background:rgba(29,31,36,.9);color:#eef1e6;font:600 12px var(--body, system-ui);border-radius:6px;box-shadow:0 2px 10px rgba(0,0,0,.3);user-select:none;touch-action:none';
  const B = (k, t, l) => `<button type="button" class="px-btn" data-k="${k}" aria-label="${l}" style="min-width:34px;min-height:34px">${t}</button>`;
  hud.innerHTML = `${B('a', '⟲', 'Otočit doleva')}${B('w', '▲', 'Dopředu')}${B('s', '▼', 'Dozadu')}${B('d', '⟳', 'Otočit doprava')}${B('q', '⇡', 'Výš')}${B('e', '⇣', 'Níž')}
    <span id="vrtulnikStav" aria-live="off" style="min-width:110px;text-align:center"></span><button type="button" class="px-btn" id="vrtulnikKonec">Přistát (Esc)</button>`;
  document.body.appendChild(hud);

  const H = { on: false, x: 0, y: 0, h: 0, v: 0, alt: 70, rot: 0, keys: new Set(), zoom: null };
  const zapni = () => {
    const vw = I.getView(), [x, y] = I.imgToWorld(vw.x, vw.y);
    Object.assign(H, { on: true, x, y, h: Math.PI / 4, v: 0, alt: 70, keys: new Set(), zoom: Math.max(vw.zoom, 30) });
    I.panTo(vw.x, vw.y, H.zoom, true);
    hud.hidden = false; document.body.classList.add('vrtulnik');
    hud.querySelector('[data-k="w"]').focus();
  };
  const vypni = () => { H.on = false; H.keys.clear(); hud.hidden = true; document.body.classList.remove('vrtulnik'); document.getElementById('vrtulnikBtn')?.focus(); };
  document.getElementById('vrtulnikBtn').addEventListener('click', () => (H.on ? vypni() : zapni()));
  document.getElementById('vrtulnikKonec').addEventListener('click', vypni);
  // klávesy: během letu je mapa nedostane (OpenSeadragon by šipkami posouval pohled)
  const dolu = (e) => {
    if (!H.on || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); vypni(); return; }
    const k = KLAVESY[e.key] || KLAVESY[e.key.toLowerCase()]; if (!k) return;
    e.preventDefault(); e.stopPropagation(); H.keys.add(k);
  };
  const nahoru = (e) => { const k = KLAVESY[e.key] || KLAVESY[e.key?.toLowerCase()]; if (k) { H.keys.delete(k); if (H.on) e.stopPropagation(); } };
  addEventListener('keydown', dolu, true); addEventListener('keyup', nahoru, true);
  addEventListener('blur', () => H.keys.clear());
  // dotyková tlačítka: držení = klávesa
  for (const b of hud.querySelectorAll('[data-k]')) {
    const k = b.dataset.k;
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture(e.pointerId); H.keys.add(k); });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, () => H.keys.delete(k));
  }

  // bod vrtulníku (podélně f, příčně s, výška dz nad vrtulníkem) -> obrazovka
  const SC = 2.5;                                             // model zvětšený (ve skutečné velikosti 12 m by byl z výšky jen tečka)
  const bod = (v, f, s, dz, x, y, h, z) => { f *= SC; s *= SC; dz *= SC; return v.toScreen(...I.toImg(x + f * Math.cos(h) - s * Math.sin(h), y + f * Math.sin(h) + s * Math.cos(h), z + dz)); };
  const mnohouhelnik = (ctx, P, barva) => { ctx.fillStyle = barva; ctx.beginPath(); P.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.fill(); };

  I.onFrame((ctx, v) => {
    if (!H.on) return;
    const dt = Math.min(0.1, v.dt > 1 ? v.dt / 1000 : v.dt || 0.016);
    // fyzika: zrychlení 6 m/s², max 45 m/s (160 km/h), odpor vzduchu; otáčení 1 rad/s
    const K = H.keys, cil = K.has('w') ? 45 : K.has('s') ? -10 : 0;
    H.v += Math.sign(cil - H.v) * Math.min(Math.abs(cil - H.v), (cil === 0 ? 4 : 6) * dt);
    H.h += ((K.has('a') ? 1 : 0) - (K.has('d') ? 1 : 0)) * 1.0 * dt;
    H.alt = Math.max(25, Math.min(250, H.alt + ((K.has('q') ? 1 : 0) - (K.has('e') ? 1 : 0)) * 18 * dt));
    H.x += Math.cos(H.h) * H.v * dt; H.y += Math.sin(H.h) * H.v * dt;
    const cam = I.getCam();                                     // nevyletět z mapy
    const vMape = cam.grounds.some((g) => Math.abs(H.x - g.cx) <= cam.half && Math.abs(H.y - g.cy) <= cam.half);
    if (!vMape) { H.x -= Math.cos(H.h) * H.v * dt * 2; H.y -= Math.sin(H.h) * H.v * dt * 2; H.v *= 0.5; }
    H.rot += dt * 28;
    const g = I.gz(H.x, H.y), z = g + H.alt, [gx, gy] = I.toImg(H.x, H.y, g);
    const [, hy] = I.toImg(H.x, H.y, z); I.panTo(gx, gy + (hy - gy) * 0.65, undefined, false);   // kamera mezi stínem a vrtulníkem (blíž vrtulníku)
    // stín na terénu
    const [sx_, sy_] = v.toScreen(gx, gy), r = Math.max(4, Math.abs(bod(v, 6, 0, 0, H.x, H.y, H.h, g)[0] - sx_));
    ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(sx_, sy_, r, r * 0.5, 0, 0, 6.283); ctx.fill();
    const P = (f, s, dz) => bod(v, f, s, dz, H.x, H.y, H.h, z);
    const nakl = Math.max(-0.6, Math.min(0.6, H.v / 60));       // předklon při letu (nos níž)
    // ližiny
    ctx.strokeStyle = '#2a2b30'; ctx.lineWidth = Math.max(1, r * 0.06);
    for (const s of [-1, 1]) { const a = P(-1.8, s * 1.1, -1.1 + 0.6 * nakl), b = P(2.2, s * 1.1, -1.1 - 0.8 * nakl); ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke(); }
    // ocasní nosník a ocasní plocha
    ctx.lineWidth = Math.max(2, r * 0.16); ctx.strokeStyle = '#a8000a';
    const o0 = P(-1.6, 0, 0.5 + 0.5 * nakl), o1 = P(-7.5, 0, 1.0 + 2.6 * nakl); ctx.beginPath(); ctx.moveTo(...o0); ctx.lineTo(...o1); ctx.stroke();
    mnohouhelnik(ctx, [P(-6.8, 0, 0.9 + 2.3 * nakl), P(-7.8, 0, 2.6 + 2.6 * nakl), P(-7.9, 0, 0.6 + 2.7 * nakl)], '#c40006');
    const tr = (H.rot * 1.7) % 6.283, tl = 0.9;                // ocasní vrtulka
    ctx.strokeStyle = 'rgba(40,40,44,.8)'; ctx.lineWidth = Math.max(1, r * 0.05); ctx.beginPath();
    ctx.moveTo(...P(-7.5 + Math.cos(tr) * tl, 0.35, 1.0 + 2.6 * nakl + Math.sin(tr) * tl)); ctx.lineTo(...P(-7.5 - Math.cos(tr) * tl, 0.35, 1.0 + 2.6 * nakl - Math.sin(tr) * tl)); ctx.stroke();
    // trup: kapka vytažená do výšky (spodní a horní obrys, boky mezi nimi stínované podle světla od severozápadu),
    // vpředu prosklená kabina; kreslí se odzadu dopředu (podle hloubky na obrazovce)
    const N = 18, PROF = Array.from({ length: N }, (_, i) => {
      const a = i / N * 6.283, c = Math.cos(a), sn = Math.sin(a);
      return [c > 0 ? c * 2.5 : c * 2.1, sn * (c > 0 ? 1.15 : 1.15 - 0.35 * -c)];   // zezadu užší
    });
    const zdz = (f, dz) => dz - f * nakl * 0.35;                    // předklon trupu
    const dole = PROF.map(([f, s_]) => P(f * 0.92, s_ * 0.85, zdz(f, -0.6))), stred = PROF.map(([f, s_]) => P(f, s_, zdz(f, 0.3))), nahore = PROF.map(([f, s_]) => P(f * 0.8, s_ * 0.75, zdz(f, 1.25)));
    const sklo = (i) => PROF[i][0] > 0.9;                             // přední část trupu je kabina
    const steny = [];
    for (let i = 0; i < N; i++) {
      const k = (i + 1) % N, nf = (PROF[i][0] + PROF[k][0]) / 2, ns = (PROF[i][1] + PROF[k][1]) / 2;
      const sv = 0.55 + 0.45 * Math.max(0, (Math.cos(H.h) * nf - Math.sin(H.h) * ns) * -0.6 + (Math.sin(H.h) * nf + Math.cos(H.h) * ns) * 0.6) / 2.5;   // světlo ze SZ
      steny.push({ P: [dole[i], dole[k], stred[k], stred[i]], y: (dole[i][1] + dole[k][1]) / 2, c: `rgb(${Math.round(160 * sv + 40)},${Math.round(8 * sv)},${Math.round(14 * sv)})` });
      steny.push({ P: [stred[i], stred[k], nahore[k], nahore[i]], y: (stred[i][1] + stred[k][1]) / 2 - 0.01, c: sklo(i) && sklo(k) ? `rgba(${Math.round(120 * sv + 60)},${Math.round(170 * sv + 50)},${Math.round(200 * sv + 40)},.97)` : `rgb(${Math.round(185 * sv + 50)},${Math.round(30 * sv)},${Math.round(30 * sv)})` });
    }
    steny.sort((a, b) => a.y - b.y);
    for (const w of steny) mnohouhelnik(ctx, w.P, w.c);
    mnohouhelnik(ctx, nahore, '#d8282a');                            // střecha trupu
    mnohouhelnik(ctx, [P(-0.3, -0.35, zdz(-0.3, 1.25)), P(0.6, -0.35, zdz(0.6, 1.25)), P(0.6, 0.35, zdz(0.6, 1.75)), P(-0.3, 0.35, zdz(-0.3, 1.75))], '#3a3a40');   // motor pod rotorem
    // hlavní rotor: kotouč a dva listy
    const hz = 2.05;
    ctx.fillStyle = 'rgba(30,30,34,.12)'; ctx.beginPath(); Array.from({ length: 16 }, (_, i) => { const a = i / 16 * 6.283; return P(Math.cos(a) * 5.5, Math.sin(a) * 5.5, hz); }).forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p))); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(30,30,34,.85)'; ctx.lineWidth = Math.max(1, r * 0.07);
    ctx.beginPath(); ctx.moveTo(...P(0.15, 0, zdz(0.15, 1.7))); ctx.lineTo(...P(0.15, 0, hz)); ctx.stroke();   // stožár
    for (const o of [0, Math.PI]) { const a = H.rot + o; ctx.beginPath(); ctx.moveTo(...P(0.15, 0, hz)); ctx.lineTo(...P(0.15 + Math.cos(a) * 5.8, Math.sin(a) * 5.8, hz)); ctx.stroke(); }
    // údaje
    const st = document.getElementById('vrtulnikStav');
    if (st) st.textContent = `${Math.round(Math.abs(H.v) * 3.6)} km/h · ${Math.round(H.alt)} m`;
  }, { layer: 'top', priority: 5 });
}
