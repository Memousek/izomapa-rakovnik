// Cloudflare Pages Function: zásahy jednotek požární ochrany z krajského portálu krizového řízení (Středočeský kraj,
// https://pkr.kr-stredocesky.cz/pkr/zasahy-jpo/; zveřejnění v mapě je s jeho souhlasem). Portál vkládá zásahy se zpožděním
// a uvádí jen obec (bez ulice a souřadnic), druh, stav, stupeň poplachu a čas poslední změny.
// Zdroj a okres jsou v site/hasici_zdroj.json (build_html.py z mesto.json "hasici"). Stáhnou se první stránky seznamu
// (nejnovější zásahy, 50 na stránku), vyberou se ty z okresu a vrátí se všem návštěvníkům z mezipaměti (3 min).
// Odpověď: { zasahy: [{ id, druh, podtyp, obec, stav: 'probiha'|'ukoncena', stupen, cas }], aktualizace }.
const STRANEK = 2, CACHE_S = 180;
const MESICE = { ledna: 1, února: 2, března: 3, dubna: 4, května: 5, června: 6, července: 7, srpna: 8, září: 9, října: 10, listopadu: 11, prosince: 12 };
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const text = (s) => s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
  .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e] ?? m))
  .split('\n').map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
const json = (d, status = 200, ttl = 60) => new Response(JSON.stringify(d), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': `public, max-age=${ttl}` } });

// „27. listopadu 2026, 11:00“ (místní čas) -> ISO s posunem pro Prahu
export function casZTextu(s) {
  const m = /(\d{1,2})\.\s*([^\s\d]+)\s+(\d{4}),\s*(\d{1,2}):(\d{2})/.exec(s || '');
  if (!m || !MESICE[m[2]]) return null;
  const [y, mo, d, h, mi] = [+m[3], MESICE[m[2]], +m[1], +m[4], +m[5]];
  const utc = Date.UTC(y, mo - 1, d, h, mi);
  return new Date(utc - posunPrahy(utc)).toISOString();
}
// o kolik ms je čas v Praze napřed před UTC v okamžiku t (1 h v zimě, 2 h v létě)
function posunPrahy(t) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(t)).map((q) => [q.type, q.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - t;
}

// stránka seznamu -> řádky [{ id, druh, podtyp, obec, okres, stav, stupen, cas }]
export function rozeber(html) {
  const out = [];
  for (const m of html.matchAll(/<tr class="row\d"[^>]*>([\s\S]*?)<\/tr>/g)) {
    const bunky = [...m[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((q) => q[1]);
    if (bunky.length < 6) continue;
    const nazev = text(bunky[0]).join(' '), druhIkona = /title="([^"]+)"/.exec(bunky[1])?.[1] || '';
    const misto = text(bunky[3]), obec = misto[0] || '', okres = (misto.find((x) => /^okres\s/i.test(x)) || '').replace(/^okres\s+/i, '') || obec;
    const casti = nazev.split(' - ').map((x) => x.trim());
    const druh = druhIkona || casti[0] || '', podtyp = casti.length > 2 ? casti.slice(1, -1).join(' - ') : '';
    const stavT = text(bunky[2]).join(' '), cas = casZTextu(text(bunky[5]).join(' '));
    if (!obec || !cas) continue;
    out.push({ id: `${druh}|${podtyp}|${obec}`.toLowerCase(), druh, podtyp, obec, okres, stav: /probíh/i.test(stavT) ? 'probiha' : 'ukoncena', stupen: text(bunky[4]).join(' '), cas });
  }
  return out;
}

async function stranka(url, p) {
  const u = new URL(url); if (p > 1) u.searchParams.set('p', String(p));
  const r = await fetch(u, { headers: { 'user-agent': 'izomapa (mapa zasahu hasicu)', accept: 'text/html' }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return rozeber(await r.text());
}

export async function onRequest({ request, env }) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return json({ ok: false }, 405);
  const zr = env.ASSETS ? await env.ASSETS.fetch(new URL('/hasici_zdroj.json', request.url)) : null;
  const zdroj = zr && zr.ok ? await zr.json().catch(() => null) : null;
  if (!zdroj || !zdroj.url || !zdroj.okres) return json({ ok: false, msg: 'Zásahy hasičů nejsou nastavené.' }, 404, 3600);
  const cache = caches.default, key = new Request(new URL('/api/hasici?v=1&o=' + encodeURIComponent(zdroj.okres), request.url));
  const hit = await cache.match(key);
  if (hit) return hit;
  let radky = [];
  try { for (let p = 1; p <= STRANEK; p++) radky.push(...await stranka(zdroj.url, p)); }
  catch (e) { return json({ zasahy: [], chyba: String(e && e.message || e).slice(0, 120) }, 200, 30); }   // výpadek portálu: prázdno, zkusit brzy znovu
  const okres = zdroj.okres.toLowerCase(), videno = new Set();
  const zasahy = radky.filter((z) => z.okres.toLowerCase() === okres)
    .filter((z) => (videno.has(z.id + z.cas) ? false : (videno.add(z.id + z.cas), true)))
    .map(({ okres: _, ...z }) => z);
  const r = json({ zasahy, aktualizace: new Date().toISOString() }, 200, CACHE_S);
  await cache.put(key, r.clone());
  return r;
}
