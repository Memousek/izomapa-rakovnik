// Dopravní události kraje (functions/api/udalosti.js + zKraje ve web/uzavirky.js): převod S-JTSK, druh, výřez mapy,
// popis z detailu, duplicity a přichycení bodu na silnici.
import assert from 'node:assert/strict';
import { jtskNaWgs, druhUdalosti, rozeberSeznam, onRequest } from '../functions/api/udalosti.js';
import { usekUBodu, zKraje, nactiSit } from '../web/uzavirky.js';

// převod: kontrolní body spočítané v pyproj (EPSG:5514 -> 4326)
for (const [x, y, la, lo] of [[-780260.6241543744, -1028976.6290230115, 50.165304, 13.875151], [-791449.9209978599, -1033918.8698582075, 50.106795, 13.730262]]) {
  const [a, b] = jtskNaWgs(x, y); assert.ok(Math.abs(a - la) < 2e-5 && Math.abs(b - lo) < 2e-5, `S-JTSK ${x} ${y} -> ${a} ${b}`);
}
assert.deepEqual(druhUdalosti('Dopravní situace, D6, km 33.4 až 34.1', 'D6, silný provoz'), { druh: 'kolona', typ: 'heavyTraffic' });
assert.deepEqual(druhUdalosti('Dopravní situace, D6', 'stojící kolona'), { druh: 'kolona', typ: 'stationaryTraffic' });
assert.deepEqual(druhUdalosti('Dopravní nehoda, I/6'), { druh: 'nehoda' });
assert.deepEqual(druhUdalosti('Omezení provozu a zákazy, silnice I/6, Krupá'), { druh: 'uzavirka' });
assert.equal(druhUdalosti('Srážky a viditelnost, II/237 Nové Strašecí'), null, 'počasí ne');

const polozka = (id, name, desc, x, y) => ({ id, name, label_description: desc, geom: { lon: String(x), lat: String(y) } });
const SEZNAM = { result: { total_items: 4, batch_start: 0, batch_size: 50 }, result_items: [{ ret: [
  polozka(1, 'Dopravní situace, II/229, Rakovník', 'vznik: 27. 11. 2026, 10:40, ukončení: 27. 11. 2026, 23:52', -791130.79, -1033507.69),
  polozka(2, 'Dopravní situace, II/229, Rakovník', 'vznik: 27. 11. 2026, 10:10, ukončení: 27. 11. 2026, 23:22', -791130.79, -1033507.69),
  polozka(3, 'Dopravní uzavírky a omezení, D6, km 29.7', 'vznik: 27. 7. 2026, 00:01, ukončení: 30. 11. 2026, 23:59', -776741.29, -1030014.30),   // mimo mapu
  polozka(4, 'Dopravní uzavírky a omezení, ulice Čechova, Rakovník', 'vznik: 14. 9. 2026, 07:00, ukončení: 1. 10. 2026, 23:59', -791703.70, -1033919.24),   // prošlá
] }] };
const r = rozeberSeznam(SEZNAM);
assert.equal(r.length, 4); assert.equal(r[0].od, '2026-11-27T09:40:00.000Z'); assert.equal(r[0].konec, '2026-11-27T22:52:00.000Z');

const BBOX = [50.06167, 13.66312, 50.19371, 13.77094];
const store = new Map(); let dotazy = [];
globalThis.caches = { default: { match: async (k) => store.get(k.url)?.clone(), put: async (k, v) => { store.set(k.url, v); } } };
globalThis.fetch = async (u) => {
  dotazy.push(String(u));
  if (/fmt=popup/.test(String(u))) return new Response(JSON.stringify({ result_items: [{ ret: [{ popup: '<tr><td class="heading"><p>Popis</p></td><td class="content"><p>II/229, silný provoz</p></td></tr>' }] }] }));
  return new Response(JSON.stringify(SEZNAM));
};
const env = { ASSETS: { fetch: async () => new Response(JSON.stringify({ bbox: BBOX, kraj: { url: 'https://example.test/udalosti/', hledat: 'Rakovník' } })) } };
const realNow = Date.now; Date.now = () => Date.parse('2026-11-27T11:00:00Z');
const d = await (await onRequest({ request: new Request('http://x/api/udalosti'), env })).json();
Date.now = realNow;
assert.deepEqual(d.udalosti.map((u) => u.id), ['1'], 'jen platná v mapě, opakované hlášení jen nejnovější');
assert.equal(d.udalosti[0].druh, 'kolona'); assert.equal(d.udalosti[0].popis, 'II/229, silný provoz');
assert.ok(dotazy[0].includes('fmt=json') && dotazy[0].includes('q=Rakovn'), 'hledání podle okresu');
const n = dotazy.length; await onRequest({ request: new Request('http://x/api/udalosti'), env }); assert.equal(dotazy.length, n, 'druhý dotaz z mezipaměti');

