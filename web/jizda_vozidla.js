// Low-poly modely vozidel pro 3D režim (jizda.html).
// Model: předek k místnímu +x, nahoru +y, šířka podél z, počátek uprostřed půdorysu na zemi.
// Pravá strana vozidla (k obrubníku) je místní +z: při rotation.y = h a kurzu na východ míří +z na jih.
// Na typ vozidla tři instancované sítě se společnou maticí instancí:
//   lak (barva instance), detaily (barvy vrcholů: skla, pneumatiky, nárazníky), světla (svítí, jen za šera).
// THREE se předává parametrem (stejná instance jako na stránce), modul sám nic neimportuje.

const SKLO = '#26323f', PNEU = '#1b1c1f', DISK = '#a3a6ab', TMAVA = '#2b2d31', SEDA = '#8b8e94', BILA = '#f0efe9';
const CELNI = '#fff1c4', KONC = '#d8261c', CELNI_DEN = '#dcd9c6', KONC_DEN = '#9c211a', SPZ = '#f4f4f0';
const PRAVA = 1;                                           // strana dveří autobusu (+z = vpravo ve směru jízdy)
const DOSAH_CEDULE = 120, CEDULI = 12, DOSAH_VLAK = 250, CEDULI_VLAK = 6;
const CD_LOW = '#123f73', CD_BODY = '#1f6ab0', CD_BAND = '#e8f0f6', CD_ROOF = '#788088';   // nátěr ČD jako TRAINS ve web/app.html

const barvy = new Map();
function rgb(hex) {                                        // '#rrggbb' -> [r, g, b] 0..1 (bez převodu barevného prostoru)
  let c = barvy.get(hex);
  if (!c) {
    const n = parseInt(String(hex).slice(1), 16);
    c = n >= 0 ? [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255] : [0.6, 0.6, 0.6];
    barvy.set(hex, c);
  }
  return c;
}

// ---------- stavba geometrie (neindexované trojúhelníky, ploché normály) ----------
const sit = () => ({ p: [], n: [], c: [] });
const novy = () => ({ L: sit(), D: sit(), P: sit(), Z: sit() });   // lak, detaily, přední a zadní světla

function troj(s, a, b, c, st, k) {                         // trojúhelník konvexního tělesa se středem st, otočený ven
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const d = Math.hypot(nx, ny, nz);
  if (d < 1e-10) return;
  nx /= d; ny /= d; nz /= d;
  const mx = (a[0] + b[0] + c[0]) / 3 - st[0], my = (a[1] + b[1] + c[1]) / 3 - st[1], mz = (a[2] + b[2] + c[2]) / 3 - st[2];
  if (nx * mx + ny * my + nz * mz < 0) { const t = b; b = c; c = t; nx = -nx; ny = -ny; nz = -nz; }
  s.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  s.n.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
  if (k) { const q = rgb(k); s.c.push(q[0], q[1], q[2], q[0], q[1], q[2], q[0], q[1], q[2]); }
}
function mnoho(s, b, st, k) { for (let i = 1; i < b.length - 1; i++) troj(s, b[0], b[i], b[i + 1], st, k); }

function hranol(s, prof, hw, k, zc = 0) {                  // konvexní boční profil [x, y, zúžení] vytažený do šířky
  const n = prof.length, A = [], B = [];
  let sx = 0, sy = 0;
  for (const [x, y, u = 0] of prof) { A.push([x, y, zc - (hw - u)]); B.push([x, y, zc + (hw - u)]); sx += x; sy += y; }
  const st = [sx / n, sy / n, zc];
  mnoho(s, A, st, k); mnoho(s, B, st, k);
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; mnoho(s, [A[i], A[j], B[j], B[i]], st, k); }
}
function kvadr(s, x0, x1, y0, y1, z0, z1, k) {
  hranol(s, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], Math.abs(z1 - z0) / 2, k, (z0 + z1) / 2);
}
function kvadr2(s, x0, x1, y0, y1, za, zb, k) {            // zrcadlově na obou bocích
  kvadr(s, x0, x1, y0, y1, za, zb, k); kvadr(s, x0, x1, y0, y1, -zb, -za, k);
}
function deska(s, xa, ya, xb, yb, f0, f1, hw, k, t = 0.02) {   // tenká deska (sklo) na šikmé stěně a→b, úsek f0..f1
  const dx = xb - xa, dy = yb - ya, L = Math.hypot(dx, dy), nx = dy / L, ny = -dx / L;
  const x0 = xa + dx * f0, y0 = ya + dy * f0, x1 = xa + dx * f1, y1 = ya + dy * f1;
  hranol(s, [[x0 - nx * 0.01, y0 - ny * 0.01], [x1 - nx * 0.01, y1 - ny * 0.01], [x1 + nx * t, y1 + ny * t], [x0 + nx * t, y0 + ny * t]], hw, k);
}
function valec(s, x, y, zc, r, hw, n, k) {                 // válec s osou z (kolo), jeden vrchol dole
  const A = [], B = [], st = [x, y, zc];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + i * 2 * Math.PI / n, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    A.push([px, py, zc - hw]); B.push([px, py, zc + hw]);
  }
  mnoho(s, A, st, k); mnoho(s, B, st, k);
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; mnoho(s, [A[i], A[j], B[j], B[i]], st, k); }
}
function kola(s, x, zv, r, w, n = 10, disk = DISK) {       // náprava: pneumatiky s vnější hranou na ±zv a disky
  for (const g of [1, -1]) {
    valec(s, x, r, g * (zv - w / 2), r, w / 2, n, PNEU);
    valec(s, x, r, g * (zv - 0.03), r * 0.58, 0.045, 6, disk);
  }
}
function svetla(m, predni, x, y0, y1, za, zb, d = predni ? 1 : -1) {   // pár světel: ve dne matné sklo, v noci svítící kvádr těsně před ním (d: kam míří)
  kvadr2(m.D, x - d * 0.02, x + d * 0.03, y0, y1, za, zb, predni ? CELNI_DEN : KONC_DEN);
  kvadr2(predni ? m.P : m.Z, x - d * 0.02, x + d * 0.045, y0 - 0.005, y1 + 0.005, za - 0.005, zb + 0.005, predni ? CELNI : KONC);
}

