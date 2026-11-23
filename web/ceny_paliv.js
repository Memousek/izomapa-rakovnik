// Ceny paliv z mBenzin.cz (functions/api/ceny.js) přiřazené pumpám z OSM (site/pumpy.json); mapa i 3D jízda.
// Stanice mBenzinu se k pumpě přiřadí podle vzdálenosti (do 150 m), při víc kandidátech vyhraje shodná značka.
// Podmínka mBenzinu: u cen viditelně „Ceny: mbenzin.cz“ jako odkaz (ZDROJ_TEXT, ZDROJ_URL).
export const ZDROJ_TEXT = 'Ceny: mbenzin.cz', ZDROJ_URL = 'https://www.mbenzin.cz';
const MAX_M = 150;

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const metry = (a, b, c, d) => Math.hypot(a - c, (b - d) * Math.cos(a * Math.PI / 180)) * 111320;
const znacka = (s) => { const n = norm(s); return n.includes('benzina') ? 'orlen' : n.includes('robinoil') ? 'eurooil' : n; };

// „Dnes“, „Včera“, „5. 11. 2026“, „před 3 dny“ -> datum (Date v poledne), jinak null
export function datumAktualizace(t, ted = new Date()) {
  const s = String(t || '').trim().toLowerCase(), d = new Date(ted.getFullYear(), ted.getMonth(), ted.getDate(), 12);
  if (s === 'dnes') return d;
  if (s === 'včera' || s === 'vcera') { d.setDate(d.getDate() - 1); return d; }
  let m = s.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], 12);
  m = s.match(/(\d+)\s*d/);
  if (m) { d.setDate(d.getDate() - +m[1]); return d; }
  return null;
}

// stanice: pumpy z pumpy.json ({id, lat, lon, druh, znacka, nazev}); vrací Map id -> {ceny, cas, aktualizace, url, nazev}
export async function nactiCeny(stanice, { cesta = 'api/ceny', cekat = 5000 } = {}) {
  const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), cekat);
  let d;
  try { const r = await fetch(cesta, { signal: ctrl.signal }); if (!r.ok) return new Map(); d = await r.json(); }
  catch { return new Map(); } finally { clearTimeout(t); }
  const mb = (d && d.stanice) || [], vysledek = new Map(), pouzite = new Set();
  const pumpy = stanice.filter((p) => p.druh === 'pumpa');
  const pary = [];
  for (const p of pumpy) for (const m of mb) {
    const dist = metry(p.lat, p.lon, m.lat, m.lng); if (dist > MAX_M) continue;
    const zp = znacka(p.znacka || p.nazev), zm = znacka(m.sit || m.nazev);
    pary.push({ p, m, skore: dist - (zp && zm && (zp.includes(zm) || zm.includes(zp)) ? 100 : 0) });
  }
  pary.sort((a, b) => a.skore - b.skore);
  for (const { p, m } of pary) {                                    // každá pumpa a každá stanice mBenzinu jen jednou
    if (vysledek.has(p.id) || pouzite.has(m.id) || !Object.keys(m.ceny || {}).length) continue;
    pouzite.add(m.id);
    const hl = m.aktualizace?.['95'] || m.aktualizace?.nafta || Object.values(m.aktualizace || {})[0];
    const dat = datumAktualizace(hl);
    vysledek.set(p.id, { ceny: m.ceny, cas: dat ? dat.toISOString().slice(0, 16) : null, aktualizace: hl || '', url: m.url || ZDROJ_URL, nazev: m.nazev });
  }
  return vysledek;
}
