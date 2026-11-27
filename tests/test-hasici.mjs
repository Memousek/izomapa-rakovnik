// Zásahy hasičů (functions/api/hasici.js): rozbor tabulky krajského portálu, čas v Praze, výběr okresu a mezipaměť.
import assert from 'node:assert/strict';
import { rozeber, casZTextu, onRequest } from '../functions/api/hasici.js';

const radek = (nazev, ikona, stav, misto, stupen, cas) => `<tr class="row1">
<th>${nazev}</th><td><span title="${ikona}"><img src="/media/svg_icons/hzs/x.svg"></span></td><td>${stav} <img src="/static/operativa/img/bullet_red.png" /></td><td>${misto}</td><td align="center">${stupen}</td><td>${cas}</td></tr>`;
const HTML = `<table id="result_list"><tbody>
${radek('požár - průmyslové,zemědělské objekty,sklady - Kladno', 'požár', 'probíhá zásah', 'Kladno', 'I.', '27. listopadu 2026, 11:00')}
${radek('technická pomoc - odstranění stromu - Panoší Újezd', 'technická pomoc', 'ukončená', 'Panoší Újezd<br>okres Rakovník', 'I.', '27. listopadu 2026, 06:50')}
${radek('dopravní nehoda - se zraněním - Rakovník', 'dopravní nehoda', 'probíhá zásah', 'Rakovník', 'II.', '5. července 2026, 08:15')}
${radek('planý poplach - Lišany', 'planý poplach', 'ukončená', 'Lišany<br>okres Rakovník', 'I.', 'nesmysl')}
</tbody></table>`;

const r = rozeber(HTML);
assert.equal(r.length, 3, 'řádek bez času se vynechá');
assert.deepEqual(r[0], { id: 'požár|průmyslové,zemědělské objekty,sklady|kladno', druh: 'požár', podtyp: 'průmyslové,zemědělské objekty,sklady', obec: 'Kladno', okres: 'Kladno', stav: 'probiha', stupen: 'I.', cas: '2026-11-27T10:00:00.000Z' });
assert.equal(r[1].okres, 'Rakovník'); assert.equal(r[1].obec, 'Panoší Újezd'); assert.equal(r[1].stav, 'ukoncena');
assert.equal(r[2].okres, 'Rakovník', 'obec bez řádku okresu = okresní město');
assert.equal(casZTextu('5. července 2026, 08:15'), '2026-07-05T06:15:00.000Z', 'letní čas');
assert.equal(casZTextu('1. ledna 2027, 00:30'), '2026-12-31T23:30:00.000Z', 'zimní čas přes půlnoc');

// funkce: zdroj ze statického souboru, jen okres, mezipaměť pro všechny
const store = new Map(); let dotazy = 0;
globalThis.caches = { default: { match: async (k) => store.get(k.url)?.clone(), put: async (k, v) => { store.set(k.url, v); } } };
globalThis.fetch = async () => { dotazy++; return new Response(HTML, { status: 200 }); };
const env = { ASSETS: { fetch: async () => new Response(JSON.stringify({ url: 'https://example.test/zasahy/', okres: 'Rakovník' })) } };
let res = await onRequest({ request: new Request('http://x/api/hasici'), env });
const d = await res.json();
assert.deepEqual(d.zasahy.map((z) => z.obec), ['Panoší Újezd', 'Rakovník']);
assert.equal(d.zasahy[0].okres, undefined, 'okres se do odpovědi neposílá');
assert.equal(dotazy, 2, 'dvě stránky seznamu');
await onRequest({ request: new Request('http://x/api/hasici'), env });
assert.equal(dotazy, 2, 'druhý dotaz z mezipaměti');
res = await onRequest({ request: new Request('http://x/api/hasici'), env: { ASSETS: { fetch: async () => new Response('', { status: 404 }) } } });
assert.equal(res.status, 404, 'bez nastavení 404 (prohlížeč se přestane ptát)');
globalThis.fetch = async () => new Response('busy', { status: 503 }); store.clear();
res = await onRequest({ request: new Request('http://x/api/hasici'), env });
assert.deepEqual((await res.json()).zasahy, [], 'výpadek portálu = prázdno');
console.log('OK: rozbor tabulky, okres, čas v Praze (léto, zima), mezipaměť, bez nastavení, výpadek zdroje');