// ---------- modely ----------
function osobni(hezci) {                                   // 4,2 × 1,76 × 1,45
  const m = novy(), hw = 0.87;
  hranol(m.L, [[-2.05, 0.28], [2.05, 0.28], [2.05, 0.62], [1.95, 0.74], [0.8, 0.86], [-1.9, 0.88], [-2.05, 0.8]], hw);
  hranol(m.D, [[-1.78, 0.84, 0.04], [0.9, 0.84, 0.04], [0.2, 1.4, 0.17], [-1.38, 1.4, 0.17]], hw, SKLO);   // prosklená kabina
  hranol(m.L, [[-1.42, 1.385, 0.16], [0.26, 1.385, 0.16], [0.2, 1.45, 0.2], [-1.36, 1.45, 0.2]], hw);      // střecha
  hranol(m.L, [[-0.5, 0.85, 0.03], [-0.36, 0.85, 0.03], [-0.36, 1.4, 0.158], [-0.5, 1.4, 0.158]], hw);     // sloupek B
  kvadr2(m.L, 0.62, 0.76, 0.86, 0.97, hw - 0.02, hw + 0.07);                                               // zrcátka
  kvadr(m.D, 1.97, 2.1, 0.24, 0.5, -hw - 0.01, hw + 0.01, TMAVA);                                          // nárazníky
  kvadr(m.D, -2.1, -1.97, 0.24, 0.5, -hw - 0.01, hw + 0.01, TMAVA);
  kvadr(m.D, 2.04, 2.06, 0.52, 0.62, -0.4, 0.4, TMAVA);                                                    // maska
  kvadr(m.D, 2.1, 2.11, 0.3, 0.42, -0.26, 0.26, SPZ);
  kvadr(m.D, -2.11, -2.1, 0.3, 0.42, -0.26, 0.26, SPZ);
  svetla(m, true, 2.05, 0.53, 0.66, 0.48, 0.82);
  svetla(m, false, -2.05, 0.6, 0.76, 0.5, 0.84);
  if (hezci) {                                             // auto hráče: prahy, spáry dveří, kliky, výfuk; kola zvlášť
    kvadr2(m.D, -0.95, 0.95, 0.25, 0.34, hw - 0.03, hw + 0.012, TMAVA);
    for (const x of [0.78, -0.43, -1.42]) kvadr2(m.D, x - 0.008, x + 0.008, 0.36, 0.85, hw - 0.01, hw + 0.004, TMAVA);
    for (const x of [-0.25, -1.24]) kvadr2(m.D, x, x + 0.16, 0.74, 0.77, hw - 0.01, hw + 0.018, TMAVA);
    kvadr(m.D, -2.13, -2.0, 0.22, 0.28, 0.5, 0.58, SEDA);
    kvadr(m.D, -1.0, -0.98, 1.45, 1.62, -0.01, 0.01, TMAVA);                                               // anténa
  } else {
    kola(m.D, 1.3, 0.885, 0.32, 0.22);
    kola(m.D, -1.3, 0.885, 0.32, 0.22);
  }
  return m;
}

function dodavka() {                                       // 5,4 × 2,0 × 2,3
  const m = novy(), hw = 0.98;
  hranol(m.L, [[-2.65, 0.32], [2.6, 0.32], [2.65, 0.9], [2.35, 1.2], [-2.65, 1.2]], hw);
  hranol(m.L, [[-2.65, 1.2], [2.35, 1.2], [1.6, 2.2], [1.4, 2.3], [-2.65, 2.3]], hw);
  deska(m.D, 2.35, 1.2, 1.6, 2.2, 0.07, 0.93, hw - 0.08, SKLO);                                            // čelní sklo
  for (const g of [1, -1]) hranol(m.D, [[1.0, 1.32], [2.12, 1.32], [1.66, 2.0], [1.0, 2.0]], 0.012, SKLO, g * hw);
  kvadr(m.D, -2.66, -2.64, 1.4, 2.0, 0.08, 0.8, SKLO);                                                     // okna zadních dveří
  kvadr(m.D, -2.66, -2.64, 1.4, 2.0, -0.8, -0.08, SKLO);
  kvadr(m.D, 2.55, 2.7, 0.28, 0.62, -hw - 0.01, hw + 0.01, TMAVA);
  kvadr(m.D, -2.7, -2.6, 0.28, 0.55, -hw - 0.01, hw + 0.01, TMAVA);
  kvadr(m.D, 2.63, 2.66, 0.64, 0.84, -0.5, 0.5, TMAVA);
  kvadr2(m.D, 1.95, 2.05, 1.35, 1.6, hw, hw + 0.1, TMAVA);
  svetla(m, true, 2.63, 0.66, 0.86, 0.58, 0.92);
  svetla(m, false, -2.65, 1.0, 1.5, 0.8, 0.96);
  kola(m.D, 1.75, 1.0, 0.36, 0.26);
  kola(m.D, -1.65, 1.0, 0.36, 0.26);
  return m;
}

