// Cloudflare Pages Function: příjem uzavírek z JSDI (ŘSD ČR – NDIC), odběr „DATEX II – Uzavírky a omezení“ protokolem PUSH.
// NDIC posílá HTTP POST se zprávou DATEX II (3.x i 2.3, volitelně gzip) při každé změně, po aktivaci nebo resetu odběru
// všechny platné záznamy. Ověření: Basic Authentication proti tajným proměnným JSDI_JMENO a JSDI_HESLO; na přijatou
// zprávu musí přijít 200, jinak NDIC zkouší znovu a po 24 h odběr zablokuje.
// Ukládá jen záznamy, které zasahují do mapy (obdélník bbox z uzavirky_zdroj.json), do KV UZAVIRKY_KV pod klíč "jsdi";
// prošlé, pozastavené a ty, které se přesunuly mimo mapu, maže. Prohlížeč je dostane přes api/uzavirky (pole "jsdi").
// Zbytek ČR se přeskočí hned podle první souřadnice, ať se zpráva za celou republiku vejde do limitu CPU.
const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const xmlText = (s) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e] ?? m)).trim();
const tag = (s, jmeno) => { const m = new RegExp(`<(?:\\w+:)?${jmeno}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${jmeno}>`).exec(s); return m ? m[1] : null; };
const vsechny = (s, jmeno) => [...s.matchAll(new RegExp(`<(?:\\w+:)?${jmeno}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${jmeno}>`, 'g'))].map((m) => m[1]);
const ZACATEK = /<(?:\w+:)?situation[\s>]/g;

function stejne(a, b) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let r = x.length ^ y.length; for (let i = 0; i < Math.max(x.length, y.length); i++) r |= (x[i] || 0) ^ (y[i] || 0);
  return r === 0;
}

// čáry úseku [[lat, lon], …]: gmlLineString/posList (ETRS89 = WGS84 na metry), jinak dvojice latitude/longitude za sebou
function cary(s) {
  const out = [];
  for (const p of vsechny(s, 'posList')) {
    const n = p.trim().split(/\s+/).map(Number), c = [];
    for (let i = 0; i + 1 < n.length; i += 2) if (Number.isFinite(n[i]) && Number.isFinite(n[i + 1])) c.push([+n[i].toFixed(6), +n[i + 1].toFixed(6)]);
    if (c.length > 1) out.push(c);
  }
  if (!out.length) {
    const la = vsechny(s, 'latitude').map(Number), lo = vsechny(s, 'longitude').map(Number), c = [];
    for (let i = 0; i < Math.min(la.length, lo.length); i++) if (Number.isFinite(la[i]) && Number.isFinite(lo[i])) c.push([+la[i].toFixed(6), +lo[i].toFixed(6)]);
    if (c.length > 1) out.push(c);
  }
  return out;
}

// „silnice I/6, Krupá, okr. Rakovník, uzavřeno, …“ -> „I/6, Krupá“
function nazevZKomentare(k) {
  const casti = [];
  for (const c of k.split(/,\s*/)) {
    if (/uzavřen|práce|provoz|zúžen|stavební|oprava|údržb|omezen|zákaz|^od\s|^\d|nehoda|objížď/i.test(c)) break;
    if (/^okr\.|^okres/i.test(c)) continue;
    casti.push(c.replace(/^silnice\s+/i, '').replace(/\s*\(okres [^)]*\)/i, '').trim());
  }
  return casti.filter(Boolean).join(', ').slice(0, 90) || 'Uzavírka';
}

// zpráva DATEX II -> {id: záznam | null (smazat)}; bbox [latMin, lonMin, latMax, lonMax]
export function rozeber(xml, bbox, ted = Date.now(), zmeny = {}) {
  const uvnitr = ([la, lo]) => la >= bbox[0] && la <= bbox[2] && lo >= bbox[1] && lo <= bbox[3];
  const blizko = ([la, lo]) => la >= bbox[0] - 0.3 && la <= bbox[2] + 0.3 && lo >= bbox[1] - 0.45 && lo <= bbox[3] + 0.45;   // ~30 km kolem mapy
  const pozice = [...xml.matchAll(ZACATEK)].map((m) => m.index);
  for (let i = 0; i < pozice.length; i++) {
    const s = xml.slice(pozice[i], i + 1 < pozice.length ? pozice[i + 1] : xml.length);
    const id = /\bid="([^"]+)"/.exec(s.slice(0, 300))?.[1];
    if (!id) continue;
    const prvni = /posList[^>]*>\s*([-\d.]+)\s+([-\d.]+)/.exec(s) || /latitude>\s*([-\d.]+)[\s\S]{0,200}?longitude>\s*([-\d.]+)/.exec(s);
    const lines = prvni && blizko([+prvni[1], +prvni[2]]) ? cary(s).filter((c) => c.some(uvnitr)) : [];   // daleko od mapy: hned dál
    if (!lines.length) { zmeny[id] = null; continue; }              // mimo mapu (nebo bez polohy): u nás nemá co být
    const starty = vsechny(s, 'overallStartTime').map(xmlText), konce = vsechny(s, 'overallEndTime').map(xmlText);
    const od = starty.sort()[0] || null, do_ = konce.sort().at(-1) || null;
    const pozastaveno = vsechny(s, 'validityStatus').some((v) => /suspended/i.test(v));
    if (pozastaveno || (do_ && Date.parse(do_) < ted)) { zmeny[id] = null; continue; }
    const typy = vsechny(s, 'roadOrCarriagewayOrLaneManagementType').map(xmlText);
    const nakladni = /forVehiclesWithCharacteristicsOf|vehicleType>\s*(lorry|heavyGoods)|grossWeight/i.test(s);
    const uplna = (typy.includes('roadClosed') || vsechny(s, 'capacityRemaining').some((c) => +xmlText(c) === 0)) && !nakladni;
    const komentar = xmlText(tag(tag(s, 'generalPublicComment') || '', 'value') || tag(s, 'value') || '');
    zmeny[id] = { nazev: nazevZKomentare(komentar), lines, od: od && od.slice(0, 10), do: do_ && do_.slice(0, 10), konec: do_,
      popis: komentar.slice(0, 600), ...(uplna ? {} : { castecna: true }), verze: xmlText(tag(s, 'situationVersionTime') || tag(s, 'situationRecordVersionTime') || '') };
  }
  return zmeny;
}

