// Kalendář akcí z webu infocentra (functions/api/kalendar.js) a domácí zápasy (site/zapasy.json, ručně), místa konání
// z site/akce_mista.json (nastroje/akce_mista.py, OSM). Sekce „Ve městě“ v záložce Dnes, štítky dnešních akcí na mapě,
// před začátkem lidé přicházejí k místu konání (u zápasu víc), během zápasu bublina nad stadionem. Zkouška: ?zivot=2026-11-28T16:40
const DNY = ['ne', 'po', 'út', 'st', 'čt', 'pá', 'so'];
const VATA = new Set(['a', 'v', 've', 'na', 'u', 'pod', 'nad', 'do', 'sv', 'svateho', 'svate', 'rakovnik', 'rakovniku', 'mesto', 'mestske', 'mestsky', 'sal', 'areal', 'budova']);
const slova = (t) => (t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[a-z0-9]+/g)?.filter((w) => w.length > 1 && !VATA.has(w)).map((w) => w.slice(0, 5)) || [];
const ted = () => {
  const p = new URLSearchParams(location.search).get('zivot'), d = p ? new Date(p) : null;
  return d && !isNaN(d) ? d : new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Prague' }));
};
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const datum = (s) => { const d = new Date(s + 'T12:00:00'); return `${DNY[d.getDay()]} ${d.getDate()}. ${d.getMonth() + 1}.`; };
const SPORT = { fotbal: '⚽', hokej: '🏒', hazena: '🤾', volejbal: '🏐', basketbal: '🏀' };

