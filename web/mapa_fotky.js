// Fotka budovy z Wikimedia Commons v kartě domu. Data: site/fotky.json z nastroje/fotky.py (Wikidata P18 + autor a licence).
// Fotka patří domu jen tehdy, když bod položky Wikidat leží v obrysu budovy (bod je poloha stavby, ne fotografa).
// Víc položek v jednom domě (kostel a mozaika na jeho zdi): přednost má ta, jejíž název sedí s budovou,
// pak stavba před drobností (deska, socha, kříž…), pak nejbližší ke středu domu.
let data = null;
const DROBNOST = /deska|mozaik|socha|soch[ay]|busta|kříž|pomník|reliéf|kašn|fontán|sloup|obelisk|strom|lípa|dub|jinan|buk/i;
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const nacti = () => data || (data = fetch('fotky.json').then((r) => (r.ok ? r.json() : [])).catch(() => []));

// b: budova z dat čtverce (hull v souřadnicích obrázku, lat, lon), nazev: titulek karty nebo null
// vMeziObrysu(lat, lon): leží bod v obrysu budovy? (karta zná převod souřadnic)
export async function najdi(b, nazev, vObrysu) {
  const P = await nacti();
  const uvnitr = P.filter((p) => vObrysu(p.lat, p.lon));
  if (!uvnitr.length) return null;
  const slova = norm(nazev).split(/[^a-z0-9]+/).filter((w) => w.length > 3);
  const skore = (p) => {
    const n = norm(p.nazev);
    return (slova.some((w) => n.includes(w)) ? 0 : 10) + (DROBNOST.test(p.nazev) ? 5 : 0)
      + Math.hypot(p.lat - b.lat, (p.lon - b.lon) * 0.64) * 1e3;   // ~1 bod na 100 m, jen rozhoduje mezi rovnými
  };
  return uvnitr.sort((a, c) => skore(a) - skore(c))[0];
}

// vykreslí fotku do <figure id="cardFoto">; uvedení autora a licence vyžaduje CC BY/BY-SA
export function vykresli(el, f) {
  el.replaceChildren();
  if (!f || !/^https:\/\/(upload|thumb)\.wikimedia\.org\//.test(f.nahled)) { el.hidden = true; return; }
  // obrázek sám odkazem není (nebylo by vidět, že vede na jiný web); odkazy jsou v popisku a značí je web/js/02-odkazy-ven.js
  const im = document.createElement('img'); im.src = f.nahled; im.alt = `Fotografie: ${f.nazev}`; im.loading = 'lazy'; im.referrerPolicy = 'no-referrer';
  im.addEventListener('error', () => { el.hidden = true; });
  const odkaz = (href, text) => Object.assign(document.createElement('a'), { href, target: '_blank', rel: 'noopener', textContent: text });
  const cap = document.createElement('figcaption');
  cap.append(`${f.nazev} · foto ${f.autor || 'neznámý autor'}, `, f.licence_url ? odkaz(f.licence_url, f.licence) : f.licence, ', ',
    f.stranka ? odkaz(f.stranka, 'Wikimedia Commons') : 'Wikimedia Commons');
  el.append(im, cap);
  el.hidden = false;
}
