// Editor uzavírek pro správce mapy: index.html?admin (načte se jen tam).
// Přihlášení heslem (UZAVIRKY_HESLO na Cloudflare), úpravy se ukládají přes functions/api/uzavirky.js do KV
// a platí hned pro všechny, bez nasazení. Úprava automatické uzavírky drží její klíč (oznámení + ulice + začátek etapy),
// takže další etapa z webu města se zase dopočítá sama. Body úseku se táhnou po mapě a přichytí k silnici,
// trasa mezi nimi vede po síti ulic (uzavirky_sit.json).
import { nactiSit, trasaMeziBody } from './uzavirky.js';

const CSS = `
.uz-admin { position: fixed; z-index: 6; top: 12px; right: 12px; width: min(360px, calc(100vw - 24px)); max-height: calc(100vh - 24px); overflow: auto;
  background: var(--panel); color: var(--ink); border: 2px solid var(--lamp); box-shadow: 4px 4px 0 rgba(0,0,0,.4); padding: 12px; font: .9rem/1.4 var(--body); display: grid; gap: 10px; }
.uz-admin h2 { margin: 0; font: 700 1rem var(--display); letter-spacing: .04em; text-transform: uppercase; color: var(--lamp); }
.uz-admin p { margin: 0; color: var(--muted); font-size: .82rem; }
.uz-admin label { display: grid; gap: 3px; font-size: .8rem; color: var(--muted); }
.uz-admin input[type=text], .uz-admin input[type=password], .uz-admin input[type=date], .uz-admin textarea { font: inherit; color: var(--ink); background: var(--panel-2); border: 1px solid var(--edge); padding: 6px 8px; }
.uz-admin textarea { min-height: 64px; resize: vertical; }
.uz-admin .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.uz-admin .row > label { flex: 1 1 120px; }
.uz-admin .chk { display: flex; gap: 6px; align-items: center; color: var(--ink); }
.uz-admin ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.uz-admin li { border: 1px solid var(--edge); padding: 6px 8px; display: grid; gap: 4px; }
.uz-admin li.skryta { opacity: .55; }
.uz-admin li b { font-weight: 600; }
.uz-admin li small { color: var(--muted); }
.uz-admin .tag { font: 600 .68rem var(--display); text-transform: uppercase; letter-spacing: .05em; padding: 0 5px; background: var(--lamp); color: var(--night); margin-left: 6px; }
.uz-admin .px-btn { padding: 4px 10px; font-size: .82rem; }
.uz-admin .msg { font-size: .82rem; } .uz-admin .msg.err { color: #ff8a80; } .uz-admin .msg.ok { color: #7fe0a0; }
.uz-h { width: 16px; height: 16px; border-radius: 50%; border: 3px solid #fff; background: #2f6fd1; box-shadow: 0 0 0 2px rgba(0,0,0,.5); cursor: grab; touch-action: none; }
.uz-h.konec { background: #d4202c; } .uz-h.pres { width: 12px; height: 12px; background: #f2c66d; }
.uz-admin-btn { position: fixed; z-index: 6; top: 12px; right: 12px; }
`;