function nakladni() {                                      // 9 × 2,45 × 3,3; kabina v barvě, skříň světlá
  const m = novy(), hw = 1.2;
  hranol(m.L, [[2.6, 0.55], [4.42, 0.55], [4.45, 1.7], [4.28, 2.82], [4.1, 2.9], [2.6, 2.9]], hw);
  deska(m.D, 4.45, 1.7, 4.28, 2.82, 0.06, 0.9, hw - 0.1, SKLO);
  for (const g of [1, -1]) hranol(m.D, [[3.3, 1.75], [4.4, 1.75], [4.27, 2.6], [3.3, 2.6]], 0.012, SKLO, g * hw);
  kvadr(m.D, 4.3, 4.5, 0.4, 0.85, -hw - 0.01, hw + 0.01, TMAVA);
  kvadr(m.D, 4.43, 4.46, 0.95, 1.55, -0.7, 0.7, TMAVA);
  kvadr2(m.D, 4.3, 4.4, 1.9, 2.5, hw, hw + 0.13, TMAVA);
  kvadr(m.D, -4.4, 2.7, 0.6, 1.05, -0.5, 0.5, TMAVA);                                                      // rám
  kvadr(m.D, -4.5, 2.45, 1.05, 3.3, -1.225, 1.225, '#e6e4dc');                                             // skříň
  kvadr2(m.D, -1.6, 2.4, 0.5, 0.7, 1.12, 1.2, SEDA);                                                       // boční zábrany
  kvadr(m.D, -4.5, -4.35, 0.5, 0.7, -1.15, 1.15, TMAVA);
  kvadr(m.D, -4.51, -4.5, 1.15, 3.2, -0.02, 0.02, SEDA);
  svetla(m, true, 4.5, 0.55, 0.75, 0.75, 1.1);
  svetla(m, false, -4.5, 0.52, 0.68, 0.8, 1.1);
  kola(m.D, 3.45, 1.225, 0.5, 0.3);
  kola(m.D, -2.4, 1.225, 0.5, 0.55);
  return m;
}

function tahac() {                                         // 6,1 × 2,5 × 3,2; za kabinou (x < −0,3) nic nad 1,12 m (návěs)
  const m = novy(), hw = 1.22;
  hranol(m.L, [[0.2, 0.55], [3.0, 0.55], [3.03, 1.7], [2.85, 2.75], [2.6, 2.85], [0.2, 2.85]], hw);
  hranol(m.L, [[0.2, 2.85], [2.6, 2.85], [1.9, 3.2, 0.12], [0.2, 3.2, 0.12]], hw);                         // střešní spoiler
  deska(m.D, 3.03, 1.7, 2.85, 2.75, 0.06, 0.92, hw - 0.1, SKLO);
  for (const g of [1, -1]) hranol(m.D, [[1.9, 1.75], [2.98, 1.75], [2.86, 2.5], [1.9, 2.5]], 0.012, SKLO, g * hw);
  kvadr(m.D, 2.9, 3.05, 0.4, 0.85, -hw - 0.01, hw + 0.01, TMAVA);
  kvadr(m.D, 3.0, 3.04, 0.95, 1.55, -0.7, 0.7, TMAVA);
  kvadr2(m.D, 2.85, 2.95, 1.9, 2.5, hw, hw + 0.13, TMAVA);
  kvadr(m.D, -3.0, 0.3, 0.62, 1.0, -0.48, 0.48, TMAVA);                                                    // rám
  kvadr(m.D, -2.75, -1.85, 1.0, 1.1, -0.45, 0.45, '#3a3c41');                                              // točnice
  kvadr2(m.D, -1.1, 0.1, 0.5, 1.0, 0.75, 1.2, SEDA);                                                       // nádrže
  kvadr2(m.D, -2.5, -1.3, 1.05, 1.1, 0.65, 1.25, TMAVA);                                                   // blatníky
  kvadr(m.D, -0.12, 0.2, 1.0, 2.9, -1.05, -0.8, SEDA);                                                     // výfuk za kabinou
  svetla(m, true, 3.05, 0.55, 0.75, 0.75, 1.1);
  svetla(m, false, -3.0, 0.7, 0.86, 0.28, 0.48);
  kola(m.D, 2.0, 1.25, 0.5, 0.32);
  kola(m.D, -1.9, 1.25, 0.52, 0.6);
  return m;
}

