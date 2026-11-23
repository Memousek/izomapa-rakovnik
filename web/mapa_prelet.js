// Přelet po zajímavých místech a krátký průvodce ovládáním při první návštěvě (nápad z minimapa.cz, kód vlastní).
// Místa: dominanty a příběhy (jizda/mista.json z nastroje/jizda.py), jinak místa a čtvrti z overlay.json.

let bezi = null;

export function zastav() { if (bezi) { const t = bezi; t.stop = true; bezi = null; if (t.dal) t.dal(); } }

export async function prelet({ goView, OV, toast, popis }) {
  if (bezi) { zastav(); return; }
  let mista = [];
  try { const r = await fetch('jizda/mista.json'); if (r.ok) mista = (await r.json()).filter((m) => m.lat && m.lon && m.druh !== 'obec').map((m) => ({ nazev: m.nazev, lat: m.lat, lon: m.lon })); } catch {}
  if (!mista.length) mista = (OV.places || []).map((p) => ({ nazev: p.name, lat: p.lat, lon: p.lon }));
  if (!mista.length) { toast('Na této mapě zatím nejsou zajímavá místa pro přelet.'); return; }
  const vyber = [], metry = (a, b) => Math.hypot(a.lat - b.lat, (a.lon - b.lon) * Math.cos(a.lat * Math.PI / 180)) * 111320;
  for (const m of mista) if (vyber.every((v) => metry(v, m) > 180)) vyber.push(m);   // sousední stavby (kostel a zvonice) by kamera skoro nepohnula
  const tah = { stop: false }; bezi = tah;
  // zastaví ho dotyk, kolečko nebo klávesa (V ne: tu obslouží zkratka a přelet vypne sama, jinak by ho hned spustila znovu)
  const konec = () => { tah.stop = true; if (bezi === tah) bezi = null; for (const ev of ['pointerdown', 'wheel', 'keydown']) removeEventListener(ev, stop, true); };
  function stop(e) { if (e && e.type === 'keydown' && /^v$/i.test(e.key)) return; konec(); if (tah.dal) tah.dal(); }
  for (const ev of ['pointerdown', 'wheel', 'keydown']) addEventListener(ev, stop, true);
  popis(true);
  for (const m of vyber.slice(0, 10)) {
    if (tah.stop) break;
    goView([m.lat, m.lon, 0.32]); toast(m.nazev);
    await new Promise((ok) => { const t = setTimeout(ok, 4500); tah.dal = () => { clearTimeout(t); ok(); }; });
  }
  const dobehl = !tah.stop;
  konec();
  if (!bezi) popis(false);                                    // žádný nový přelet mezitím: vrátit deník a sledování
  if (dobehl) toast('Konec přeletu. Klikněte na cokoli, co vás zaujme.');
}

const KROKY = [
  ['Posun a přiblížení', 'Táhněte myší nebo prstem, přibližujte kolečkem nebo dvěma prsty.'],
  ['Klikněte na cokoli', 'Budova ukáže adresu a příběh, vlak nebo autobus linku a další zastávku, pumpa ceny paliv.'],
  ['Vzhled a hledání', 'V panelu přepnete roční období, denní dobu a počasí a najdete adresu. Otazník ukáže nápovědu a klávesové zkratky.'],
];

// průvodce jen při první návštěvě bez sdíleného odkazu; „Spustit přelet“ na konci
export function pruvodce({ spustPrelet }) {
  try { if (localStorage.getItem('izo-pruvodce') === '1') return; localStorage.setItem('izo-pruvodce', '1'); } catch { return; }
  const el = document.createElement('section'); el.className = 'pruvodce'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-live', 'polite'); el.setAttribute('aria-labelledby', 'pruvodceNadpis');
  document.body.append(el);
  const esc = (e) => { if (e.key === 'Escape') { el.remove(); removeEventListener('keydown', esc); } };
  addEventListener('keydown', esc);
  let i = 0;
  const kresli = () => {
    const [h, t] = KROKY[i], posl = i === KROKY.length - 1;
    el.innerHTML = `<p class="pr-krok">${i + 1} / ${KROKY.length}</p><h3 id="pruvodceNadpis"></h3><p></p><div class="pr-btns">
      <button class="px-btn" type="button" data-a="konec">${posl ? 'Rozumím' : 'Přeskočit'}</button>
      <button class="px-btn pr-dal" type="button" data-a="${posl ? 'prelet' : 'dal'}">${posl ? 'Spustit přelet' : 'Další'}</button></div>`;
    el.querySelector('h3').textContent = h; el.querySelector('p:not(.pr-krok)').textContent = t;
    el.querySelector('.pr-dal').focus({ preventScroll: true });
  };
  el.addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
    if (a === 'dal') { i++; kresli(); return; }
    el.remove();
    if (a === 'prelet') spustPrelet();
  });
  kresli();
}
