// Multiplayer 3D jízdy bez Cloudflare: kódování zpráv (web/jizda_sit.js) a místnost (multiplayer/worker.js)
// s napodobenými sokety. Spuštění: node tests/test-multiplayer.mjs
import assert from 'node:assert/strict';
import { zakodujStav, dekodujStav, zakodujSnimek, dekodujSnimek, vyberBlizke, vymyslJmeno, REZIM, PRIZNAK, platneAuto, AUTO_VYCHOZI } from '../web/jizda_sit.js';
import { Mistnost } from '../multiplayer/worker.js';
import worker from '../multiplayer/worker.js';

const blizko = (a, b, eps = 1e-3) => Math.abs(a - b) < eps;

// stav tam a zpět
const s0 = { rezim: REZIM.auto, flags: PRIZNAK.svetla | PRIZNAK.brzda, x: 1234.56, y: -987.25, z: 301.5, yaw: 2.5, v: 13.89 };
const s1 = dekodujStav(zakodujStav(s0));
assert.equal(zakodujStav(s0).byteLength, 20);
assert.equal(s1.rezim, 1); assert.equal(s1.flags, 3);
assert.ok(blizko(s1.x, s0.x, 1e-2) && blizko(s1.y, s0.y, 1e-2) && blizko(s1.z, s0.z, 1e-2) && blizko(s1.yaw, 2.5) && blizko(s1.v, 13.89, 0.01));
assert.ok(blizko(dekodujStav(zakodujStav({ ...s0, yaw: 2 * Math.PI + 0.3 })).yaw, 0.3), 'směr se zabalí do ±π');
// nesmysly zahodit
assert.equal(dekodujStav(new ArrayBuffer(19)), null);
assert.equal(dekodujStav(zakodujStav({ ...s0, x: NaN })), null);
assert.equal(dekodujStav(zakodujStav({ ...s0, x: 5e5 })), null);
assert.equal(dekodujStav(zakodujStav({ ...s0, rezim: 7 })), null);
assert.equal(dekodujStav('ahoj'), null);
{ const b = zakodujStav(s0); new DataView(b).setUint8(0, 2); assert.equal(dekodujStav(b), null, 'jiný typ'); }

// snímek tam a zpět
const sn = dekodujSnimek(zakodujSnimek([{ id: 3, stav: s0 }, { id: 65000, stav: { ...s0, rezim: 0, x: -5 } }]));
assert.equal(sn.length, 2); assert.equal(sn[0].id, 3); assert.equal(sn[1].id, 65000); assert.equal(sn[1].rezim, 0); assert.ok(blizko(sn[1].x, -5));
assert.deepEqual(dekodujSnimek(zakodujSnimek([])), []);
assert.equal(dekodujSnimek(new ArrayBuffer(3)), null);

// blízcí: dosah a počet, nejbližší první
const ost = [[0, 10], [0, 800], [300, 0], [5, 5]].map(([x, y], i) => ({ id: i + 1, stav: { x, y } }));
assert.deepEqual(vyberBlizke({ x: 0, y: 0 }, ost).map((o) => o.id), [4, 1, 3]);
assert.deepEqual(vyberBlizke({ x: 0, y: 0 }, ost, 700, 2).map((o) => o.id), [4, 1]);

// jména: různá, i když náhoda dá stejné číslo
const jm = new Set(); for (let k = 0; k < 50; k++) jm.add(vymyslJmeno(0.5, jm));
assert.equal(jm.size, 50);

// místnost s napodobenými sokety
class Soket {
  constructor() { this.dostal = []; this.zavren = null; this.pr = null; }
  send(d) { this.dostal.push(d); }
  close(kod, duvod) { this.zavren = [kod, duvod]; }
  serializeAttachment(a) { this.pr = structuredClone(a); }
  deserializeAttachment() { return this.pr; }
  json() { return this.dostal.filter((d) => typeof d === 'string').map((d) => JSON.parse(d)); }
  snimky() { return this.dostal.filter((d) => d instanceof ArrayBuffer).map(dekodujSnimek); }
}
const M = new Mistnost({ getWebSockets: () => [] }, {});
const A = new Soket(), B = new Soket(), C = new Soket();
const ha = M.pripoj(A), hb = M.pripoj(B);
assert.equal(ha.id, 1); assert.equal(hb.id, 2); assert.notEqual(ha.jmeno, hb.jmeno); assert.notEqual(ha.barva, hb.barva);
assert.deepEqual(A.json().map((z) => z.t), ['ahoj', 'novy']);
assert.deepEqual(B.json()[0].hraci.map((h) => h.id), [1], 'nový hráč dostane seznam ostatních');

