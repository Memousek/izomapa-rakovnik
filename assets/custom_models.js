// Rakovník: vlastní modely a rekvizity (načítá render.html i 3D jízda)

export const landmarks = {

  // ---------- obchody, pumpy, myčka (dominanty.json "lm": "znacka", "mp": {"t": typ, "z": značka, ...}) ----------
  // typ obchod: budova kreslí obecný kód (barvy a plochá střecha ze spec), model přidá pás, ceduli s logem, prosklení,
  // stříšku nad vchodem, totem a vlajky; průčelí = stěna obrácená k bodu "face" (parkoviště).
  // typ pumpa: stříška (třída roof, styl 12) dostane lem v barvách sítě, ostrůvky se stojany a cenový totem (mp.totem_ll).
  // typ mycka / vysavace: samoobslužná myčka (boxy se žlutými sloupy, technická místnost), stříška s vysavači.
  znacka(b, ctx) { return znacka(b, ctx); },
  // kruhový objezd: dlážděný lem, travnatý ostrůvek s keři, stožár se čtyřmi rameny, šipky Z3 proti vjezdům ("only": 1)
  kruhac(b, ctx) { return kruhac(b, ctx); },
  // sloup s hodinami na autobusovém nádraží (dominanty.json, "lm": "hodiny_sloup")
  hodiny_sloup(b, { X, frameAt, pushBox }) {
    const n = b.p.length, x = b.p.reduce((a, q) => a + q[0], 0) / n, y = b.p.reduce((a, q) => a + q[1], 0) / n;
    const f = frameAt(x, y, 0, Math.PI / 4), g = b.g, tmava = [0.20, 0.24, 0.26], bila = [0.95, 0.95, 0.92];
    pushBox(X, f, -0.35, 0.35, -0.35, 0.35, g - 0.3, g + 0.4, [0.55, 0.54, 0.52], [0, 1, 1, 0]);   // patka
    pushBox(X, f, -0.12, 0.12, -0.12, 0.12, g + 0.4, g + 3.3, tmava, [0, 1, 0, 0]);                 // sloup
    pushBox(X, f, -0.48, 0.48, -0.48, 0.48, g + 3.3, g + 4.2, tmava, [0, 1, 0, 0]);                 // skříň hodin
    for (const [s0, s1, t0, t1] of [[-0.4, 0.4, -0.5, -0.47], [-0.4, 0.4, 0.47, 0.5], [-0.5, -0.47, -0.4, 0.4], [0.47, 0.5, -0.4, 0.4]])
      pushBox(X, f, s0, s1, t0, t1, g + 3.38, g + 4.12, bila, [0, 1, 0, 0]);                         // ciferníky
    pushBox(X, f, -0.2, 0.2, -0.2, 0.2, g + 4.2, g + 4.4, tmava, [0, 1, 1, 0]);
    return true;
  },
  // Mariánský sloup na Husově náměstí (1749, Kryštof Knopf, 12 m): stupně, podstavec se čtyřmi konzolami se sochami
  // sv. Václava, Víta, Prokopa a Vojtěcha, sloup s hlavicí, nahoře Panna Maria s Ježíškem (zlatá svatozář).
  // Pískovec, natočený podél náměstí. dominanty.json "lm": "mariansky_sloup", "only": 1
  mariansky_sloup(b, { X, frameAt, pushBox }) {
    const n = b.p.length, x = b.p.reduce((a, q) => a + q[0], 0) / n, y = b.p.reduce((a, q) => a + q[1], 0) / n;
    const f = frameAt(x, y, 0, -0.16), g = b.g, W = [0, 1, 1, 0], W2 = [0, 1, 0, 0];
    const kamen = [0.74, 0.68, 0.56], svetly = [0.82, 0.77, 0.66], tmavy = [0.58, 0.53, 0.44], socha = [0.86, 0.83, 0.76], zlato = [0.95, 0.78, 0.32];
    // tři stupně
    pushBox(X, f, -2.6, 2.6, -2.6, 2.6, g - 0.4, g + 0.25, tmavy, W);
    pushBox(X, f, -2.2, 2.2, -2.2, 2.2, g + 0.25, g + 0.5, kamen, W);
    pushBox(X, f, -1.8, 1.8, -1.8, 1.8, g + 0.5, g + 0.75, kamen, W);
    // podstavec: sokl, tělo s vpadlinami, římsa
    pushBox(X, f, -1.2, 1.2, -1.2, 1.2, g + 0.75, g + 1.1, svetly, W);
    pushBox(X, f, -1.0, 1.0, -1.0, 1.0, g + 1.1, g + 2.9, kamen, W2);
    for (const [s0, s1, t0, t1] of [[-0.7, 0.7, -1.04, -1.0], [-0.7, 0.7, 1.0, 1.04], [-1.04, -1.0, -0.7, 0.7], [1.0, 1.04, -0.7, 0.7]])
      pushBox(X, f, s0, s1, t0, t1, g + 1.4, g + 2.6, tmavy, W2);                                     // vpadlé pole (nápis)
    pushBox(X, f, -1.25, 1.25, -1.25, 1.25, g + 2.9, g + 3.25, svetly, W);
    // čtyři konzoly v rozích se sochami světců (stojící postava: plášť, hlava, svatozář)
    for (const [cs, ct] of [[-1.15, -1.15], [1.15, -1.15], [1.15, 1.15], [-1.15, 1.15]]) {
      pushBox(X, f, cs - 0.45, cs + 0.45, ct - 0.45, ct + 0.45, g + 2.2, g + 3.25, kamen, W);
      pushBox(X, f, cs - 0.5, cs + 0.5, ct - 0.5, ct + 0.5, g + 3.25, g + 3.4, svetly, W);
      pushBox(X, f, cs - 0.28, cs + 0.28, ct - 0.24, ct + 0.24, g + 3.4, g + 4.4, socha, W2);           // plášť
      pushBox(X, f, cs - 0.2, cs + 0.2, ct - 0.17, ct + 0.17, g + 4.4, g + 4.95, socha, W2);            // ramena
      pushBox(X, f, cs - 0.12, cs + 0.12, ct - 0.12, ct + 0.12, g + 4.95, g + 5.25, socha, W2);         // hlava
      pushBox(X, f, cs - 0.03, cs + 0.03, ct - 0.03, ct + 0.03, g + 4.0, g + 5.5, tmavy, W2);           // berla, kopí
    }
    // sloup: patka, dřík (osmiboký z kvádrů), hlavice
    pushBox(X, f, -0.6, 0.6, -0.6, 0.6, g + 3.25, g + 3.7, svetly, W);
    for (const r of [0, Math.PI / 4]) {
      const fr = frameAt(x, y, 0, -0.16 + r);
      pushBox(X, fr, -0.34, 0.34, -0.34, 0.34, g + 3.7, g + 10.4, kamen, W2);
    }
    pushBox(X, f, -0.5, 0.5, -0.5, 0.5, g + 10.4, g + 10.75, svetly, W);                              // hlavice
    pushBox(X, f, -0.62, 0.62, -0.62, 0.62, g + 10.75, g + 10.95, kamen, W);
    // Panna Maria s Ježíškem a svatozář
    pushBox(X, f, -0.22, 0.22, -0.22, 0.22, g + 10.95, g + 11.15, tmavy, W);                          // oblak, měsíc
    pushBox(X, f, -0.24, 0.24, -0.2, 0.2, g + 11.15, g + 12.0, socha, W2);                              // šat
    pushBox(X, f, -0.18, 0.18, -0.15, 0.15, g + 12.0, g + 12.45, socha, W2);                            // ramena
    pushBox(X, f, 0.12, 0.34, -0.12, 0.08, g + 11.95, g + 12.25, socha, W2);                            // Ježíšek v náručí
    pushBox(X, f, -0.1, 0.1, -0.1, 0.1, g + 12.45, g + 12.72, socha, W2);                               // hlava
    pushBox(X, f, -0.2, 0.2, -0.04, 0.04, g + 12.72, g + 12.78, zlato, W2);                             // svatozář s hvězdami
    pushBox(X, f, -0.04, 0.04, -0.2, 0.2, g + 12.72, g + 12.78, zlato, W2);
    return true;
  },
  // obloukový hangár na letišti: valená klenba nad nízkými zdmi, osa podél delší strany (dominanty.json, "lm": "hangar_oblouk")
  hangar_oblouk(b, { X, R, pushQuad, pushTri, C255, tv }) {
    const p = b.p; if (p.length < 4) return false;
    const e1 = [p[1][0] - p[0][0], p[1][1] - p[0][1]], e2 = [p[2][0] - p[1][0], p[2][1] - p[1][1]];
    const [ax, cr] = Math.hypot(...e1) >= Math.hypot(...e2) ? [e1, e2] : [e2, e1];
    const cx = p.reduce((a, q) => a + q[0], 0) / p.length, cy = p.reduce((a, q) => a + q[1], 0) / p.length;
    const L = Math.hypot(...ax), Wd = Math.hypot(...cr), u = [ax[0] / L, ax[1] / L], v = [cr[0] / Wd, cr[1] / Wd];
    const rise = Math.min(9, Wd * 0.32), z0 = b.e, N = 12, rc = C255(b.rc), wc = C255(b.wc);
    const pt = (s, t, z) => [cx + u[0] * s + v[0] * t, cy + u[1] * s + v[1] * t, z];
    const ven = (a, b_, c, d, col, buf) => {                 // čtyřúhelník s normálou ven od osy klenby
      const A = tv(...a), B = tv(...b_), C = tv(...c), mx = (a[0] + c[0]) / 2 - cx, my = (a[1] + c[1]) / 2 - cy, mz = (a[2] + c[2]) / 2 - z0 + 0.01;
      const n = [(B[1] - A[1]) * (C[2] - A[2]) - (B[2] - A[2]) * (C[1] - A[1]), (B[2] - A[2]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[2] - A[2]), (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0])];
      const out = n[0] * mx + n[1] * mz + n[2] * -my;          // three: (x, z, -y)
      if (out >= 0) pushQuad(buf, A, B, C, tv(...d), col, [0, 1, 1, 0]); else pushQuad(buf, tv(...d), C, B, A, col, [0, 1, 1, 0]);
    };
    for (let k = 0; k < N; k++) {
      const a0 = Math.PI * k / N, a1 = Math.PI * (k + 1) / N, t0 = Math.cos(a0) * Wd / 2, t1 = Math.cos(a1) * Wd / 2;
      const h0 = z0 + Math.sin(a0) * rise, h1 = z0 + Math.sin(a1) * rise, sh = 0.82 + 0.18 * Math.cos((a0 + a1) / 2 - 0.6);
      ven(pt(-L / 2, t0, h0), pt(L / 2, t0, h0), pt(L / 2, t1, h1), pt(-L / 2, t1, h1), rc.map((c) => c * sh), R);
      for (const s of [-L / 2, L / 2])                          // čela klenby (vrata)
        pushTri(X, tv(...pt(s, 0, z0)), tv(...pt(s, t0, h0)), tv(...pt(s, t1, h1)), wc, [0, 1, 1, 0]), pushTri(X, tv(...pt(s, 0, z0)), tv(...pt(s, t1, h1)), tv(...pt(s, t0, h0)), wc, [0, 1, 1, 0]);
    }
    return true;
  },
};

