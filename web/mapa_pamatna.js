// Vrstva „Památná místa“ (site/pamatna.json z nastroje/pamatna.py, OSM): pamětní desky, kameny zmizelých, pomníky, sochy,
// kříže a boží muka, památné stromy a vyhlídky. Malá pixelová ikona na sloupku od přiblížení ~0,4 m/px, klik ukáže kartu.
// Přepínač se přidá k ostatním vrstvám (Vrstvy → Na mapě), stav si pamatuje prohlížeč.
const DRUH = {
  deska: ['Pamětní deska', '#8a6a3a'], kamen: ['Kámen zmizelých', '#c9a227'], pomnik: ['Pomník', '#6b6f7a'], socha: ['Socha', '#4f7d6a'],
  kriz: ['Kříž, boží muka', '#7a4a3a'], strom: ['Památný strom', '#3f8f3a'], vyhlidka: ['Vyhlídka', '#2f6fb0'],
};
// ikony 7 × 7 bodů (1 = bílá)
const IKONA = {
  deska: ['1111111', '1000001', '1011101', '1000001', '1011101', '1000001', '1111111'],
  kamen: ['0000000', '0111110', '0100010', '0101010', '0100010', '0111110', '0000000'],
  pomnik: ['0001000', '0011100', '0011100', '0011100', '0111110', '0111110', '1111111'],
  socha: ['0011100', '0011100', '0001000', '0111110', '0001000', '0010100', '0111110'],
  kriz: ['0001000', '0001000', '1111111', '0001000', '0001000', '0001000', '0001000'],
  strom: ['0011100', '0111110', '1111111', '0111110', '0011100', '0001000', '0001000'],
  vyhlidka: ['0000000', '0111110', '1100011', '1101011', '1100011', '0111110', '0000000'],
};

export async function spust({ ukazKartu }) {
  let P;
  try { const r = await fetch('pamatna.json'); if (!r.ok) return; P = await r.json(); } catch { return; }
  const I = window.Izomapa; if (!I || !P.length) return;
  const body = P.filter((p) => DRUH[p.druh]).map((p) => { const [x, y] = I.latLonToWorld(p.lat, p.lon); return { p, x, y }; });
  // přepínač vrstvy
  const box = document.querySelector('.prepinace');
  let zap = true;
  try { zap = localStorage.getItem('izo-pamatna') !== '0'; } catch {}
  if (box) {
    const l = document.createElement('label'); l.className = 'chip';
    l.innerHTML = `<input type="checkbox" id="l-pamatna"${zap ? ' checked' : ''}><span>Památná místa</span>`;
    box.appendChild(l);
    l.querySelector('input').addEventListener('change', (e) => { zap = e.target.checked; try { localStorage.setItem('izo-pamatna', zap ? '1' : '0'); } catch {} });
  }
  const kde = [];
  I.onFrame((ctx, v) => {
    kde.length = 0;
    if (!zap || v.sx < 0.5) return;
    const q = Math.max(2, Math.min(3, Math.round(v.sx * 2)));     // velikost bodu ikony
    for (const b of body) {
      const [ix, iy] = I.toImg(b.x, b.y, I.gz(b.x, b.y)); if (!v.vis(ix, iy, 40)) continue;
      const [X, Y] = v.toScreen(ix, iy), s = 7 * q + 4, x0 = Math.round(X - s / 2), y0 = Math.round(Y - s - 8);
      ctx.fillStyle = 'rgba(15,18,26,.7)'; ctx.fillRect(Math.round(X) - 1, y0 + s, 2, 8);
      ctx.fillStyle = 'rgba(15,18,26,.75)'; ctx.fillRect(x0 - 1, y0 - 1, s + 2, s + 2);
      ctx.fillStyle = DRUH[b.p.druh][1]; ctx.fillRect(x0, y0, s, s);
      ctx.fillStyle = '#fff';
      IKONA[b.p.druh].forEach((r, j) => { for (let i = 0; i < 7; i++) if (r[i] === '1') ctx.fillRect(x0 + 2 + i * q, y0 + 2 + j * q, q, q); });
      kde.push([x0, y0, s, b.p]);
    }
  }, { layer: 'top', priority: -1 });
  I.onMapClick((e) => {
    if (!zap) return false;
    const h = kde.find(([x0, y0, s]) => e.screenX >= x0 - 2 && e.screenX <= x0 + s + 2 && e.screenY >= y0 - 2 && e.screenY <= y0 + s + 10);
    if (!h) return false;
    const p = h[3], [nazevDruhu] = DRUH[p.druh];
    ukazKartu({ title: p.nazev || nazevDruhu, text: p.napis ? `„${p.napis}“` : '', lat: p.lat, lon: p.lon, target: '_blank',
      link: p.wiki || p.zdroj, linkText: p.wiki ? 'Článek na Wikipedii ↗' : 'Záznam v OpenStreetMap ↗',
      rows: [['Druh', nazevDruhu], ['Zdroj', 'OpenStreetMap']] });
    return true;
  });
}