export function spust(A) {
  // A: { viewer, W, toImg, imgToWorld, gz, UZ_ED, uzavirky: () => [...], goTo }
  const { viewer, W, UZ_ED } = A;
  const st = document.createElement('style'); st.textContent = CSS; document.head.append(st);
  const box = document.createElement('section'); box.className = 'uz-admin'; box.setAttribute('aria-label', 'Správa uzavírek');
  const otevrit = document.createElement('button'); otevrit.className = 'px-btn uz-admin-btn'; otevrit.type = 'button'; otevrit.textContent = 'Správa uzavírek'; otevrit.hidden = true;
  otevrit.addEventListener('click', () => { box.hidden = false; otevrit.hidden = true; });
  document.body.append(box, otevrit);
  let heslo = ''; try { heslo = sessionStorage.getItem('izo-uz-heslo') || ''; } catch {}
  let S = null, ed = null;                                   // ed: rozpracovaná úprava
  const sit = () => S || fetch('uzavirky_sit.json').then((r) => r.json()).then((d) => (S = nactiSit(d)));
  const el = (tag, attrs = {}, ...deti) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'on') for (const [ev, f] of Object.entries(v)) e.addEventListener(ev, f); else if (k in e) e[k] = v; else e.setAttribute(k, v); } e.append(...deti.filter((d) => d !== null && d !== undefined)); return e; };
  const btn = (t, f) => el('button', { type: 'button', className: 'px-btn', textContent: t, on: { click: f } });
  const msg = el('p', { className: 'msg', role: 'status' });
  const zprava = (t, c = '') => { msg.textContent = t; msg.className = 'msg ' + c; };
  const fmt = (s) => (s ? s.split('-').reverse().map(Number).join('. ') : '');
  const svet2img = ([x, y]) => A.toImg(x, y, A.gz(x, y));
  const ll2svet = ([la, lo]) => [(lo - A.cam.lon0) * A.cam.kx, (la - A.cam.lat0) * A.cam.ky];

  async function api(metoda, telo, dotaz = '') {
    const r = await fetch('api/uzavirky' + dotaz, { method: metoda, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + heslo }, body: telo ? JSON.stringify(telo) : undefined });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok) throw new Error(d.msg || `Server odpověděl ${r.status}.`);
    return d;
  }

  // ---------- přihlášení
  function prihlaseni() {
    const vstup = el('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Heslo správce' });
    const form = el('form', { on: { submit: async (e) => {
      e.preventDefault(); heslo = vstup.value; zprava('Ověřuji…');
      try { await api('POST', {}, '?overit'); try { sessionStorage.setItem('izo-uz-heslo', heslo); } catch {} seznam(); }
      catch (er) { zprava(er.message, 'err'); }
    } } }, el('label', {}, 'Heslo', vstup), el('div', { className: 'row' }, el('button', { type: 'submit', className: 'px-btn', textContent: 'Přihlásit' }), btn('Zavřít', () => { box.hidden = true; otevrit.hidden = false; })));
    box.replaceChildren(el('h2', { textContent: 'Správa uzavírek' }), el('p', { textContent: 'Úpravy se uloží na server a hned je uvidí všichni návštěvníci.' }), form, msg);
    vstup.focus();
  }

  // ---------- seznam
  function seznam() {
    konecEditace();
    const ex = UZ_ED.extra || { skryte: [], upravy: [] };
    const polozka = (u, skryta) => el('li', { className: skryta ? 'skryta' : '' },
      el('div', {}, el('b', { textContent: u.nazev || 'Uzavírka' }), u.uprava ? el('span', { className: 'tag', textContent: skryta ? 'skrytá' : u.uprava.typ === 'nova' ? 'ruční' : 'upravená' }) : null),
      el('small', { textContent: `${fmt(u.od)} – ${fmt(u.do)}${u.auto ? ' · z webu města' : ''}` }),
      el('div', { className: 'row' },
        skryta ? null : btn('Upravit', () => upravit(u)),
        skryta ? btn('Zobrazit', () => uloz(ex.upravy.filter((m) => m !== u.uprava), 'Uzavírka je zase vidět.'))
          : u.uprava && u.uprava.typ === 'nova' ? btn('Smazat', () => confirm(`Smazat ruční uzavírku ${u.nazev || ''}?`) && uloz(ex.upravy.filter((m) => m !== u.uprava), 'Smazáno.'))
            : btn('Skrýt', () => uloz([...ex.upravy.filter((m) => m.klic !== u.klic), { typ: 'skryt', klic: u.klic, nazev: u.nazev }], 'Uzavírka je skrytá.')),
        u.uprava && u.uprava.typ === 'uprava' ? btn('Vrátit automatiku', () => uloz(ex.upravy.filter((m) => m !== u.uprava), 'Platí zase úsek z oznámení.')) : null,
        btn('Ukázat', () => { const [ix, iy] = svet2img(ll2svet(u.line[Math.floor(u.line.length / 2)])); A.goTo(ix, iy, 1.2); })));
    const ul = el('ul', {}, ...A.uzavirky().map((u) => polozka(u, false)), ...(ex.skryte || []).map((u) => polozka(u, true)));
    box.replaceChildren(el('h2', { textContent: 'Správa uzavírek' }),
      ex.upravyZapnute ? null : el('p', { className: 'msg err', textContent: 'Úložiště úprav na serveru není nastavené, uložení selže.' }),
      el('div', { className: 'row' }, btn('+ Nová uzavírka', () => upravit(null)), btn('Odhlásit', () => { heslo = ''; try { sessionStorage.removeItem('izo-uz-heslo'); } catch {} prihlaseni(); }), btn('Zavřít', () => { box.hidden = true; otevrit.hidden = false; })),
      ul, msg);
  }

  async function uloz(upravy, hotovo) {
    zprava('Ukládám…');
    try {
      const d = await api('POST', { upravy });
      UZ_ED.extra = { ...(UZ_ED.extra || {}), upravy: d.upravy };
      await UZ_ED.obnov();
      seznam(); zprava(hotovo, 'ok');
    } catch (e) { zprava(e.message, 'err'); }
  }

  // ---------- úprava jedné uzavírky
  function konecEditace() {
    if (!ed) return;
    for (const h of ed.uchyty) viewer.removeOverlay(h.el);
    ed = null; UZ_ED.edit = null; UZ_ED.klik = null;
  }
  function uchyty() {                                         // přetahovací body na mapě
    for (const h of ed.uchyty) viewer.removeOverlay(h.el);
    ed.uchyty = ed.body.map((b, i) => {
      const [ix, iy] = svet2img(b), e = el('div', { className: 'uz-h' + (i === 0 ? '' : i === ed.body.length - 1 ? ' konec' : ' pres'), title: i === 0 ? 'Začátek (táhni)' : i === ed.body.length - 1 ? 'Konec (táhni)' : 'Průjezdní bod (táhni, dvojklik smaže)' });
      const h = { el: e, p: new OpenSeadragon.Point(ix / W, iy / W) };
      viewer.addOverlay({ element: e, location: h.p, placement: OpenSeadragon.Placement.CENTER, checkResize: false });
      new OpenSeadragon.MouseTracker({ element: e,
        dragHandler: (ev) => { h.p = h.p.plus(viewer.viewport.deltaPointsFromPixels(ev.delta)); viewer.updateOverlay(e, h.p, OpenSeadragon.Placement.CENTER); },
        dragEndHandler: () => { ed.body[i] = A.imgToWorld(h.p.x * W, h.p.y * W); prepocitej(); },
        dblClickHandler: () => { if (i > 0 && i < ed.body.length - 1) { ed.body.splice(i, 1); prepocitej(); } },
      });
      return h;
    });
  }
  async function prepocitej() {
    if (ed.body.length < 2) { UZ_ED.edit = { klic: ed.klic, line: null }; uchyty(); return; }
    const t = trasaMeziBody(await sit(), ed.body);
    if (!t) { zprava('Bod je moc daleko od silnice (víc než 60 m), posuň ho blíž.', 'err'); uchyty(); return; }
    ed.line = t.line; ed.body = t.body; UZ_ED.edit = { klic: ed.klic, line: ed.line };
    zprava(`Úsek ${Math.round(delka(ed.line))} m. Klik do mapy přidá průjezdní bod.`);
    uchyty();
  }
  const delka = (l) => l.slice(1).reduce((s, q, i) => s + Math.hypot((q[0] - l[i][0]) * 111320, (q[1] - l[i][1]) * 111320 * Math.cos(q[0] * Math.PI / 180)), 0);

  async function upravit(u) {
    konecEditace();
    await sit();
    const ex = UZ_ED.extra || { upravy: [] };
    ed = { u, klic: u ? u.klic : null, body: u ? [ll2svet(u.line[0]), ll2svet(u.line[u.line.length - 1])] : [], line: u ? u.line : null, uchyty: [] };
    UZ_ED.edit = { klic: ed.klic, line: ed.line };
    if (u) uchyty();
    UZ_ED.klik = (ix, iy) => {                                // klik do mapy: nová uzavírka = začátek a konec, jinak průjezdní bod před konec
      const b = A.imgToWorld(ix, iy);
      if (ed.body.length < 2) ed.body.push(b); else ed.body.splice(ed.body.length - 1, 0, b);
      prepocitej(); return true;
    };
    const f = (n, v, typ = 'text') => el('input', { type: typ, name: n, value: v || '' });
    const nazev = f('nazev', u && u.nazev), od = f('od', u && u.od, 'date'), do_ = f('do', u && u.do, 'date');
    const popis = el('textarea', { name: 'popis', value: (u && u.popis) || '' }), obj = f('objizdka', u && u.objizdka);
    const cast = el('input', { type: 'checkbox', checked: !!(u && u.castecna) });
    box.replaceChildren(el('h2', { textContent: u ? 'Upravit uzavírku' : 'Nová uzavírka' }),
      el('p', { textContent: u ? 'Táhni modrý začátek a červený konec po mapě, úsek se přichytí k silnici. Klik do mapy přidá průjezdní bod, dvojklik na něj ho smaže.' : 'Klikni do mapy na začátek a pak na konec úseku. Další klik přidá průjezdní bod.' }),
      el('label', {}, 'Název (ulice)', nazev), el('div', { className: 'row' }, el('label', {}, 'Od', od), el('label', {}, 'Do', do_)),
      el('label', {}, 'Popis', popis), el('label', {}, 'Objížďka', obj), el('label', { className: 'chk' }, cast, 'Částečná (průjezd zůstává)'),
      el('div', { className: 'row' }, btn('Uložit', () => {
        if (!ed.line || ed.line.length < 2) { zprava('Úsek ještě nemá začátek a konec.', 'err'); return; }
        if (!nazev.value.trim()) { zprava('Doplň název.', 'err'); return; }
        if (od.value && do_.value && od.value > do_.value) { zprava('„Od“ je po „Do“.', 'err'); return; }
        const zaznam = { line: ed.line, nazev: nazev.value.trim(), od: od.value || undefined, do: do_.value || undefined, popis: popis.value.trim(), objizdka: obj.value.trim(), castecna: cast.checked || undefined };
        let upr = ex.upravy.slice();
        if (u && u.uprava && u.uprava.typ === 'nova') upr = upr.map((m) => (m === u.uprava ? { ...m, ...zaznam } : m));
        else if (u) upr = [...upr.filter((m) => m.klic !== u.klic), { typ: 'uprava', klic: u.klic, ...zaznam, url: u.url, zdroj: u.zdroj }];
        else upr.push({ typ: 'nova', id: crypto.randomUUID(), ...zaznam });
        uloz(upr, 'Uloženo, platí hned pro všechny.');
      }), btn('Zrušit', () => { seznam(); zprava(''); })), msg);
    if (u) zprava(`Úsek ${Math.round(delka(u.line))} m.`);
  }

  UZ_ED.upravit = (u) => { box.hidden = false; otevrit.hidden = true; if (heslo) upravit(u); else prihlaseni(); };
  UZ_ED.zmena = () => { if (!ed && heslo && box.querySelector('ul')) seznam(); };
  if (heslo) api('POST', {}, '?overit').then(seznam).catch(() => { heslo = ''; prihlaseni(); }); else prihlaseni();
}