// rekvizity ze scene.props (assets/custom_prep.py): záhony, letadla, kluzák, přívěsy, značky dráhy
export function buildProps(P, { make, inst, F, id, pushBox }) {
  const N = [0, 1, 1, 0];
  if (P.zahon?.length) inst(make((B) => {
    pushBox(B, F, -1.3, 1.3, -1.3, 1.3, -0.2, 0.35, [0.62, 0.30, 0.22], N);   // cihlová obruba
    pushBox(B, F, -1.1, 1.1, -1.1, 1.1, 0.35, 0.45, [0.36, 0.28, 0.20], N);
    pushBox(B, F, -0.9, 0.9, -0.9, 0.9, 0.45, 0.75, [0.30, 0.48, 0.22], N);
    pushBox(B, F, -0.6, 0.6, -0.6, 0.6, 0.75, 0.9, [0.95, 0.70, 0.16], N);    // žlutooranžové květy
  }), P.zahon, id);
  const bila = [0.94, 0.94, 0.92], cervena = [0.78, 0.18, 0.15], seda = [0.25, 0.26, 0.28];
  if (P.letadlo?.length) inst(make((B) => {                 // malé hornoplošné letadlo (~8 m, rozpětí 11 m)
    pushBox(B, F, -3.6, 2.6, -0.55, 0.55, 0.5, 1.7, bila, N);           // trup
    pushBox(B, F, 2.6, 3.4, -0.45, 0.45, 0.65, 1.45, cervena, N);       // motor
    pushBox(B, F, 3.4, 3.5, -0.9, 0.9, 0.9, 1.2, seda, N);              // vrtule
    pushBox(B, F, 0.4, 1.2, -0.5, 0.5, 1.7, 2.1, [0.32, 0.42, 0.52], N); // kabina
    pushBox(B, F, -0.2, 1.3, -5.5, 5.5, 2.1, 2.25, bila, N);            // křídlo
    pushBox(B, F, -0.2, 1.3, -5.5, -4.6, 2.1, 2.26, cervena, N); pushBox(B, F, -0.2, 1.3, 4.6, 5.5, 2.1, 2.26, cervena, N);
    pushBox(B, F, -3.6, -2.7, -1.7, 1.7, 1.25, 1.35, bila, N);          // výškovka
    pushBox(B, F, -3.6, -2.8, -0.07, 0.07, 1.35, 2.7, cervena, N);      // směrovka
    for (const [s, t] of [[1.6, -1.1], [1.6, 1.1], [2.8, 0]]) pushBox(B, F, s - 0.2, s + 0.2, t - 0.1, t + 0.1, 0, 0.55, seda, N);
  }), P.letadlo, id);
  if (P.kluzak?.length) inst(make((B) => {                  // větroň: štíhlý trup, rozpětí 15 m
    pushBox(B, F, -4.2, 2.8, -0.35, 0.35, 0.15, 0.95, bila, N);
    pushBox(B, F, 1.0, 2.4, -0.3, 0.3, 0.95, 1.2, [0.32, 0.42, 0.52], N);
    pushBox(B, F, -0.1, 0.8, -7.5, 7.5, 0.75, 0.85, bila, N);
    pushBox(B, F, -4.2, -3.6, -1.4, 1.4, 1.85, 1.92, bila, N);
    pushBox(B, F, -4.2, -3.5, -0.06, 0.06, 0.95, 1.9, bila, N);
  }), P.kluzak, id);
  if (P.prives?.length) inst(make((B) => {                  // uzavřený přívěs na kluzák
    pushBox(B, F, -4.6, 4.6, -1.05, 1.05, 0.55, 1.95, bila, N);
    pushBox(B, F, 4.6, 5.6, -0.08, 0.08, 0.45, 0.6, seda, N);
    for (const t of [-1.0, 1.0]) pushBox(B, F, -0.4, 0.4, t - 0.12, t + 0.12, 0, 0.6, seda, N);
  }), P.prives, id);
  if (P.znacka?.length) inst(make((B) => pushBox(B, F, -1.5, 1.5, -0.4, 0.4, 0, 0.35, bila, N)), P.znacka, id);   // značka okraje dráhy
  // chmelnice (assets/custom_prep.py): dřevěné sloupy 7 m, dráty mezi nimi; révy podle období (render?season=…):
  // jaro nízké výhonky, léto zelená stěna až k drátům s hlávkami, podzim a zima po sklizni jen konstrukce
  const SEZ = new URLSearchParams(location.search).get('season') || 'autumn';
  if (P.chmel_sloup?.length) inst(make((B) => {
    pushBox(B, F, -0.09, 0.09, -0.09, 0.09, -0.2, 7.0, [0.42, 0.34, 0.25], N);
  }), P.chmel_sloup, id);
  if (P.chmel_rada?.length) inst(make((B) => {
    pushBox(B, F, -5, 5, -0.05, 0.05, 6.88, 6.98, [0.30, 0.31, 0.33], N);                               // nosný drát
    if (SEZ === 'summer') {                                                                           // zelená stěna rév, nahoře světlejší hlávky
      pushBox(B, F, -4.75, 4.75, -0.32, 0.32, 0.0, 5.4, [0.20, 0.44, 0.16], N);
      pushBox(B, F, -4.75, 4.75, -0.42, 0.42, 5.4, 6.85, [0.46, 0.66, 0.28], N);
    } else if (SEZ === 'spring') {
      for (let k = -4; k <= 4; k += 1.6) pushBox(B, F, k - 0.12, k + 0.12, -0.12, 0.12, 0.0, 1.6, [0.36, 0.58, 0.24], N);   // mladé výhonky na drátcích
    }
  }), P.chmel_rada, id);
}

