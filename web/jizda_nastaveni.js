// Nastavení 3D jízdy: grafika do detailu (předvolby Nízká–Ultra, každou volbu jde změnit zvlášť = „Vlastní“),
// kamera a ovládání, přístupnost. Hodnoty se pamatují v prohlížeči (localStorage 'izo-3d-nastaveni').
// Volby s reload: true se projeví až po novém načtení světa (stínová mapa, textury, zeleň, letecký snímek).
export const PREDVOLBY = {
  nizka: { nazev: 'Nízká', ctverce: 650, stromy: 45, auta: 350, opar: 2000, stiny: 0, ssao: 0, odrazy: 0, efekty: 1, textury: 0, zelen: 0, postavy: 0, orto: 0 },
  stredni: { nazev: 'Střední', ctverce: 900, stromy: 70, auta: 600, opar: 2600, stiny: 0, ssao: 0, odrazy: 0, efekty: 2, textury: 1, zelen: 1, postavy: 10, orto: 1 },
  vysoka: { nazev: 'Vysoká', ctverce: 1300, stromy: 130, auta: 900, opar: 3400, stiny: 1, ssao: 1, odrazy: 1, efekty: 2, textury: 1, zelen: 1, postavy: 20, orto: 1 },
  ultra: { nazev: 'Ultra', ctverce: 1800, stromy: 220, auta: 1300, opar: 4500, stiny: 2, ssao: 1, odrazy: 2, efekty: 2, textury: 1, zelen: 1, postavy: 32, orto: 1 },
};
const KLICE_PREDVOLBY = Object.keys(PREDVOLBY.nizka).filter((k) => k !== 'nazev');