export async function spust({ panelPo, ukazKartu, jdi }) {
  const nacti = (u) => fetch(u, { signal: AbortSignal.timeout(25000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const [K, Z, M] = await Promise.all([nacti('api/kalendar'), nacti('zapasy.json'), nacti('akce_mista.json')]);
  const mista = (M || []).map((m) => ({ ...m, sl: new Set(m.slova) }));
  const najdi = (txt) => {                                               // místo podle shody slov (alespoň 60 % slov názvu místa)
    const w = new Set(slova(txt)); let best = null, bs = 0;
    for (const m of mista) { const hit = m.slova.filter((s) => w.has(s)).length, sc = hit / m.slova.length + hit * 0.01; if (hit && hit / m.slova.length >= 0.6 && sc > bs) { bs = sc; best = m; } }
    return best;
  };
  const akce = [];
  for (const a of (K && K.akce) || []) if (a.od) akce.push({ ...a, druh: 'akce', m: najdi(a.misto) || najdi(a.nazev) });
  for (const z of (Z && Z.zapasy) || []) {
    if (!z.den) continue;
    akce.push({ druh: 'zapas', sport: z.sport, nazev: `${z.domaci} – ${z.hoste}`, od: z.den, do: z.den, cas: z.cas, misto: z.misto || '', perex: z.soutez || '', url: z.url || (Z && Z.url) || '', m: najdi(z.misto) });
  }
  const zacatek = (a) => (a.cas ? new Date(`${a.od}T${a.cas}:00`) : null);
  const dnesIso = iso(ted());
  const budouci = akce.filter((a) => (a.do || a.od) >= dnesIso);
  if (!budouci.length) return;

  // ---------- panel: záložka Dnes ----------
  const karta = (a) => {
    if (a.m) jdi(a.m.lat, a.m.lon);
    ukazKartu({ title: (a.druh === 'zapas' ? (SPORT[a.sport] || '🏟') + ' ' : '') + a.nazev, text: a.perex || '', lat: a.m ? a.m.lat : null, lon: a.m ? a.m.lon : null,
      rows: [['Kdy', a.kdy || `${datum(a.od)}${a.cas ? ' v ' + a.cas : ''}`], ['Kde', a.m ? a.m.nazev : a.misto], ['Zdroj', a.druh === 'zapas' ? (Z && Z.zdroj) || 'rozpis klubu' : (K && K.zdroj) || 'kalendář akcí']],
      link: a.url || undefined, linkText: a.druh === 'zapas' ? 'Rozpis zápasů ↗' : 'Podrobnosti o akci ↗' });
  };
  const box = document.createElement('details'); box.className = 'sec'; box.id = 'kalendarBox';
  box.innerHTML = '<summary>Ve městě <span class="sum-val"></span></summary><div class="kal-body"></div><p class="predpoved-zdroj"></p>';
  const zdroj = box.querySelector('.predpoved-zdroj');
  if (K && K.odkaz) { const o = document.createElement('a'); o.href = K.odkaz; o.target = '_blank'; o.rel = 'noopener'; o.textContent = K.zdroj || 'kalendář akcí'; zdroj.append('Kalendář: ', o); }
  const vykresli = () => {
    const d = ted(), dIso = iso(d), body = box.querySelector('.kal-body'); body.replaceChildren();
    const jednodenni = budouci.filter((a) => a.od === (a.do || a.od) || a.cas), vystavy = budouci.filter((a) => !jednodenni.includes(a) && a.od <= dIso);
    const dny = [...new Set(jednodenni.map((a) => a.od))].filter((x) => x >= dIso).sort().slice(0, 4);
    const dnes = jednodenni.filter((a) => a.od === dIso);
    box.querySelector('.sum-val').textContent = dnes.length ? `dnes ${dnes.length} ${dnes.length === 1 ? 'akce' : dnes.length < 5 ? 'akce' : 'akcí'}` : dny[0] ? datum(dny[0]) : '';
    for (const den of dny) {
      const h = document.createElement('p'); h.className = 'akce-den'; h.textContent = (den === dIso ? 'Dnes, ' : '') + datum(den); body.append(h);
      const ul = document.createElement('ul'); ul.className = 'places akce-list';
      for (const a of jednodenni.filter((q) => q.od === den).sort((p, q) => (p.cas || '99').localeCompare(q.cas || '99')).slice(0, 8)) {
        const li = document.createElement('li'), b = document.createElement('button'); b.type = 'button';
        const c = document.createElement('span'); c.className = 'akce-cas'; c.textContent = a.cas || 'celý den';
        const n = document.createElement('span'); n.textContent = (a.druh === 'zapas' ? (SPORT[a.sport] || '🏟') + ' ' : '') + a.nazev;
        const s = document.createElement('small'); s.textContent = a.m ? a.m.nazev : a.misto;
        const z = zacatek(a); if (den === dIso && z && d > new Date(z.getTime() + 2 * 3600e3)) b.classList.add('akce-bylo');
        b.append(c, n, s); b.addEventListener('click', () => karta(a)); li.append(b); ul.append(li);
      }
      body.append(ul);
    }
    if (vystavy.length) {
      const p = document.createElement('p'); p.className = 'akce-dalsi';
      p.textContent = 'Probíhá: ' + vystavy.slice(0, 5).map((a) => a.nazev).join(', ');
      body.append(p);
    }
  };
  vykresli(); setInterval(vykresli, 5 * 60000);
  panelPo.after(box);

  // ---------- mapa: štítky dnešních akcí, příchod lidí, bublina u zápasu ----------
  const I = window.Izomapa; if (!I) return;
  const font = getComputedStyle(document.documentElement).getPropertyValue('--display').trim() || 'monospace';
  const rnd = (s) => { const x = Math.sin(s * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const kde = [];
  I.onFrame((ctx, v) => {
    kde.length = 0;
    const d = ted(), dIso = iso(d), t = d.getTime();
    for (const [n, a] of akce.entries()) {
      if (!a.m || a.od !== dIso) continue;
      const [x, y] = I.latLonToWorld(a.m.lat, a.m.lon), z0 = zacatek(a), zap = a.druh === 'zapas';
      const pred = z0 ? (z0.getTime() - t) / 60000 : null;               // minut do začátku
      // lidé přicházejí: 45 min (zápas 60 min) před začátkem, stojí u vchodu; po začátku zmizí uvnitř
      if (pred !== null && pred > 0 && pred < (zap ? 60 : 45) && v.sx > 0.45 && I.postava) {
        const pocet = Math.round((zap ? 24 : 9) * (1 - pred / (zap ? 60 : 45)) + 2);
        if (!a.volno || performance.now() - a.volnoT > 10000) {                        // volná místa kolem (ne v budově), bod místa bývá uprostřed domu;
          a.volno = []; a.volnoT = performance.now();                                  // po 10 s znovu, budovy a stromy čtverce se načítají postupně
          for (let k = 0; k < 600; k++) {                                // volné a z pohledu viditelné místo, co nejblíž (vchod do domu v bloku neznáme)
            const o = rnd(n * 97 + k) * 6.283, r = 3 + rnd(n * 31 + k) * (zap ? 40 : 35), px = x + Math.cos(o) * r, py = y + Math.sin(o) * r;
            if (I.vBudove && I.vBudove(px, py)) continue;
            a.volno.push([px, py, r + (I.zakryto && I.zakryto(px, py) ? 1000 : 0)]);
          }
          a.volno.sort((p, q) => p[2] - q[2]); a.volno.length = Math.min(a.volno.length, 40);
        }
        const L = a.volno.slice(0, pocet).map(([px, py], k) => [px, py, k]);
        L.sort((p, q) => I.toImg(p[0], p[1], 0)[1] - I.toImg(q[0], q[1], 0)[1]);
        for (const [px, py, k] of L) I.postava(v, px, py, { oi: 400 + n * 13 + k, back: I.toImg(px, py, 0)[1] > I.toImg(x, y, 0)[1], mir: px > x });
      }
      if (v.sx < 0.12) continue;
      const [ix, iy] = I.toImg(x, y, I.gz(x, y) + 14); if (!v.vis(ix, iy, 120)) continue;
      const bezi = zap && pred !== null && pred <= 0 && pred > -120;
      const txt = (zap ? (SPORT[a.sport] || '🏟') + ' ' : '') + (bezi ? a.nazev + ' · hraje se' : `${a.cas ? a.cas + ' ' : ''}${a.nazev.length > 28 ? a.nazev.slice(0, 27) + '…' : a.nazev}`);
      const [X, Y] = v.toScreen(ix, iy);
      ctx.font = `12px ${font}`; const w = Math.ceil(ctx.measureText(txt).width) + 12, x0 = Math.round(X - w / 2), y0 = Math.round(Y - 26);
      ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(x0 + 2, y0 + 2, w, 18);
      ctx.fillStyle = bezi ? '#2c5a2e' : '#232d42'; ctx.fillRect(x0, y0, w, 18);
      ctx.fillStyle = zap ? '#8cc063' : '#c9583b'; ctx.fillRect(x0, y0 + 16, w, 2);
      ctx.fillStyle = '#eef1e6'; ctx.textBaseline = 'middle'; ctx.fillText(txt, x0 + 6, y0 + 9.5);
      ctx.fillStyle = '#232d42'; ctx.fillRect(Math.round(X) - 1, y0 + 18, 2, 6);
      kde.push([X, y0 + 9, w, a]);
    }
  }, { layer: 'top' });
  I.onMapClick((e) => { const h = kde.find((q) => Math.abs(q[0] - e.screenX) < q[2] / 2 && Math.abs(q[1] - e.screenY) < 11); if (h) { karta(h[3]); return true; } return false; });
}