function naves() {                                         // 13,6 × 2,55 × 3,6; kola jen vzadu, předek leží na tahači
  const m = novy(), hw = 1.275;
  kvadr(m.L, -6.8, 6.8, 1.15, 3.6, -hw, hw);
  kvadr(m.D, -6.6, 5.2, 0.95, 1.15, -0.5, 0.5, TMAVA);
  kvadr(m.D, -6.8, -6.68, 0.5, 0.7, -1.2, 1.2, TMAVA);                                                     // zadní zábrana
  kvadr2(m.D, -6.78, -6.7, 0.7, 1.15, 0.6, 0.7, TMAVA);
  kvadr(m.D, -6.81, -6.8, 1.25, 3.5, -0.02, 0.02, SEDA);                                                   // spára dveří
  kvadr2(m.D, 3.3, 3.45, 0.25, 1.15, 0.75, 0.87, SEDA);                                                    // opěrné nohy
  kvadr2(m.D, 3.2, 3.55, 0.2, 0.26, 0.7, 0.92, SEDA);
  kvadr2(m.D, -2.6, 2.8, 0.5, 0.62, 1.2, 1.25, SEDA);                                                      // boční zábrany
  kvadr2(m.D, -2.6, 2.8, 0.75, 0.87, 1.2, 1.25, SEDA);
  svetla(m, false, -6.8, 0.52, 0.68, 0.85, 1.15);
  for (const x of [-3.4, -4.7, -6.0]) kola(m.D, x, hw, 0.5, 0.4);
  return m;
}

function popelar() {                                       // 9,2 × 2,5 × 3,2; bílá kabina, nástavba v barvě (oranžová)
  const m = novy(), hw = 1.2;
  hranol(m.D, [[2.75, 0.55], [4.52, 0.55], [4.55, 1.7], [4.4, 2.7], [4.2, 2.8], [2.75, 2.8]], hw, BILA);
  deska(m.D, 4.55, 1.7, 4.4, 2.7, 0.05, 0.9, hw - 0.1, SKLO);
  for (const g of [1, -1]) hranol(m.D, [[3.4, 1.6], [4.5, 1.6], [4.38, 2.5], [3.4, 2.5]], 0.012, SKLO, g * hw);
  kvadr2(m.D, 3.4, 3.6, 2.8, 2.93, 0.6, 0.85, '#f5a623');                                                  // majáky
  kvadr(m.D, 4.4, 4.6, 0.4, 0.85, -hw - 0.02, hw + 0.02, TMAVA);
  kvadr(m.D, 4.53, 4.56, 0.95, 1.5, -0.7, 0.7, TMAVA);
  kvadr2(m.D, 4.3, 4.4, 1.8, 2.4, hw, hw + 0.13, TMAVA);
  kvadr(m.D, -4.0, 2.8, 0.6, 1.05, -0.5, 0.5, TMAVA);
  hranol(m.L, [[-2.7, 1.05], [2.55, 1.05], [2.55, 2.85], [2.3, 3.1], [-2.7, 3.1]], 1.25);                  // lisovací nástavba
  hranol(m.L, [[-4.3, 0.75], [-2.7, 0.75], [-2.7, 3.2], [-3.5, 3.2], [-4.6, 2.0], [-4.6, 1.1]], 1.25);     // zadní výklopná část
  kvadr2(m.D, -2.4, 2.3, 1.9, 2.1, 1.24, 1.262, BILA);                                                     // bílý pruh
  deska(m.D, -3.5, 3.2, -4.6, 2.0, 0.15, 0.9, 1.0, TMAVA);
  kvadr(m.D, -4.62, -4.5, 0.7, 1.1, -1.0, 1.0, SEDA);                                                      // vyklápěč nádob
  svetla(m, true, 4.6, 0.55, 0.75, 0.75, 1.1);
  svetla(m, false, -4.6, 1.2, 1.5, 1.02, 1.2);
  kola(m.D, 3.55, 1.25, 0.5, 0.32);
  kola(m.D, -0.9, 1.25, 0.5, 0.55);
  kola(m.D, -2.1, 1.25, 0.5, 0.55);
  return m;
}

function traktor() {                                       // 4,3 × 2,3 × 2,8; velká zadní kola
  const m = novy(), RAF = '#e6d28a';
  hranol(m.L, [[0.1, 0.95], [2.05, 0.95], [2.1, 1.45], [1.9, 1.6], [0.1, 1.75]], 0.42);                    // kapota
  kvadr(m.L, -1.55, 0.1, 0.9, 1.4, -0.62, 0.62);
  kvadr(m.D, -1.55, 0.1, 1.4, 2.62, -0.62, 0.62, SKLO);                                                    // kabina
  kvadr(m.L, -1.65, 0.2, 2.62, 2.8, -0.72, 0.72);
  kvadr2(m.L, -1.56, -1.46, 1.4, 2.62, 0.55, 0.635);                                                       // sloupky
  kvadr2(m.L, 0.0, 0.11, 1.4, 2.62, 0.55, 0.635);
  kvadr2(m.L, -1.8, -0.05, 1.71, 1.83, 0.62, 1.15);                                                        // blatníky
  kvadr(m.D, 2.08, 2.12, 1.0, 1.42, -0.29, 0.29, TMAVA);
  kvadr(m.D, 2.05, 2.15, 0.6, 0.95, -0.35, 0.35, SEDA);                                                    // závaží
  kvadr(m.D, -1.3, 2.0, 0.5, 0.95, -0.3, 0.3, TMAVA);
  kvadr(m.D, 1.25, 1.45, 0.42, 0.58, -0.8, 0.8, TMAVA);                                                    // přední náprava
  kvadr(m.D, 0.55, 0.67, 1.7, 2.5, 0.2, 0.32, TMAVA);                                                      // výfuk
  kvadr(m.D, -2.15, -1.5, 0.55, 0.7, -0.1, 0.1, TMAVA);                                                    // závěs
  svetla(m, true, 2.1, 1.2, 1.36, 0.31, 0.41);
  svetla(m, false, -1.8, 1.72, 1.82, 0.8, 1.1);
  kola(m.D, 1.35, 0.95, 0.5, 0.3, 10, RAF);
  kola(m.D, -0.9, 1.15, 0.85, 0.5, 12, RAF);
  return m;
}

