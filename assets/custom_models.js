// Rakovník: vlastní modely a rekvizity (načítá render.html i 3D jízda)

export const landmarks = {
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
