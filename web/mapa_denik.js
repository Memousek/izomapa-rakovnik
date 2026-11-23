// Deník: sbírání míst ve městě (nápad z minimapa.cz, kód vlastní). Místo se zapíše, když na něj přiblížíte
// (pohled užší než 600 m a místo blízko středu) nebo otevřete jeho kartu. Ukládá se jen v prohlížeči (localStorage).
// Hádanky: site/hadanky.json z assets/hadanky.json [{misto, lat, lon, otazka, odpovedi: [...], spravne, zdroj}],
// texty jen z ověřených zdrojů (CLAUDE.md: nic si nevymýšlej). Bez souboru se sekce hádanek neukáže.
const metry = (a, b, c, d) => Math.hypot(a - c, (b - d) * Math.cos(a * Math.PI / 180)) * 111320;
const DRUH = { pamatka: 'Památky a dominanty', misto: 'Místa a příběhy', cast: 'Části města' };

export async function spust({ OV, mesto, toast, el, goView, stav }) {
  const KLIC = 'izo-denik-' + mesto;
  let d = { mista: {}, obdobi: [], noc: 0, hadanky: {} };
  try { d = { ...d, ...JSON.parse(localStorage.getItem(KLIC) || '{}') }; } catch {}
  const uloz = () => { try { localStorage.setItem(KLIC, JSON.stringify(d)); } catch {} };

  let mista = [];
  try { const r = await fetch('jizda/mista.json'); if (r.ok) mista = (await r.json()).filter((m) => m.lat && m.lon && m.druh !== 'obec').map((m) => ({ nazev: m.nazev, lat: m.lat, lon: m.lon, druh: m.druh === 'dominanta' ? 'pamatka' : 'misto' })); } catch {}
  for (const p of OV.places || []) mista.push({ nazev: p.name, lat: p.lat, lon: p.lon, druh: 'misto' });
  const sez = [], vid = new Set();
  for (const m of mista) { const k = m.nazev + '|' + m.lat.toFixed(3) + m.lon.toFixed(3); if (!vid.has(k)) { vid.add(k); sez.push({ ...m, id: k }); } }
  const casti = (OV.districts || []).filter((x) => x.ll).map((x) => ({ nazev: x.name, lat: x.ll[0], lon: x.ll[1], druh: 'cast', id: 'cast|' + x.name }));
  sez.push(...casti);
  let hadanky = [];
  try { const r = await fetch('hadanky.json'); if (r.ok) hadanky = (await r.json()).filter((h) => h.otazka && Array.isArray(h.odpovedi) && h.odpovedi.length > 1); } catch {}
  if (!sez.length && !hadanky.length) return null;
  el.hidden = false;

  const ODZNAKY = [
    ...(sez.length ? [['Průzkumník', 'Najděte 5 míst', () => Object.keys(d.mista).length >= Math.min(5, sez.length)],
      ['Znalec', 'Najděte polovinu míst', () => Object.keys(d.mista).length >= Math.ceil(sez.length / 2)]] : []),
    ['Kronikář', 'Najděte všechna místa', () => sez.length && sez.every((m) => d.mista[m.id])],
    ['Noční pták', 'Najděte místo v noci', () => d.noc > 0],
    ['Celý rok', 'Hledejte ve všech čtyřech ročních obdobích', () => d.obdobi.length >= 4],
    ...(casti.length ? [['Místopisec', 'Navštivte všechny části města', () => casti.every((m) => d.mista[m.id])]] : []),
    ...(hadanky.length ? [['Pamětník', 'Vyřešte všechny hádanky', () => hadanky.every((h) => d.hadanky[h.otazka] === 1)]] : []),
  ];
  const mel = new Set(ODZNAKY.filter(([, , f]) => f()).map(([n]) => n));

  function zapis(m) {
    if (d.mista[m.id]) return;
    d.mista[m.id] = Date.now();
    if (stav().noc) d.noc++;
    const o = stav().obdobi; if (!d.obdobi.includes(o)) d.obdobi.push(o);
    uloz(); toast(`Do deníku: ${m.nazev}`);
    for (const [n, , f] of ODZNAKY) if (!mel.has(n) && f()) { mel.add(n); setTimeout(() => toast(`Nový odznak: ${n}`), 2400); }
    kresli();
  }

  // přiblížení: z adresy pohledu (#…@lat,lon,km), kterou mapa udržuje; během automatického přeletu se nezapisuje
  let pauza = false;
  setInterval(() => {
    if (document.hidden || pauza) return;
    const at = (location.hash.split('@')[1] || '').split(',').map(Number);
    if (at.length < 3 || !at.every(Number.isFinite)) return;
    const [la, lo, km] = at;
    for (const m of sez) {
      if (d.mista[m.id]) continue;
      const dist = metry(la, lo, m.lat, m.lon);
      if (m.druh === 'cast' ? km < 1.5 && dist < 350 : km < 0.6 && dist < km * 1000 * 0.25) zapis(m);
    }
  }, 1500);

  function kresli() {
    el.querySelector('.sum-val').textContent = sez.length ? `${Object.keys(d.mista).filter((k) => sez.some((m) => m.id === k)).length} / ${sez.length}` : '';
    const body = el.querySelector('.denik-body'); body.replaceChildren();
    const odz = document.createElement('div'); odz.className = 'odznaky';
    for (const [n, popis, f] of ODZNAKY) { const s = document.createElement('span'); s.className = 'odznak' + (f() ? ' ma' : ''); s.textContent = n; s.title = popis + (f() ? ' (splněno)' : ''); odz.append(s); }
    body.append(odz);
    for (const druh of Object.keys(DRUH)) {
      const vyber = sez.filter((m) => m.druh === druh); if (!vyber.length) continue;
      const h = document.createElement('p'); h.className = 'label'; h.textContent = `${DRUH[druh]} ${vyber.filter((m) => d.mista[m.id]).length}/${vyber.length}`; body.append(h);
      const ul = document.createElement('ul'); ul.className = 'places denik-list';
      for (const m of vyber) {
        const li = document.createElement('li'), b = document.createElement('button'); b.type = 'button';
        const ma = !!d.mista[m.id];
        b.textContent = (ma ? '✓ ' : '· ') + (ma ? m.nazev : '???');
        b.title = ma ? m.nazev : 'Zatím nenalezeno: přibližte se na mapě ke všem zajímavým místům';
        if (ma) b.addEventListener('click', () => goView([m.lat, m.lon, m.druh === 'cast' ? 1 : 0.3]));
        if (!ma) b.className = 'skryte';
        li.append(b); ul.append(li);
      }
      body.append(ul);
    }
    if (hadanky.length) {
      const h = document.createElement('p'); h.className = 'label'; h.textContent = `Hádanky ${hadanky.filter((x) => d.hadanky[x.otazka] === 1).length}/${hadanky.length}`; body.append(h);
      hadanky.forEach((x, i) => {
        const box = document.createElement('div'); box.className = 'hadanka';
        const q = document.createElement('p'); q.textContent = x.otazka; box.append(q);
        if (d.hadanky[x.otazka] === 1) {   // klíč je otázka, ne pořadí (po přeskládání souboru by se řešení přeneslo)
          const ok = document.createElement('p'); ok.className = 'muted'; ok.textContent = `✓ ${x.odpovedi[x.spravne]}${x.misto ? ' · ' + x.misto : ''}`;
          if (x.zdroj) { const a = document.createElement('a'); a.href = x.zdroj; a.target = '_blank'; a.rel = 'noopener'; a.textContent = ' (zdroj)'; ok.append(a); }
          box.append(ok);
        } else x.odpovedi.forEach((o, j) => {
          const b = document.createElement('button'); b.type = 'button'; b.className = 'px-btn'; b.textContent = o;
          b.addEventListener('click', () => {
            if (j === x.spravne) { d.hadanky[x.otazka] = 1; uloz(); toast('Správně!'); if (x.lat && x.lon) goView([x.lat, x.lon, 0.3]); for (const [n, , f] of ODZNAKY) if (!mel.has(n) && f()) { mel.add(n); setTimeout(() => toast(`Nový odznak: ${n}`), 2400); } kresli(); }
            else { b.disabled = true; toast('Tohle to není, zkuste jinou odpověď.'); }
          });
          box.append(b);
        });
        body.append(box);
      });
    }
    const sm = document.createElement('p'); sm.className = 'muted denik-pozn'; sm.textContent = 'Deník se ukládá jen v tomto prohlížeči.';
    const vym = document.createElement('button'); vym.type = 'button'; vym.className = 'px-btn'; vym.textContent = 'Začít znovu';
    vym.addEventListener('click', () => { if (confirm('Smazat celý deník v tomto prohlížeči?')) { d = { mista: {}, obdobi: [], noc: 0, hadanky: {} }; mel.clear(); uloz(); kresli(); } });
    body.append(sm, vym);
  }
  kresli();
  return { zapisPodleNazvu(nazev) { const m = sez.find((x) => x.nazev === nazev); if (m) zapis(m); }, pauza(v) { pauza = !!v; } };
}
