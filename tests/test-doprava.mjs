// Doprava 3D jízdy (web/jizda_doprava.js) bez prohlížeče: stabilní uid silnic a aut nezávislé na pořadí načtení
// čtverců, stejné vlastnosti aut ze semínka a simulace, která auta rozjede bez chyb.
// Spuštění: node tests/test-doprava.mjs
import assert from 'node:assert/strict';
import { vytvorDopravu, semeno, nah } from '../web/jizda_doprava.js';

const HALF = 1150;
// dva čtverce: v c0_0 křižovatka hlavní a vedlejší se semaforem, hlavní pokračuje do c1_0
const DATA = {
  c0_0: { roads: [
    { w: [[-1100, 0, 300], [0, 0, 300]], c: 'primary', v: 12000, t: 8, sg: [[1080, -20, 0, 'k']] },
    { w: [[0, 0, 300], [1150, 0, 302]], c: 'primary', v: 12000, t: 8 },
    { w: [[0, -900, 298], [0, 0, 300]], c: 'tertiary', v: 3000 },
    { w: [[0, 0, 300], [0, 900, 304]], c: 'residential', v: 800 },
    { w: [[5, 5, 300], [5.5, 5, 300]], c: 'service' },                   // kratší než 1 m: vynechá se, uid ostatních se nemění
    { w: [[200, 0, 300], [200, -300, 300]], c: 'service', v: 100 },
  ] },
  c1_0: { roads: [
    { w: [[1150, 0, 302], [2200, 40, 305]], c: 'primary', v: 12000, t: 8 },
    { w: [[1600, 20, 303], [1600, 800, 310]], c: 'secondary', v: 5000 },
  ] },
};

async function postav(poradi) {
  const hrac = { x: 1e6, y: 1e6, vAuto: false };
  const D = vytvorDopravu({ HALF, hrac: () => hrac, ted: () => 0, nacti: async (k) => structuredClone(DATA[k]) });
  for (const k of poradi) {
    const [i, j] = k.slice(1).split('_').map(Number);
    D.LOADED.push([i * 2 * HALF, j * 2 * HALF]);
    await D.nactiDopravu(k);
  }
  return D;
}
const stav = (D) => new Map(D.cars.map((c) => [c.uid, { r: D.roads[c.r].uid, s: +c.s.toFixed(6), dir: c.dir, t: c.t, col: c.col, f: c.f, drzy: c.drzy }]));

// generátor: stejné semínko = stejná řada, stav je jedno číslo
const a = { sd: semeno('c0_0:3') }, b = { sd: semeno('c0_0:3') };
assert.deepEqual([nah(a), nah(a), nah(a)], [nah(b), nah(b), nah(b)]);
assert.equal(typeof a.sd, 'number');
assert.ok([...Array(1000)].map(() => nah(a)).every((x) => x >= 0 && x < 1));

// pořadí čtverců nemění uid ani vlastnosti aut
const D1 = await postav(['c0_0', 'c1_0']), D2 = await postav(['c1_0', 'c0_0']);
assert.ok(D1.cars.length > 20, `aut je ${D1.cars.length}`);
assert.deepEqual(stav(D1), stav(D2));
assert.equal(D1.roads.length, 7);
assert.ok(!D1.silniceId.has('c0_0:4'), 'krátký kus se vynechá');
assert.equal(D1.roads[D1.silniceId.get('c0_0:5')].uid, 'c0_0:5', 'uid za vynechaným kusem zůstává podle souboru');
assert.notEqual(D1.silniceId.get('c1_0:0'), D2.silniceId.get('c1_0:0'), 'index v roads se liší, uid ne');
assert.ok(D1.cars.every((c) => D1.roads[c.r].c !== 'service'), 'auta jen mimo obslužné cesty');

// simulace: minuta provozu, auta se hýbou, nic není NaN, rozhodování neovlivní Math.random
const start = stav(D1), rnd0 = Math.random;
Math.random = () => { throw new Error('doprava sáhla po Math.random'); };
try {
  for (let k = 0; k < 600; k++) { D1.carGaps(); for (const c of D1.cars) D1.stepCar(c, 0.1); }
} finally { Math.random = rnd0; }
const konec = stav(D1);
let pohnulo = 0;
for (const [uid, s] of konec) {
  assert.ok(Number.isFinite(s.s) && D1.roads.some((r) => r.uid === s.r), uid);
  const p = D1.carPose(D1.cars.find((c) => c.uid === uid));
  assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.h), uid);
  if (s.r !== start.get(uid).r || Math.abs(s.s - start.get(uid).s) > 5) pohnulo++;
}
assert.ok(pohnulo > D1.cars.length * 0.8, `pohnulo se ${pohnulo} z ${D1.cars.length}`);
console.log(`OK: ${D1.cars.length} aut, uid nezávislá na pořadí čtverců, semínka, minuta simulace bez Math.random`);
