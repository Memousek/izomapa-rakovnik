// Cloudflare Pages Function: výstrahy ČHMÚ (otevřená data, formát CAP 1.2, https://vystrahy-cr.chmi.cz) pro oblasti mapy.
// Soubor XOCZ50_OKPR.xml má ~1,7 MB bez komprese: funkce ho stáhne jednou za 10 min pro všechny návštěvníky a vrátí
// jen výstrahy (a výhled), které se týkají zadaných oblastí: ?o=Rakovník&o=Středočeský kraj (názvy z <areaDesc>, nejvýš 4).
// Odpověď: { stazeno, vystrahy: [{ jev, stupen (Moderate žlutá, Severe oranžová, Extreme červená, Unknown výhled), od, do,
//   popis, pokyny, oblasti, web }] }. „Žádná výstraha …“ se vynechá. Parsuje se textově (Workers nemají DOMParser).
const ZDROJ = 'https://vystrahy-cr.chmi.cz/data/XOCZ50_OKPR.xml';
const CERSTVE = 600;

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const txt = (s) => (s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&(#\d+|[a-z]+);/g, (m, e) => (e[0] === '#' ? String.fromCodePoint(+e.slice(1)) : ENT[e] ?? m)).trim();
const tag = (s, t) => { const m = new RegExp(`<${t}>([\\s\\S]*?)</${t}>`).exec(s); return m ? txt(m[1]) : ''; };
const json = (o, st = 200, max = CERSTVE) => new Response(JSON.stringify(o), { status: st, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': `public, max-age=${max}` } });

export async function onRequestGet({ request }) {
  const u = new URL(request.url);
  const oblasti = [...new Set(u.searchParams.getAll('o').map((s) => s.trim().slice(0, 60)).filter(Boolean))].slice(0, 4).sort();
  if (!oblasti.length) return json({ vystrahy: [] }, 400, 60);
  const cache = caches.default, klic = new Request('https://izomapa.internal/vystrahy?' + oblasti.map(encodeURIComponent).join('&'));
  const hit = await cache.match(klic);
  if (hit) return hit;
  let xml;
  try {
    const r = await fetch(ZDROJ, { headers: { 'user-agent': 'izomapa (vystrahy CHMU)' }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) return json({ vystrahy: [], chyba: `ČHMÚ ${r.status}` }, 200, 120);
    xml = await r.text();
  } catch { return json({ vystrahy: [], chyba: 'ČHMÚ nedostupné' }, 200, 120); }
  const ted = Date.now(), vystrahy = [];
  for (const blok of xml.split('<info>').slice(1)) {
    if (!blok.includes('<language>cs</language>')) continue;
    const jev = tag(blok, 'event');
    if (!jev || /^Žádn/.test(jev)) continue;                    // „Žádná výstraha…“, „Žádný výhled…“
    const shoda = [...blok.matchAll(/<areaDesc>([\s\S]*?)<\/areaDesc>/g)].map((m) => txt(m[1])).filter((n) => oblasti.includes(n));
    if (!shoda.length) continue;
    const doKdy = tag(blok, 'expires');
    if (doKdy && Date.parse(doKdy) < ted) continue;
    vystrahy.push({ jev, stupen: tag(blok, 'severity'), od: tag(blok, 'onset'), do: doKdy, popis: tag(blok, 'description').slice(0, 1500),
      pokyny: tag(blok, 'instruction').slice(0, 1000), oblasti: shoda, web: /^https?:\/\//.test(tag(blok, 'web')) ? tag(blok, 'web') : 'https://www.chmi.cz/' });
  }
  const res = json({ stazeno: new Date().toISOString(), zdroj: 'ČHMÚ', vystrahy });
  await cache.put(klic, res.clone());
  return res;
}
