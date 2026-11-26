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

function tyc(s, xa, ya, xb, yb, t, hw, k, zc = 0) {    // šikmá tyč tloušťky t v bočním profilu (vidlice, výfuk, končetiny)
  const dx = xb - xa, dy = yb - ya, L = Math.hypot(dx, dy) || 1, nx = -dy / L * t / 2, ny = dx / L * t / 2;
  hranol(s, [[xa + nx, ya + ny], [xb + nx, yb + ny], [xb - nx, yb - ny], [xa - nx, ya - ny]], hw, k, zc);
}
function motorka() {                                       // 2,1 × 0,8 × 1,75 i s jezdcem; lak = nádrž, záď, blatník a helma
  const m = novy(), BUNDA = '#2d3138', KALHOTY = '#2a3550', MOTOR = '#3a3c40';
  for (const x of [-0.72, 0.73]) { valec(m.D, x, 0.31, 0, 0.31, 0.06, 12, PNEU); valec(m.D, x, 0.31, 0, 0.19, 0.066, 8, DISK); }
  hranol(m.L, [[-0.12, 0.84], [0.42, 0.88], [0.5, 0.98], [0.38, 1.08], [0.0, 1.07], [-0.15, 0.98]], 0.16);   // nádrž
  hranol(m.L, [[-0.84, 0.9], [-0.45, 0.86], [-0.42, 0.96], [-0.86, 1.0]], 0.09);                             // záď
  tyc(m.L, 0.58, 0.68, 0.9, 0.6, 0.04, 0.07);                                                                // přední blatník
  hranol(m.D, [[-0.55, 0.92], [-0.1, 0.92], [-0.1, 0.99], [-0.5, 1.01]], 0.14, TMAVA);                       // sedlo
  kvadr(m.D, -0.15, 0.32, 0.3, 0.7, -0.15, 0.15, MOTOR);                                                     // motor
  tyc(m.D, 0.12, 0.62, 0.3, 0.82, 0.2, 0.17, SEDA);                                                          // hlava válců
  for (const g of [1, -1]) {
    tyc(m.D, 0.48, 1.0, -0.05, 0.78, 0.07, 0.03, TMAVA, g * 0.12);                                           // rám
    tyc(m.D, -0.72, 0.31, -0.1, 0.45, 0.06, 0.03, TMAVA, g * 0.1);                                           // kyvná vidlice
    tyc(m.D, 0.5, 1.04, 0.73, 0.31, 0.05, 0.025, SEDA, g * 0.09);                                            // přední vidlice
    tyc(m.D, 0.42, 1.12, 0.4, 1.34, 0.02, 0.01, TMAVA, g * 0.3);                                             // držák zrcátka
  }
  tyc(m.D, 0.28, 0.4, -0.2, 0.36, 0.06, 0.03, SEDA, 0.14);                                                   // výfuk
  tyc(m.D, -0.2, 0.4, -0.66, 0.6, 0.11, 0.055, SEDA, 0.2);
  kvadr(m.D, 0.41, 0.45, 1.1, 1.14, -0.37, 0.37, TMAVA);                                                     // řídítka
  kvadr2(m.D, 0.38, 0.42, 1.3, 1.38, 0.25, 0.37, TMAVA);                                                     // zrcátka
  kvadr(m.D, 0.55, 0.66, 0.92, 1.08, -0.09, 0.09, TMAVA);                                                    // pouzdro světla
  kvadr(m.D, -0.88, -0.86, 0.72, 0.85, -0.09, 0.09, SPZ);
  svetla(m, true, 0.66, 0.95, 1.05, 0, 0.065);
  svetla(m, false, -0.86, 0.92, 0.98, 0, 0.06);
  // jezdec: trup v bundě, helma v barvě motorky, ruce na řídítkách, nohy na stupačkách
  hranol(m.D, [[-0.45, 0.95], [-0.2, 0.95], [0.08, 1.45], [-0.14, 1.5]], 0.18, BUNDA);
  const helma = []; for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; helma.push([0.03 + Math.cos(a) * 0.15, 1.63 + Math.sin(a) * 0.15, Math.abs(Math.sin(a)) > 0.9 ? 0.04 : 0]); }
  hranol(m.L, helma, 0.13);
  kvadr(m.D, 0.15, 0.185, 1.58, 1.68, -0.09, 0.09, SKLO);                                                    // hledí
  for (const g of [1, -1]) {
    tyc(m.D, -0.04, 1.42, 0.2, 1.22, 0.09, 0.045, BUNDA, g * 0.25);                                          // paže
    tyc(m.D, 0.2, 1.22, 0.43, 1.12, 0.08, 0.04, BUNDA, g * 0.31);                                            // předloktí
    tyc(m.D, -0.32, 1.0, 0.08, 0.92, 0.15, 0.065, KALHOTY, g * 0.225);                                       // stehno (vně nádrže)
    tyc(m.D, 0.08, 0.92, -0.12, 0.44, 0.12, 0.06, KALHOTY, g * 0.23);                                        // lýtko
  }
  kvadr2(m.D, -0.2, 0.02, 0.36, 0.46, 0.17, 0.28, TMAVA);                                                    // boty
  m.bl = [[0.6, 1.0, 0.16], [-0.8, 0.95, 0.12]];                                                             // blinkry (úzké vozidlo)
  return m;
}

