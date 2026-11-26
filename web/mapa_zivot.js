// Život na mapě podle kalendáře (inspirace izomapa.sachytynec.cz a Kopřivnice, kód vlastní). Bez stavu: co se kde děje,
// se počítá jen z data, hodiny a semínka, takže všichni návštěvníci vidí totéž. Ilustrace, ne zpravodajství:
//   31. 12. večer a o půlnoci ohňostroj nad městem, 5. 12. odpoledne a večer Mikuláš, anděl a čert na náměstí,
//   v sobotu od května do září dopoledne svatba před radnicí, o adventních víkendech večer lidé u vánočního stromu,
//   při akci z programu města (web/mapa_akce.js) dav na náměstí. Postavy schované za stromem, domem nebo výzdobou se nekreslí.
// Kreslí přes window.Izomapa.onFrame (web/js/90-doplnky-api.js). Zkouška jiného data: ?zivot=2026-12-05T17:30
// pražský čas jako místní Date; posun se spočítá jednou, takže čas běží plynule (i s ?zivot=, kde začne v zadaném okamžiku)
const POSUN = (() => {
  const p = new URLSearchParams(location.search).get('zivot'), d = p ? new Date(p) : null, ted = new Date();
  if (d && !isNaN(d)) return d - ted;
  return new Date(ted.toLocaleString('en-US', { timeZone: 'Europe/Prague' })) - ted + ted.getMilliseconds();
})();
const praha = () => new Date(Date.now() + POSUN);
const rnd = (s) => { const x = Math.sin(s * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

export function spust({ namesti, radnice, akce, namestiSektor }) {
  const SEKTOR = (namestiSektor || [0, 360]).map((a) => a * Math.PI / 180);
  const I = window.Izomapa; if (!I || !namesti) return;
  const [nx, ny] = I.latLonToWorld(namesti[0], namesti[1]);
  const [rx, ry] = radnice ? I.latLonToWorld(radnice[0], radnice[1]) : [nx - 40, ny];
  const img = (x, y, h = 0) => I.toImg(x, y, I.gz(x, y) + h);
  const advent = (d) => {                                         // 4 neděle před Vánoci
    const vanoce = new Date(d.getFullYear(), 11, 25), n4 = new Date(vanoce); n4.setDate(25 - ((vanoce.getDay() + 6) % 7) - 1 - 21);
    return d >= n4 && d < new Date(d.getFullYear(), 11, 24);
  };

  // ---------- svět: lidé na náměstí a u radnice ----------
  // Postavy jsou stejný model jako chodci v mapě (Izomapa.postava): oblečení podle období, v noci ztmavené, za stromem oříznuté.
  // Kostýmy (Mikuláš, anděl, čert, nevěsta, ženich) jsou jen jiné barvy a střihy téhož modelu.
  const KOSTYM = {
    mikulas: { top: 'coat', topC: '#f4f2ea', bot: 'trousers', botC: '#f4f2ea', scarf: '#c8102e', hat: { t: 'beanie', c: '#f4f2ea' }, hair: '#e8e4da', hairStyle: 'long', shoes: '#6b4a30', gloves: '#c8102e' },
    andel: { top: 'dress', topC: '#fbfbf6', bot: 'none', hair: '#f2d34f', hairStyle: 'long', shoes: '#fbfbf6' },
    cert: { top: 'hoodie', topC: '#1d1d20', bot: 'trousers', botC: '#1d1d20', skin: '#5a3a30', hair: '#1a1a1a', hat: { t: 'beret', c: '#4a3a30' }, shoes: '#1a1a1a' },
    nevesta: { top: 'dress', topC: '#fbfbf6', bot: 'none', hair: '#6b4a30', hairStyle: 'bun', shoes: '#fbfbf6' },
    zenich: { top: 'jacket', topC: '#1d1f24', topC2: '#f2f2ee', bot: 'trousers', botC: '#1d1f24', hair: '#3a2a22', shoes: '#1a1a1a' },
  };
  I.onFrame((ctx, v) => {
    if (v.sx < 0.45 || !I.postava) return;
    const d = praha(), h = d.getHours() + d.getMinutes() / 60, m = d.getMonth(), den = d.getDate(), wd = d.getDay(), t = d.getTime() / 1000;
    const L = [];                                                   // [x, y, volby], kreslí se odzadu dopředu
    const pridej = (x, y, q) => L.push([x, y, q, I.toImg(x, y, I.gz(x, y))[1]]);
    const kOkoli = (x, y) => I.toImg(x, y, 0)[1] > I.toImg(nx, ny, 0)[1];   // stojí před stromem: k divákovi zády
    // Mikuláš, anděl a čert 5. 12. 15:30–20:30: obchůzka po náměstí, kolem děti
    if (m === 11 && den === 5 && h >= 15.5 && h < 20.5) {
      const st = (SEKTOR[0] + SEKTOR[1]) / 2, sw = (SEKTOR[1] - SEKTOR[0]) / 2 * 0.8, f = t / 40;   // chodí sem a tam po volné výseči náměstí
      const a = st + Math.sin(f) * sw, R = 9, kr = Math.floor(t * 3) % 4, smer = Math.cos(f) > 0;
      const bod = (o) => [nx + Math.cos(a + o) * R, ny + Math.sin(a + o) * R];
      const p0 = I.toImg(...bod(0), 0), p1 = I.toImg(...bod(smer ? 0.05 : -0.05), 0);
      const sm = { mir: p1[0] < p0[0], back: p1[1] < p0[1], frame: kr };
      pridej(...bod(0), { ...sm, outfit: KOSTYM.mikulas });
      pridej(...bod(0.07), { ...sm, outfit: KOSTYM.andel });
      pridej(...bod(-0.07), { ...sm, outfit: KOSTYM.cert });
      for (let k = 0; k < 7; k++) {
        const o = a + (rnd(k) - 0.5) * 1.2, r = 2 + rnd(k + 9) * 3, x = bod(0)[0] + Math.cos(o) * r, y = bod(0)[1] + Math.sin(o) * r;
        pridej(x, y, { oi: 300 + k, kid: true, back: I.toImg(x, y, 0)[1] > I.toImg(...bod(0), 0)[1], mir: k % 2 === 0 });
      }
    }
    // svatba: sobota květen–září 10:30–14:00 před radnicí (nevěsta, ženich, hosté)
    if (wd === 6 && m >= 4 && m <= 8 && h >= 10.5 && h < 14) {
      const k = Math.floor(rnd(den + m * 31) * 3);                // ne každou sobotu
      if (k !== 0) {
        pridej(rx + 4, ry - 6, { outfit: KOSTYM.nevesta, mir: true });
        pridej(rx + 5.2, ry - 6, { outfit: KOSTYM.zenich });
        for (let g = 0; g < 9; g++) pridej(rx + 6 + Math.cos(g) * (5 + g), ry - 9 - rnd(g + 3) * 6, { oi: 200 + g, back: true, mir: g % 2 === 0 });
      }
    }
    // dav u vánočního stromu: při akci z programu města (rozsvícení stromu víc lidí), bez programu o adventních víkendech 16–20 h.
    // Lidé stojí 4,6–12 m od stromu (strom má poloměr 3,7 m) ve volné výseči náměstí (namestiSektor, úhel od východu), čelem ke stromu.
    const ak = akce ? akce(d) : { dav: 0 };
    const n = ak.dav === 2 ? 44 : ak.dav === 1 ? 26 : advent(d) && (wd === 0 || wd === 6) && h >= 16 && h < 20 ? 16 : 0;
    for (let k = 0; k < n; k++) {
      const o = SEKTOR[0] + rnd(k + 40) * (SEKTOR[1] - SEKTOR[0]), r = 4.6 + rnd(k + 70) * 7.5;
      const x = nx + Math.cos(o) * r, y = ny + Math.sin(o) * r, dite = k % 7 === 3;
      pridej(x, y, { oi: 100 + k, kid: dite, back: kOkoli(x, y), mir: I.toImg(x, y, 0)[0] > I.toImg(nx, ny, 0)[0] });
    }
    L.sort((p, q) => p[3] - q[3]);
    for (const [x, y, q] of L) I.postava(v, x, y, q);
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