const poloha = (x, y) => zakodujStav({ ...s0, x, y });
M.webSocketMessage(A, poloha(0, 0)); M.webSocketMessage(B, poloha(50, 0));
clearInterval(M.casovac); M.casovac = null;   // tiky v testu ručně
const t0 = Date.now();
M.tik(t0);
assert.deepEqual(A.snimky().at(-1).map((z) => z.id), [2]);
assert.deepEqual(B.snimky().at(-1).map((z) => z.id), [1]);
// B odjede z dosahu: A dostane jednou prázdný snímek, pak už nic
M.webSocketMessage(B, poloha(5000, 0)); clearInterval(M.casovac); M.casovac = null;
M.tik(t0); const nA = A.snimky().length; assert.deepEqual(A.snimky().at(-1), []);
M.tik(t0); assert.equal(A.snimky().length, nA, 'prázdný snímek se neopakuje');
// zamrzlý hráč (bez zprávy 5 s) se neposílá
M.webSocketMessage(B, poloha(10, 0)); clearInterval(M.casovac); M.casovac = null;
M.tik(t0 + 6000); assert.deepEqual(A.snimky().at(-1), []);

// odchod: ostatní dostanou zprávu, id se uvolní
M.webSocketClose(B);
assert.deepEqual(A.json().at(-1), { t: 'pryc', id: 2 });
assert.equal(M.pripoj(C).id, 2);

// probuzení z hibernace: hráči z příloh soketů
const M2 = new Mistnost({ getWebSockets: () => [A, C] }, {});
assert.deepEqual([...M2.hraci.values()].map((h) => h.id).sort(), [1, 2]);

// záplava zpráv: nad limit se zahazuje, trojnásobek odpojí
const D = new Soket(); M.pripoj(D);
for (let k = 0; k < 100; k++) M.webSocketMessage(D, poloha(1, 1));
clearInterval(M.casovac); M.casovac = null;
assert.equal(D.zavren?.[0], 1008);

// vstup do workeru: cesta a původ
const env = (o) => ({ POVOLENE_ORIGINY: o, MISTNOST: { idFromName: (n) => n, get: (n) => ({ fetch: async () => new Response('místnost ' + n) }) } });
let r = await worker.fetch(new Request('http://x/mistnost/rakovnik', { headers: { Origin: 'https://zly.example' } }), env('https://izomapa-rakovnik.pages.dev'));
assert.equal(r.status, 403);
r = await worker.fetch(new Request('http://x/mistnost/rakovnik', { headers: { Origin: 'https://izomapa-rakovnik.pages.dev' } }), env('https://izomapa-rakovnik.pages.dev'));
assert.equal(await r.text(), 'místnost rakovnik');
r = await worker.fetch(new Request('http://x/mistnost/../x'), env('')); assert.equal(r.status, 404);
r = await worker.fetch(new Request('http://x/mistnost/Rakovnik'), env('')); assert.equal(r.status, 404, 'jen malá písmena');
// auto z garáže: kontrola voleb a barev, server ho pošle ostatním a pamatuje si ho pro nově příchozí
assert.deepEqual(platneAuto({ ...AUTO_VYCHOZI, b1: '#ABCDEF', dopl: ['box', 'raketa', 'spoiler'] }).dopl, ['spoiler', 'box']);
assert.equal(platneAuto({ ...AUTO_VYCHOZI, b1: '#ABCDEF' }).b1, '#abcdef');
for (const zle of [{ k: 'tank' }, { b1: 'red' }, { b2: '#12345' }, { v: '<script>' }, { dopl: 'box' }, { vys: 'let' }]) assert.equal(platneAuto({ ...AUTO_VYCHOZI, ...zle }), null, JSON.stringify(zle));
assert.equal(platneAuto(null), null);
{
  const M3 = new Mistnost({ getWebSockets: () => [] }, {}), P = new Soket(), Q = new Soket();
  const hp = M3.pripoj(P); M3.pripoj(Q);
  M3.webSocketMessage(P, JSON.stringify({ t: 'auto', a: { ...AUTO_VYCHOZI, k: 'suv', dopl: ['rampa'] } }));
  assert.deepEqual(Q.json().at(-1), { t: 'auto', id: hp.id, a: { ...AUTO_VYCHOZI, k: 'suv', dopl: ['rampa'] } });
  assert.equal(P.json().filter((z) => z.t === 'auto').length, 0, 'odesílatel svoje auto zpátky nedostane');
  M3.webSocketMessage(P, JSON.stringify({ t: 'auto', a: { k: 'tank' } }));
  M3.webSocketMessage(P, JSON.stringify({ t: 'chat', text: 'ahoj' }));
  assert.equal(Q.json().length, 2, 'neplatné auto ani chat se dál neposílají');
  const R = new Soket(); M3.pripoj(R);
  assert.equal(R.json()[0].hraci.find((h) => h.id === hp.id).auto.k, 'suv', 'nový hráč dostane auta ostatních');
  assert.equal(P.pr.auto.k, 'suv', 'auto přežije hibernaci (příloha soketu)');
  clearInterval(M3.casovac);
}
console.log('OK: auto z garáže (kontrola, rozeslání, příchozí, hibernace); kódování stavu a snímku, blízcí hráči, jména, místnost (příchod, snímky, odchod, hibernace, limit), původ');
