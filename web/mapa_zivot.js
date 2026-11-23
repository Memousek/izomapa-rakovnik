// Život na mapě podle kalendáře (inspirace izomapa.sachytynec.cz a Kopřivnice, kód vlastní). Bez stavu: co se kde děje,
// se počítá jen z data, hodiny a semínka, takže všichni návštěvníci vidí totéž. Ilustrace, ne zpravodajství:
//   31. 12. večer a o půlnoci ohňostroj nad městem, 5. 12. odpoledne a večer Mikuláš, anděl a čert na náměstí,
//   v sobotu od května do září dopoledne svatba před radnicí, o adventních víkendech večer lidé u vánočního stromu.
// Kreslí přes window.Izomapa.onFrame (web/js/90-doplnky-api.js). Zkouška jiného data: ?zivot=2026-12-05T17:30
const praha = () => {
  const p = new URLSearchParams(location.search).get('zivot'), d = p ? new Date(p) : new Date();
  return isNaN(d) ? new Date() : (p ? d : new Date(d.toLocaleString('en-US', { timeZone: 'Europe/Prague' })));
};
const rnd = (s) => { const x = Math.sin(s * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

// pixelová postavička: hlava, tělo, nohy (barvy), výška v obrázkových px podle měřítka
function postava(ctx, x, y, s, telo, hlava = '#e8c4a0', extra) {
  const u = Math.max(1, Math.round(1.6 * s));
  ctx.fillStyle = '#1d1f24'; ctx.fillRect(Math.round(x - u), Math.round(y - u * 3), u, u * 3); ctx.fillRect(Math.round(x), Math.round(y - u * 3), u, u * 3);
  ctx.fillStyle = telo; ctx.fillRect(Math.round(x - u * 1.5), Math.round(y - u * 7), u * 3, u * 4);
  ctx.fillStyle = hlava; ctx.fillRect(Math.round(x - u), Math.round(y - u * 9), u * 2, u * 2);
  if (extra) extra(Math.round(x), Math.round(y), u);
}

export function spust({ namesti, radnice }) {
  const I = window.Izomapa; if (!I || !namesti) return;
  const [nx, ny] = I.latLonToWorld(namesti[0], namesti[1]);
  const [rx, ry] = radnice ? I.latLonToWorld(radnice[0], radnice[1]) : [nx - 40, ny];
  const img = (x, y, h = 0) => I.toImg(x, y, I.gz(x, y) + h);
  const advent = (d) => {                                         // 4 neděle před Vánoci
    const vanoce = new Date(d.getFullYear(), 11, 25), n4 = new Date(vanoce); n4.setDate(25 - ((vanoce.getDay() + 6) % 7) - 1 - 21);
    return d >= n4 && d < new Date(d.getFullYear(), 11, 24);
  };

  // ---------- svět: lidé na náměstí a u radnice ----------
  I.onFrame((ctx, v) => {
    if (v.sx < 0.45) return;
    const d = praha(), h = d.getHours() + d.getMinutes() / 60, m = d.getMonth(), den = d.getDate(), wd = d.getDay(), t = d.getTime() / 1000;
    const s = Math.min(2.2, v.sx);
    const kresli = (wx, wy, telo, hlava, extra) => { const [ix, iy] = img(wx, wy); if (!v.vis(ix, iy, 40)) return; const [X, Y] = v.toScreen(ix, iy); postava(ctx, X, Y, s, telo, hlava, extra); };
    // Mikuláš, anděl a čert 5. 12. 15:30–20:30: obchůzka po náměstí, kolem děti
    if (m === 11 && den === 5 && h >= 15.5 && h < 20.5) {
      const a = (t / 90) % (Math.PI * 2), R = 28;
      const bod = (o) => [nx + Math.cos(a + o) * R, ny + Math.sin(a + o) * R * 0.6];
      kresli(...bod(0), '#f2f2ee', '#e8c4a0', (x, y, u) => { ctx.fillStyle = '#c8102e'; ctx.fillRect(x - u * 2, y - u * 7, u, u * 4); ctx.fillRect(x + u, y - u * 7, u, u * 4); ctx.fillStyle = '#f2f2ee'; ctx.fillRect(x - u, y - u * 12, u * 2, u * 3); ctx.fillStyle = '#e3b23c'; ctx.fillRect(x + u * 2, y - u * 11, u, u * 9); });   // mitra a berla
      kresli(...bod(0.06), '#fbfbf6', '#f0d2b0', (x, y, u) => { ctx.fillStyle = '#f2d34f'; ctx.fillRect(x - u * 3, y - u * 7, u, u * 3); ctx.fillRect(x + u * 2, y - u * 7, u, u * 3); });   // křídla
      kresli(...bod(-0.06), '#1a1a1a', '#2a2020', (x, y, u) => { ctx.fillStyle = '#c8102e'; ctx.fillRect(x, y - u * 8, u, u); ctx.fillStyle = '#4a3a30'; ctx.fillRect(x - u, y - u * 10, u, u); ctx.fillRect(x + u, y - u * 10, u, u); });   // jazyk a rohy
      for (let k = 0; k < 7; k++) {
        const o = rnd(k) * 6.28, r = 8 + rnd(k + 9) * 18;
        kresli(nx + Math.cos(a * 0.3 + o) * r, ny + Math.sin(a * 0.3 + o) * r * 0.6, ['#2f6fd0', '#e05a2b', '#3a9a5b', '#d23a8a'][k % 4], '#e8c4a0');
      }
    }
    // svatba: sobota květen–září 10:30–14:00 před radnicí (nevěsta, ženich, hosté)
    if (wd === 6 && m >= 4 && m <= 8 && h >= 10.5 && h < 14) {
      const k = Math.floor(rnd(den + m * 31) * 3);                // ne každou sobotu
      if (k !== 0) {
        kresli(rx + 4, ry - 6, '#fbfbf6', '#e8c4a0', (x, y, u) => { ctx.fillStyle = '#fbfbf6'; ctx.fillRect(x - u * 2.5, y - u * 4, u * 5, u * 4); });   // šaty
        kresli(rx + 6, ry - 6, '#1d1f24', '#e8c4a0');
        for (let g = 0; g < 9; g++) kresli(rx + 6 + Math.cos(g) * (5 + g), ry - 9 - rnd(g + 3) * 6, ['#3f5f8a', '#7a2f4f', '#2f6b4f', '#8a7a3a', '#5a5a62'][g % 5], '#e8c4a0');
      }
    }
    // advent: o víkendech 16–20 h lidé u vánočního stromu na náměstí
    if (advent(d) && (wd === 0 || wd === 6) && h >= 16 && h < 20) {
      for (let k = 0; k < 16; k++) {
        const o = rnd(k + 40) * 6.28, r = 7 + rnd(k + 70) * 20, kyv = Math.sin(t / 3 + k) * 0.6;
        kresli(nx + Math.cos(o) * r + kyv, ny + Math.sin(o) * r * 0.6, ['#2f4f86', '#8a2f2f', '#3c6e47', '#6b5b4b', '#2a2c31'][k % 5], '#e8c4a0', (x, y, u) => { if (k % 3 === 0) { ctx.fillStyle = '#c8102e'; ctx.fillRect(x - u, y - u * 10, u * 2, u); } });   // čepice
      }
    }
  }, { layer: 'world', priority: -1 });

  // ---------- nebe: silvestrovský ohňostroj ----------
  const BARVY = ['255,90,80', '255,210,90', '120,200,255', '150,255,140', '255,130,230', '255,255,255'];
  I.onFrame((ctx, v) => {
    const d = praha(), m = d.getMonth(), den = d.getDate(), h = d.getHours() + d.getMinutes() / 60;
    const silvestr = m === 11 && den === 31 && h >= 18, pulnoc = (m === 11 && den === 31 && h >= 23.75) || (m === 0 && den === 1 && h < 0.75);
    if (!silvestr && !(m === 0 && den === 1 && h < 0.75)) return;
    if (v.night < 0.4) return;
    const t = d.getTime() / 1000, hustota = pulnoc ? 2.5 : 0.25;  // rakety za sekundu (o půlnoci hodně)
    const s0 = Math.floor(t * hustota);
    for (let k = s0 - 6; k <= s0; k++) {                          // rakety odpálené za posledních ~2,5 s
      const t0 = k / hustota, age = t - t0; if (age < 0 || age > 2.6) continue;
      const r = (q) => rnd(k * 13.7 + q), R = 150 + r(1) * 1100, an = r(2) * 6.283;
      const wx = nx + Math.cos(an) * R, wy = ny + Math.sin(an) * R, vy = 55 + r(3) * 45, col = BARVY[Math.floor(r(4) * BARVY.length)];
      if (age < 1.1) {                                             // stoupá
        const [ix, iy] = img(wx, wy, vy * age / 1.1); if (!v.vis(ix, iy, 80)) continue;
        const [X, Y] = v.toScreen(ix, iy); ctx.fillStyle = `rgba(255,220,160,.9)`; ctx.fillRect(Math.round(X), Math.round(Y), 2, 2);
        continue;
      }
      const [ix, iy] = img(wx, wy, vy); if (!v.vis(ix, iy, 200)) continue;
      const zm = Math.max(0.9, Math.min(1.8, v.sx * 2)), q = zm > 1.3 ? 3 : 2;   // i z dálky je ohňostroj vidět
      const [X, Y] = v.toScreen(ix, iy), e = (age - 1.1) / 1.5, a = Math.max(0, 1 - e), rr = (14 + 26 * r(5)) * zm * Math.sqrt(e) * 3;
      for (let j = 0; j < 22; j++) {
        const u = j / 22 * 6.283, px = X + Math.cos(u) * rr, py = Y + Math.sin(u) * rr + e * e * 18 * zm;
        ctx.fillStyle = `rgba(${col},${a.toFixed(2)})`; ctx.fillRect(Math.round(px), Math.round(py), q, q);
      }
      if (e < 0.25) { const g = ctx.createRadialGradient(X, Y, 0, X, Y, rr * 1.4 + 6); g.addColorStop(0, `rgba(${col},${(0.35 * (1 - e * 4)).toFixed(2)})`); g.addColorStop(1, `rgba(${col},0)`); ctx.fillStyle = g; ctx.fillRect(X - rr * 1.4 - 6, Y - rr * 1.4 - 6, (rr * 1.4 + 6) * 2, (rr * 1.4 + 6) * 2); }
    }
  }, { layer: 'sky', priority: -1 });
}