// pid: nátěr PID (Manuál jednotného vzhledu vozidel PID 09/2023, jako mapa BUS_LIV): šedá RAL 7038, červená RAL 3020
// nad koly a nad okny, černý pás oken
function autobus(pid = false) {                            // 12 × 2,55 × 3,1; obecný nízkopodlažní linkový vůz, vlastní nátěr
  const m = novy(), B = 1.26, D = m.D;
  hranol(D, [[-6, 0.32], [5.92, 0.32], [6.0, 1.0], [5.9, 2.95], [5.7, 3.02], [-5.9, 3.02], [-6, 2.9]], B, pid ? '#b5b8b1' : '#ecebe4');
  if (pid) {
    kvadr2(D, -5.85, 5.85, 1.32, 2.6, B - 0.02, B + 0.008, '#1a1b1d');                                    // černý pás oken
    kvadr2(D, -5.9, 5.75, 2.6, 2.95, B - 0.02, B + 0.01, '#cc0605');                                       // červená nad okny
    for (const x of [3.3, -3.4]) kvadr2(D, x - 0.9, x + 0.9, 0.32, 1.32, B - 0.02, B + 0.01, '#cc0605');    // červená nad koly
  }
  kvadr2(D, -5.75, 5.8, 1.4, 2.5, B - 0.02, B + 0.012, SKLO);                                              // pás oken
  if (!pid) kvadr2(D, -5.97, 5.95, 1.05, 1.3, B - 0.02, B + 0.01, '#2b74b8');                              // barevný pruh
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

// motorová / elektrická jednotka: vůz délky L s kabinou na +x (cab2: i na −x), výška h, nátěr lv podle mapy (TRAINS):
// low sokl, body skříň, band světlý pás oken, upper pás nad okny, roof střecha, win sklo, endLow spodek čela
const hexRgb = (a) => '#' + a.map((q) => q.toString(16).padStart(2, '0')).join('');
const LV = {
  cd: { low: CD_LOW, body: CD_BODY, band: CD_BAND, upper: CD_BODY, roof: CD_ROOF, win: SKLO, endLow: CD_BODY },
  cdw: { low: '#1f5fa8', body: '#ecf0f2', band: '#1f5fa8', upper: '#ecf0f2', roof: '#969ca2', win: SKLO, endLow: '#1f5fa8' },
  arriva: { low: hexRgb([36, 146, 198]), body: hexRgb([36, 146, 198]), band: hexRgb([36, 146, 198]), upper: hexRgb([36, 146, 198]), roof: hexRgb([112, 160, 190]), win: hexRgb([52, 58, 68]), endLow: hexRgb([232, 214, 60]) },
  dlb: { low: hexRgb([118, 188, 64]), body: hexRgb([118, 188, 64]), band: hexRgb([238, 160, 42]), upper: hexRgb([44, 62, 150]), roof: hexRgb([138, 146, 158]), win: SKLO, endLow: hexRgb([118, 188, 64]) },
};
function jednotka(L, lv, h = 3.9, cab2 = false) {
  const m = novy(), D = m.D, hw = 1.475, x1 = L / 2, xf = x1 - 2.2, xb = cab2 ? -xf : -x1 + 0.15, k = h / 3.9;
  const yr = 3.35 * k, yt = 3.7 * k;
  kvadr(D, xb, xf, 0.5, 1.2, -hw, hw, lv.low);
  kvadr(D, xb, xf, 1.2, 1.9, -hw, hw, lv.body);
  kvadr(D, xb, xf, 1.9, 3.05 * k, -hw, hw, lv.band);
  kvadr(D, xb, xf, 3.05 * k, yr, -hw, hw, lv.upper);
  hranol(D, [[xb, yr], [xf, yr], [xf, yt, 0.35], [xb, yt, 0.35]], hw, lv.roof);
  const cel = (g) => {                                     // čelo kabiny na straně g (+1 vpředu, −1 vzadu)
    const X = (q) => q.map(([x, y, z = 0]) => [g * x, y, z]);
    hranol(D, X([[xf, 0.5, 0], [x1 - 0.6, 0.5, 0.3], [x1, 1.0, 0.45], [x1, 1.6, 0.45], [x1 - 1.2, 3.2 * k, 0.3], [xf, yt, 0.35]]), hw, lv.body);
    hranol(D, X([[xf - 0.01, 0.49], [x1 - 0.6, 0.49], [x1 + 0.012, 1.02], [xf - 0.01, 1.02]]), hw + 0.008, lv.endLow);   // spodek čela
    deska(D, g * x1, 1.6, g * (x1 - 1.2), 3.2 * k, 0.08, 0.76, 0.95, SKLO);                                 // čelní sklo
    kvadr(D, g > 0 ? x1 - 1.2 : -(x1 - 0.92), g > 0 ? x1 - 0.92 : -(x1 - 1.2), 2.88 * k, 3.24 * k, -0.75, 0.75, '#14161a');   // číslo linky
    kvadr(D, g > 0 ? x1 - 0.25 : -x1, g > 0 ? x1 : -(x1 - 0.25), 0.62, 0.95, -0.2, 0.2, TMAVA);             // spřáhlo
    celo(m, g * x1, g, 1.15, 3.36 * k, g * (x1 - 1.52));
  };
  cel(1); if (cab2) cel(-1); else kvadr(D, -x1, -x1 + 0.15, 0.8, 3.0 * k, -0.65, 0.65, '#1a1c1f');   // přechod (rovný konec)
  kvadr2(D, xb + 0.45, xf - 0.3, 2.05, 2.9 * k, hw - 0.02, hw + 0.012, lv.win);                          // pás oken
  const dv = L > 18 ? [-L * 0.28, L * 0.19] : [-L * 0.1];
  for (const x of dv) dvere(D, x - 0.7, x + 0.7, hw, 0.6);
  kvadr(D, -L * 0.25, -L * 0.05, yt, yt + 0.2, -0.9, 0.9, '#6a7178');                                       // střešní agregát
  kvadr(D, -L * 0.2, L * 0.2, 0.25, 0.5, -1.2, 1.2, '#1d1f22');
  podvozek(D, x1 - 3.5); podvozek(D, -(x1 - 3.5));
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

function koloHrace(r = 0.32, disk = DISK, w = 0.11) {      // kolo auta hráče se středem v počátku (točí se kolem z)
  const s = sit();
  valec(s, 0, 0, 0, r, w, 16, PNEU);
  valec(s, 0, 0, 0, r * 0.66, w + 0.008, 5, disk);         // pětiúhelník: otáčení je vidět
  valec(s, 0, 0, 0, r * 0.22, w + 0.015, 6, TMAVA);
  return s;
}

// ---------- univerzální auto hráče (konfigurátor jizda/garaz.js; volby a kontrola v jizda/sit.js AUTO_VOLBY) ----------
// Karoserie: lak = boční profily [x, y] vytažené do šířky ±hw, sklo a střecha se zúžením u, sloupky [x0, x1],
// kola [x vpředu, x vzadu] a poloměr r, předek xf a záď xr, světla [y0, y1, z0, z1], nárazníky [y0, y1],
// zrcátka [x0, x1, y0, y1], spoiler [x0, x1, y, výška], střecha pro box a rampu [x0, x1, y], extra = díly navíc.
const AUTO_ZAKLAD = { k: 'hatch', b1: '#c0392b', b2: '#f2f2ee', v: 'zadny', kola: 'ocel', vys: 'normal', dopl: [] };
const KAR = {
  hatch: { hw: 0.87, lak: [[[-2.05, 0.28], [2.05, 0.28], [2.05, 0.62], [1.95, 0.74], [0.8, 0.86], [-1.9, 0.88], [-2.05, 0.8]]],
    sklo: [[-1.78, 0.84, 0.04], [0.9, 0.84, 0.04], [0.2, 1.4, 0.17], [-1.38, 1.4, 0.17]],
    strecha: [[-1.42, 1.385, 0.16], [0.26, 1.385, 0.16], [0.2, 1.45, 0.2], [-1.36, 1.45, 0.2]], sloupky: [[-0.5, -0.36]],
    kola: [1.3, -1.3], r: 0.32, xf: 2.05, xr: -2.05, svP: [0.53, 0.66, 0.48, 0.82], svZ: [0.6, 0.76, 0.5, 0.84], naraz: [0.24, 0.5],
    zrc: [0.62, 0.76, 0.86, 0.97], spoiler: [-1.5, -1.2, 1.4, 0.06], strop: [-1.36, 0.2, 1.45] },
  sedan: { hw: 0.88, lak: [[[-2.35, 0.3], [2.35, 0.3], [2.35, 0.6], [2.2, 0.72], [0.95, 0.84], [-1.6, 0.88], [-2.3, 0.86], [-2.35, 0.78]]],
    sklo: [[-1.75, 0.86, 0.05], [1.0, 0.84, 0.05], [0.25, 1.38, 0.17], [-1.0, 1.38, 0.17]],
    strecha: [[-1.05, 1.365, 0.16], [0.3, 1.365, 0.16], [0.24, 1.43, 0.2], [-1.0, 1.43, 0.2]], sloupky: [[-0.45, -0.32]],
    kola: [1.42, -1.42], r: 0.32, xf: 2.35, xr: -2.35, svP: [0.5, 0.62, 0.5, 0.84], svZ: [0.64, 0.78, 0.5, 0.84], naraz: [0.26, 0.5],
    zrc: [0.75, 0.9, 0.84, 0.95], spoiler: [-2.32, -2.02, 0.86, 0.12], strop: [-1.0, 0.24, 1.43] },
  kombi: { hw: 0.88, lak: [[[-2.35, 0.3], [2.35, 0.3], [2.35, 0.6], [2.2, 0.72], [0.95, 0.84], [-2.35, 0.9]]],
    sklo: [[-2.22, 0.88, 0.05], [1.0, 0.84, 0.05], [0.25, 1.4, 0.17], [-2.15, 1.42, 0.17]],
    strecha: [[-2.18, 1.405, 0.16], [0.3, 1.405, 0.16], [0.24, 1.47, 0.2], [-2.13, 1.47, 0.2]], sloupky: [[-0.45, -0.32], [-1.5, -1.38]],
    kola: [1.42, -1.42], r: 0.32, xf: 2.35, xr: -2.35, svP: [0.5, 0.62, 0.5, 0.84], svZ: [0.66, 0.86, 0.55, 0.84], naraz: [0.26, 0.5],
    zrc: [0.75, 0.9, 0.84, 0.95], spoiler: [-2.3, -2.0, 1.44, 0.05], strop: [-2.13, 0.24, 1.47] },
  suv: { hw: 0.93, lak: [[[-2.3, 0.42], [2.3, 0.42], [2.3, 0.86], [2.12, 0.98], [0.95, 1.06], [-2.25, 1.1], [-2.3, 1.02]]],
    sklo: [[-2.15, 1.06, 0.04], [1.0, 1.04, 0.04], [0.45, 1.62, 0.15], [-2.05, 1.64, 0.15]],
    strecha: [[-2.08, 1.625, 0.14], [0.5, 1.625, 0.14], [0.45, 1.7, 0.18], [-2.03, 1.7, 0.18]], sloupky: [[-0.4, -0.26], [-1.45, -1.33]],
    kola: [1.42, -1.42], r: 0.38, xf: 2.3, xr: -2.3, svP: [0.78, 0.9, 0.55, 0.88], svZ: [0.85, 1.02, 0.6, 0.9], naraz: [0.36, 0.62],
    zrc: [0.8, 0.95, 1.06, 1.18], spoiler: [-2.2, -1.95, 1.68, 0.05], strop: [-2.03, 0.45, 1.7],
    extra(m, hw) {                                         // plastové lemy dole a podélníky na střeše
      kvadr2(m.D, -2.2, 2.2, 0.42, 0.55, hw - 0.01, hw + 0.025, TMAVA);
      kvadr2(m.D, -1.85, 0.25, 1.7, 1.76, 0.55, 0.6, SEDA);
    } },
  sport: { hw: 0.93, lak: [[[-2.2, 0.22], [2.2, 0.22], [2.2, 0.5], [1.85, 0.64], [0.5, 0.74], [-1.9, 0.78], [-2.2, 0.72]]],
    sklo: [[-1.35, 0.74, 0.08], [0.55, 0.71, 0.08], [-0.2, 1.12, 0.22], [-1.0, 1.13, 0.22]],
    strecha: [[-1.03, 1.11, 0.21], [-0.15, 1.11, 0.21], [-0.2, 1.16, 0.25], [-0.98, 1.16, 0.25]], sloupky: [],
    kola: [1.35, -1.3], r: 0.3, w: 0.13, xf: 2.2, xr: -2.2, svP: [0.42, 0.51, 0.45, 0.86], svZ: [0.56, 0.67, 0.45, 0.86], naraz: [0.18, 0.36],
    zrc: [0.35, 0.5, 0.72, 0.82], spoiler: [-2.15, -1.85, 0.76, 0.16], strop: [-0.98, -0.2, 1.16],
    extra(m, hw) {                                         // nasávání za dveřmi a difuzor
      kvadr2(m.D, -1.25, -0.8, 0.36, 0.56, hw - 0.01, hw + 0.012, TMAVA);
      kvadr(m.D, -2.24, -2.1, 0.18, 0.3, -0.7, 0.7, TMAVA);
    } },
  pickup: { hw: 0.92, lak: [[[-0.75, 0.42], [2.5, 0.42], [2.5, 0.86], [2.3, 0.98], [1.25, 1.06], [-0.75, 1.07]]],
    sklo: [[-0.68, 1.05, 0.04], [1.25, 1.04, 0.04], [0.65, 1.62, 0.15], [-0.62, 1.64, 0.15]],
    strecha: [[-0.65, 1.625, 0.14], [0.7, 1.625, 0.14], [0.65, 1.7, 0.18], [-0.6, 1.7, 0.18]], sloupky: [],
    kola: [1.65, -1.6], r: 0.37, xf: 2.5, xr: -2.55, svP: [0.78, 0.9, 0.55, 0.86], svZ: [0.76, 1.0, 0.78, 0.9], naraz: [0.36, 0.62],
    zrc: [1.05, 1.2, 1.06, 1.18], spoiler: [-0.7, -0.45, 1.7, 0.05], strop: [-0.6, 0.65, 1.7],
    extra(m, hw, a) {                                      // korba: dno, bočnice a zadní čelo v laku, vnitřek tmavý
      kvadr(m.L, -2.55, -0.75, 0.42, 0.72, -hw, hw, a.b1);
      kvadr2(m.L, -2.55, -0.75, 0.72, 1.07, hw - 0.07, hw, a.b1);
      kvadr(m.L, -2.55, -2.48, 0.72, 1.07, -hw + 0.07, hw - 0.07, a.b1);
      kvadr(m.D, -2.48, -0.75, 0.72, 0.735, -hw + 0.07, hw - 0.07, TMAVA);
      if (a.v === 'bok' || a.v === 'dvoubarevne') kvadr2(m.L, -2.555, -0.75, 0.42, a.v === 'bok' ? 0.5 : 0.7, hw - 0.004, hw + 0.006, a.b2);
    } },
  van: { hw: 0.95, lak: [[[-2.4, 0.32], [2.4, 0.32], [2.4, 0.74], [2.05, 0.95], [-2.4, 0.95]], [[-2.4, 0.95], [2.05, 0.95], [1.15, 1.9], [-2.4, 1.95]]],
    sloupky: [], kola: [1.55, -1.6], r: 0.33, xf: 2.4, xr: -2.4, svP: [0.6, 0.74, 0.55, 0.9], svZ: [0.72, 1.1, 0.8, 0.92], naraz: [0.26, 0.52],
    zrc: [1.75, 1.9, 1.02, 1.16], spoiler: [-2.35, -2.1, 1.9, 0.05], strop: [-2.3, 1.1, 1.95],
    extra(m, hw) {                                         // čelní sklo, boční okna u řidiče, okna zadních dveří
      deska(m.D, 2.05, 0.95, 1.15, 1.9, 0.08, 0.92, hw - 0.08, SKLO);
      for (const g of [1, -1]) hranol(m.D, [[0.55, 1.08], [1.88, 1.08], [1.22, 1.75], [0.55, 1.75]], 0.012, SKLO, g * hw);
      kvadr(m.D, -2.41, -2.39, 1.25, 1.75, 0.08, 0.8, SKLO);
      kvadr(m.D, -2.41, -2.39, 1.25, 1.75, -0.8, -0.08, SKLO);
    } },
};
const DISKY = { ocel: DISK, alu: '#d9dce0', cerna: '#1f2023', zlata: '#c9a227' };

// ---------- hotové modely auta hráče (glTF/GLB ve web/jizda_modely/ -> site/jizda/modely/) ----------
// Kenney Car Kit 3.1 (www.kenney.nl, CC0). V souboru: předek +z, vlevo +x, nahoru +y, kola jako uzly wheel-front-left…
// f: soubor, d: délka ve hře (m), lak: proužek palety colormap.png [sloupec 0–15, řádek 0–3], který se přebarví barvou laku
// (null = model má vlastní barvy, např. policie), sv: přední a zadní světla [y0, y1] jako podíl výšky karoserie,
// n: náhradní karoserie z KAR, dokud se soubor nenačte. Kreslená auta jsou vysoká a široká: výška a šířka se zmenší
// (VYSKA, SIRKA vůči délce), kola se zmenší stejně jako výška, aby zůstala kulatá.
export const HOTOVE = {
  m_sedan: { f: 'sedan', d: 4.5, lak: [13, 1], n: 'sedan' },
  m_sedan_sport: { f: 'sedan-sports', d: 4.5, lak: [13, 1], n: 'sedan' },
  m_hatch_sport: { f: 'hatchback-sports', d: 4.2, lak: [7, 1], n: 'hatch' },
  m_suv: { f: 'suv', d: 4.6, lak: [7, 1], n: 'suv' },
  m_suv_lux: { f: 'suv-luxury', d: 4.8, lak: [9, 1], n: 'suv' },
  m_van: { f: 'van', d: 5.0, lak: [15, 1], n: 'van' },
  m_taxi: { f: 'taxi', d: 4.5, lak: null, n: 'sedan' },
  m_policie: { f: 'police', d: 4.7, lak: null, n: 'sedan' },
  m_zavodni: { f: 'race', d: 4.6, lak: [13, 1], n: 'sport' },
  m_futur: { f: 'race-future', d: 4.6, lak: [15, 1], n: 'sport' },
  m_sanitka: { f: 'ambulance', d: 5.8, lak: null, n: 'van' },
  m_dodavka: { f: 'delivery', d: 6.2, lak: [7, 1], n: 'van' },
  m_nakladak: { f: 'truck', d: 5.8, lak: [7, 1], n: 'pickup' },
  m_hasici: { f: 'firetruck', d: 7.5, lak: null, n: 'van' },
  m_popelar: { f: 'garbage-truck', d: 7.5, lak: [7, 1], n: 'van' },
  m_traktor: { f: 'tractor', d: 3.8, lak: null, n: 'pickup' },
};
const SIRKA = 0.74, VYSKA = 0.8;
const sablony = new Map(), nacitani = new Map();             // načtené šablony a rozběhnutá stahování (klíč z HOTOVE)
function rozsir(prof, d) {                                 // profil o kousek větší (pruhy a dvoubarevný lak těsně nad lakem), bez zúžení
  const cx = prof.reduce((s, p) => s + p[0], 0) / prof.length, cy = prof.reduce((s, p) => s + p[1], 0) / prof.length;
  return prof.map(([x, y]) => { const dx = x - cx, dy = y - cy, l = Math.hypot(dx, dy) || 1; return [x + dx / l * d, y + dy / l * d]; });
}
function orez(prof, ym, dole) {                            // část konvexního profilu pod (dole) nebo nad vodorovnou přímkou y = ym
  const out = [], uvnitr = (p) => (dole ? p[1] <= ym : p[1] >= ym);
  for (let i = 0; i < prof.length; i++) {
    const a = prof[i], b = prof[(i + 1) % prof.length];
    if (uvnitr(a)) out.push([a[0], a[1]]);
    if (uvnitr(a) !== uvnitr(b)) { const t = (ym - a[1]) / (b[1] - a[1]); out.push([a[0] + (b[0] - a[0]) * t, ym]); }
  }
  return out;
}
function posun(s, dy) { for (let i = 1; i < s.p.length; i += 3) s.p[i] += dy; }
function univerzal(a) {
  const B = KAR[a.k] || KAR.hatch, m = novy(), hw = B.hw, c1 = a.b1, c2 = a.b2, dopl = new Set(a.dopl || []);
  m.R = sit();
  const cStrecha = a.v === 'strecha' ? c2 : c1;
  const spodek = B.lak[0], ys = spodek.map((p) => p[1]), y0 = Math.min(...ys), y1 = Math.max(...ys);
  for (const p of B.lak) hranol(m.L, p, hw, c1);
  if (B.sklo) hranol(m.D, B.sklo, hw, SKLO);
  if (B.strecha) hranol(m.L, B.strecha, hw, cStrecha);
  for (const [x0, x1] of B.sloupky) {                      // sloupky mezi okny: od spodku skla po střechu, zúžené jako sklo
    const yb = B.sklo[0][1] + 0.01, yt = B.sklo[2][1], ut = B.sklo[2][2] - 0.012;
    hranol(m.L, [[x0, yb, 0.03], [x1, yb, 0.03], [x1, yt, ut], [x0, yt, ut]], hw, cStrecha);
  }
  // vzor laku
  if (a.v === 'pruhy') for (const zc of [-0.17, 0.17]) {
    for (const p of B.lak) hranol(m.L, rozsir(p, 0.008), 0.065, c2, zc);
    if (B.strecha) hranol(m.L, rozsir(B.strecha, 0.008), 0.065, c2, zc);
  }
  if (a.v === 'bok') { const yb = y0 + (y1 - y0) * 0.55; kvadr2(m.L, B.xr + 0.3, B.xf - 0.35, yb, yb + 0.07, hw - 0.004, hw + 0.01, c2); }
  if (a.v === 'dvoubarevne') hranol(m.L, rozsir(orez(spodek, y0 + (y1 - y0) * 0.45, true), 0.006), hw + 0.006, c2);
  if (a.v === 'strecha' && !B.strecha) { const h = B.lak[B.lak.length - 1], yt = Math.max(...h.map((p) => p[1])); hranol(m.L, rozsir(orez(h, yt - 0.12, false), 0.006), hw + 0.006, c2); }
  // nárazníky, maska, SPZ, světla, zrcátka, prahy, anténa
  kvadr(m.D, B.xf - 0.08, B.xf + 0.05, B.naraz[0], B.naraz[1], -hw - 0.01, hw + 0.01, TMAVA);
  kvadr(m.D, B.xr - 0.05, B.xr + 0.08, B.naraz[0], B.naraz[1], -hw - 0.01, hw + 0.01, TMAVA);
  kvadr(m.D, B.xf - 0.01, B.xf + 0.012, B.svP[0] - 0.02, B.svP[1] + 0.02, -B.svP[2] + 0.06, B.svP[2] - 0.06, TMAVA);
  kvadr(m.D, B.xf + 0.05, B.xf + 0.06, B.naraz[0] + 0.06, B.naraz[0] + 0.18, -0.26, 0.26, SPZ);
  kvadr(m.D, B.xr - 0.06, B.xr - 0.05, B.naraz[0] + 0.06, B.naraz[0] + 0.18, -0.26, 0.26, SPZ);
  svetla(m, true, B.xf, ...B.svP);
  svetla(m, false, B.xr, ...B.svZ);
  kvadr2(m.L, B.zrc[0], B.zrc[1], B.zrc[2], B.zrc[3], hw - 0.02, hw + 0.07, cStrecha);
  kvadr2(m.D, B.kola[1] + 0.45, B.kola[0] - 0.45, y0 - 0.03, y0 + 0.06, hw - 0.03, hw + 0.012, TMAVA);
  B.extra?.(m, hw, a);
  // výfuk (dvojitý: sportovní koncovky po stranách)
  for (const z of dopl.has('vyfuky') ? [-0.45, -0.3, 0.3, 0.45] : [0.54]) kvadr(m.D, B.xr - 0.1, B.xr + 0.05, y0 - 0.06, y0 + 0.02, z - 0.04, z + 0.04, SEDA);
  // doplňky
  const [sx0, sx1, sy0, sh] = B.spoiler, [tx0, tx1, ty] = B.strop, tm = (tx0 + tx1) / 2;
  if (dopl.has('spoiler')) {
    kvadr(m.L, sx0, sx1, sy0 + sh, sy0 + sh + 0.045, -hw + 0.04, hw - 0.04, c2);
    kvadr2(m.D, sx0 + 0.08, sx1 - 0.08, sy0 - 0.01, sy0 + sh, 0.45, 0.52, TMAVA);
  }
  if (dopl.has('box')) kvadr(m.D, Math.max(tx0 + 0.05, tm - 0.8), Math.min(tx1 - 0.05, tm + 0.7), ty, ty + 0.3, -0.42, 0.42, '#30343b');
  if (dopl.has('rampa')) {                                 // světelná rampa nad čelním sklem: ve dne matná, v noci svítí (m.R jde k předním světlům)
    const x = tx1 - 0.08;
    kvadr(m.D, x - 0.14, x, ty, ty + 0.12, -0.6, 0.6, TMAVA);
    kvadr(m.D, x, x + 0.02, ty + 0.025, ty + 0.095, -0.55, 0.55, CELNI_DEN);
    kvadr(m.R, x + 0.005, x + 0.04, ty + 0.02, ty + 0.1, -0.555, 0.555, CELNI);
  }
  // podvozek: zvýšený = karoserie výš a větší kola, snížený = karoserie níž
  const dy = a.vys === 'vysoky' ? 0.12 : a.vys === 'nizky' ? -0.035 : 0, r = B.r + (a.vys === 'vysoky' ? 0.04 : 0);
  if (dy) for (const s of [m.L, m.D, m.P, m.Z, m.R]) posun(s, dy);
  return { m, kola: { x: B.kola, z: hw - 0.095, r, w: B.w || 0.11, disk: a.kola === 'barva' ? c2 : DISKY[a.kola] || DISK } };
}

const MODELY = { car: () => osobni(false), van: dodavka, truck: nakladni, semi: tahac, trailer: naves, garbage: popelar, tractor: traktor, moto: motorka, bus: () => autobus(false),
  bus_pid: () => autobus(true), vlak_kab: vlakKab, lokomotiva, vuz,
  j_shark: () => jednotka(21.6, LV.cd, 3.9), j_panter: () => jednotka(26.2, LV.cd, 4.2), j_nova: () => jednotka(14, LV.cd, 3.8),
  j_810: () => jednotka(13.97, LV.cdw, 3.7, true), j_arriva: () => jednotka(23.2, LV.arriva, 3.85), j_dlb: () => jednotka(24.8, LV.dlb, 3.55, true) };
// kde je na voze cedule s linkou: [x, y středu, fronta (0 autobusy, 1 vlaky)]
const CEDULE = { bus: [5.965, 2.715, 0], bus_pid: [5.965, 2.715, 0], vlak_kab: [9.89, 3.06, 1], lokomotiva: [8.5, 3.2, 1],
  j_shark: [21.6 / 2 - 0.91, 3.06, 1], j_panter: [26.2 / 2 - 0.91, 3.06 * 4.2 / 3.9, 1], j_nova: [7 - 0.91, 3.06 * 3.8 / 3.9, 1],
  j_810: [13.97 / 2 - 0.91, 3.06 * 3.7 / 3.9, 1], j_arriva: [11.6 - 0.91, 3.06 * 3.85 / 3.9, 1], j_dlb: [12.4 - 0.91, 3.06 * 3.55 / 3.9, 1] };

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
  // brzdová světla a blinkry: vlastní instance (svítí i ve dne), poloha z modelu (zadní světla, rohy u předních a zadních)
  const matBrzda = new THREE.MeshBasicMaterial({ color: 0xff2414, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const matBlinkr = new THREE.MeshBasicMaterial({ color: 0xffa31a });
  const gBlinkr = new THREE.BoxGeometry(0.13, 0.1, 0.13);
  const meze = (sit_) => {
    const a = sit_.p; if (!a.length) return null;
    const m = { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9, z: 0 };
    for (let i = 0; i < a.length; i += 3) { m.x0 = Math.min(m.x0, a[i]); m.x1 = Math.max(m.x1, a[i]); m.y0 = Math.min(m.y0, a[i + 1]); m.y1 = Math.max(m.y1, a[i + 1]); m.z = Math.max(m.z, Math.abs(a[i + 2])); }
    return m;
  };
  const instance = (g, mat, n) => {
    const im = new THREE.InstancedMesh(g, mat, n);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; im.count = 0; im.visible = false; scene.add(im);
    return im;
  };

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
    const mz = meze(m.Z), mp = meze(m.P), ml = meze(m.L);
    t.nb = 0; t.nl = 0;
    if (mz) t.brz = instance(geom(m.Z, false), matBrzda, max);
    const zadni = mz || ml, predni = mp || ml;
    if (zadni && predni) {                                   // blinkry: přední roh, zadní roh (na straně ±z)
      t.bl = instance(gBlinkr, matBlinkr, max * 2);
      t.blBody = m.bl || [[predni.x1 - 0.02, (predni.y0 + predni.y1) / 2, Math.max(predni.z, 0.6)], [zadni.x0 + 0.02, (zadni.y0 + zadni.y1) / 2 + 0.02, Math.max(zadni.z, 0.6)]];
    }
    typy[druh] = t; seznam.push(t);
  }

  // ---------- hotové modely (Kenney, CC0) pro nejbližší auta v provozu ----------
  // Model má ~2 000 trojúhelníků, proto jen do DOSAH_M od hráče a nejvýš MAX_M aut; dál zůstávají jednoduché karoserie.
  // Varianta podle semínka auta (stejné auto = stejný model). Lak: proužek palety se v shaderu přebarví barvou instance.
  const VARIANTY = {
    car: [['m_sedan', 30], ['m_hatch_sport', 22], ['m_suv', 22], ['m_suv_lux', 10], ['m_sedan_sport', 6], ['m_nakladak', 6], ['m_taxi', 4]],
    van: [['m_van', 6], ['m_dodavka', 4]], garbage: [['m_popelar', 1]], tractor: [['m_traktor', 1]],
  };
  for (const v of Object.values(VARIANTY)) { const s_ = v.reduce((a, [, w]) => a + w, 0); let c_ = 0; for (const q of v) { c_ += q[1] / s_; q[2] = c_; } }
  const DOSAH_M = 110, MAX_M = 220;
  const modelTypy = new Map();                               // klíč HOTOVE -> typ (jako typy[druh]) | null během načítání
  let okoX = 0, okoY = 0, nM = 0, priTelese = null;
  function typModelu(k) {
    if (modelTypy.has(k)) return modelTypy.get(k);
    modelTypy.set(k, null);
    if (typeof document !== 'undefined') nactiModel(k).then((sb) => { if (sb) modelTypy.set(k, postavTyp(sb)); });
    return null;
  }
  function postavTyp(sb) {
    const H = sb.H, p = [], nn = [], uv = [];
    let map = null;
    for (const k of sb.kusy) {
      let g = k.g.index ? k.g.toNonIndexed() : k.g.clone();
      if (k.kolo) g.translate(k.poz.x, k.poz.y, k.poz.z);
      const P = g.attributes.position.array, N = g.attributes.normal?.array, U = g.attributes.uv?.array;
      for (let i = 0; i < P.length / 3; i++) {
        p.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
        if (N) nn.push(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]); else nn.push(0, 1, 0);
        if (U) uv.push(U[i * 2], U[i * 2 + 1]); else uv.push(0, 0);
      }
      if (!map && k.mat.map) map = k.mat.map;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nn, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    if (map) map.colorSpace = THREE.NoColorSpace;            // paleta bez převodu, stejně jako barvy ostatních aut
    // průměrný jas proužku laku v paletě: přebarvení zachová stínování proužku (jas / průměr × barva laku)
    let ref = 0.6;
    if (map && H.lak && map.image) {
      const im = map.image, cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height;
      const c2 = cv.getContext('2d'); c2.drawImage(im, 0, 0);
      const w = im.width / 16, h = im.height / 4, d = c2.getImageData(Math.round(H.lak[0] * w), Math.round(H.lak[1] * h), Math.round(w), Math.round(h)).data;
      let sum = 0; for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      ref = Math.max(0.05, sum / (d.length / 4) / 255);
    }
    const lak = H.lak ? new THREE.Vector4(H.lak[0] / 16, (H.lak[0] + 1) / 16, H.lak[1] / 4, (H.lak[1] + 1) / 4) : new THREE.Vector4(-1, -1, -1, -1);
    const mat = new THREE.MeshLambertMaterial({ map, color: map ? 0xffffff : 0xcccccc });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uLak = { value: lak }; sh.uniforms.uRef = { value: ref };
      sh.fragmentShader = 'uniform vec4 uLak; uniform float uRef;\n' + sh.fragmentShader.replace('#include <color_fragment>', `
#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
#ifdef USE_MAP
  if (vMapUv.x >= uLak.x && vMapUv.x < uLak.y && vMapUv.y >= uLak.z && vMapUv.y < uLak.w)
    diffuseColor.rgb = vColor * (dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)) / uRef);
#endif
#endif`);
    };
    mat.customProgramCacheKey = () => 'auto_lak_' + (H.lak ? H.lak.join('_') : 'x');
    const t = { n: 0, lak: null, det: null, sv: null, im: null, ic: null, ced: null, nb: 0, nl: 0, model: true };
    t.im = new THREE.InstancedBufferAttribute(new Float32Array(MAX_M * 16), 16); t.im.setUsage(THREE.DynamicDrawUsage);
    t.ic = new THREE.InstancedBufferAttribute(new Float32Array(MAX_M * 3).fill(1), 3); t.ic.setUsage(THREE.DynamicDrawUsage);
    const sitM = (geo_, m_) => { const im = new THREE.InstancedMesh(geo_, m_, MAX_M); im.instanceMatrix = t.im; im.frustumCulled = false; im.count = 0; im.visible = false; scene.add(im); return im; };
    t.det = sitM(g, mat); t.det.instanceColor = t.ic;
    const m = { P: sit(), Z: sit(), R: sit(), D: sit() }, [p0, p1] = H.sv || [0.4, 0.5], hw = sb.hw;
    svetla(m, true, sb.xf - 0.03, sb.vyska * p0, sb.vyska * p1, hw * 0.5, hw * 0.85);
    svetla(m, false, sb.xr + 0.03, sb.vyska * p0, sb.vyska * p1, hw * 0.55, hw * 0.85);
    t.sv = sitM(geom(spoj(m.P, m.Z), true), matSv);
    const mz = meze(m.Z), mp = meze(m.P);
    t.brz = instance(geom(m.Z, false), matBrzda, MAX_M);
    t.bl = instance(gBlinkr, matBlinkr, MAX_M * 4);
    t.blBody = [[mp.x1 - 0.02, (mp.y0 + mp.y1) / 2, Math.max(mp.z, 0.6)], [mz.x0 + 0.02, (mz.y0 + mz.y1) / 2 + 0.02, Math.max(mz.z, 0.6)]];
    t.max = MAX_M;
    telesa.push(t.det); if (priTelese) priTelese(t.det);
    seznam.push(t);
    return t;
  }
  function vyberModel(druh, x, y, sd) {                     // typ s hotovým modelem pro auto blízko hráče, jinak null
    const v = VARIANTY[druh];
    if (!v || sd === undefined || nM >= MAX_M || Math.abs(x - okoX) > DOSAH_M || Math.abs(y - okoY) > DOSAH_M) return null;
    const u = ((sd >>> 8) % 10007) / 10007;
    let k = v[v.length - 1][0]; for (const q of v) if (u < q[2]) { k = q[0]; break; }
    const t = typModelu(k);
    if (t && t.n < MAX_M) { nM++; return t; }
    return null;
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
  let blik = true;

  return {
    telesa,
    zacni(ox, oy) { if (ox !== undefined) { okoX = ox; okoY = oy; } nM = 0; for (let i = 0; i < seznam.length; i++) { seznam[i].n = 0; seznam[i].nb = 0; seznam[i].nl = 0; } fronty[0].n = 0; fronty[1].n = 0; blik = Math.floor(performance.now() / 380) % 2 === 0; },
    set priTelese(f) { priTelese = f; },                    // nová tělesa (hotové modely se načítají později) -> f(mesh)
    // fl: 1 brzdí, 2 blinkr vlevo, 4 blinkr vpravo (obojí = výstražná světla); blinkr svítí jen v sudé fázi (blik)
    // sd: semínko auta v provozu (jizda/doprava.js); blízko hráče pak dostane hotový model
    pridej(druh, x, y, z, h, barva, linka, fl, sd) {
      const t = vyberModel(druh, x, y, sd) || typy[druh] || typy.car;
      if (t.n >= (t.max || max)) return;
      const i = t.n++, a = t.im.array, o = i * 16, c = Math.cos(h), s = Math.sin(h);
      a[o] = c; a[o + 1] = 0; a[o + 2] = -s; a[o + 3] = 0;
      a[o + 4] = 0; a[o + 5] = 1; a[o + 6] = 0; a[o + 7] = 0;
      a[o + 8] = s; a[o + 9] = 0; a[o + 10] = c; a[o + 11] = 0;
      a[o + 12] = x; a[o + 13] = z; a[o + 14] = -y; a[o + 15] = 1;
      if (fl) {
        if (fl & 1 && t.brz) { const b = t.brz.instanceMatrix.array, ob = t.nb++ * 16; for (let k = 0; k < 16; k++) b[ob + k] = a[o + k]; }
        if (fl & 6 && t.bl && blik) {
          const b = t.bl.instanceMatrix.array;
          for (const strana of [fl & 2 ? -1 : 0, fl & 4 ? 1 : 0]) {
            if (!strana) continue;                           // +z = vpravo
            for (const [lx, ly, lz] of t.blBody) {
              const ob = t.nl++ * 16, zz = lz * strana;
              for (let k = 0; k < 12; k++) b[ob + k] = a[o + k];
              b[ob + 12] = x + c * lx + s * zz; b[ob + 13] = z + ly; b[ob + 14] = -y - s * lx + c * zz; b[ob + 15] = 1;
            }
          }
        }
      }
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
        for (const [im, k] of [[t.brz, t.nb], [t.bl, t.nl]]) if (im) { im.count = k; im.visible = k > 0; if (k) im.instanceMatrix.needsUpdate = true; }
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
    // auto hráče: univerzální auto z konfigurátoru (a = { k, b1, b2, v, kola, vys, dopl }, jizda/sit.js AUTO_VOLBY)
    // nebo jen barva (výchozí červený hatchback). Díly: [0] lak (vlastní materiál), detaily, 4 kola (userData.kolo),
    // světla (userData.svetlo), brzdová světla (userData.brzda), blinkry (userData.blinkr = ±1).
    mojeAuto(a) { return autoHrace(a); },
    autoHrace,
    prestavAuto(g, a) { uvolniAuto(g); naplnAuto(g, a); },   // stejná skupina (poloha, viditelnost zůstanou), nové díly
    uvolniAuto,
    HOTOVE,
    nactiModel,                                              // (k) -> Promise: hotový model z HOTOVE je připravený
    pripraveno,                                              // (a) -> false, dokud se auto staví z náhradní karoserie
  };

  // ---------- hotové modely (HOTOVE): načtou se až při prvním použití, do té doby náhradní karoserie ----------
  function nactiModel(k) {                                   // Promise se šablonou (null = není hotový model nebo se nenačetl)
    const H = HOTOVE[k];
    if (!H) return Promise.resolve(null);
    if (sablony.has(k)) return Promise.resolve(sablony.get(k));
    if (!nacitani.has(k)) nacitani.set(k, (async () => {
      const { GLTFLoader } = await import('./three/loaders/GLTFLoader.js');
      const gltf = await new GLTFLoader().loadAsync(new URL(`./modely/${H.f}.glb`, import.meta.url).href);
      const t = sablona(gltf.scene, H);
      sablony.set(k, t);
      return t;
    })().catch((e) => { console.warn('Model auta se nenačetl:', k, e); nacitani.delete(k); return null; }));
    return nacitani.get(k);
  }
  function pripraveno(a) { return !a || typeof a !== 'object' || !HOTOVE[a.k] || sablony.has(a.k); }
  // tvary jednou na model, převedené do souřadnic hry: předek +x, vpravo +z, počátek uprostřed na zemi
  function sablona(koren, H) {
    koren.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(koren), s = H.d / (box.max.z - box.min.z);
    const R = new THREE.Matrix4().makeRotationY(Math.PI / 2);
    const M = new THREE.Matrix4().makeScale(s * SIRKA, s * VYSKA, s).premultiply(R);                 // karoserie
    const MK = new THREE.Matrix4().makeScale(s * SIRKA, s * VYSKA, s * VYSKA).premultiply(R);       // kolo kolem svého středu
    const kusy = [];
    koren.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry.clone().applyMatrix4(o.matrixWorld), kolo = /^wheel-(front|back)-(left|right)/.test(o.name), poz = new THREE.Vector3();
      if (kolo) { g.computeBoundingBox(); g.boundingBox.getCenter(poz); g.translate(-poz.x, -poz.y, -poz.z); g.applyMatrix4(MK); poz.applyMatrix4(M); }
      else g.applyMatrix4(M);
      g.deleteAttribute('tangent'); g.userData.sdilena = true;
      kusy.push({ g, mat: o.material, kolo, poz });
    });
    const b = new THREE.Box3(), v = new THREE.Box3();
    for (const k of kusy) { k.g.computeBoundingBox(); v.copy(k.g.boundingBox).translate(k.poz); b.union(v); }
    const sx = (b.min.x + b.max.x) / 2, sz = (b.min.z + b.max.z) / 2;
    for (const k of kusy) {
      if (k.kolo) k.poz.sub(new THREE.Vector3(sx, b.min.y, sz)); else k.g.translate(-sx, -b.min.y, -sz);
      k.g.computeBoundingSphere();
    }
    const kola = kusy.filter((k) => k.kolo);
    return { H, kusy, xf: b.max.x - sx, xr: b.min.x - sx, vyska: b.max.y - b.min.y, hw: (b.max.z - b.min.z) / 2,
      r: kola.length ? Math.max(...kola.map((k) => k.poz.y)) : 0.35 };
  }
  // paleta s jedním proužkem v barvě laku (zachová přechod světla a stínu proužku)
  function prebarvi(tx, [sl, rd], hex) {
    const img = tx.image, cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    const c = cv.getContext('2d'); c.drawImage(img, 0, 0);
    const w = img.width / 16, h = img.height / 4, x0 = Math.round(sl * w), y0 = Math.round(rd * h);
    const d = c.getImageData(x0, y0, Math.round(w), Math.round(h)), p = d.data, [R, G, B] = rgb(hex);
    const jas = (i) => 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
    let ref = 0; for (let i = 0; i < p.length; i += 4) ref += jas(i);
    ref = ref / (p.length / 4) || 1;
    for (let i = 0; i < p.length; i += 4) {
      const q = jas(i) / ref;
      p[i] = Math.min(255, R * 255 * q); p[i + 1] = Math.min(255, G * 255 * q); p[i + 2] = Math.min(255, B * 255 * q);
    }
    c.putImageData(d, x0, y0);
    const t = new THREE.CanvasTexture(cv);
    for (const k of ['flipY', 'wrapS', 'wrapT', 'magFilter', 'minFilter', 'generateMipmaps']) t[k] = tx[k];
    t.colorSpace = THREE.NoColorSpace; t.userData.vlastni = true;
    return t;
  }
  function naplnModel(g, a, t) {                             // díly z šablony; vrací světla { m.P, m.Z, m.R } pro společnou část
    const H = t.H, mats = new Map(), dy = a.vys === 'vysoky' ? 0.12 : a.vys === 'nizky' ? -0.035 : 0;
    const material = (src) => {                              // materiál na auto (vlastní kvůli přebarvené paletě)
      let m = mats.get(src);
      if (!m) {
        let map = src.map || null;
        if (map) map.colorSpace = THREE.NoColorSpace;      // barvy palety bez převodu jako vertex colors ostatních aut
        if (map && H.lak) map = prebarvi(map, H.lak, a.b1);
        m = new THREE.MeshLambertMaterial({ map, color: map ? 0xffffff : src.color?.getHex() ?? 0xcccccc });
        mats.set(src, m);
      }
      return m;
    };
    for (const k of t.kusy) {
      const o = new THREE.Mesh(k.g, material(k.mat));
      o.position.copy(k.poz);
      if (k.kolo) o.userData.kolo = true; else o.position.y += dy;
      o.userData.svetlo = false;
      g.add(o);
    }
    // světla jen na noc (ve dne jsou nakreslená v textuře) a brzdová světla: na čele a zádi v podílu výšky
    const m = { P: sit(), Z: sit(), R: sit(), D: sit() }, [p0, p1] = H.sv || [0.4, 0.5], hw = t.hw;
    svetla(m, true, t.xf - 0.03, t.vyska * p0 + dy, t.vyska * p1 + dy, hw * 0.5, hw * 0.85);
    svetla(m, false, t.xr + 0.03, t.vyska * p0 + dy, t.vyska * p1 + dy, hw * 0.55, hw * 0.85);
    return m;
  }

  function naplnAuto(g, a) {
    if (typeof a === 'string' || !a) a = { ...AUTO_ZAKLAD, b1: a || AUTO_ZAKLAD.b1 };
    g.userData.auto = a;
    const pridejDil = (o, svetlo) => { o.userData.svetlo = svetlo; g.add(o); return o; };
    let u;
    if (HOTOVE[a.k] && sablony.get(a.k)) u = { m: naplnModel(g, a, sablony.get(a.k)) };
    else {
      if (HOTOVE[a.k]) { nactiModel(a.k); a = { ...a, k: HOTOVE[a.k].n }; }   // náhrada; volající přestaví auto po načtení (nactiModel)
      u = univerzal(a);
      pridejDil(new THREE.Mesh(geom(u.m.L, true), new THREE.MeshLambertMaterial({ vertexColors: true })), false);
      pridejDil(new THREE.Mesh(geom(u.m.D, true), matDet), false);
      const gk = geom(koloHrace(u.kola.r, u.kola.disk, u.kola.w), true);
      for (const x of u.kola.x) for (const z of [u.kola.z, -u.kola.z]) {
        const k = pridejDil(new THREE.Mesh(gk, matDet), false);
        k.position.set(x, u.kola.r, z); k.userData.kolo = true;
      }
    }
    pridejDil(new THREE.Mesh(geom(spoj(u.m.P, u.m.R), true), matSv), true);   // přední světla i rampa na střeše
    pridejDil(new THREE.Mesh(geom(u.m.Z, true), matSv), true);
    // brzdová světla a blinkry hráče (jizda.html je zapíná podle brzdy a odbočování)
    const br = new THREE.Mesh(geom(u.m.Z, false), matBrzda); br.userData.brzda = true; br.visible = false; g.add(br);
    const mz = meze(u.m.Z), mp = meze(u.m.P);
    if (mz && mp) for (const [lx, ly, lz] of [[mp.x1 - 0.02, (mp.y0 + mp.y1) / 2, mp.z], [mz.x0 + 0.02, (mz.y0 + mz.y1) / 2 + 0.02, mz.z]]) for (const strana of [-1, 1]) {
      const b = new THREE.Mesh(gBlinkr, matBlinkr); b.position.set(lx, ly, lz * strana); b.userData.blinkr = strana; b.visible = false; g.add(b);
    }
  }
  function autoHrace(a) { const g = new THREE.Group(); naplnAuto(g, a); return g; }
  function uvolniAuto(g) {                                   // vlastní tvary a lak pryč, sdílené materiály a blinkr zůstanou
    const sdilene = new Set([matDet, matSv, matBrzda, matBlinkr]), geo = new Set(), mat = new Set();
    for (const o of g.children) {
      if (o.geometry && o.geometry !== gBlinkr && !o.geometry.userData.sdilena) geo.add(o.geometry);   // tvary hotových modelů sdílí šablona
      for (const m of [].concat(o.material || [])) if (!sdilene.has(m)) mat.add(m);
    }
    for (const x of geo) x.dispose();
    for (const x of mat) { if (x.map?.userData.vlastni) x.map.dispose(); x.dispose(); }
    g.clear();
  }
}
