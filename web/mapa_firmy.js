// Názvy velkých firem a areálů (site/firmy.json z nastroje/firmy.py, OSM) jen při velkém přiblížení: malý štítek s ikonou
// továrny nad areálem, překrývající se štítky se vynechají, klik ukáže kartu. Vypíná se s popisky (vrstva Popisky).
const DRUH = { brewery: 'pivovar', factory: 'továrna', warehouse: 'sklad', concrete_plant: 'betonárna', works: 'závod', company: 'firma', industrial: 'průmyslový areál', rucne: 'firma' };

export async function spust({ ukazKartu }) {
  let F;
  try { const r = await fetch('firmy.json'); if (!r.ok) return; F = await r.json(); } catch { return; }
  const I = window.Izomapa; if (!I || !F.length) return;
  const body = F.map((f) => { const [x, y] = I.latLonToWorld(f.lat, f.lon); return { f, x, y }; });
  const font = getComputedStyle(document.documentElement).getPropertyValue('--display').trim() || 'monospace';
  const kde = [];
  I.onFrame((ctx, v) => {
    kde.length = 0;
    if (v.sx < 0.6 || !document.getElementById('l-labels')?.checked) return;
    const boxes = [];
    ctx.font = `11px ${font}`; ctx.textBaseline = 'middle';
    for (const b of body) {
      const [ix, iy] = I.toImg(b.x, b.y, I.gz(b.x, b.y) + 6); if (!v.vis(ix, iy, 120)) continue;
      const [X, Y] = v.toScreen(ix, iy), t = b.f.nazev.length > 30 ? b.f.nazev.slice(0, 29) + '…' : b.f.nazev;
      const w = Math.ceil(ctx.measureText(t).width) + 22, x0 = Math.round(X - w / 2), y0 = Math.round(Y - 9);
      if (boxes.some(([a, c, d]) => x0 < a + d && x0 + w > a && Math.abs(c - y0) < 20)) continue;
      boxes.push([x0, y0, w]);
      ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(x0 + 2, y0 + 2, w, 17);
      ctx.fillStyle = 'rgba(42,47,58,.92)'; ctx.fillRect(x0, y0, w, 17);
      ctx.fillStyle = '#a9b3c4'; ctx.fillRect(x0 + 5, y0 + 9, 9, 5); ctx.fillRect(x0 + 5, y0 + 5, 2, 4); ctx.fillRect(x0 + 9, y0 + 6, 2, 3);   // ikona továrny
      ctx.fillStyle = '#eef1e6'; ctx.fillText(t, x0 + 17, y0 + 9);
      kde.push([x0, y0, w, b.f]);
    }
  }, { layer: 'top', priority: -1 });
  I.onMapClick((e) => {
    const h = kde.find(([x0, y0, w]) => e.screenX >= x0 && e.screenX <= x0 + w && e.screenY >= y0 && e.screenY <= y0 + 17);
    if (!h) return false;
    const f = h[3];
    ukazKartu({ title: f.nazev, text: '', lat: f.lat, lon: f.lon, rows: [['Druh', DRUH[f.druh] || 'firma'], ['Zdroj', 'OpenStreetMap']] });
    return true;
  });
}
