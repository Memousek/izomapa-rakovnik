// Úryvek z české Wikipedie do karty místa bez vlastního příběhu (nápad z minimapa.cz, kód vlastní).
// Článek se hledá podle polohy (geosearch do 300 m) a bere se jen ten, jehož název odpovídá názvu místa,
// aby karta neukázala cizí článek. Text je vždy označený jako Wikipedie (CC BY-SA 4.0) s odkazem na článek.
const API = 'https://cs.wikipedia.org';
const pamet = new Map();
const VYPLN = new Set(['a', 'v', 'na', 'u', 've', 'z', 'ze', 'do', 'sv', 'svateho', 'svate', 'svaty', 'mesto', 'obec']);

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
let MESTO = new Set();                                       // slova z názvu města (u každého článku, nic nerozlišují)
export const nastavMesto = (m) => { MESTO = new Set(norm(m).split(' ')); };
const slova = (s) => norm(s).split(' ').filter((w) => w.length > 2 && !VYPLN.has(w) && !MESTO.has(w));

function shoda(nazev, titulek) {
  const a = norm(nazev), b = norm(titulek);
  if (!a || !b) return 0;
  if (a === b || b.startsWith(a) || a.startsWith(b)) return 3;
  const sa = slova(nazev), sb = new Set(slova(titulek));
  if (sa.length && !sb.has(sa[0])) return 0;                    // druh stavby musí sedět (zvonice u kostela není článek o kostele)
  const spol = sa.filter((w) => sb.has(w)).length;
  return spol >= 2 || (spol === 1 && sa.length === 1 && sb.size <= 2) ? spol : 0;
}

const vety = (t, n) => { const m = String(t).match(/[^.!?]+[.!?]+(\s|$)/g); return m ? m.slice(0, n).join('').trim() : String(t).slice(0, 400); };

export async function hledej(nazev, lat, lon) {
  if (!nazev || !isFinite(lat) || !isFinite(lon)) return null;
  const klic = `${norm(nazev)}|${lat.toFixed(4)},${lon.toFixed(4)}`;
  if (pamet.has(klic)) return pamet.get(klic);
  const uloha = (async () => {
    const u = `${API}/w/api.php?action=query&list=geosearch&gscoord=${lat.toFixed(6)}|${lon.toFixed(6)}&gsradius=300&gslimit=15&format=json&origin=*`;
    const g = await fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const kandidati = ((g && g.query && g.query.geosearch) || []).map((x) => ({ ...x, s: shoda(nazev, x.title) })).filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || a.dist - b.dist);
    if (!kandidati.length) return null;
    const t = kandidati[0].title;
    const d = await fetch(`${API}/api/rest_v1/page/summary/${encodeURIComponent(t.replace(/ /g, '_'))}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (!d || !d.extract || d.type === 'disambiguation') return null;
    return { titulek: d.title || t, text: vety(d.extract, 3), obrazek: d.thumbnail && d.thumbnail.source, url: (d.content_urls && d.content_urls.desktop && d.content_urls.desktop.page) || `${API}/wiki/${encodeURIComponent(t)}` };
  })();
  pamet.set(klic, uloha);
  return uloha;
}

// vykreslí úryvek do prvku el (prázdný div v kartě)
export function vykresli(el, w) {
  el.replaceChildren();
  if (!w) { el.hidden = true; return; }
  if (w.obrazek && /^https:\/\/upload\.wikimedia\.org\//.test(w.obrazek)) {
    const im = document.createElement('img'); im.src = w.obrazek; im.alt = w.titulek; im.loading = 'lazy'; im.referrerPolicy = 'no-referrer'; el.append(im);
  }
  const p = document.createElement('p'); p.textContent = w.text; el.append(p);
  const z = document.createElement('p'); z.className = 'wiki-zdroj';
  const a = document.createElement('a'); a.href = w.url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = `Wikipedie: ${w.titulek}`;
  z.append(a, ' (CC BY-SA 4.0)'); el.append(z);
  el.hidden = false;
}