// ======================= obchody a pumpy =======================
const SEZONA = new URLSearchParams(typeof location !== 'undefined' ? location.search : '').get('season') || 'autumn';
const NE = [0, 1, 1, 0], SV = [1, 1, 0, 0], SKLO_SV = [0.55, 1, 0, 0];
const H = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
const BILA = H(0xf2f2ee), SEDA = H(0x8e9196), TMAVA = H(0x2a2c30), SKLO = H(0x3d5566);
// logo = obdélníky na ceduli [s0, s1, z0, z1] v podílech plochy cedule, barva
const ZNACKY = {
  albert: { cedule: BILA, sw: 9, sh: 2.4, logo: [[0.1, 0.9, 0.3, 0.75, H(0x1f4e9c)], [0.05, 0.14, 0.55, 0.9, H(0x63b32e)]], sipka: H(0x50555b),
    sklo: [0.38, 0.62, 3.0], vchod: H(0x6b7075), pylon: { cedule: BILA, logo: [[0.1, 0.9, 0.45, 0.8, H(0x1f4e9c)], [0.1, 0.9, 0.12, 0.34, H(0x1f4e9c)], [0.35, 0.6, 0.82, 0.95, H(0x63b32e)]], w: 3.6, h: 8, v: 0.9 } },
  jysk: { cedule: H(0x143c8c), sw: 6.5, sh: 2.2, logo: [[0.12, 0.88, 0.3, 0.7, BILA]], sklo: [0.1, 0.75, 3.2], vchod: SEDA,
    vlajky: { n: 3, c: H(0x143c8c) } },
  kaufland: { cedule: H(0xe10915), sw: 7, sh: 3, logo: [[0.32, 0.68, 0.18, 0.82, BILA], [0.42, 0.58, 0.34, 0.66, H(0xe10915)]], pas: { c: H(0xe10915), h: 0.8 },
    sklo: [0.3, 0.7, 3.4], vchod: SEDA },
  tesco: { cedule: BILA, sw: 9, sh: 2.2, logo: [[0.1, 0.9, 0.42, 0.85, H(0x00539f)], [0.1, 0.9, 0.12, 0.28, H(0xee1c2e)]], pas: { c: H(0x00539f), h: 0.5 },
    sklo: [0.3, 0.7, 3.4], vchod: SEDA },
  lidl: { cedule: H(0x0050aa), sw: 3.2, sh: 3.2, logo: [[0.12, 0.88, 0.12, 0.88, H(0xfff000)], [0.25, 0.75, 0.3, 0.7, H(0x0050aa)], [0.3, 0.7, 0.18, 0.24, H(0xe60a14)]],
    sklo: [0.05, 0.6, 3.6], vchod: SEDA, sz: 0.25 },
  penny: { cedule: H(0xcd1316), sw: 6, sh: 2, logo: [[0.12, 0.8, 0.3, 0.7, BILA], [0.82, 0.92, 0.55, 0.85, H(0xffd500)]], sklo: [0.15, 0.55, 3.2], vchod: SEDA, sz: 0.3 },
  billa: { cedule: H(0xffe500), sw: 6, sh: 2, logo: [[0.12, 0.88, 0.25, 0.75, H(0xe2001a)]], sklo: [0.2, 0.6, 3.2], vchod: SEDA },
  // obchodní park: řada cedulí jednotlivých prodejen (barvy jejich značek), nad nimi pás
  stopshop: { obchody: [H(0x0a3d91), H(0xd8232a), H(0xe30613), H(0x1d1d1b), H(0xf39200), H(0x00519e)], pas: { c: H(0x5b5f64), h: 0.9 }, sklo: [0.04, 0.96, 3.2],
    pylon: { cedule: H(0xe2001a), logo: [[0.1, 0.9, 0.55, 0.85, BILA], [0.1, 0.9, 0.25, 0.45, BILA]], w: 2.6, h: 9 } },
  park: { obchody: [H(0x1d1d1b), H(0xf7a600), H(0x005ca9)], pas: { c: H(0x6d7177), h: 0.7 }, sklo: [0.05, 0.95, 3.0] },
  mercedes: { sklo: [0.08, 0.7, 0], hvezda: 1, vlajky: { n: 3, c: H(0x1b1c1e) }, cedule: H(0x4a4d52), sw: 10, sh: 1.0, logo: [[0.05, 0.95, 0.25, 0.75, H(0xd8dadc)]] },
  // pumpy: lem stříšky (c), pás (p, podíl výšky lemu), totem (t)
  orlen: { lem: BILA, lemPas: H(0xe30a17), totem: H(0xe30a17), totemLogo: BILA, obchodPas: H(0xe30a17), stojan: H(0xe30a17) },
  eurooil: { lem: H(0x00843d), lemPas: H(0xffd200), totem: H(0x00843d), totemLogo: H(0xffd200), obchodPas: H(0x00843d), stojan: H(0x00843d) },
  prim: { lem: BILA, lemPas: H(0x0b4ea2), totem: H(0x0b4ea2), totemLogo: BILA, obchodPas: H(0x0b4ea2), stojan: H(0xd52b1e) },
  tankono: { lem: H(0xffd000), lemPas: H(0xf2b800), totem: H(0xffd000), totemLogo: H(0x1d1d1b), obchodPas: H(0xffd000), stojan: H(0xffd000) },   // žlutá (podle uživatele)
};

