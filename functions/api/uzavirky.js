// Cloudflare Pages Function: oznámení o uzavírkách silnic z webu města, ať je mapa má bez ručního nasazení.
// Adresa seznamu je v statickém site/uzavirky_zdroj.json (nastroje/uzavirky.py z mesto.json "uzavirky_web"), takže
// funkce nestahuje nic jiného než ten web (není to otevřená proxy). Vrací {stazeno, oznameni: [{url, nadpis, text}]};
// úseky z textu dopočítá prohlížeč (web/uzavirky.js) po síti ulic site/uzavirky_sit.json.
// Výsledek drží Cache API (pro všechny návštěvníky v datacentru): čerstvý 3 h, pak se vrátí starý a na pozadí
// se stáhne znovu. Mezi stránkami pauza 1 s (web má v robots.txt Crawl-Delay 3, stahuje se nejvýš pár krát denně).
const CERSTVE = 3 * 3600e3, DRZET = 7 * 86400, PAUZA = 1000, MAX_STRANEK = 25;
const UA = 'izomapa-uzavirky/1.0 (+https://github.com/adamklatovsky/izomapa)';
const ENT = { nbsp: ' ', ndash: '–', mdash: '—', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", bdquo: '„', ldquo: '“', rdquo: '”', lsquo: '‚', rsquo: '‘', hellip: '…', laquo: '«', raquo: '»', shy: '', times: '×', deg: '°', sect: '§', euro: '€', copy: '©' };

const json = (d, status = 200, extra = {}) => new Response(JSON.stringify(d), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...extra } });
const spi = (ms) => new Promise((r) => setTimeout(r, ms));

function textHtml(s) {
  let t = s.replace(/<br\s*\/?>|<\/p>|<\/li>|<\/h\d>|<\/div>/gi, '\n').replace(/<[^>]+>/g, '');
  t = t.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e.toLowerCase()] ?? m));
  t = t.replace(/ /g, ' ').replace(/[ \t]+/g, ' ');
  return t.split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
}

