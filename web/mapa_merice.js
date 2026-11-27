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
const SW = 17, SH = 31;                                           // obrázek tabule v bodech: skříň 13, štítek 3, sloup 14 (2,8 m)

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

  // tabule jako pixelový obrázek (1 bod = 1 pixel při přiblížení 1), stejně jako vozidla: tmavý obrys, světlo zleva shora,
  // stín vpravo dole; zvětšuje se s mapou bez vyhlazení. Cache podle čísla, barvy a noci.
  const SPRITY = new Map();
  function sprite(txt, nad, noc) {
    const k = `${txt}|${nad}|${noc}`;
    let c = SPRITY.get(k); if (c) return c;
    c = document.createElement('canvas'); c.width = SW; c.height = SH;
    const g = c.getContext('2d'), tma = (hex) => {             // v noci skříň a sloup potmavé a do modra, svítí jen čísla
      if (!noc) return hex; const n = parseInt(hex.slice(1), 16);
      return `rgb(${Math.round((n >> 16) * 0.34)},${Math.round(((n >> 8) & 255) * 0.36)},${Math.round((n & 255) * 0.5 + 12)})`;
    };
    const px = (x, y, col, w = 1, h = 1, sviti) => { g.fillStyle = sviti ? col : tma(col); g.fillRect(x, y, w, h); };
    const OBR = '#1d1f22';
    // skříň displeje 17 × 13: obrys se zkosenými rohy, žlutý rám (světlá horní a levá hrana, tmavší dolní a pravá)
    px(1, 0, OBR, 15); px(1, 12, OBR, 15); px(0, 1, OBR, 1, 11); px(16, 1, OBR, 1, 11);
    px(1, 1, '#ffd200', 15, 11);
    px(1, 1, '#ffe766', 15); px(1, 1, '#ffe766', 1, 11);
    px(1, 11, '#c99d00', 15); px(15, 1, '#c99d00', 1, 11);
    // displej 13 × 9 (tmavé sklo, v noci s nádechem barvy čísla)
    px(2, 2, OBR, 13, 9);
    px(3, 3, txt && noc ? (nad ? '#2a0f0d' : '#0d2414') : '#0b0c0d', 11, 7, true);
    if (txt) {
      const col = nad ? '#ff4a3d' : '#46ff74', x = 2 + Math.floor((13 - (txt.length * 4 - 1)) / 2);
      [...txt].forEach((ch, n) => CIF[ch].forEach((r, j) => { for (let i = 0; i < 3; i++) if (r[i] === '1') px(x + n * 4 + i, 4 + j, col, 1, 1, true); }));
    }
    // štítek „VAŠE RYCHLOST“ pod displejem: bílá cedulka, text naznačený tečkami
    px(3, 13, OBR, 11, 3); px(4, 14, '#eef0f2', 9);
    for (let i = 5; i < 12; i += 2) px(i, 14, '#7a8087');
    // sloup 2 px s obrysem (světlá levá, tmavší pravá strana) a patka
    px(7, 16, OBR, 1, SH - 17); px(10, 16, OBR, 1, SH - 17);
    px(8, 16, '#d3d7db', 1, SH - 17); px(9, 16, '#8f959c', 1, SH - 17);
    px(6, SH - 1, OBR, 6);
    SPRITY.set(k, c);
    return c;
  }
  I.onFrame((ctx, v) => {
    kde.length = 0;
    if (!zap || !tabule.length || v.sx < 0.5) return;        // jen zblízka (z výšky by tabule trčela nad městem)
    const ted = v.now / 1000, mer = ted - posledni > 0.12;       // měřit asi 8× za sekundu
    if (mer) posledni = ted;
    const q = v.sx;                                             // 1 bod tabule = 1 pixel mapy (0,2 m), zvětšuje se plynule s mapou jako auta
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
      const [X, Y] = v.toScreen(ix, iy);
      const nad = t.cislo != null && t.cislo > t.m.limit, blik = nad && Math.floor(ted * 2.5) % 2;
      const txt = t.cislo == null || blik ? '' : String(Math.min(199, t.cislo));
      const sp = sprite(txt, nad, v.night > 0.3), x0 = Math.round(X - (SW / 2) * q), y0 = Math.round(Y) - SH * q;
      ctx.fillStyle = 'rgba(0,0,0,.26)';                            // stín sloupu po zemi (slunce od jihovýchodu), po celých pixelech
      if (v.night < 0.5) for (let i = 1; i <= 6; i++) ctx.fillRect(x0 + (SW / 2 + i) * q, y0 + (SH - 1 - (i >> 1)) * q, q, q);
      if (txt && v.night > 0.3) {                                   // v noci displej září do okolí
        ctx.fillStyle = nad ? 'rgba(255,59,48,.22)' : 'rgba(60,255,106,.2)';
        ctx.fillRect(x0 - 2 * q, y0 - 2 * q, (SW + 4) * q, 17 * q);
      }
      ctx.imageSmoothingEnabled = false; ctx.drawImage(sp, x0, y0, SW * q, SH * q);
      kde.push([x0, y0, SW * q, SH * q, t]);
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
