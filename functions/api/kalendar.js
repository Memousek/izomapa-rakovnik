// Cloudflare Pages Function: kalendář akcí z webu infocentra (adresa ve statickém site/kalendar_zdroj.json z mesto.json
// "kalendar_web": {"url", "zdroj"}), takže nejde o otevřenou proxy. Stahuje nejvýš 3 stránky seznamu jednou za 3 h pro všechny.
// Parser pro CMS GCM (div.event-message, h3.event-name, div.action_date, div.venues, p.event-perex), stejný jako web města.
const CERSTVE = 10800, UA = 'izomapa-kalendar/1.0 (+https://github.com/adamklatovsky/izomapa)';
const ENT = { nbsp: ' ', ndash: '–', mdash: '—', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", bdquo: '„', ldquo: '“', rdquo: '”', hellip: '…' };
const text = (s) => (s || '').replace(/<[^>]+>/g, ' ').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e.toLowerCase()] ?? m)).replace(/\s+/g, ' ').trim();
const json = (o, max = CERSTVE) => new Response(JSON.stringify(o), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': `public, max-age=${Math.min(max, 1800)}` } });
const iso = (d, m, y) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

// „23. 11. 2026 začátek od 19:00“, „1. 12. 2026 – 24. 12. 2026“, „5. 12. 2026 16:00 – 18:00“
function kdy(t) {
  const dny = [...t.matchAll(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/g)].map((m) => iso(+m[1], +m[2], +m[3]));
  const casy = [...t.matchAll(/(\d{1,2}):(\d{2})/g)].map((m) => `${m[1].padStart(2, '0')}:${m[2]}`);
  return { od: dny[0] || null, do: dny[1] || dny[0] || null, cas: casy[0] || null, konec: casy[1] || null };
}

export async function onRequestGet({ request, env }) {
  const z = env.ASSETS ? await env.ASSETS.fetch(new URL('/kalendar_zdroj.json', request.url)) : await fetch(new URL('/kalendar_zdroj.json', request.url));
  if (!z.ok) return json({ akce: [] }, 300);
  const cfg = await z.json();
  if (!cfg || !/^https:\/\//.test(cfg.url || '')) return json({ akce: [] }, 300);
  const cache = caches.default, klic = new Request('https://izomapa.internal/kalendar?' + encodeURIComponent(cfg.url));
  const hit = await cache.match(klic);
  if (hit) return hit;
  const base = new URL(cfg.url), akce = [], videno = new Set();
  for (let page = 1; page <= 3; page++) {
    let html;
    try {
      const u = new URL(cfg.url); if (page > 1) u.searchParams.set('page', page);
      const r = await fetch(u, { headers: { 'user-agent': UA, accept: 'text/html' }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) break; html = await r.text();
    } catch { break; }
    const bloky = html.split('class="event event-message').slice(1);
    if (!bloky.length) break;
    for (const b of bloky) {
      const a = /<a[^>]+href="([^"]+)"/.exec(b), n = /event-name[^>]*>([\s\S]*?)<\/h\d>/.exec(b);
      if (!a || !n) continue;
      const u = new URL(a[1], base); if (u.host !== base.host || videno.has(u.href)) continue; videno.add(u.href);
      const d = /action_date[^>]*>([\s\S]*?)<\/div>/.exec(b), v = /class="venues[^>]*>([\s\S]*?)<\/div>/.exec(b), p = /event-perex[^>]*>([\s\S]*?)<\/p>/.exec(b);
      const dt = text(d ? d[1] : '').replace(/^Kdy:\s*/, ''), misto = text(v ? v[1] : '').replace(/^Kde:\s*/, '');
      akce.push({ nazev: text(n[1]).slice(0, 140), ...kdy(dt), kdy: dt.slice(0, 80), misto: misto.slice(0, 120), perex: p ? text(p[1]).slice(0, 240) : '', url: u.href });
    }
    await new Promise((r) => setTimeout(r, 1000));                   // šetrně k webu infocentra
  }
  const res = json({ stazeno: new Date().toISOString(), zdroj: cfg.zdroj || base.host, odkaz: cfg.url, akce });
  await cache.put(klic, new Response(res.clone().body, { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': `public, max-age=${CERSTVE}` } }));
  return res;
}