async function stahni(url) {
  const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html' }, redirect: 'follow' });
  if (!r.ok) throw new Error(`${url} ${r.status}`);
  const b = new Uint8Array(await r.arrayBuffer());
  const m = /charset=["']?([\w-]+)/i.exec(String.fromCharCode(...b.slice(0, 3000))) ||/charset=([\w-]+)/i.exec(r.headers.get('content-type') || '');
  try { return new TextDecoder(m ? m[1] : 'utf-8').decode(b); } catch { return new TextDecoder('utf-8').decode(b); }
}

async function obnov(cfg, key) {
  const seznam = await stahni(cfg.url), base = new URL(cfg.url), cesta = base.pathname.replace(/\/?$/, '/');
  const odkazy = [];
  for (const [, h] of seznam.matchAll(/href="([^"#?]+)"/g)) {
    const u = new URL(h, base);
    if (u.host === base.host && u.pathname.startsWith(cesta) && u.pathname !== cesta && !odkazy.includes(u.href)) odkazy.push(u.href);
  }
  const oznameni = [];
  for (const u of odkazy.slice(0, MAX_STRANEK)) {
    await spi(PAUZA);
    try {
      const d = await stahni(u);
      const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(d);
      const tel = /<div class="editor_content[^"]*">([\s\S]*?)<div class="cleaner"/i.exec(d) || /<main[^>]*>([\s\S]*?)<\/main>/i.exec(d);
      if (h1 && tel) oznameni.push({ url: u, nadpis: textHtml(h1[1]).split(/\s+/).join(' '), text: textHtml(tel[1]) });
    } catch { /* jedna nedostupná stránka nevadí, ostatní zůstanou */ }
  }
  const telo = JSON.stringify({ stazeno: new Date().toISOString(), zdroj: cfg.url, oznameni });
  await caches.default.put(key, new Response(telo, { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': `public, max-age=${DRZET}`, 'x-stazeno-ms': String(Date.now()) } }));
  return telo;
}

// ---------------------------------------------------------------- ruční úpravy správce (editor v mapě: index.html?admin)
// KV binding UZAVIRKY_KV, heslo v tajné proměnné UZAVIRKY_HESLO. Úpravy jsou jeden seznam pod klíčem "upravy";
// každé uložení si nechá zálohu "zaloha-<čas>" na 90 dní. Bez bindingu nebo hesla se úpravy jen neukládají.
const DATUM_RE = /^\d{4}-\d{2}-\d{2}$/;
const txt = (v, n = 500) => (typeof v === 'string' ? v.trim().slice(0, n) : undefined);

async function nactiUpravy(env) {
  if (!env.UZAVIRKY_KV) return [];
  try { return JSON.parse((await env.UZAVIRKY_KV.get('upravy')) || '[]'); } catch { return []; }
}

function stejne(a, b) {                                      // porovnání hesla v konstantním čase
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let r = x.length ^ y.length; for (let i = 0; i < Math.max(x.length, y.length); i++) r |= (x[i] || 0) ^ (y[i] || 0);
  return r === 0;
}

function overUpravy(seznam) {
  if (!Array.isArray(seznam) || seznam.length > 300) throw new Error('seznam úprav má být pole (nejvýš 300)');
  return seznam.map((u) => {
    if (!u || typeof u !== 'object') throw new Error('úprava není objekt');
    const typ = ['uprava', 'skryt', 'nova'].includes(u.typ) ? u.typ : null;
    if (!typ) throw new Error('typ úpravy: uprava | skryt | nova');
    const o = { typ, id: txt(u.id, 80) || crypto.randomUUID(), klic: txt(u.klic, 600), kdy: new Date().toISOString() };
    if (typ !== 'nova' && !o.klic) throw new Error('úprava bez klíče uzavírky');
    if (typ !== 'skryt') {
      if (!Array.isArray(u.line) || u.line.length < 2 || u.line.length > 2000) throw new Error('čára úseku: 2 až 2000 bodů');
      o.line = u.line.map((q) => { const la = +q[0], lo = +q[1]; if (!(Math.abs(la) <= 90 && Math.abs(lo) <= 180)) throw new Error('špatný bod čáry'); return [+la.toFixed(6), +lo.toFixed(6)]; });
      for (const k of ['od', 'do']) if (u[k]) { if (!DATUM_RE.test(u[k])) throw new Error(`${k}: RRRR-MM-DD`); o[k] = u[k]; }
      for (const k of ['nazev', 'popis', 'objizdka', 'zdroj', 'url']) { const v = txt(u[k], k === 'popis' ? 800 : 300); if (v) o[k] = v; }
      if (o.url && !/^https?:\/\//.test(o.url)) delete o.url;
      if (u.castecna) o.castecna = true;
    }
    return o;
  });
}

async function ulozUpravy(request, env) {
  if (!env.UZAVIRKY_KV || !env.UZAVIRKY_HESLO) return json({ ok: false, msg: 'Úložiště úprav není nastavené (KV UZAVIRKY_KV a heslo UZAVIRKY_HESLO).' }, 501);
  const heslo = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!heslo || !stejne(heslo, env.UZAVIRKY_HESLO)) { await spi(800); return json({ ok: false, msg: 'Špatné heslo.' }, 401); }
  if (new URL(request.url).searchParams.has('overit')) return json({ ok: true });
  let seznam;
  try { seznam = overUpravy((await request.json()).upravy); } catch (e) { return json({ ok: false, msg: String(e.message || e) }, 400); }
  const telo = JSON.stringify(seznam);
  if (telo.length > 2e6) return json({ ok: false, msg: 'Úpravy jsou moc velké.' }, 413);
  const stare = await env.UZAVIRKY_KV.get('upravy');
  if (stare) await env.UZAVIRKY_KV.put('zaloha-' + new Date().toISOString(), stare, { expirationTtl: 90 * 86400 });
  await env.UZAVIRKY_KV.put('upravy', telo);
  return json({ ok: true, upravy: seznam });
}

export async function onRequest(ctx) {
  const { request, env } = ctx;
  if (request.method === 'POST') return ulozUpravy(request, env);
  if (request.method !== 'GET' && request.method !== 'HEAD') return json({ ok: false }, 405, { allow: 'GET, POST' });
  const geo = new URL(request.url).searchParams.get('geo');
  if (geo !== null) return geojsonOdpoved(ctx, +geo);
  const upravy = await nactiUpravy(env);
  const odp = await oznameniOdpoved(ctx);
  let d; try { d = JSON.parse(await odp.text()); } catch { d = { oznameni: [] }; }
  d.upravy = upravy; d.upravyZapnute = !!(env.UZAVIRKY_KV && env.UZAVIRKY_HESLO);
  const h = new Headers(odp.headers); h.set('cache-control', 'no-cache');   // úpravy správce mají platit hned
  return new Response(JSON.stringify(d), { status: odp.status, headers: h });
}

// GeoJSON zdroj (mesto.json "uzavirky_geojson", např. mapa KSÚS): jen přeposlat, prohlížeč si vybere úseky v mapě.
// Zdroj bývá jen po http a bez CORS, takže ho prohlížeč napřímo nestáhne. Adresy jsou jen ze statického uzavirky_zdroj.json.
async function geojsonOdpoved({ request, env, waitUntil }, i) {
  const cr = await env.ASSETS.fetch(new URL('/uzavirky_zdroj.json', request.url));
  const cfg = cr.ok ? await cr.json().catch(() => null) : null;
  const url = cfg && Array.isArray(cfg.geojson) && Number.isInteger(i) ? cfg.geojson[i] : null;
  if (!url || !/^https?:\/\//.test(url)) return json({ features: [] }, 404);
  const key = new Request('https://izomapa.cache/uzavirky-geo/' + encodeURIComponent(url)), zamek = new Request(key.url + '/obnova');
  const obnov = async () => {
    const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' } });
    if (!r.ok) throw new Error(`${url} ${r.status}`);
    const telo = await r.text();
    if (!/^\s*\{/.test(telo)) throw new Error('není to JSON');
    await caches.default.put(key, new Response(telo, { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': `public, max-age=${DRZET}`, 'x-stazeno-ms': String(Date.now()) } }));
    return telo;
  };
  const hit = await caches.default.match(key), hlav = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=900' };
  if (hit) {
    if (Date.now() - Number(hit.headers.get('x-stazeno-ms') || 0) > CERSTVE && !(await caches.default.match(zamek))) {
      await caches.default.put(zamek, new Response('1', { headers: { 'cache-control': 'public, max-age=120' } }));
      waitUntil(obnov().catch(() => {}));
    }
    return new Response(hit.body, { headers: hlav });
  }
  try { return new Response(await obnov(), { headers: hlav }); }
  catch (e) { return json({ features: [], chyba: String(e && e.message || e).slice(0, 120) }, 502, { 'cache-control': 'public, max-age=300' }); }
}

async function oznameniOdpoved({ request, env, waitUntil }) {
  const cr = await env.ASSETS.fetch(new URL('/uzavirky_zdroj.json', request.url));
  if (!cr.ok) return json({ oznameni: [] }, 404);
  const cfg = await cr.json().catch(() => null);
  if (!cfg || !/^https?:\/\//.test(cfg.url || '')) return json({ oznameni: [] }, 404);
  const key = new Request('https://izomapa.cache/uzavirky/' + encodeURIComponent(cfg.url));
  const zamek = new Request(key.url + '/obnova');
  const hit = await caches.default.match(key);
  const vystup = { 'cache-control': 'public, max-age=900' };
  if (hit) {
    const stari = Date.now() - Number(hit.headers.get('x-stazeno-ms') || 0);
    if (stari > CERSTVE && !(await caches.default.match(zamek))) {   // starý: vrátit hned, obnovit na pozadí (jen jedna obnova naráz)
      await caches.default.put(zamek, new Response('1', { headers: { 'cache-control': 'public, max-age=120' } }));
      waitUntil(obnov(cfg, key).catch(() => {}));
    }
    return new Response(await hit.text(), { headers: { 'content-type': 'application/json; charset=utf-8', ...vystup, 'x-stari-min': String(Math.round(stari / 60e3)) } });
  }
  try { return new Response(await obnov(cfg, key), { headers: { 'content-type': 'application/json; charset=utf-8', ...vystup } }); }
  catch (e) { return json({ oznameni: [], chyba: String(e && e.message || e).slice(0, 120) }, 502, { 'cache-control': 'public, max-age=300' }); }
}