function autobus() {                                       // 12 × 2,55 × 3,1; obecný nízkopodlažní linkový vůz, vlastní nátěr
  const m = novy(), B = 1.26, D = m.D;
  hranol(D, [[-6, 0.32], [5.92, 0.32], [6.0, 1.0], [5.9, 2.95], [5.7, 3.02], [-5.9, 3.02], [-6, 2.9]], B, '#ecebe4');
  kvadr2(D, -5.75, 5.8, 1.4, 2.5, B - 0.02, B + 0.012, SKLO);                                              // pás oken
  kvadr2(D, -5.97, 5.95, 1.05, 1.3, B - 0.02, B + 0.01, '#2b74b8');                                        // barevný pruh
  kvadr2(D, -5.97, 5.9, 0.32, 0.62, B - 0.02, B + 0.008, '#c3c5c8');
  for (const [x0, x1] of [[4.2, 5.5], [-0.7, 0.7]]) {                                                      // dveře (vpravo)
    kvadr(D, x0, x1, 0.45, 2.5, PRAVA * (B - 0.01), PRAVA * (B + 0.02), '#1c2530');
    kvadr(D, (x0 + x1) / 2 - 0.03, (x0 + x1) / 2 + 0.03, 0.45, 2.5, PRAVA * (B + 0.01), PRAVA * (B + 0.028), '#454a52');
  }
  deska(D, 6.0, 1.0, 5.9, 2.95, 0.08, 0.75, 1.15, SKLO);                                                   // čelní sklo
  deska(D, 6.0, 1.0, 5.9, 2.95, 0.79, 0.97, 1.15, '#14161a');                                              // pole pro číslo linky
  kvadr(D, 5.9, 6.03, 0.3, 0.55, -1.2, 1.2, TMAVA);
  kvadr(D, -6.04, -5.9, 0.3, 0.5, -1.2, 1.2, TMAVA);
  kvadr(D, -6.02, -5.98, 1.7, 2.5, -1.0, 1.0, SKLO);
  kvadr(D, -6.02, -5.98, 0.6, 1.0, -0.8, 0.8, TMAVA);
  kvadr(D, -3.5, -1.0, 3.02, 3.1, -0.8, 0.8, '#d5d6d4');                                                   // klimatizace
  kvadr(D, 1.5, 3.0, 3.02, 3.1, -0.7, 0.7, '#d5d6d4');
  kvadr2(D, 5.78, 5.9, 1.9, 2.4, B, B + 0.1, TMAVA);
  svetla(m, true, 5.97, 0.62, 0.8, 0.7, 1.1);
  svetla(m, false, -6.0, 1.1, 1.5, 0.95, 1.15);
  kola(D, 3.3, 1.275, 0.48, 0.3);
  kola(D, -3.4, 1.275, 0.48, 0.3);
  return m;
}

// ---------- vlaky (y = 0 je temeno kolejnice; vše v detailech, barva instance se nepoužívá) ----------
function podvozek(s, x) {                                  // dvounápravový podvozek se středem (otočným bodem) v x
  kvadr(s, x - 1.35, x + 1.35, 0.3, 0.75, -0.68, 0.68, '#141517');
  kvadr2(s, x - 1.5, x + 1.5, 0.4, 0.6, 0.86, 0.96, '#1d1f22');
  for (const dx of [-0.95, 0.95]) for (const g of [1, -1]) valec(s, x + dx, 0.46, g * 0.78, 0.46, 0.07, 8, '#2a2c30');
}
function skrin(s, x0, x1, hw, y0, yr, yt, us) {            // skříň vozu: sokl, modrý pás, světlý pás oken, modrý pás, zkosená střecha
  kvadr(s, x0, x1, y0, 1.2, -hw, hw, CD_LOW);
  kvadr(s, x0, x1, 1.2, 1.9, -hw, hw, CD_BODY);
  kvadr(s, x0, x1, 1.9, 3.05, -hw, hw, CD_BAND);
  kvadr(s, x0, x1, 3.05, yr, -hw, hw, CD_BODY);
  hranol(s, [[x0, yr], [x1, yr], [x1, yt, us], [x0, yt, us]], hw, CD_ROOF);
}
function dvere(s, x0, x1, hw, y0) {                        // dveře na obou bocích: šedé křídlo s oknem
  kvadr2(s, x0, x1, y0, 3.0, hw - 0.01, hw + 0.02, '#c9ced3');
  kvadr2(s, x0 + 0.15, x1 - 0.15, 1.95, 2.9, hw, hw + 0.028, SKLO);
}
function celo(m, x, g, y, yh, xh) {                        // světla čela (g = ±1 směr): bílá dole a nahoře uprostřed, červená vně
  svetla(m, true, x, y, y + 0.2, 0.5, 0.78, g);
  svetla(m, false, x, y, y + 0.2, 0.83, 0.99, g);
  kvadr(m.D, xh - 0.1, xh + 0.1, yh, yh + 0.12, -0.12, 0.12, CELNI_DEN);
  kvadr(m.P, xh - 0.11, xh + 0.11, yh - 0.005, yh + 0.125, -0.125, 0.125, CELNI);
}

