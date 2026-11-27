// Ukazatele rychlosti ve 3D jízdě (web/jizda_merice.js) bez prohlížeče: tabule ukáže rychlost hráče jen ze směru,
// který měří, a měřený úsek spočítá průměrnou rychlost mezi okamžiky, kdy byl hráč tabulím nejblíž.
// Spuštění: node tests/test-merice.mjs
import assert from 'node:assert/strict';

const CAM = { lon0: 13.7, lat0: 50.1, kx: 71500, ky: 111200 };
const bod = (x, y) => [CAM.lat0 + y / CAM.ky, CAM.lon0 + x / CAM.kx];
// silnice sever–jih, tabule 400 m od sebe: severní měří auta od severu (0°), jižní od jihu (180°)
const DATA = [
  { id: 1, lat: 0, lon: 0, stoji: bod(4, 400), typ: 'displej', smer: 0, osa: 0, limit: 50, usek: 0 },
  { id: 2, lat: 0, lon: 0, stoji: bod(4, 0), typ: 'displej', smer: 180, osa: 0, limit: 50, usek: 0 },
];
globalThis.fetch = async () => ({ ok: true, json: async () => DATA });
const g2 = { fillRect() {}, fillText() {} };
globalThis.document = { createElement: () => ({ getContext: () => g2 }) };
class O { constructor() { this.position = { set() {}, z: 0, y: 0 }; this.rotation = { y: 0 }; } add() {} clone() { return new O(); } }
const THREE = { Group: O, Mesh: O, CanvasTexture: class {}, MeshBasicMaterial: class {}, MeshLambertMaterial: class {},
  CylinderGeometry: class {}, BoxGeometry: class {}, PlaneGeometry: class {}, SRGBColorSpace: 1 };
const { vytvorMerice } = await import('../web/jizda_merice.js');

function jizda(od, kam, v) {                                       // hráč v autě jede rovně rychlostí v m/s, 30 snímků za sekundu
  const hrac = { x: 0, y: od, z: 0, vAuto: true, bus: null }, toasty = [];
  const M = vytvorMerice(THREE, { add() {} }, { CAM, roads: [1], gz: () => 0, hrac, jenVeDne: [], toast: (t) => toasty.push(t) });
  return new Promise((ok) => setTimeout(() => {
    const [sev, jih] = [...M.seznam].sort((a, b) => b.y - a.y), cisla = [new Set(), new Set()];
    for (let t = 0, y = od; Math.sign(kam - od) * (kam - y) >= 0; t += 1000 / 30, y += Math.sign(kam - od) * v / 30) {
      hrac.y = y; M.update(t);
      if (sev.cislo != null) cisla[0].add(sev.cislo);
      if (jih.cislo != null) cisla[1].add(jih.cislo);
    }
    ok({ toasty, cisla });
  }, 5));
}

// na jih 72 km/h: severní tabule ukáže 72, jižní nic (auto k ní jede zezadu), průměr v úseku 72
let r = await jizda(550, -100, 20);
assert.ok(r.cisla[0].has(72), 'severní tabule měří auta od severu');
assert.equal(r.cisla[1].size, 0, 'jižní tabule auta od severu neměří');
assert.equal(r.toasty.length, 1);
assert.match(r.toasty[0], /400 m: průměr 72 km\/h, o 22 víc než 50/);

// na sever 45 km/h: měří jižní tabule, limit dodržen
r = await jizda(-150, 550, 12.5);
assert.ok(r.cisla[1].has(45));
assert.equal(r.cisla[0].size, 0);
assert.match(r.toasty[0], /průměr 45 km\/h, limit 50 dodržen/);
console.log('test-merice: ok');