// hrany půdorysu: délka, úhel, střed a vnější normála (prep dává obrys proti směru hodinových ručiček)
function hrany(p) {
  let A = 0; for (let i = 0; i < p.length; i++) { const a = p[i], c = p[(i + 1) % p.length]; A += a[0] * c[1] - c[0] * a[1]; }
  const sg = A >= 0 ? 1 : -1;
  return p.map((a, i) => {
    const c = p[(i + 1) % p.length], dx = c[0] - a[0], dy = c[1] - a[1], L = Math.hypot(dx, dy) || 1;
    return { a, c, L, ang: Math.atan2(dy, dx), m: [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2], n: [sg * dy / L, -sg * dx / L], sg };
  });
}
// průčelí: dlouhá stěna obrácená k bodu fp (parkoviště); bez bodu nejdelší
function pruceli(E, fp) {
  const sk = (e) => { if (!fp) return e.L; const vx = fp[0] - e.m[0], vy = fp[1] - e.m[1], d = Math.hypot(vx, vy) || 1; return e.L * Math.max(0.05, (e.n[0] * vx + e.n[1] * vy) / d) ** 2; };
  return E.reduce((a, e) => (sk(e) > sk(a) ? e : a));
}
// rám na stěně: s podél (0..L), t ven ze stěny (+), z výška
const ramStena = (e, frameAt) => {                          // otočením o 180° (ne zrcadlením) zůstane rám pravotočivý
  if (e.sg < 0) return frameAt(e.a[0], e.a[1], 0, e.ang);
  const f = frameAt(e.c[0], e.c[1], 0, e.ang + Math.PI); return (s, t, z) => f(e.L - s, t, z);
};
function boxS(X, pushBox, F, s0, s1, t0, t1, z0, z1, col, aw = NE) {     // kvádr v rámu stěny (t ven)
  pushBox(X, F, Math.min(s0, s1), Math.max(s0, s1), Math.min(t0, t1), Math.max(t0, t1), z0, z1, col, aw);
}
function cedule(X, pushBox, F, sc, zc, w, h, c, logo, hloubka = 0.3, aw = SV) {   // deska s logem na stěně
  boxS(X, pushBox, F, sc - w / 2, sc + w / 2, 0.02, hloubka, zc - h / 2, zc + h / 2, c, aw);
  for (const [a0, a1, b0, b1, lc] of logo || [])
    boxS(X, pushBox, F, sc - w / 2 + a0 * w, sc - w / 2 + a1 * w, hloubka, hloubka + 0.06, zc - h / 2 + b0 * h, zc - h / 2 + b1 * h, lc, aw);
}
function pylon(X, pushBox, frameAt, x, y, g, ang, P) {         // reklamní pylon u silnice: dvě desky s logem do V (P.v = úhel rozevření), každá na sloupu
  const w = P.w, h = P.h, rozev = P.v ?? 0;
  const desky = rozev ? [ang + rozev / 2, ang + Math.PI - rozev / 2] : [ang];
  for (const a of desky) {
    const f = frameAt(x, y, g, a), s0 = rozev ? 0 : -w / 2, s1 = rozev ? w : w / 2, sc = (s0 + s1) / 2;
    pushBox(X, f, sc - 0.13, sc + 0.13, -0.13, 0.13, -0.3, h - 2.4, SEDA, NE);
    pushBox(X, f, s0, s1, -0.15, 0.15, h - 2.6, h, P.cedule, SV);
    for (const sg of [-1, 1]) for (const [a0, a1, b0, b1, lc] of P.logo || [])
      pushBox(X, f, s0 + a0 * w, s0 + a1 * w, sg > 0 ? 0.15 : -0.19, sg > 0 ? 0.19 : -0.15, h - 2.6 + b0 * 2.6, h - 2.6 + b1 * 2.6, lc, SV);
  }
}
function vlajky(X, pushBox, frameAt, e, g, V) {               // stožáry s vlajkami před průčelím
  const F = frameAt(e.m[0] + e.n[0] * 6, e.m[1] + e.n[1] * 6, g, e.ang);
  for (let k = 0; k < V.n; k++) {
    const s = (k - (V.n - 1) / 2) * 3 - e.L * 0.3;
    pushBox(X, F, s - 0.06, s + 0.06, -0.06, 0.06, 0, 8, BILA, NE);
    pushBox(X, F, s + 0.06, s + 0.16, -0.04, 0.04, 3.2, 7.6, V.c, NE);    // svislá vlajka (beachflag)
  }
}

