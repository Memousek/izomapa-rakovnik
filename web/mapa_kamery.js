// Webkamery (Vrstvy → Webkamery): ikona kamery na mapě, klik otevře kartu.
// Centrum: webkamera webcamlive.cz (provoz unitednetworks.cz); web dovoluje vložit obrázek s odkazem zpět na stránku kamery,
// proto karta ukazuje aktuální snímek a pod ním odkaz na webcamlive.cz. Ikona stojí na domě, kde kamera je.
// Husovo náměstí: kamera CBCNET (now.jpg, obnova ~10 s, cache 10 let → při vložení nutný parametr ?t=); podmínky nejsou
// zveřejněné, proto zatím jen odkaz. Se souhlasem CBC stačí doplnit obrazek: 'https://cbcnet.cz/wp-content/uploads/kamera/now.jpg?x=1'.
// Dálnice D6: kamery ŘSD; podmínky použití obrázků nejsou zveřejněné, proto jen odkaz na dopravniinfo.gov.cz (bez snímku).
const KAMERY = [
  { nazev: 'Webkamera: centrum Rakovníka', lat: 50.10614, lon: 13.72287, text: 'Kamera na domě Dukelských hrdinů 1804, pohled k východu na centrum přes Havlíčkovu a Palackého ulici. Snímek se obnovuje po několika minutách.',
    obrazek: 'https://www.webcamlive.cz/camera_image.php?idCamera=955', odkaz: 'https://www.webcamlive.cz/en/webcam/town-of-rakovnik/955', zdroj: 'webcamlive.cz' },
  { nazev: 'Webkamera: Husovo náměstí', lat: 50.10481, lon: 13.72748, text: 'Kamera na domě Husovo náměstí 54, pohled k východu: radnice, kostel sv. Bartoloměje a Pražská brána. Aktuální snímek je na webu CBCNET.',
    odkaz: 'https://cbcnet.cz/o-nas/kamera/', zdroj: 'CBCNET, cbcnet.cz' },
  ...[[3615, 40.7, 50.178, 13.779], [4245, 43.2, 50.170, 13.745], [4246, 45.4, 50.168, 13.716], [4247, 47.2, 50.170, 13.691]].map(([id, km, lat, lon]) => ({
    nazev: `Kamera ŘSD: D6, km ${String(km).replace('.', ',')}`, lat, lon, text: 'Dopravní kamera Ředitelství silnic a dálnic. Aktuální snímek je na webu Dopravní info.',
    odkaz: 'https://dopravniinfo.gov.cz/cameras-overview/D6', zdroj: 'ŘSD ČR, dopravniinfo.gov.cz', id })),
];
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
    if (k.obrazek) {                                               // snímek do místa pro úryvek z Wikipedie, s odkazem zpět
      const el = document.getElementById('cardWiki');
      if (el) {
        const im = document.createElement('img'); im.src = `${k.obrazek}&t=${Math.floor(Date.now() / 120000)}`; im.alt = k.nazev; im.loading = 'lazy'; im.referrerPolicy = 'no-referrer';
        im.style.cssText = 'float:none;display:block;width:100%;height:auto;max-height:240px;object-fit:cover;margin:0 0 6px;border-radius:10px';   // celý snímek, ne náhled vedle textu
        const p = document.createElement('p'); p.className = 'wiki-zdroj';
        const a = document.createElement('a'); a.href = k.odkaz; a.target = '_blank'; a.rel = 'noopener'; a.textContent = `Webkamera: ${k.zdroj}`;
        p.append(a); el.replaceChildren(im, p); el.hidden = false;
      }
    }
    return true;
  });
}
