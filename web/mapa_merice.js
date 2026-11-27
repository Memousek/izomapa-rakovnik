// Ukazatele rychlosti „Vaše rychlost“ (Vrstvy → Měřiče rychlosti): tabule na sloupku na místech z OpenStreetMap
// (nastroje/merice.py -> site/merice.json). Číslo je rychlost auta ze simulace, které k tabuli právě jede (Izomapa.auta),
// ne skutečně naměřená: zeleně do limitu, nad limitem červeně a bliká. Klik otevře kartu s posledními průjezdy.
// smer = kompasový směr od tabule, odkud auta přijíždějí (OSM direction); bez něj tabule měří oba směry.
const CIF = {                                                     // číslice 3 × 5 bodů
  0: ['111', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '111'], 2: ['111', '001', '111', '100', '111'],
  3: ['111', '001', '011', '001', '111'], 4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'], 7: ['111', '001', '010', '010', '010'], 8: ['111', '101', '111', '101', '111'],
  9: ['111', '101', '111', '001', '111'],
};
const DOSAH = 70, BLIZ = 8, VYDRZ = 2.5, MAX_UHEL = 60;          // m, m, s, °

export function spust({ ukazKartu }) {
  const I = window.Izomapa; if (!I) return;
  let tabule = [], zap = true;
  try { zap = localStorage.getItem('izo-merice') !== '0'; } catch {}
  fetch('merice.json').then((r) => (r.ok ? r.json() : [])).catch(() => []).then((d) => {
    tabule = (d || []).filter((m) => m.typ === 'displej').map((m) => {
      const [x, y] = I.latLonToWorld(...(m.stoji || [m.lat, m.lon]));   // sloup u okraje vozovky
      return { m, x, y, cislo: null, do: 0, posl: [], minule: null };
    });
    if (!tabule.length) return;
    const box = document.querySelector('.prepinace');
    if (box) {
      const l = document.createElement('label'); l.className = 'chip';
      l.innerHTML = `<input type="checkbox" id="l-merice"${zap ? ' checked' : ''}><span>Měřiče rychlosti</span>`;
      box.appendChild(l);
      l.querySelector('input').addEventListener('change', (e) => { zap = e.target.checked; try { localStorage.setItem('izo-merice', zap ? '1' : '0'); } catch {} });
    }
  });

  // auto, které k tabuli jede ze směru, který měří; nejbližší vyhrává
  function mereneAuto(t) {
    let best = null;
    for (const a of I.auta(t.x, t.y, DOSAH)) {
      const ux = a.x - t.x, uy = a.y - t.y, d = Math.hypot(ux, uy);
      if (d < BLIZ || a.v < 1) continue;
      if ((-ux * a.dx - uy * a.dy) / d < 0.6) continue;           // nejede k tabuli
      if (t.m.smer != null) {
        const az = (Math.atan2(ux, uy) * 180 / Math.PI + 360) % 360, r = Math.abs(((az - t.m.smer + 540) % 360) - 180);
        if (r > MAX_UHEL) continue;                                 // jede z druhé strany, tabuli nevidí
      }
      if (!best || d < best.d) best = { ...a, d };
    }
    return best;
  }

  let posledni = 0;
  const kde = [];
  I.onFrame((ctx, v) => {
    kde.length = 0;
    if (!zap || !tabule.length || v.sx < 0.15) return;
    const ted = v.now / 1000, mer = ted - posledni > 0.12;       // měřit asi 8× za sekundu
    if (mer) posledni = ted;
    const q = Math.max(1, Math.round(v.sx * 1.3));
    for (const t of tabule) {
      const z = I.gz(t.x, t.y), [ix, iy] = I.toImg(t.x, t.y, z);
      if (!v.vis(ix, iy, 60)) continue;
      if (mer) {
        const a = mereneAuto(t);
        if (a) {
          t.cislo = Math.round(a.v * 3.6); t.do = ted + VYDRZ;
          if (a.auto !== t.minule) { t.minule = a.auto; t.posl.unshift({ v: t.cislo, cas: new Date() }); t.posl.length = Math.min(t.posl.length, 8); }
        } else if (ted > t.do) t.cislo = null;
      }
      const [X, Y] = v.toScreen(ix, iy), h = Math.max(14, 17 * v.sx);   // sloup ~3,4 m
      const txt = t.cislo == null ? '' : String(Math.min(199, t.cislo)), w = 3 * 4 * q + 3 * q, vy = 5 * q + 4 * q;
      const x0 = Math.round(X - w / 2), y0 = Math.round(Y - h - vy);
      const pw = Math.max(2, q), px = Math.round(X - pw / 2);
      ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(px + pw, Math.round(Y) - 1, Math.round(h * 0.5), Math.max(2, q));   // stín sloupu
      ctx.fillStyle = '#2b2d31'; ctx.fillRect(px - 1, y0 + vy, pw + 2, Math.round(h) + 1);
      ctx.fillStyle = '#b9bdc2'; ctx.fillRect(px, y0 + vy, pw, Math.round(h));
      ctx.fillStyle = '#ffd200'; ctx.fillRect(x0 - q, y0 - q, w + 2 * q, vy + 2 * q);   // žlutý rámeček jako u skutečných tabulí
      ctx.fillStyle = '#111'; ctx.fillRect(x0, y0, w, vy);
      const nad = t.cislo != null && t.cislo > t.m.limit, blik = nad && Math.floor(ted * 2.5) % 2;
      if (txt && !blik) {
        const col = nad ? '#ff3b30' : '#3cff6a';
        if (v.night > 0.3) { ctx.fillStyle = nad ? 'rgba(255,59,48,.25)' : 'rgba(60,255,106,.22)'; ctx.fillRect(x0 - 3 * q, y0 - 3 * q, w + 6 * q, vy + 6 * q); }
        ctx.fillStyle = col;
        const sx0 = x0 + 2 * q + (3 - txt.length) * 2 * q;            // zarovnání na střed
        [...txt].forEach((ch, k) => CIF[ch].forEach((r, j) => { for (let i = 0; i < 3; i++) if (r[i] === '1') ctx.fillRect(sx0 + (k * 4 + i) * q, y0 + 2 * q + j * q, q, q); }));
      }
      kde.push([x0 - q, y0 - q, w + 2 * q, vy + 2 * q + h, t]);
    }
  }, { layer: 'top', priority: -1 });

  I.onMapClick((e) => {
    if (!zap) return false;
    const h = kde.find(([x0, y0, w, hh]) => e.screenX >= x0 - 3 && e.screenX <= x0 + w + 3 && e.screenY >= y0 - 3 && e.screenY <= y0 + hh);
    if (!h) return false;
    const t = h[4], m = t.m;
    const usek = m.usek != null ? tabule.filter((o) => o.m.usek === m.usek && o !== t) : [];
    const rows = [['Ulice', m.ulice || 'silnice bez názvu'], ['Nejvyšší povolená', `${m.limit} km/h`],
      ['Měří', m.smer == null ? 'oba směry' : `auta od ${['severu', 'severovýchodu', 'východu', 'jihovýchodu', 'jihu', 'jihozápadu', 'západu', 'severozápadu'][Math.round(m.smer / 45) % 8]}`]];
    if (t.posl.length) rows.push(['Poslední auta v mapě', t.posl.map((p) => `${p.v}`).join(', ') + ' km/h']);
    if (usek.length) rows.push(['Měřený úsek', `s tabulí na ${usek[0].m.ulice || 'silnici'}, ${Math.round(Math.hypot(usek[0].x - t.x, usek[0].y - t.y))} m (ve 3D jízdě počítá průměr)`]);
    ukazKartu({ title: usek.length ? 'Měřený úsek: ukazatel rychlosti' : 'Ukazatel rychlosti', lat: m.lat, lon: m.lon,
      text: 'Tabule „Vaše rychlost“ stojí na tomhle místě i ve skutečnosti (poloha z OpenStreetMap). Čísla na ní ukazují rychlost aut v mapě, která jsou jen ilustrace provozu, ne skutečně naměřené hodnoty.',
      link: `https://www.openstreetmap.org/node/${m.id}`, linkText: 'Tabule v OpenStreetMap ↗', target: '_blank', rows: [...rows, ['Zdroj polohy', 'OpenStreetMap (ODbL)']] });
    return true;
  });
}