// definice voleb: cast (záložka), sk (skupina), k (klíč), typ: range | volba | prepinac
export const DEF = [
  { cast: 'grafika', sk: 'Dohled', k: 'ctverce', typ: 'range', min: 500, max: 2000, krok: 50, jed: ' m', nazev: 'Dohled města', popis: 'jak daleko se staví domy a terén' },
  { cast: 'grafika', sk: 'Dohled', k: 'stromy', typ: 'range', min: 30, max: 260, krok: 10, jed: ' m', nazev: 'Prostorové stromy', popis: 'dál jsou stromy jako obrázky' },
  { cast: 'grafika', sk: 'Dohled', k: 'auta', typ: 'range', min: 250, max: 1400, krok: 50, jed: ' m', nazev: 'Auta v provozu' },
  { cast: 'grafika', sk: 'Dohled', k: 'opar', typ: 'range', min: 1500, max: 5000, krok: 100, jed: ' m', nazev: 'Opar v dálce od' },
  { cast: 'grafika', sk: 'Světlo a obraz', k: 'stiny', typ: 'volba', moznosti: [[0, 'Jen předpočítané'], [1, 'Kolem hráče'], [2, 'I domy, ostré']], nazev: 'Stíny', popis: 'auta, lidé a stromy vrhají stín podle slunce', reload: true },
  { cast: 'grafika', sk: 'Světlo a obraz', k: 'ssao', typ: 'prepinac', nazev: 'Stín v koutech (SSAO)', popis: 'tmavší paty zdí a místo pod auty' },
  { cast: 'grafika', sk: 'Světlo a obraz', k: 'odrazy', typ: 'volba', moznosti: [[0, 'Vypnuté'], [1, 'Úsporné'], [2, 'Plné']], nazev: 'Odrazy na mokré silnici' },
  { cast: 'grafika', sk: 'Světlo a obraz', k: 'efekty', typ: 'volba', moznosti: [[0, 'Vypnuté'], [1, 'Základní'], [2, 'Plné']], nazev: 'Efekty obrazu', popis: 'mraky, záře světel, paprsky slunce, filmový vzhled' },
  { cast: 'grafika', sk: 'Detaily', k: 'textury', typ: 'prepinac', nazev: 'Textury povrchů a fasád', reload: true },
  { cast: 'grafika', sk: 'Detaily', k: 'zelen', typ: 'prepinac', nazev: 'Tráva a keře u cest', reload: true },
  { cast: 'grafika', sk: 'Detaily', k: 'orto', typ: 'prepinac', nazev: 'Letecký snímek terénu', popis: 'ortofoto ČÚZK do dálky', reload: true },
  { cast: 'grafika', sk: 'Detaily', k: 'postavy', typ: 'volba', moznosti: [[0, 'Žádné'], [10, '10'], [20, '20'], [32, '32']], nazev: 'Chodci s animací', popis: 'kolik nejbližších lidí je plně animovaných' },
  { cast: 'grafika', sk: 'Výkon', k: 'autoRes', typ: 'prepinac', nazev: 'Automatické rozlišení', popis: 'při nízkém fps sníží ostrost, ať hra běží plynule' },
  { cast: 'grafika', sk: 'Výkon', k: 'rozliseni', typ: 'range', min: 50, max: 150, krok: 10, jed: ' %', nazev: 'Nejvyšší ostrost obrazu', popis: '100 % = rozlišení obrazovky' },
  { cast: 'grafika', sk: 'Výkon', k: 'fps', typ: 'prepinac', nazev: 'Ukazovat fps' },
  { cast: 'kamera', sk: 'Kamera', k: 'fov', typ: 'range', min: 55, max: 100, krok: 1, jed: '°', nazev: 'Zorné pole' },
  { cast: 'kamera', sk: 'Kamera', k: 'fovRychlost', typ: 'prepinac', nazev: 'Zorné pole se v rychlosti rozšiřuje', pohyb: true },
  { cast: 'kamera', sk: 'Kamera', k: 'houpani', typ: 'prepinac', nazev: 'Pohupování hlavy při chůzi', pohyb: true },
  { cast: 'kamera', sk: 'Kamera', k: 'chveni', typ: 'prepinac', nazev: 'Chvění auta od 120 km/h', pohyb: true },
  { cast: 'kamera', sk: 'Kamera', k: 'naklon', typ: 'prepinac', nazev: 'Pohyb hlavy v autě (zatáčky, brzdění)', pohyb: true },
  { cast: 'kamera', sk: 'Myš', k: 'citlivost', typ: 'range', min: 30, max: 250, krok: 5, jed: ' %', nazev: 'Citlivost myši' },
  { cast: 'kamera', sk: 'Myš', k: 'invertY', typ: 'prepinac', nazev: 'Obrátit svislou osu' },
  { cast: 'kamera', sk: 'Myš', k: 'zamer', typ: 'prepinac', nazev: 'Tečka uprostřed obrazovky' },
  { cast: 'pristupnost', sk: 'Pohyb', k: 'menePohybu', typ: 'prepinac', nazev: 'Méně pohybu', popis: 'vypne pohupování, chvění, náklon hlavy, rozšiřování zorného pole, blikání světel a animace rozhraní' },
  { cast: 'pristupnost', sk: 'Čitelnost', k: 'pismo', typ: 'volba', moznosti: [[100, 'Normální'], [120, 'Větší'], [140, 'Největší']], nazev: 'Velikost písma' },
  { cast: 'pristupnost', sk: 'Čitelnost', k: 'kontrast', typ: 'prepinac', nazev: 'Vysoký kontrast', popis: 'neprůhledné panely, výraznější okraje a text' },
];
export const CASTI = [['grafika', 'Grafika'], ['kamera', 'Kamera a ovládání'], ['pristupnost', 'Přístupnost']];

export function nactiNastaveni({ dotyk = false } = {}) {
  const sys = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const zaklad = dotyk ? 'nizka' : 'stredni';
  const N = { preset: zaklad, ...PREDVOLBY[zaklad], autoRes: 1, rozliseni: 100, fps: 0, fov: 70, fovRychlost: 1, houpani: 1, chveni: 1, naklon: 1,
    citlivost: 100, invertY: 0, zamer: 1, menePohybu: sys ? 1 : 0, pismo: 100, kontrast: 0 };
  delete N.nazev;
  try {
    const ulozene = JSON.parse(localStorage.getItem('izo-3d-nastaveni') || 'null');
    if (ulozene) Object.assign(N, ulozene);
    else {                                                     // dřívější volby: předvolba grafiky a letecký snímek
      const g = localStorage.getItem('izo-3d-grafika'); if (PREDVOLBY[g]) { Object.assign(N, PREDVOLBY[g], { preset: g }); delete N.nazev; }
      const o = localStorage.getItem('izo-3d-orto'); if (o) N.orto = o === '1' ? 1 : 0;
    }
  } catch {}
  return N;
}
export function ulozNastaveni(N) { try { localStorage.setItem('izo-3d-nastaveni', JSON.stringify(N)); } catch {} }
// účinná hodnota s ohledem na „Méně pohybu“
export const smiPohyb = (N, k) => !N.menePohybu && !!N[k];