// tělo požadavku po kusech (gzip i bez): situace se rozebírají průběžně, celá zpráva (úvodní dávka za celou ČR může mít
// desítky MB) se nikdy nedrží v paměti najednou
const KONEC = /<\/(?:\w+:)?situation>/g;
export async function rozeberProud(body, bbox, ted = Date.now()) {
  const r0 = body.getReader(), prvni = await r0.read();
  let proud = new ReadableStream({ start(c) { if (prvni.value) c.enqueue(prvni.value); }, async pull(c) { const { value, done } = await r0.read(); if (done) c.close(); else c.enqueue(value); } });
  if (prvni.value && prvni.value[0] === 0x1f && prvni.value[1] === 0x8b) proud = proud.pipeThrough(new DecompressionStream('gzip'));
  const rd = proud.pipeThrough(new TextDecoderStream('utf-8')).getReader(), zmeny = {};
  let buf = '';
  for (;;) {
    const { value, done } = await rd.read();
    if (value) buf += value;
    if (!done && buf.length < 1 << 20) continue;
    let posl = -1; KONEC.lastIndex = 0; for (let m; (m = KONEC.exec(buf));) posl = m.index + m[0].length;
    if (done) { rozeber(buf, bbox, ted, zmeny); break; }
    if (posl > 0) { rozeber(buf.slice(0, posl), bbox, ted, zmeny); buf = buf.slice(posl); }
  }
  return zmeny;
}

export async function onRequestPost({ request, env }) {
  if (!env.UZAVIRKY_KV || !env.JSDI_JMENO || !env.JSDI_HESLO) return json({ ok: false, msg: 'Příjem JSDI není nastavený.' }, 501);
  const auth = request.headers.get('authorization') || '';
  let jmeno = '', heslo = '';
  try { [jmeno, heslo] = atob(auth.replace(/^Basic\s+/i, '')).split(/:(.*)/s); } catch {}
  if (!/^Basic\s/i.test(auth) || !stejne(jmeno || '', env.JSDI_JMENO) || !stejne(heslo || '', env.JSDI_HESLO)) {
    return new Response('Unauthorized', { status: 401, headers: { 'www-authenticate': 'Basic realm="jsdi"' } });
  }
  const cr = await env.ASSETS.fetch(new URL('/uzavirky_zdroj.json', request.url));
  const bbox = cr.ok ? (await cr.json().catch(() => ({}))).bbox : null;
  if (!Array.isArray(bbox) || bbox.length !== 4) return json({ ok: false, msg: 'Chybí bbox mapy v uzavirky_zdroj.json.' }, 500);
  let zmeny;
  try { zmeny = await rozeberProud(request.body, bbox); }
  catch (e) { return json({ ok: true, chyba: String(e && e.message || e).slice(0, 200) }); }   // nečitelnou zprávu přijmout, ať NDIC odběr nezablokuje
  const ids = Object.keys(zmeny); if (!ids.length) return json({ ok: true, zmen: 0 });
  const ulozeno = JSON.parse((await env.UZAVIRKY_KV.get('jsdi')) || '{"zaznamy":{}}');
  let zmen = 0;
  for (const id of ids) {
    if (zmeny[id] === null) { if (id in ulozeno.zaznamy) { delete ulozeno.zaznamy[id]; zmen++; } continue; }
    const st = ulozeno.zaznamy[id];
    if (st && st.verze && zmeny[id].verze && zmeny[id].verze < st.verze) continue;          // starší verze, než už máme
    if (st && JSON.stringify({ ...st, prijato: 0 }) === JSON.stringify({ ...zmeny[id], prijato: 0 })) continue;   // beze změny (reset odběru): KV nezapisovat
    ulozeno.zaznamy[id] = { ...zmeny[id], prijato: new Date().toISOString() }; zmen++;
  }
  for (const [id, z] of Object.entries(ulozeno.zaznamy)) if (z.konec && Date.parse(z.konec) < Date.now()) { delete ulozeno.zaznamy[id]; zmen++; }
  if (zmen) { ulozeno.aktualizace = new Date().toISOString(); await env.UZAVIRKY_KV.put('jsdi', JSON.stringify(ulozeno)); }
  return json({ ok: true, zmen });
}

export async function onRequest({ request }) {
  return json({ ok: false, msg: 'Sem posílá data jen NDIC (HTTP POST).' }, request.method === 'GET' ? 200 : 405);
}