function znacka(b, { X, R, frameAt, pushBox, pushQuad, tv, C255 }) {
  const mp = b.mp || {}, Z = ZNACKY[mp.z] || {}, t = mp.t || 'obchod';
  if (!b.p || b.p.length < 3) return false;
  const E = hrany(b.p), g = b.g, e_ = b.e;
  if (t === 'pumpa') return pumpa(b, mp, Z, E, { X, frameAt, pushBox });
  if (t === 'mycka') return mycka(b, mp, E, { X, frameAt, pushBox });
  if (t === 'vysavace') return vysavace(b, E, { X, frameAt, pushBox });
  if (t === 'technika') return technika(b, E, { X, frameAt, pushBox });
  const pr = pruceli(E, b.fp), F = ramStena(pr, frameAt), L = pr.L, vys = e_ - g;
  // pás pod atikou kolem celé budovy (u pumpy barva sítě)
  const pas = Z.pas || (Z.obchodPas ? { c: Z.obchodPas, h: Math.min(0.9, vys * 0.28) } : null);
  if (pas) for (const e of E) { const Fe = ramStena(e, frameAt); boxS(X, pushBox, Fe, -0.03, e.L + 0.03, 0, 0.1, e_ - pas.h, e_ + 0.12, pas.c, pas === Z.pas && !Z.obchodPas ? NE : SV); }
  // prosklení průčelí (v noci svítí)
  if (Z.sklo) {
    const [a0, a1, hs] = Z.sklo, h1 = hs ? Math.min(g + hs, e_ - 0.6) : e_ - 0.9;
    boxS(X, pushBox, F, L * a0, L * a1, 0, 0.06, g + 0.15, h1, SKLO, SKLO_SV);
    for (let s = L * a0; s <= L * a1 + 0.01; s += 2.4) boxS(X, pushBox, F, s - 0.05, s + 0.05, 0.06, 0.1, g + 0.15, h1, SEDA, NE);   // rámy
  }
  // šipka (Albert): šedý klín přes celé průčelí u jednoho rohu
  if (Z.sipka) {
    const s0 = L * 0.06, w = Math.min(3.2, L * 0.08), d = Math.min(4, L * 0.1), zt = e_ - 0.2, zm = g + vys * 0.5, zb = g + 0.3, tt = 0.07;
    const q = (a, b_, c, d_) => pushQuad(X, F(...a), F(...b_), F(...c), F(...d_), Z.sipka, NE);
    q([s0, tt, zt], [s0 + d, tt, zm], [s0 + d + w, tt, zm], [s0 + w, tt, zt]);
    q([s0 + d, tt, zm], [s0, tt, zb], [s0 + w, tt, zb], [s0 + d + w, tt, zm]);
  }
  // řada cedulí obchodního parku
  if (Z.obchody) {
    const n = Z.obchody.length, w = L / n;
    Z.obchody.forEach((c, k) => cedule(X, pushBox, F, w * (k + 0.5), e_ - 1.4, Math.min(w * 0.6, 6), 1.3, c, [[0.15, 0.85, 0.32, 0.68, BILA]]));
  }
  // hlavní cedule nad vchodem
  if (Z.cedule && !Z.obchody) {
    const sc = L * (Z.sz ?? 0.5), w = Math.min(Z.sw, L * 0.5), h = Math.min(Z.sh, vys * 0.55);
    cedule(X, pushBox, F, sc, Math.min(e_ - h / 2 - 0.3, g + vys * 0.72 + h / 2), w, h, Z.cedule, Z.logo);
  }
  // stříška nad vchodem
  if (Z.vchod) {
    const sc = Z.sklo ? L * (Z.sklo[0] + Z.sklo[1]) / 2 : L / 2, w = Math.min(8, L * 0.25), zc = g + Math.min(3.4, vys * 0.7);
    boxS(X, pushBox, F, sc - w / 2, sc + w / 2, 0, 2.6, zc, zc + 0.35, Z.vchod, NE);
    for (const s of [sc - w / 2 + 0.3, sc + w / 2 - 0.3]) boxS(X, pushBox, F, s - 0.12, s + 0.12, 2.3, 2.54, g, zc, SEDA, NE);
  }
  // Mercedes: hvězda na sloupu u rohu průčelí
  if (Z.hvezda) {
    const s0 = L * 0.88, f = (s, tt, z) => F(s0 + s, 0.8 + tt, z), r = 1.25, zc = e_ + 3.4, st = [0.86, 0.88, 0.9];
    boxS(X, pushBox, f, -0.08, 0.08, -0.08, 0.08, e_, zc - r, SEDA, NE);
    for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; boxS(X, pushBox, f, Math.cos(a) * r - 0.13, Math.cos(a) * r + 0.13, -0.06, 0.06, zc + Math.sin(a) * r - 0.13, zc + Math.sin(a) * r + 0.13, st, SV); }
    for (const a of [Math.PI / 2, Math.PI / 2 + 2.094, Math.PI / 2 + 4.189])
      for (let k = 1; k < 5; k++) { const q = k / 5 * r; boxS(X, pushBox, f, Math.cos(a) * q - 0.08, Math.cos(a) * q + 0.08, -0.05, 0.05, zc + Math.sin(a) * q - 0.08, zc + Math.sin(a) * q + 0.08, st, SV); }
  }
  if (Z.vlajky) vlajky(X, pushBox, frameAt, pr, g, Z.vlajky);
  if (Z.pylon && mp.pylon_ll) pylon(X, pushBox, frameAt, mp.pylon_ll[0], mp.pylon_ll[1], g, (mp.pylon_a || 0) * Math.PI / 180, Z.pylon);
  return true;
}

