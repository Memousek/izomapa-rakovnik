// Cloudflare Pages Function: plánované výluky a operativní mimořádnosti PID (RSS pid.cz) jen pro linky, které jezdí po mapě
// (seznam linek ve statickém site/vyluky_zdroj.json z build_html.py podle site/mhd.json). Cache 15 min pro všechny návštěvníky.
const FEEDS = [['vyluka', 'https://pid.cz/feed/rss-vyluky'], ['mimoradnost', 'https://pid.cz/feed/rss-mimoradnosti']];
const UA = 'izomapa-vyluky/1.0 (+https://github.com/adamklatovsky/izomapa)';
const ENT = { nbsp: ' ', ndash: '–', mdash: '—', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", bdquo: '„', ldquo: '“', rdquo: '”', hellip: '…' };
const text = (s) => (s || '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e.toLowerCase()] ?? m)).replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
const json = (o, max = 900) => new Response(JSON.stringify(o), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': `public, max-age=${max}` } });

export async function onRequestGet({ request, env }) {
  const z = env.ASSETS ? await env.ASSETS.fetch(new URL('/vyluky_zdroj.json', request.url)) : await fetch(new URL('/vyluky_zdroj.json', request.url));
  if (!z.ok) return json({ vyluky: [] }, 300);
  const linky = new Set(((await z.json()).linky || []).map(String));
  const cache = caches.default, klic = new Request('https://izomapa.internal/vyluky?' + [...linky].sort().join(','));
  const hit = await cache.match(klic);
  if (hit) return hit;
  const vyluky = [], ted = Date.now() / 1000;
  for (const [druh, url] of FEEDS) {
    let xml;
    try { const r = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15000) }); if (!r.ok) continue; xml = await r.text(); } catch { continue; }
    for (const it of xml.split('<item>').slice(1)) {
      const g = (tag) => { const m = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(it); return m ? m[1] : ''; };
      const ln = [...it.matchAll(/<line>([^<]+)<\/line>/g)].map((m) => m[1].trim()).filter((l) => linky.has(l));
      if (!ln.length) continue;
      const od = +g('dateFrom') || null, dO = +g('dateTo') || null;
      if (dO && dO < ted) continue;                                    // skončená
      if (od && od > ted + 14 * 86400) continue;                       // víc než 14 dní dopředu
      vyluky.push({ druh, nazev: text(g('title')).slice(0, 160), odkaz: text(g('link')), kdy: text(g('date')), od, do: dO, linky: ln, text: text(g('content:encoded')).replace(/^Linky:[^\n]*\n/, '').slice(0, 600) });
    }
  }
  vyluky.sort((a, b) => (a.druh === 'mimoradnost' ? -1 : 0) - (b.druh === 'mimoradnost' ? -1 : 0) || (a.od || 0) - (b.od || 0));
  const res = json({ stazeno: new Date().toISOString(), zdroj: 'PID (ROPID)', vyluky });
  await cache.put(klic, res.clone());
  return res;
}