// přichycení na síť: malá síť se silnicí 229 a vedlejší ulicí
const cam = { lon0: 13.72, lat0: 50.1, kx: 71500, ky: 111200, half: 1150 };
const sd = { cam, ctverce: [[0, 0]], uzly: [0, 0, 50, 0, 100, 0, 150, 0, 100, 60], ulice: ['Vedlejší'], refy: ['229'], hrany: [0, 1, -1, '0', 1, 2, -1, '0', 2, 3, -1, '0', 2, 4, 0, ''], kruh: [], adresy: [], mista: [] };
const S = nactiSit(sd), ll = (x, y) => [y / cam.ky + cam.lat0, x / cam.kx + cam.lon0];
const l = usekUBodu(S, ...ll(98, 5), 'Dopravní situace, II/229, Rakovník', 60);
assert.ok(l && l.length >= 3, 'úsek po silnici 229');
assert.ok(l.every(([la]) => Math.abs(la - cam.lat0) < 1e-5), 'nezabočí do vedlejší ulice');
const U = { id: '9', nazev: 'Omezení provozu a zákazy, silnice II/229, Rakovník, okr. Rakovník', druh: 'uzavirka', lat: ll(98, 5)[0], lon: ll(98, 5)[1], od: '2026-09-15T22:00:00.000Z', konec: '2026-12-20T22:59:00.000Z' };
const [k] = zKraje(S, { udalosti: [U] }, { zdroj: 'kraj' }, []);
assert.equal(k.length, 1); assert.equal(k[0].nazev, 'II/229, Rakovník'); assert.equal(k[0].castecna, true, 'uzavírka jen z kraje je částečná');
assert.equal(k[0].od, '2026-09-16', 'místní den, ne UTC');
// duplicita: kraj vyhrává (název, termín, zdroj), čáru a úplnost převezme z webu města
const web = { nazev: 'Rakovnická (II/229)', line: [ll(0, 0), ll(150, 0)], od: '2026-09-20', do: '2026-12-01', zdroj: 'Město Rakovník', puvod: 'web' };
const [k2, nahr] = zKraje(S, { udalosti: [U] }, { zdroj: 'kraj' }, [web]);
assert.ok(nahr.has(web), 'záznam z webu je nahrazený');
assert.equal(k2.length, 1); assert.equal(k2[0].zdroj, 'kraj'); assert.equal(k2[0].do, '2026-12-20'); assert.deepEqual(k2[0].line, web.line);
assert.equal(k2[0].castecna, undefined, 'úplná podle webu'); assert.equal(k2[0].usek, 'Město Rakovník');
// kolona nenahrazuje uzavírku a stejná kolona z JSDI se nezdvojí
const K = { ...U, id: '10', nazev: 'Dopravní situace, II/229', druh: 'kolona', typ: 'heavyTraffic' };
assert.equal(zKraje(S, { udalosti: [K] }, {}, [web])[0].length, 1, 'kolona vedle uzavírky zůstane');
assert.equal(zKraje(S, { udalosti: [K] }, {}, [{ druh: 'kolona', line: web.line }])[0].length, 0, 'stejná kolona z JSDI');
console.log('OK: S-JTSK, druh, výřez a platnost, opakovaná hlášení, popis, mezipaměť, přichycení na silnici, duplicity');