function pumpa(b, mp, Z, E, { X, frameAt, pushBox }) {
  const g = b.g, e_ = b.e, hl = 1.0;
  for (const e of E) {                                      // lem stříšky: bílý rám, pás v barvě sítě (kromě rohů)
    const Fe = ramStena(e, frameAt);
    boxS(X, pushBox, Fe, -0.12, e.L + 0.12, 0, 0.14, e_ - hl + 0.1, e_ + 0.15, Z.lem || BILA, NE);
    if (e.L > 3) boxS(X, pushBox, Fe, Math.min(1.4, e.L * 0.15), e.L - Math.min(1.4, e.L * 0.15), 0.14, 0.18, e_ - hl * 0.75, e_ + 0.05, Z.lemPas || H(0xe30a17), SV);
  }
  // ostrůvky se stojany podél delší osy stříšky
  const ax = E.reduce((a, e) => (e.L > a.L ? e : a)), cx = b.p.reduce((s, q) => s + q[0], 0) / b.p.length, cy = b.p.reduce((s, q) => s + q[1], 0) / b.p.length;
  const kr = E.reduce((a, e) => (Math.abs(Math.sin(e.ang - ax.ang)) > 0.7 && e.L > a ? e.L : a), 0) || 8;
  const n = mp.ostruvky || Math.max(1, Math.min(3, Math.round(kr / 6)));
  for (let k = 0; k < n; k++) {
    const tt = (k - (n - 1) / 2) * (kr / n), f = frameAt(cx, cy, g, ax.ang);
    pushBox(X, f, -ax.L * 0.3, ax.L * 0.3, tt - 0.6, tt + 0.6, 0, 0.18, H(0xb8b8b4), NE);
    for (const s of [-ax.L * 0.17, ax.L * 0.17]) {
      pushBox(X, f, s - 0.45, s + 0.45, tt - 0.3, tt + 0.3, 0.18, 1.9, BILA, NE);
      pushBox(X, f, s - 0.47, s + 0.47, tt - 0.32, tt + 0.32, 1.0, 1.75, Z.stojan || H(0xe30a17), NE);
    }
    for (const s of [-ax.L * 0.3 + 0.3, ax.L * 0.3 - 0.3]) pushBox(X, f, s - 0.18, s + 0.18, tt - 0.18, tt + 0.18, 0.18, e_ - g - hl + 0.1, BILA, NE);   // sloup stříšky
  }
  // cenový totem
  if (mp.totem_ll) {
    const [x, y] = mp.totem_ll, f = frameAt(x, y, g, (mp.totem_a || 0) * Math.PI / 180), w = 1.6, h = 6.2;
    pushBox(X, f, -w / 2, w / 2, -0.25, 0.25, 0, h, Z.totem, NE);
    pushBox(X, f, -w / 2 + 0.12, w / 2 - 0.12, -0.27, 0.27, h - 1.5, h - 0.15, Z.totemLogo || BILA, SV);
    pushBox(X, f, -w / 2 + 0.12, w / 2 - 0.12, -0.27, 0.27, h - 1.5 - 2.6, h - 1.7, TMAVA, NE);
    for (let r = 0; r < 4; r++) pushBox(X, f, 0, w / 2 - 0.2, -0.29, 0.29, h - 4.0 + r * 0.6, h - 3.75 + r * 0.6, H(0xff3b1f), SV);   // ceny (svítí)
  }
  return true;
}