function vlakKab() {                                       // 21,6 × 2,95 × 3,9; vůz dvoudílné jednotky, kabina na +x, podvozky ±7,3
  const m = novy(), D = m.D, hw = 1.475;
  skrin(D, -10.65, 8.6, hw, 0.5, 3.35, 3.7, 0.35);
  hranol(D, [[8.6, 0.5, 0], [10.2, 0.5, 0.3], [10.8, 1.0, 0.45], [10.8, 1.6, 0.45], [9.6, 3.2, 0.3], [8.6, 3.7, 0.35]], hw, CD_BODY);   // čelo
  deska(D, 10.8, 1.6, 9.6, 3.2, 0.08, 0.76, 0.95, SKLO);                                                   // čelní sklo
  kvadr(D, 9.6, 9.88, 2.88, 3.24, -0.75, 0.75, '#14161a');                                                 // pole pro číslo linky
  kvadr(D, 10.55, 10.8, 0.62, 0.95, -0.2, 0.2, TMAVA);                                                     // spřáhlo
  celo(m, 10.8, 1, 1.15, 3.36, 9.28);
  kvadr2(D, -10.2, 8.3, 2.05, 2.9, hw - 0.02, hw + 0.012, SKLO);                                           // pás oken
  dvere(D, -6.6, -5.2, hw, 0.6); dvere(D, 3.6, 5.0, hw, 0.6);
  kvadr(D, -10.8, -10.65, 0.8, 3.0, -0.65, 0.65, '#1a1c1f');                                               // přechod (rovný konec)
  kvadr(D, -6.0, -1.0, 3.7, 3.9, -0.9, 0.9, '#6a7178');                                                    // střešní agregát
  kvadr(D, -4.5, 4.5, 0.25, 0.5, -1.2, 1.2, '#1d1f22');
  podvozek(D, 7.3); podvozek(D, -7.3);
  return m;
}

function lokomotiva() {                                    // 18 × 3,0 × 4,1; kabiny na obou koncích, podvozky ±5,2, sběrače do 4,45 m
  const m = novy(), D = m.D, hw = 1.5;
  hranol(D, [[-8.85, 0.55], [8.85, 0.55], [8.85, 1.9], [8.3, 3.5], [7.9, 3.75], [-7.9, 3.75], [-8.3, 3.5], [-8.85, 1.9]], hw, CD_BODY);
  kvadr2(D, -8.85, 8.85, 0.55, 1.1, hw - 0.02, hw + 0.01, CD_LOW);
  kvadr2(D, -8.85, 8.85, 1.5, 1.75, hw - 0.02, hw + 0.01, CD_BAND);
  hranol(D, [[-7.9, 3.74], [7.9, 3.74], [7.7, 4.1, 0.3], [-7.7, 4.1, 0.3]], hw - 0.1, CD_ROOF);
  deska(D, 8.85, 1.9, 8.3, 3.5, 0.15, 0.66, 1.25, SKLO);
  deska(D, -8.3, 3.5, -8.85, 1.9, 0.34, 0.85, 1.25, SKLO);
  for (const x of [7.2, -7.9]) kvadr2(D, x, x + 0.7, 2.3, 3.0, hw - 0.02, hw + 0.012, SKLO);               // boční okna kabin
  for (const x of [-2.6, 1.6]) kvadr2(D, x, x + 1.0, 2.5, 3.0, hw - 0.02, hw + 0.012, SKLO);               // okna strojovny
  for (const g of [1, -1]) {
    kvadr2(D, g * 8.85, g * 9.0, 1.0, 1.25, 0.75, 1.0, SEDA);                                              // nárazníky
    celo(m, g * 8.85, g, 1.3, 3.56, g * 8.14);
    const p = g * 5.5;                                                                                     // sběrač (stažený)
    kvadr(D, p - 0.6, p + 0.6, 4.1, 4.16, -0.5, 0.5, TMAVA);
    hranol(D, [[p - g * 0.5, 4.16], [p - g * 0.42, 4.16], [p + g * 0.45, 4.4], [p + g * 0.37, 4.4]], 0.06, TMAVA);
    kvadr(D, p + g * 0.3, p + g * 0.5, 4.39, 4.45, -0.9, 0.9, TMAVA);
  }
  kvadr(D, -3.2, 3.2, 0.25, 0.55, -1.2, 1.2, '#1d1f22');
  podvozek(D, 5.2); podvozek(D, -5.2);
  return m;
}

