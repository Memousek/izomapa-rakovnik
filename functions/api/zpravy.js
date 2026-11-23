// Cloudflare Pages Function: aktuality z webu města pro panel mapy (titulky, perex, datum, odkaz).
// Adresa seznamu je ve statickém site/zpravy_zdroj.json (build_html.py z mesto.json "zpravy_web": {"url", "zdroj"}),
// takže funkce nestahuje nic jiného (není to otevřená proxy). Stránka se stahuje nejvýš jednou za 30 min pro všechny.
// Parser je naladěný na CMS GCM (web mesto-rakovnik.cz: div.event-message__item, h3.event-message__heading,
// p.event-message__perex, span.event-message__date-value); jiný web může potřebovat úpravu.
const CERSTVE = 1800, UA = 'izomapa-zpravy/1.0 (+https://github.com/adamklatovsky/izomapa)';
const ENT = { nbsp: ' ', ndash: '–', mdash: '—', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", bdquo: '„', ldquo: '“', rdquo: '”', hellip: '…' };
const text = (s) => (s || '').replace(/<[^>]+>/g, '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e.toLowerCase()] ?? m)).replace(/\s+/g, ' ').trim();
const json = (o, max = CERSTVE) => new Response(JSON.stringify(o), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': `public, max-age=${max}` } });

export async function onRequestGet({ request, env }) {
  const z = env.ASSETS ? await env.ASSETS.fetch(new URL('/zpravy_zdroj.json', request.url)) : await fetch(new URL('/zpravy_zdroj.json', request.url));
  if (!z.ok) return json({ zpravy: [] }, 300);
  const cfg = await z.json();
  if (!cfg || !/^https:\/\//.test(cfg.url || '')) return json({ zpravy: [] }, 300);
  const cache = caches.default, klic = new Request('https://izomapa.internal/zpravy?' + encodeURIComponent(cfg.url));
  const hit = await cache.match(klic);
  if (hit) return hit;
  let html;
  try {
    const r = await fetch(cfg.url, { headers: { 'user-agent': UA, accept: 'text/html' }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) return json({ zpravy: [], chyba: `web ${r.status}` }, 300);
    html = await r.text();
  } catch { return json({ zpravy: [], chyba: 'web nedostupný' }, 300); }
  const base = new URL(cfg.url), zpravy = [];
  for (const blok of html.split('event-message__item').slice(1, 13)) {
    const a = /<a[^>]+href="([^"]+)"/.exec(blok), h = /event-message__heading[^>]*>([\s\S]*?)<\/h\d>/.exec(blok);
    if (!a || !h) continue;
    const u = new URL(a[1], base);
    if (u.host !== base.host) continue;
    const p = /event-message__perex[^>]*>([\s\S]*?)<\/p>/.exec(blok), d = /event-message__date-value[^>]*>([\s\S]*?)<\/span>/.exec(blok);
    zpravy.push({ nadpis: text(h[1]).slice(0, 160), perex: p ? text(p[1]).slice(0, 300) : '', datum: d ? text(d[1]) : '', url: u.href });
  }
  const res = json({ stazeno: new Date().toISOString(), zdroj: cfg.zdroj || base.host, odkaz: cfg.url, zpravy });
  await cache.put(klic, res.clone());
  return res;
}