function mycka(b, mp, E, { X, frameAt, pushBox }) {
  // AT Car Wash Center (podle fotek uživatele): střecha ~4,6 m s černým lemem a nápisem, mohutné žluté sloupy na hranicích boxů
  // (vyšší než střecha, nahoře zúžené a sešikmené), tmavě šedé přepážky, uprostřed technická místnost, pod boxy světlý beton
  const g = b.g, e_ = b.e, ZL = H(0xf4b400), CER = H(0x1e1f22), PANEL = H(0x55595f), BETON = H(0xc9c6bd);
  const ax = E.reduce((a, e) => (e.L > a.L ? e : a)), cx = b.p.reduce((s, q) => s + q[0], 0) / b.p.length, cy = b.p.reduce((s, q) => s + q[1], 0) / b.p.length;
  const L = ax.L, Wd = Math.max(4, ...E.filter((e) => Math.abs(Math.sin(e.ang - ax.ang)) > 0.7).map((e) => e.L)), f = frameAt(cx, cy, g, ax.ang);
  const seg = mp.boxy || ['b', 'b', 't', 'b', 'b'], n = seg.length, d = L / n, v = e_ - g;
  pushBox(X, f, -L / 2 - 1.5, L / 2 + 1.5, -Wd / 2 - 1.2, Wd / 2 + 1.2, -0.2, 0.06, BETON, [0, 1, 1, 0]);           // betonová plocha
  for (const e of E) { const Fe = ramStena(e, frameAt); boxS(X, pushBox, Fe, -0.1, e.L + 0.1, 0, 0.14, e_ - 1.0, e_ + 0.12, CER, NE); }   // černý lem střechy
  for (let k = 0; k < n; k++) {
    const s0 = -L / 2 + k * d;
    if (seg[k] === 't') {                                     // technická místnost: šedé panely, dveře, nad ní nápis AT na lemu
      pushBox(X, f, s0 + 0.15, s0 + d - 0.15, -Wd / 2 + 0.5, Wd / 2 - 0.5, 0, v - 0.25, H(0x6c7076), NE);
      for (const sg of [-1, 1]) {
        pushBox(X, f, s0 + d * 0.38, s0 + d * 0.62, sg * (Wd / 2 - 0.5) - 0.04, sg * (Wd / 2 - 0.5) + 0.04, 0, 2.1, H(0x4a4e54), NE);
        pushBox(X, f, s0 + d * 0.3, s0 + d * 0.7, sg * (Wd / 2 + 0.14) - 0.03, sg * (Wd / 2 + 0.14) + 0.03, v - 0.75, v - 0.3, H(0xf2f2ee), SV);
        pushBox(X, f, s0 + d * 0.32, s0 + d * 0.68, sg * (Wd / 2 + 0.17) - 0.02, sg * (Wd / 2 + 0.17) + 0.02, v - 0.85, v - 0.8, ZL, SV);
      }
    } else {
      pushBox(X, f, s0 + d * 0.5 - 0.35, s0 + d * 0.5 + 0.35, -0.05, 0.05, 0, 0.03, BETON.map((c) => c * 0.85), NE);   // odtokový žlab
      for (const sg of [-1, 1]) pushBox(X, f, s0 + d * 0.44, s0 + d * 0.56, sg * (Wd / 2 + 0.14) - 0.03, sg * (Wd / 2 + 0.14) + 0.03, v - 0.8, v - 0.35, ZL, SV);   // číslo boxu
      pushBox(X, f, s0 + d * 0.5 - 0.25, s0 + d * 0.5 + 0.25, -0.25, 0.25, v - 0.9, v - 0.6, H(0xdcdcdc), SV);         // světlo uprostřed boxu
    }
  }
  for (let k = 0; k <= n; k++) {
    const s = -L / 2 + k * d;
    if (k > 0 && k < n && seg[k - 1] !== 't' && seg[k] !== 't')                                    // přepážka mezi boxy
      pushBox(X, f, s - 0.1, s + 0.1, -Wd / 2 + 0.6, Wd / 2 - 0.6, 0.15, 2.7, PANEL, NE);
    for (const sg of [-1, 1]) {
      const t0 = sg * Wd / 2;
      pushBox(X, f, s - 0.07, s + 0.07, t0 - sg * 0.5 - 0.07, t0 - sg * 0.5 + 0.07, 0, v - 0.9, H(0x9aa0a6), NE);    // ocelový sloupek
      if (seg[Math.min(k, n - 1)] !== 't' || k === 0 || k === n)
        pushBox(X, f, s - 0.3, s + 0.3, t0 - sg * 0.5 - 0.22, t0 - sg * 0.5 + 0.22, 0, 1.4, H(0x8d9196), NE);          // automat u boxu
      // žlutý sloup: dole 0,9 m, nahoře 1,1 m (rozšiřuje se), přečnívá střechu o 1,2 m
      pushBox(X, f, s - 0.45, s + 0.45, t0 - 0.35, t0 + 0.35, 0, v * 0.55, ZL, NE);
      pushBox(X, f, s - 0.55, s + 0.55, t0 - 0.4, t0 + 0.4, v * 0.55, v + 0.8, ZL, NE);
      pushBox(X, f, s - 0.48, s + 0.48, t0 - 0.36, t0 + 0.36, v + 0.8, v + 1.25, ZL.map((c) => c * 0.95), NE);
    }
  }
  return true;
}
// technická budova myčky: tmavě šedé čtvercové panely, žlutý pás nahoře (styl fasády 19 kreslí dveře a mřížky)
function technika(b, E, { X, frameAt, pushBox }) {
  const ZL = H(0xf4b400);
  for (const e of E) { const Fe = ramStena(e, frameAt); boxS(X, pushBox, Fe, -0.03, e.L + 0.03, 0, 0.08, b.e - 0.7, b.e + 0.1, ZL, NE); }
  return true;
}
function vysavace(b, E, { X, frameAt, pushBox }) {
  const g = b.g, e_ = b.e, ZL = H(0xf5c400);
  const ax = E.reduce((a, e) => (e.L > a.L ? e : a)), cx = b.p.reduce((s, q) => s + q[0], 0) / b.p.length, cy = b.p.reduce((s, q) => s + q[1], 0) / b.p.length, f = frameAt(cx, cy, g, ax.ang);
  for (const e of E) { const Fe = ramStena(e, frameAt); boxS(X, pushBox, Fe, -0.1, e.L + 0.1, 0, 0.12, e_ - 0.6, e_ + 0.08, H(0x2a2c30), NE); }
  for (const s of [-ax.L / 2 + 0.4, ax.L / 2 - 0.4]) pushBox(X, f, s - 0.35, s + 0.35, -0.3, 0.3, 0, e_ - g + 0.5, ZL, NE);
  for (let s = -ax.L / 2 + 2; s < ax.L / 2 - 1; s += 3.2) pushBox(X, f, s - 0.3, s + 0.3, -0.25, 0.25, 0, 1.3, H(0x3a3d42), NE);   // vysavače
  return true;
}