function vuz() {                                           // 26,4 × 2,9 × 4,0; osobní vůz, podvozky ±9,5
  const m = novy(), D = m.D, hw = 1.45;
  skrin(D, -13.05, 13.05, hw, 0.6, 3.4, 4.0, 0.55);
  kvadr2(D, -11.3, 11.3, 2.05, 2.9, hw - 0.02, hw + 0.012, SKLO);
  dvere(D, -12.6, -11.7, hw, 0.7); dvere(D, 11.7, 12.6, hw, 0.7);
  for (const g of [1, -1]) kvadr(D, g * 13.05, g * 13.2, 0.9, 3.1, -0.65, 0.65, '#1a1c1f');                // přechody
  kvadr(D, -6.5, 6.5, 0.25, 0.6, -1.15, 1.15, '#1d1f22');
  podvozek(D, 9.5); podvozek(D, -9.5);
  return m;
}

function koloHrace() {                                     // kolo auta hráče se středem v počátku (točí se kolem z)
  const s = sit();
  valec(s, 0, 0, 0, 0.32, 0.11, 16, PNEU);
  valec(s, 0, 0, 0, 0.21, 0.118, 5, DISK);                 // pětiúhelník: otáčení je vidět
  valec(s, 0, 0, 0, 0.07, 0.125, 6, TMAVA);
  return s;
}

const MODELY = { car: () => osobni(false), van: dodavka, truck: nakladni, semi: tahac, trailer: naves, garbage: popelar, tractor: traktor, bus: autobus, vlak_kab: vlakKab, lokomotiva, vuz };
// kde je na voze cedule s linkou: [x, y středu, fronta (0 autobusy, 1 vlaky)]
const CEDULE = { bus: [5.965, 2.715, 0], vlak_kab: [9.89, 3.06, 1], lokomotiva: [8.5, 3.2, 1] };

