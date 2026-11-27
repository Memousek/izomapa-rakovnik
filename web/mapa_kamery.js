// Webkamery (Vrstvy → Webkamery): ikona kamery na domě, kde kamera je, klik otevře kartu. Data jsou ve web/kamery.js
// (společná s 3D jízdou). Snímek karta ukazuje jen u kamer s obrazek (provozovatel dovoluje vložení), vždy s odkazem zpět.
import { KAMERY, snimekUrl } from './kamery.js';

const IKONA = ['000000000', '011111100', '011111111', '011101111', '011111111', '011111100', '000100000', '000100000', '001110000'];

export function spust({ ukazKartu }) {
  const I = window.Izomapa; if (!I) return;
  const body = KAMERY.map((k) => { const [x, y] = I.latLonToWorld(k.lat, k.lon); return { k, x, y }; });
  const box = document.querySelector('.prepinace');
  let zap = true;
  try { zap = localStorage.getItem('izo-kamery') !== '0'; } catch {}
  if (box) {
    const l = document.createElement('label'); l.className = 'chip';
    l.innerHTML = `<input type="checkbox" id="l-kamery"${zap ? ' checked' : ''}><span>Webkamery</span>`;
    box.appendChild(l);
    l.querySelector('input').addEventListener('change', (e) => { zap = e.target.checked; try { localStorage.setItem('izo-kamery', zap ? '1' : '0'); } catch {} });
  }
  const kde = [];
  I.onFrame((ctx, v) => {
    kde.length = 0;
    if (!zap || v.sx < 0.12) return;
    const q = Math.max(1, Math.min(2, Math.round(v.sx * 2)));
    for (const b of body) {
      const [ix, iy] = I.toImg(b.x, b.y, I.gz(b.x, b.y)); if (!v.vis(ix, iy, 40)) continue;
      const [X, Y] = v.toScreen(ix, iy), s = 9 * q + 4, x0 = Math.round(X - s / 2), y0 = Math.round(Y - s - 8);
      ctx.fillStyle = 'rgba(15,18,26,.7)'; ctx.fillRect(Math.round(X) - 1, y0 + s, 2, 8);
      ctx.fillStyle = 'rgba(15,18,26,.75)'; ctx.fillRect(x0 - 1, y0 - 1, s + 2, s + 2);
      ctx.fillStyle = b.k.obrazek ? '#c40006' : '#44403b'; ctx.fillRect(x0, y0, s, s);
      ctx.fillStyle = '#fff';
      IKONA.forEach((r, j) => { for (let i = 0; i < 9; i++) if (r[i] === '1') ctx.fillRect(x0 + 2 + i * q, y0 + 2 + j * q, q, q); });
      kde.push([x0, y0, s, b.k]);
    }
  }, { layer: 'top', priority: -1 });
  I.onMapClick((e) => {
    if (!zap) return false;
    const h = kde.find(([x0, y0, s]) => e.screenX >= x0 - 2 && e.screenX <= x0 + s + 2 && e.screenY >= y0 - 2 && e.screenY <= y0 + s + 10);
    if (!h) return false;
    const k = h[3];
    ukazKartu({ title: k.nazev, text: k.text, lat: k.lat, lon: k.lon, link: k.odkaz, linkText: `Otevřít na ${k.zdroj.split(',').pop().trim()} ↗`, target: '_blank', rows: [['Zdroj', k.zdroj]] });
    const el = document.getElementById('cardWiki');                // snímek (jen kde to provozovatel dovoluje) a pohled ve 3D
    if (el && (k.obrazek || k.pohled)) {
      const obsah = [];
      if (k.obrazek) {
        const im = document.createElement('img'); im.src = snimekUrl(k); im.alt = k.nazev; im.loading = 'lazy'; im.referrerPolicy = 'no-referrer';
        im.style.cssText = 'float:none;display:block;width:100%;height:auto;max-height:240px;object-fit:cover;margin:0 0 6px;border-radius:10px';   // celý snímek, ne náhled vedle textu
        const p = document.createElement('p'); p.className = 'wiki-zdroj';
        const a = document.createElement('a'); a.href = k.odkaz; a.target = '_blank'; a.rel = 'noopener'; a.textContent = `Webkamera: ${k.zdroj}`;
        p.append(a); obsah.push(im, p);
      }
      if (k.pohled) {                                                // 3D jízda rovnou v pohledu kamery (jizda.html?kamera=<id>), dá se sdílet
        const p = document.createElement('p'); p.className = 'wiki-zdroj';
        const a = document.createElement('a'); a.href = `jizda.html?kamera=${encodeURIComponent(k.id)}`; a.textContent = 'Stejný pohled ve 3D';
        p.append(a); obsah.push(p);
      }
      el.replaceChildren(...obsah); el.hidden = false;
    }
    return true;
  });
}
