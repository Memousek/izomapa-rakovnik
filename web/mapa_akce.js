// Akce ve městě (assets/akce.json -> site/akce.json, např. program adventu z webu města): sekce v záložce Dnes,
// bublina „právě hraje“ nad místem konání a míra davu pro život na mapě (web/mapa_zivot.js). Jen opsaný oficiální program,
// nic vymyšleného. Zkouška jiného data: ?zivot=2026-11-29T16:30
const DNY = ['ne', 'po', 'út', 'st', 'čt', 'pá', 'so'];
const ted = () => {
  const p = new URLSearchParams(location.search).get('zivot'), d = p ? new Date(p) : null;
  return d && !isNaN(d) ? d : new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Prague' }));
};
const datum = (d) => `${DNY[d.getDay()]} ${d.getDate()}. ${d.getMonth() + 1}.`;

export async function spust({ panelPo, jdi }) {
  let D;
  try { const r = await fetch('akce.json'); if (!r.ok) return null; D = await r.json(); } catch { return null; }
  const A = (D.akce || []).map((a) => ({ ...a, t0: new Date(`${a.den}T${a.od}:00`) })).sort((a, b) => a.t0 - b.t0);
  A.forEach((a, i) => {                                       // konec: uvedený, jinak začátek dalšího bodu téhož dne, poslední bod 75 min
    const n = A[i + 1];
    a.t1 = a.do ? new Date(`${a.den}T${a.do}:00`) : n && n.den === a.den ? n.t0 : new Date(a.t0.getTime() + 75 * 60000);
  });
  if (!A.length) return null;
  const misto = D.misto || {};
  const dny = [...new Set(A.map((a) => a.den))];
  const denAkci = (den) => A.filter((a) => a.den === den);
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  // stav pro mapu: co právě běží a jak velký je dav (0 nic, 1 program, 2 vrchol jako rozsvícení stromu)
  const stav = (d = ted()) => {
    const dnes = denAkci(iso(d));
    if (!dnes.length) return { dav: 0 };
    const zac = new Date(dnes[0].t0.getTime() - 20 * 60000), kon = new Date(dnes[dnes.length - 1].t1.getTime() + 30 * 60000);
    if (d < zac || d > kon) return { dav: 0 };
    const bezi = dnes.find((a) => d >= a.t0 && d < a.t1) || null;
    return { dav: bezi?.dav || 1, bezi, misto };
  };

  // ---------- panel: záložka Dnes ----------
  const box = document.createElement('details'); box.className = 'sec'; box.id = 'akceBox';
  box.innerHTML = '<summary><span class="akce-nazev"></span> <span class="sum-val"></span></summary><div class="akce-body"></div><p class="predpoved-zdroj"></p>';
  box.querySelector('.akce-nazev').textContent = D.nazev || 'Akce ve městě';
  const zdroj = box.querySelector('.predpoved-zdroj'), odkaz = document.createElement('a');
  odkaz.href = D.url; odkaz.target = '_blank'; odkaz.rel = 'noopener'; odkaz.textContent = D.zdroj || 'web města';
  zdroj.append(`${misto.nazev ? misto.nazev + ' · ' : ''}Program: `, odkaz, ' (změna vyhrazena)');
  const body = box.querySelector('.akce-body');
  const vykresli = () => {
    const d = ted(), dnesIso = iso(d), dalsi = dny.filter((x) => x >= dnesIso);
    if (!dalsi.length) { box.hidden = true; return; }
    box.hidden = false;
    const s = stav(d), den = dalsi[0], jeDnes = den === dnesIso;
    box.querySelector('.sum-val').textContent = s.bezi ? `teď: ${s.bezi.nazev}` : jeDnes ? 'dnes' : datum(new Date(`${den}T12:00:00`));
    body.replaceChildren();
    const h = document.createElement('p'); h.className = 'akce-den'; h.textContent = (jeDnes ? 'Dnes, ' : '') + datum(new Date(`${den}T12:00:00`));
    const ul = document.createElement('ul'); ul.className = 'places akce-list';
    for (const a of denAkci(den)) {
      const li = document.createElement('li'), b = document.createElement('button'); b.type = 'button';
      const cas = document.createElement('span'); cas.className = 'akce-cas'; cas.textContent = a.do ? `${a.od}–${a.do}` : a.od;
      const n = document.createElement('span'); n.textContent = a.nazev;
      b.append(cas, n);
      if (jeDnes && d >= a.t1) b.classList.add('akce-bylo');
      if (s.bezi === a) { b.classList.add('akce-ted'); const t = document.createElement('small'); t.textContent = 'právě teď'; b.append(t); }
      b.addEventListener('click', () => { if (misto.lat) jdi(misto.lat, misto.lon); });
      li.append(b); ul.append(li);
    }
    body.append(h, ul);
    const pozdeji = dalsi.slice(1);
    if (pozdeji.length) {
      const p = document.createElement('p'); p.className = 'akce-dalsi';
      p.textContent = 'Další dny: ' + pozdeji.map((x) => datum(new Date(`${x}T12:00:00`))).join(', ');
      body.append(p);
    }
    if (jeDnes && !box.dataset.otevreno) { box.open = true; box.dataset.otevreno = '1'; }   // v den programu rozbalené
  };
  vykresli();
  setInterval(vykresli, 60000);
  panelPo.after(box);

  // ---------- mapa: bublina nad místem konání, když něco právě běží ----------
  const I = window.Izomapa;
  if (I && misto.lat) {
    const [mx, my] = I.latLonToWorld(misto.lat, misto.lon);
    const font = getComputedStyle(document.documentElement).getPropertyValue('--display').trim() || 'monospace';
    I.onFrame((ctx, v) => {
      const s = stav(); if (!s.bezi || v.sx < 0.2) return;
      const [ix, iy] = I.toImg(mx, my, I.gz(mx, my) + 19); if (!v.vis(ix, iy, 120)) return;
      const [X, Y] = v.toScreen(ix, iy), txt = '♪ ' + (s.bezi.nazev.length > 34 ? s.bezi.nazev.slice(0, 33) + '…' : s.bezi.nazev);
      ctx.font = `13px ${font}`; const w = Math.ceil(ctx.measureText(txt).width) + 14, x0 = Math.round(X - w / 2), y0 = Math.round(Y - 30);
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(x0 + 3, y0 + 3, w, 22);
      ctx.fillStyle = '#232d42'; ctx.fillRect(x0, y0, w, 22);
      ctx.fillStyle = '#f2c66d'; ctx.fillRect(x0, y0, w, 2); ctx.fillRect(x0, y0 + 20, w, 2); ctx.fillRect(x0, y0, 2, 22); ctx.fillRect(x0 + w - 2, y0, 2, 22);
      ctx.fillRect(Math.round(X) - 3, y0 + 22, 6, 3); ctx.fillRect(Math.round(X) - 1, y0 + 25, 2, 3);   // ocásek k místu
      ctx.fillStyle = '#eef1e6'; ctx.textBaseline = 'middle'; ctx.fillText(txt, x0 + 7, y0 + 11.5);
    }, { layer: 'top', priority: 1 });
  }
  return stav;
}