export function vytvorVozidla(THREE, scene, max = 1400) {
  const geom = (s, sBarvou) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(s.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(s.n, 3));
    if (sBarvou) g.setAttribute('color', new THREE.Float32BufferAttribute(s.c, 3));
    return g;
  };
  const spoj = (a, b) => ({ p: a.p.concat(b.p), n: a.n.concat(b.n), c: a.c.concat(b.c) });
  const matLak = new THREE.MeshLambertMaterial();
  const matDet = new THREE.MeshLambertMaterial({ vertexColors: true });
  const matSv = new THREE.MeshBasicMaterial({ vertexColors: true });
  const telesa = [], typy = {}, seznam = [];

  for (const druh in MODELY) {
    const m = MODELY[druh](), t = { n: 0, lak: null, det: null, sv: null, im: null, ic: null, ced: CEDULE[druh] || null };
    t.im = new THREE.InstancedBufferAttribute(new Float32Array(max * 16), 16);      // jedna matice instancí pro všechny sítě typu
    t.im.setUsage(THREE.DynamicDrawUsage);
    const pridejSit = (g, mat) => {
      const im = new THREE.InstancedMesh(g, mat, max);
      im.instanceMatrix = t.im; im.frustumCulled = false; im.count = 0; im.visible = false;
      scene.add(im);
      return im;
    };
    if (m.L.p.length) {
      t.lak = pridejSit(geom(m.L, false), matLak);
      t.ic = new THREE.InstancedBufferAttribute(new Float32Array(max * 3).fill(1), 3);
      t.ic.setUsage(THREE.DynamicDrawUsage);
      t.lak.instanceColor = t.ic;                          // barvy instancí od začátku (shader se sestaví s nimi)
      telesa.push(t.lak);
    }
    t.det = pridejSit(geom(m.D, true), matDet);
    telesa.push(t.det);
    if (m.P.p.length + m.Z.p.length) t.sv = pridejSit(geom(spoj(m.P, m.Z), true), matSv);
    typy[druh] = t; seznam.push(t);
  }

  // ---------- cedule s číslem linky (jen nejbližší autobusy a čela vlaků) ----------
  const maDoc = typeof document !== 'undefined';
  const textury = new Map();
  function textura(linka) {
    let t = textury.get(linka);
    if (t === undefined) {
      t = null;
      if (maDoc) {
        const c = document.createElement('canvas'); c.width = 256; c.height = 64;
        const g = c.getContext('2d');
        g.fillStyle = '#0b0b0c'; g.fillRect(0, 0, 256, 64);
        g.fillStyle = '#ffb000'; g.font = 'bold 54px Arial, Helvetica, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(String(linka), 128, 35, 236);
        t = new THREE.CanvasTexture(c);
        t.anisotropy = 4;
      }
      textury.set(linka, t);
    }
    return t;
  }
  const gCed = new THREE.PlaneGeometry(1.4, 0.35); gCed.rotateY(Math.PI / 2);      // lícem k +x
  const fronta = (pocet, dosah) => {                       // uchazeči o ceduli v tomto snímku a zásoba cedulí
    const f = { n: 0, pocet, r2: dosah * dosah, x: new Float32Array(max), y: new Float32Array(max), z: new Float32Array(max), h: new Float32Array(max),
      l: new Array(max).fill(undefined), blizko: new Int32Array(pocet), vzd: new Float32Array(pocet), site: [] };
    for (let i = 0; i < pocet; i++) {
      const c = new THREE.Mesh(gCed, new THREE.MeshBasicMaterial({ color: maDoc ? 0xffffff : 0x0b0b0c }));
      c.visible = false; scene.add(c); f.site.push(c);
    }
    return f;
  };
  const fronty = [fronta(CEDULI, DOSAH_CEDULE), fronta(CEDULI_VLAK, DOSAH_VLAK)];   // autobusy, vlaky
  const oko = new THREE.Vector3();

  return {
    telesa,
    zacni() { for (let i = 0; i < seznam.length; i++) seznam[i].n = 0; fronty[0].n = 0; fronty[1].n = 0; },
    pridej(druh, x, y, z, h, barva, linka) {
      const t = typy[druh] || typy.car;
      if (t.n >= max) return;
      const i = t.n++, a = t.im.array, o = i * 16, c = Math.cos(h), s = Math.sin(h);
      a[o] = c; a[o + 1] = 0; a[o + 2] = -s; a[o + 3] = 0;
      a[o + 4] = 0; a[o + 5] = 1; a[o + 6] = 0; a[o + 7] = 0;
      a[o + 8] = s; a[o + 9] = 0; a[o + 10] = c; a[o + 11] = 0;
      a[o + 12] = x; a[o + 13] = z; a[o + 14] = -y; a[o + 15] = 1;
      if (t.ic) { const q = rgb(barva), b = t.ic.array, k = i * 3; b[k] = q[0]; b[k + 1] = q[1]; b[k + 2] = q[2]; }
      if (t.ced && linka !== undefined && linka !== null && linka !== '') {   // poloha cedule rovnou ve světě three
        const f = fronty[t.ced[2]];
        if (f.n < max) { const j = f.n++; f.x[j] = x + c * t.ced[0]; f.y[j] = z + t.ced[1]; f.z[j] = -(y + s * t.ced[0]); f.h[j] = h; f.l[j] = linka; }
      }
    },
    dokonci(sviti, kamera) {
      for (let i = 0; i < seznam.length; i++) {
        const t = seznam[i], n = t.n;
        if (t.lak) { t.lak.count = n; t.lak.visible = n > 0; }
        t.det.count = n; t.det.visible = n > 0;
        if (t.sv) { t.sv.count = sviti ? n : 0; t.sv.visible = sviti && n > 0; }
        if (n) {
          t.im.clearUpdateRanges(); t.im.addUpdateRange(0, n * 16); t.im.needsUpdate = true;
          if (t.ic) { t.ic.clearUpdateRanges(); t.ic.addUpdateRange(0, n * 3); t.ic.needsUpdate = true; }
        }
      }
      if (kamera) kamera.getWorldPosition(oko);
      for (let q = 0; q < fronty.length; q++) {
        const f = fronty[q], P = f.pocet, vzd = f.vzd, blizko = f.blizko;
        let nc = 0;
        if (kamera) for (let i = 0; i < f.n; i++) {          // P nejbližších v dosahu (vkládáním do seřazeného pole)
          const dx = f.x[i] - oko.x, dy = f.y[i] - oko.y, dz = f.z[i] - oko.z, d2 = dx * dx + dy * dy + dz * dz;
          if (d2 > f.r2) continue;
          let j;
          if (nc < P) j = nc++; else if (d2 < vzd[P - 1]) j = P - 1; else continue;
          while (j > 0 && vzd[j - 1] > d2) { vzd[j] = vzd[j - 1]; blizko[j] = blizko[j - 1]; j--; }
          vzd[j] = d2; blizko[j] = i;
        }
        for (let k = 0; k < P; k++) {
          const c = f.site[k];
          if (k >= nc) { c.visible = false; continue; }
          const i = blizko[k], tx = textura(f.l[i]), mat = c.material;
          if (mat.map !== tx) { if (!mat.map !== !tx) mat.needsUpdate = true; mat.map = tx; }
          c.position.set(f.x[i], f.y[i], f.z[i]);
          c.rotation.y = f.h[i];
          c.visible = true;
        }
      }
    },
    mojeAuto(barva) {
      const m = osobni(true), g = new THREE.Group();
      const pridejDil = (o, svetlo) => { o.userData.svetlo = svetlo; g.add(o); return o; };
      pridejDil(new THREE.Mesh(geom(m.L, false), new THREE.MeshLambertMaterial({ color: barva })), false);
      pridejDil(new THREE.Mesh(geom(m.D, true), matDet), false);
      const gk = geom(koloHrace(), true);
      for (const x of [1.3, -1.3]) for (const z of [0.775, -0.775]) {
        const k = pridejDil(new THREE.Mesh(gk, matDet), false);
        k.position.set(x, 0.32, z); k.userData.kolo = true;
      }
      pridejDil(new THREE.Mesh(geom(m.P, true), matSv), true);
      pridejDil(new THREE.Mesh(geom(m.Z, true), matSv), true);
      return g;
    },
  };
}