// ======================= kruhový objezd =======================
function kruhac(b, { X, frameAt, pushBox, pushQuad, tv }) {
  const mp = b.mp || {}, cx = b.p.reduce((s, q) => s + q[0], 0) / b.p.length, cy = b.p.reduce((s, q) => s + q[1], 0) / b.p.length, g = b.g;
  const r = mp.r || 9, lem = mp.lem || 1.2, N = 40;
  const KOSTKY = H(0xa8a39a), TRAVA = { spring: H(0x5d8a34), summer: H(0x6d8a3a), autumn: H(0x7a8240), winter: H(0x6f7a5a) }[SEZONA] || H(0x6d8a3a);
  const P = (rr, a, z) => tv(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, z);
  const mezikruzi = (r0, r1, z0, z1, col, aw) => {
    for (let k = 0; k < N; k++) {
      const a0 = k / N * Math.PI * 2, a1 = (k + 1) / N * Math.PI * 2;
      pushQuad(X, P(r0, a0, z0), P(r1, a0, z1), P(r1, a1, z1), P(r0, a1, z0), col, aw);
    }
  };
  const bok = (rr, z0, z1, col) => { for (let k = 0; k < N; k++) { const a0 = k / N * Math.PI * 2, a1 = (k + 1) / N * Math.PI * 2; pushQuad(X, P(rr, a0, z0), P(rr, a1, z0), P(rr, a1, z1), P(rr, a0, z1), col, NE); } };
  bok(r, g - 0.15, g + 0.1, KOSTKY.map((v) => v * 0.8));
  mezikruzi(r, r - lem, g + 0.1, g + 0.13, KOSTKY, [0, 1, 1, 0]);                       // dlážděný pojížděný lem
  bok(r - lem, g + 0.13, g + 0.3, H(0x8f8a82));                                          // obrubník
  mezikruzi(r - lem, r - lem - 2.2, g + 0.3, g + 0.75, TRAVA, [0, 1, 1, 0]);            // travnatý val
  mezikruzi(r - lem - 2.2, 0.01, g + 0.75, g + 0.9, TRAVA, [0, 1, 1, 0]);
  // keře: shluky v pásu kolem stožáru (pevné rozmístění)
  const KER = SEZONA === 'winter' ? H(0x4e5540) : SEZONA === 'autumn' ? H(0x6a6a34) : H(0x3f6a2a);
  for (let k = 0; k < 11; k++) {
    const a = k * 2.39 + 0.4, rr = 2.2 + (k * 0.37 % 1) * (r - lem - 3.6), s = 0.7 + (k * 0.61 % 1) * 0.8, h = 0.6 + (k * 0.29 % 1) * 0.7;
    const f = frameAt(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, g + 0.8, a);
    pushBox(X, f, -s, s, -s * 0.8, s * 0.8, 0, h, KER, [0, 1, 1, 0]);
    pushBox(X, f, -s * 0.6, s * 0.6, -s * 0.5, s * 0.5, h, h + 0.3, KER.map((v) => v * 1.12), [0, 1, 1, 0]);
  }
  // stožár osvětlení se čtyřmi rameny
  const fz = frameAt(cx, cy, g + 0.9, mp.lampa_a ? mp.lampa_a * Math.PI / 180 : 0.4), vy = mp.stozar || 11, ST = H(0x9da3a8);
  pushBox(X, fz, -0.14, 0.14, -0.14, 0.14, 0, vy, ST, NE);
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2, f = frameAt(cx, cy, g + 0.9, (mp.lampa_a || 23) * Math.PI / 180 + a);
    pushBox(X, f, 0, 2.3, -0.05, 0.05, vy - 0.1, vy + 0.05, ST, NE);
    pushBox(X, f, 1.9, 2.6, -0.16, 0.16, vy - 0.15, vy + 0.05, H(0xdedfe0), SV);
  }
  // šipky (Z3) na okraji ostrůvku proti každému vjezdu
  for (const deg of mp.vjezdy || []) {
    const a = deg * Math.PI / 180, rr = r - lem - 0.5, f = frameAt(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, g + 0.3, a + Math.PI / 2);
    pushBox(X, f, -0.04, 0.04, -0.04, 0.04, 0, 0.95, ST, NE);
    pushBox(X, f, -0.6, 0.6, 0.04, 0.09, 0.5, 0.95, H(0xd8201c), NE);
    for (const s of [-0.3, 0.12]) pushBox(X, f, s - 0.08, s + 0.08, 0.09, 0.11, 0.56, 0.89, BILA, NE);
  }
  return true;
}