// panel nastavení do prvku `kam`; zmena(klic, hodnota) volá stránka, po každé změně; vrací obnov() pro překreslení hodnot
export function vykresliNastaveni(kam, N, zmena) {
  kam.textContent = '';
  const el = (tag, attrs = {}, ...deti) => { const e = document.createElement(tag); for (const [a, v] of Object.entries(attrs)) { if (a === 'text') e.textContent = v; else if (a.startsWith('on')) e.addEventListener(a.slice(2), v); else e.setAttribute(a, v); } for (const d of deti) if (d) e.append(d); return e; };
  const taby = el('div', { class: 'nast-taby', role: 'tablist', 'aria-label': 'Části nastavení' });
  const casti = {};
  let aktivni = 'grafika';
  for (const [k, nazev] of CASTI) {
    const b = el('button', { type: 'button', role: 'tab', id: `nt-${k}`, 'aria-controls': `nc-${k}`, 'aria-selected': String(k === aktivni), tabindex: k === aktivni ? '0' : '-1', text: nazev });
    b.addEventListener('click', () => prepni(k));
    b.addEventListener('keydown', (e) => {                    // šipky mezi záložkami (vzor WAI-ARIA tabs)
      const i = CASTI.findIndex(([q]) => q === k), d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (d) { e.preventDefault(); const n = CASTI[(i + d + CASTI.length) % CASTI.length][0]; prepni(n); taby.querySelector(`#nt-${n}`).focus(); }
    });
    taby.append(b);
    casti[k] = el('div', { class: 'nast-cast', id: `nc-${k}`, role: 'tabpanel', 'aria-labelledby': `nt-${k}` });
    if (k !== aktivni) casti[k].hidden = true;
  }
  function prepni(k) {
    aktivni = k;
    for (const [q] of CASTI) { const b = taby.querySelector(`#nt-${q}`); b.setAttribute('aria-selected', String(q === k)); b.tabIndex = q === k ? 0 : -1; casti[q].hidden = q !== k; }
  }
  kam.append(taby);

  // předvolby grafiky
  const pred = el('div', { class: 'nast-pred', role: 'group', 'aria-label': 'Předvolba grafiky' });
  const predBtn = {};
  for (const [k, p] of Object.entries(PREDVOLBY)) {
    predBtn[k] = el('button', { type: 'button', class: 'px-btn', text: p.nazev, onclick: () => { const st = { ...N }; Object.assign(N, p); delete N.nazev; N.preset = k; for (const q of KLICE_PREDVOLBY) if (st[q] !== N[q]) zmena(q, N[q], st[q]); hotovo(); } });
    pred.append(predBtn[k]);
  }
  const predStav = el('span', { class: 'nast-vlastni', 'aria-live': 'polite' });
  casti.grafika.append(el('div', { class: 'nast-skupina' }, el('h3', { text: 'Předvolba' }), pred, predStav));

  const ovladace = {}, skupiny = {};
  const reloadBox = el('div', { class: 'nast-reload', hidden: '' }, el('span', { text: 'Některé změny se projeví až po novém načtení světa.' }),
    el('button', { type: 'button', class: 'px-btn', text: 'Načíst znovu', onclick: () => location.reload() }));
  for (const d of DEF) {
    const kl = `${d.cast}/${d.sk}`;
    if (!skupiny[kl]) { skupiny[kl] = el('div', { class: 'nast-skupina' }, el('h3', { text: d.sk })); casti[d.cast].append(skupiny[kl]); }
    const id = `ns-${d.k}`, popis = d.popis ? el('small', { id: `${id}-p`, text: d.popis }) : null;
    let radek;
    if (d.typ === 'range') {
      const out = el('output', { for: id });
      const inp = el('input', { type: 'range', id, min: d.min, max: d.max, step: d.krok, value: N[d.k], ...(popis ? { 'aria-describedby': `${id}-p` } : {}) });
      const ukaz = () => { out.textContent = `${N[d.k]}${d.jed || ''}`; inp.setAttribute('aria-valuetext', out.textContent); };
      inp.addEventListener('input', () => { const st = N[d.k]; N[d.k] = +inp.value; ukaz(); zmenaVolby(d, st); });
      radek = el('div', { class: 'nast-radek rozsah' }, el('label', { for: id }, el('span', { text: d.nazev }), popis), el('div', { class: 'nast-ovl' }, inp, out));
      ovladace[d.k] = () => { inp.value = N[d.k]; ukaz(); };
    } else if (d.typ === 'volba') {
      const sk = el('div', { class: 'nast-seg', role: 'radiogroup', 'aria-labelledby': `${id}-n`, ...(popis ? { 'aria-describedby': `${id}-p` } : {}) });
      const tl = d.moznosti.map(([v, t]) => {
        const b = el('button', { type: 'button', role: 'radio', class: 'px-btn', text: t, onclick: () => { const st = N[d.k]; N[d.k] = v; ovladace[d.k](); zmenaVolby(d, st); } });
        b.addEventListener('keydown', (e) => {
          const i = d.moznosti.findIndex(([q]) => q === N[d.k]), s = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
          if (s) { e.preventDefault(); const n = d.moznosti[(i + s + d.moznosti.length) % d.moznosti.length][0], st = N[d.k]; N[d.k] = n; ovladace[d.k](); zmenaVolby(d, st); tl[d.moznosti.findIndex(([q]) => q === n)].focus(); }
        });
        sk.append(b); return b;
      });
      radek = el('div', { class: 'nast-radek' }, el('div', { class: 'nast-popis' }, el('span', { id: `${id}-n`, text: d.nazev }), popis), sk);
      ovladace[d.k] = () => tl.forEach((b, i) => { const on = d.moznosti[i][0] === N[d.k]; b.setAttribute('aria-checked', String(on)); b.setAttribute('aria-pressed', String(on)); b.tabIndex = on ? 0 : -1; });
    } else {
      const inp = el('input', { type: 'checkbox', id, role: 'switch', ...(popis ? { 'aria-describedby': `${id}-p` } : {}) });
      inp.addEventListener('change', () => { const st = N[d.k]; N[d.k] = inp.checked ? 1 : 0; zmenaVolby(d, st); });
      radek = el('div', { class: 'nast-radek prepinac' }, el('label', { for: id }, el('span', { text: d.nazev }), popis), inp);
      ovladace[d.k] = () => { inp.checked = !!N[d.k]; const ztlum = d.pohyb && N.menePohybu; inp.disabled = !!ztlum; radek.classList.toggle('ztlumeno', !!ztlum); };
    }
    if (d.reload) radek.append(el('span', { class: 'nast-znacka', title: 'Projeví se po novém načtení', text: '↻' }));
    skupiny[kl].append(radek);
  }
  casti.grafika.append(reloadBox);
  for (const [k] of CASTI) kam.append(casti[k]);
  kam.append(el('div', { class: 'nast-pata' }, el('button', { type: 'button', class: 'px-btn', text: 'Obnovit výchozí nastavení', onclick: () => {
    if (!confirm('Vrátit všechna nastavení 3D na výchozí?')) return;
    try { localStorage.removeItem('izo-3d-nastaveni'); localStorage.removeItem('izo-3d-grafika'); localStorage.removeItem('izo-3d-orto'); } catch {}
    location.reload();
  } })));

  const potrebaReload = new Set();
  function zmenaVolby(d, stara) {
    if (KLICE_PREDVOLBY.includes(d.k)) N.preset = Object.entries(PREDVOLBY).find(([, p]) => KLICE_PREDVOLBY.every((q) => p[q] === N[q]))?.[0] || 'vlastni';
    zmena(d.k, N[d.k], stara);
    if (d.k === 'menePohybu') for (const q of DEF) if (q.pohyb) ovladace[q.k]();
    hotovo();
  }
  function hotovo() {
    for (const d of DEF) if (d.reload && N[d.k] !== N0[d.k]) potrebaReload.add(d.k); else potrebaReload.delete(d.k);
    reloadBox.hidden = !potrebaReload.size;
    obnov(); ulozNastaveni(N);
  }
  const N0 = { ...N };                                         // hodnoty, se kterými se svět postavil (pro „Načíst znovu“)
  function obnov() {
    for (const [k, b] of Object.entries(predBtn)) b.setAttribute('aria-pressed', String(N.preset === k));
    predStav.textContent = N.preset === 'vlastni' ? 'Vlastní nastavení' : '';
    for (const f of Object.values(ovladace)) f();
  }
  obnov();
  return { obnov, prepni };
}
