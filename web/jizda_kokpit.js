// Pohled z kabiny auta hráče: interiér kolem řidiče (palubní deska s budíky, volant točený podle řízení, ruce na volantu,
// kapota v barvě laku, sloupky, strop, zrcátka) a pohyb hlavy (přetížení v zatáčce a při brzdění, pohled do zatáčky).
// Kokpit je skupina se stejnou polohou a natočením jako auto (lokálně: +x dopředu, +y nahoru, +z vpravo, řidič vlevo z = −0,38).
export function vytvorKokpit(THREE, scene, { jenVeDne = [] } = {}) {
  const g = new THREE.Group(); g.visible = false; scene.add(g);
  const lam = (c) => new THREE.MeshLambertMaterial({ color: c });
  const PLAST = lam(0x2e3034), TMAVA = lam(0x1c1d20), STROP = lam(0xb9b6ad), KUZE = lam(0xd9a98a), RUKAV = lam(0x2f5fa8), LAK = lam(0xb02020), CHROM = lam(0x9aa0a6);
  const pridej = (m, par = g) => { par.add(m); jenVeDne.push(m); return m; };
  const box = (x0, x1, y0, y1, z0, z1, mat, par = g) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); return pridej(m, par);
  };
  const VALEC = new THREE.CylinderGeometry(0.5, 0.5, 1, 10), up = new THREE.Vector3(0, 1, 0), tv = new THREE.Vector3();
  const usek = (m, a, b, r) => {                              // válec m mezi body a a b (souřadnice kokpitu), poloměr r
    tv.subVectors(b, a); const L = tv.length() || 1e-3;
    m.position.copy(a).addScaledVector(tv, 0.5); m.quaternion.setFromUnitVectors(up, tv.divideScalar(L)); m.scale.set(r * 2, L, r * 2);
  };
  const tyc = (a, b, r, mat) => { const m = pridej(new THREE.Mesh(VALEC, mat)); usek(m, a, b, r); return m; };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // palubní deska, kryt budíků, středový panel, horní plocha pod čelním sklem
  box(0.5, 0.98, 0.7, 0.98, -0.78, 0.78, PLAST);
  box(0.62, 1.1, 0.97, 1.02, -0.78, 0.78, TMAVA);
  box(0.6, 0.74, 1.12, 1.15, -0.6, -0.16, TMAVA);                                          // stříška nad budíky
  box(0.69, 0.74, 0.97, 1.13, -0.6, -0.16, TMAVA);                                         // zadní stěna budíků
  box(0.42, 0.62, 0.62, 0.96, -0.13, 0.13, TMAVA);
  box(0.45, 0.5, 0.86, 0.92, -0.1, 0.1, lam(0x111214));      // displej uprostřed
  // kapota před čelním sklem (barva laku), mírně se svažuje dopředu
  const kap = box(1.08, 2.25, 0.86, 0.92, -0.82, 0.82, LAK); kap.rotation.z = -0.05;
  // A-sloupky, rám čelního skla nahoře, strop, dveře, zrcátka
  for (const s of [-1, 1]) {
    tyc(V(1.02, 1.0, s * 0.74), V(0.14, 1.52, s * 0.7), 0.04, TMAVA);
    box(-0.8, 0.98, 0.94, 1.03, s * 0.74 - 0.04, s * 0.74 + 0.04, PLAST);                 // horní hrana dveří
    box(-0.8, 0.98, 0.55, 0.94, s * 0.78 - 0.02, s * 0.78 + 0.02, lam(0x3a3c40));         // výplň dveří
    box(0.8, 0.86, 1.0, 1.07, s * 0.92 - 0.05, s * 0.92 + 0.05, LAK);                     // boční zrcátko
    box(0.795, 0.8, 1.01, 1.06, s * 0.92 - 0.04, s * 0.92 + 0.04, CHROM);
  }
  box(-1.3, 0.12, 1.52, 1.57, -0.78, 0.78, STROP);
  // zbytek auta (při rozhlížení): podlaha, sedadla vpředu a vzadu s opěrkami, B- a C-sloupky, zadní okno, víko kufru
  const SED = lam(0x3b3d42), KOBEREC = lam(0x24252a);
  box(-1.6, 0.98, 0.3, 0.38, -0.76, 0.76, KOBEREC);
  for (const zc of [-0.38, 0.38]) {                                                      // přední sedadla
    box(-0.32, 0.22, 0.45, 0.6, zc - 0.25, zc + 0.25, SED);
    const op = box(-0.46, -0.3, 0.55, 1.22, zc - 0.25, zc + 0.25, SED); op.rotation.z = 0.12;
    box(-0.5, -0.36, 1.26, 1.46, zc - 0.13, zc + 0.13, SED);                               // opěrka hlavy
  }
  box(-1.3, -0.78, 0.45, 0.6, -0.72, 0.72, SED);                                           // zadní lavice
  const zop = box(-1.46, -1.3, 0.55, 1.12, -0.72, 0.72, SED); zop.rotation.z = 0.15;
  for (const zc of [-0.45, 0.45]) box(-1.5, -1.38, 1.14, 1.32, zc - 0.12, zc + 0.12, SED);
  box(-1.78, -1.42, 0.98, 1.03, -0.74, 0.74, TMAVA);                                       // odkládací plocha
  box(-2.15, -1.75, 0.86, 1.0, -0.8, 0.8, LAK);                                            // víko kufru za zadním oknem
  box(-1.36, -1.26, 1.47, 1.53, -0.72, 0.72, TMAVA);                                       // horní rám zadního okna
  for (const s_ of [-1, 1]) {
    tyc(V(-0.48, 0.98, s_ * 0.76), V(-0.52, 1.53, s_ * 0.72), 0.05, PLAST);                 // B-sloupek
    tyc(V(-1.75, 1.0, s_ * 0.74), V(-1.3, 1.52, s_ * 0.7), 0.07, PLAST);                    // C-sloupek
    box(-1.75, -0.8, 0.94, 1.03, s_ * 0.74 - 0.04, s_ * 0.74 + 0.04, PLAST);               // zadní dveře: hrana a výplň
    box(-1.75, -0.8, 0.55, 0.94, s_ * 0.78 - 0.02, s_ * 0.78 + 0.02, lam(0x3a3c40));
  }
  box(0.1, 0.18, 1.49, 1.55, -0.72, 0.72, TMAVA);
  box(0.3, 0.34, 1.33, 1.41, -0.13, 0.13, TMAVA);                                          // zpětné zrcátko
  box(0.295, 0.3, 1.34, 1.4, -0.12, 0.12, lam(0x8e99a6));
  tyc(V(0.32, 1.41, 0), V(0.2, 1.52, 0), 0.012, TMAVA);

  // ---------- čelní sklo: kapky a stěrače ----------
  // Sklo je rovina od spodní hrany (x 1,02, y 1,0) k horní (x 0,14, y 1,52), šířka z ±0,74. Kapky jsou na plátně (u = z, v = po skle),
  // přibývají podle deště (a sněhu), stěrač je maže výsečí kolem své osy. Bez deště stěrače parkují dole a kapky pomalu oschnou.
  const SK0 = V(1.0, 1.0, 0), SKU = V(-0.86, 0.51, 0).normalize(), SKL = 1.02, SKW = 0.74, SKN = V(-0.51, -0.86, 0);   // SKN: normála ke kabině
  const KW = 512, KH = 352, skloG = new THREE.Group();
  const kc = typeof document !== "undefined" ? document.createElement('canvas') : null; let kx = null, ktex = null;
  if (kc) { kc.width = KW; kc.height = KH; kx = kc.getContext('2d'); ktex = new THREE.CanvasTexture(kc); ktex.colorSpace = THREE.NoColorSpace; }
  {
    const p = (u, v) => SK0.clone().addScaledVector(SKU, v * SKL).add(V(0, 0, (u - 0.5) * 2 * SKW)).addScaledVector(SKN, 0.012);
    const gs = new THREE.BufferGeometry().setFromPoints([p(0, 0), p(1, 0), p(1, 1), p(0, 0), p(1, 1), p(0, 1)]);
    gs.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2));
    // sklo se kreslí až na složený obraz (jizda.html: KOKPIT.sklo ve vlastní scéně), jinak by kapky přes nebe a dálku přemazala obloha a mlha
    const sklo = new THREE.Mesh(gs, new THREE.MeshBasicMaterial({ map: ktex, transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide }));
    sklo.userData.bezStinu = true; skloG.add(sklo);
  }
  const PIVOTY = [-0.36, 0.14];                                  // osy stěračů (z), ramena parkují směrem doprava
  const stierace = PIVOTY.map((zp) => {
    const osa = new THREE.Group();                              // souřadnice skla: x po šířce (z auta), y po skle nahoru, z = normála
    osa.position.copy(SK0).add(V(0, 0, zp)).addScaledVector(SKU, 0.03).addScaledVector(SKN, 0.02);
    osa.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(0, 0, 1), SKU, SKN));   // pravotočivá: (0,0,1) × SKU = SKN
    g.add(osa);
    const rameno = new THREE.Group(); osa.add(rameno);
    box(0, 0.62, -0.012, 0.012, -0.016, 0.008, TMAVA, rameno);                     // rameno
    box(0.06, 0.68, -0.022, 0.022, -0.03, -0.004, lam(0x111113), rameno);            // lišta s gumou
    return { zp, rameno, uhel: 0.04 };
  });
  const DELKA = 0.66, MAXU = 1.95;                               // dosah ramena (m), největší výchylka (rad)
  const naPlatno = (z, sv) => [(z + SKW) / (2 * SKW) * KW, (1 - sv / SKL) * KH];
  function setri(st, a0, a1) {                                   // výseč stěrače mezi úhly a0 a a1 pryč z plátna
    if (!kx) return;
    const lo = Math.min(a0, a1) - 0.03, hi = Math.max(a0, a1) + 0.03;
    kx.save(); kx.globalCompositeOperation = 'destination-out'; kx.beginPath();
    kx.moveTo(...naPlatno(st.zp, 0.03));
    for (let a = lo; a <= hi + 1e-6; a += (hi - lo) / 6) kx.lineTo(...naPlatno(st.zp + Math.cos(a) * (DELKA + 0.04), 0.03 + Math.sin(a) * (DELKA + 0.04)));
    kx.closePath(); kx.fill(); kx.restore();
  }
  let stF = 0, stPauza = 0, sucho = 0, rezim = 0;               // rezim: 0 automaticky (dešťový senzor), 1 stále, 2 rychle, 3 vypnuto
  const REZIMY = ['Stěrače: automaticky', 'Stěrače: stále', 'Stěrače: rychle', 'Stěrače: vypnuto'];
  function kapkyAStierace(dt, dest, snih, v) {
    const pada = Math.max(dest, snih * 0.6);
    if (kx) {
      const n = pada * dt * (480 + Math.abs(v) * 20);                // za jízdy dopadá víc kapek
      for (let k = 0; k < n || (k === 0 && Math.random() < n); k++) {
        const x = Math.random() * KW, y = Math.random() * KH, r = (snih > dest ? 2.5 : 1.6) + Math.random() * 2.6;
        kx.fillStyle = snih > dest ? 'rgba(245,248,255,0.75)' : 'rgba(150,168,186,0.45)';
        kx.beginPath(); kx.arc(x, y, r, 0, Math.PI * 2); kx.fill();
        if (snih <= dest) { kx.strokeStyle = 'rgba(40,48,58,0.45)'; kx.lineWidth = 1.2; kx.stroke(); }   // okraj kapky (lom světla)
        kx.fillStyle = 'rgba(255,255,255,0.65)'; kx.beginPath(); kx.arc(x - r * 0.3, y - r * 0.35, r * 0.3, 0, Math.PI * 2); kx.fill();
      }
      if (pada < 0.02 && (sucho += dt) > 0.5) {                   // bez deště kapky pomalu oschnou
        sucho = 0; kx.save(); kx.globalCompositeOperation = 'destination-out'; kx.fillStyle = 'rgba(0,0,0,0.06)'; kx.fillRect(0, 0, KW, KH); kx.restore();
      }
    }
    // stěrače: dešťový senzor (cyklovač při slabém dešti, rychle při lijáku), jeden cyklus = tam a zpět
    let T = pada > 0.65 ? 0.9 : pada > 0.25 ? 1.3 : 1.5, pauza = pada > 0.25 ? 0 : pada > 0.03 ? 3.5 : Infinity;
    if (rezim === 1) { T = 1.3; pauza = 0; } else if (rezim === 2) { T = 0.85; pauza = 0; } else if (rezim === 3) pauza = Infinity;   // ruční volba (O)
    if (stPauza > 0) stPauza -= dt;
    else if (stF > 0 || pauza !== Infinity) {
      stF += dt / T;
      if (stF >= 1) { stF = 0; stPauza = pauza === Infinity ? 0 : pauza; }
    }
    const u = 0.04 + MAXU * (1 - Math.cos(stF * Math.PI * 2)) / 2;
    for (const st of stierace) { if (Math.abs(u - st.uhel) > 1e-4) setri(st, st.uhel, u); st.uhel = u; st.rameno.rotation.z = u; }
    if (ktex && (pada > 0.01 || stF > 0 || sucho === 0)) ktex.needsUpdate = true;
  }

  // budíky: plátno s rychloměrem a otáčkoměrem (svítí samo, i v noci)
  const cv = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  let tex = null, ctx = null;
  if (cv) { cv.width = 256; cv.height = 96; ctx = cv.getContext('2d'); tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.NoColorSpace; }
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.15), new THREE.MeshBasicMaterial({ map: tex, color: tex ? 0xffffff : 0x111111 }));
  panel.position.set(0.66, 1.06, -0.38); panel.rotation.set(0, -Math.PI / 2, 0); panel.rotateX(-0.2); g.add(panel);
  function kresliBudiky(kmh, ot, sipky) {
    if (!ctx) return;
    ctx.fillStyle = '#0b0c0e'; ctx.fillRect(0, 0, 256, 96);
    // kontrolky blinkrů: mezi budíky ve výšce jejich středu (nahoře je zakrývala stříška)
    const sipka = (x, d) => { ctx.fillStyle = '#35e06a'; ctx.beginPath(); ctx.moveTo(x + d * 16, 58); ctx.lineTo(x, 46); ctx.lineTo(x, 70); ctx.closePath(); ctx.fill(); ctx.fillRect(d > 0 ? x - 9 : x, 53, 9, 10); };
    if (sipky & 1) sipka(118, -1); if (sipky & 2) sipka(138, 1);
    const oblouk = (cx, f, barva) => {
      ctx.lineWidth = 6; ctx.strokeStyle = '#26282c'; ctx.beginPath(); ctx.arc(cx, 58, 34, Math.PI * 0.8, Math.PI * 2.2); ctx.stroke();
      ctx.strokeStyle = barva; ctx.beginPath(); ctx.arc(cx, 58, 34, Math.PI * 0.8, Math.PI * (0.8 + 1.4 * Math.min(1, f))); ctx.stroke();
    };
    oblouk(64, ot / 7000, ot > 5800 ? '#ff4a3a' : '#ffb000'); oblouk(192, kmh / 200, '#e8f0ff');   // vlevo otáčky, vpravo rychlost
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 26px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(String(Math.round(kmh)), 192, 66);
    ctx.font = '10px Arial, sans-serif'; ctx.fillStyle = '#8a9099'; ctx.fillText('km/h', 192, 82); ctx.fillText('×1000 ot/min', 64, 82);
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 20px Arial, sans-serif'; ctx.fillText((ot / 1000).toFixed(1), 64, 64);
    tex.needsUpdate = true;
  }

  // volant: skupina na sloupku (sklon k řidiči), uvnitř točená část s věncem, ramenem a rukama v poloze „za deset dvě“
  const sloupek = new THREE.Group(); sloupek.position.set(0.5, 0.92, -0.38); sloupek.rotation.z = 0.5; g.add(sloupek);
  const toc = new THREE.Group(); sloupek.add(toc);
  const venec = pridej(new THREE.Mesh(new THREE.TorusGeometry(0.185, 0.02, 8, 28), TMAVA), toc); venec.rotation.y = Math.PI / 2;
  box(-0.01, 0.01, -0.02, 0.02, -0.17, 0.17, TMAVA, toc); box(-0.01, 0.01, -0.17, 0.0, -0.02, 0.02, TMAVA, toc);
  pridej(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 12), PLAST), toc).rotation.z = Math.PI / 2;
  tyc(V(0.5, 0.92, -0.38), V(0.64, 0.84, -0.38), 0.03, TMAVA);                             // sloupek řízení
  const packa = box(0.035, 0.045, -0.025, -0.015, -0.24, -0.06, TMAVA, sloupek);                    // páčka blinkrů vlevo pod volantem
  const packaS = box(0.035, 0.045, -0.025, -0.015, 0.06, 0.24, TMAVA, sloupek);                    // páčka stěračů vpravo
  const uchop = [V(0, 0.09, -0.16), V(0, 0.09, 0.16)];                                     // „za deset dvě“ v rovině věnce (y nahoru, z do stran)
  const dlane = uchop.map((p) => { const m = pridej(new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), KUZE), toc); m.position.copy(p); m.scale.set(1.1, 0.9, 1.3); return m; });
  const predlokti = [0, 1].map(() => pridej(new THREE.Mesh(VALEC, RUKAV)));
  const lokty = [V(0.16, 0.84, -0.62), V(0.16, 0.84, -0.14)];
  const wp = new THREE.Vector3();

  // pohyb hlavy: pružina vychýlená přetížením (bočním z rychlosti otáčení, podélným ze změny rychlosti)
  const hlava = { x: 0, z: 0, vx: 0, vz: 0, nahl: 0, h0: null, v0: 0 };
  let tBud = 0, otacky = 900, klak = 0, blink = 0, blinkS = 0, strk = 0;
  const cilRuky = new THREE.Vector3();
  return {
    get skupina() { return g; },
    get sklo() { return skloG; },
    // klávesa O: další režim stěračů, vrací jeho název
    dalsiRezimSteracu() { rezim = (rezim + 1) % 4; strk = 0.5; return REZIMY[rezim]; },
    // každý snímek v kabině: c = auto hráče (x, y, h, v, steer), auto = jeho model (poloha, natočení), barva laku
    // st: { troubi (klakson), blinkr (2 vlevo, 4 vpravo, 6 varovky), blik (fáze světla) }
    update(c, auto, dt, kabina, barva, obleceni, st = {}) {
      g.visible = kabina; skloG.visible = kabina;
      if (!kabina || !(dt > 0)) { hlava.h0 = null; return; }
      g.position.copy(auto.position); g.quaternion.copy(auto.quaternion); skloG.position.copy(g.position); skloG.quaternion.copy(g.quaternion);
      if (barva) LAK.color.set(barva);
      if (obleceni) RUKAV.color.setHex(obleceni);
      toc.rotation.x = -(c.steer || 0) * 2.6;                // volant: 2,6 rad na plný rejd
      // klakson: pravá dlaň na střed volantu; blinkr: levá ruka krátce k páčce (páčka nahoru / dolů)
      klak += ((st.troubi ? 1 : 0) - klak) * Math.min(1, dt * 14);
      const bs = st.blinkr === 2 ? 2 : st.blinkr === 4 ? 4 : 0;
      if (bs !== blinkS) { blink = 0.45; blinkS = bs; }
      blink = Math.max(0, blink - dt);
      const kB = Math.sin(Math.min(1, (0.45 - blink) / 0.45) * Math.PI) * (blink > 0 ? 1 : 0);
      packa.rotation.x = bs === 2 ? 0.25 : bs === 4 ? -0.25 : 0;
      // pravá ruka: klakson (dlaň na střed), nebo při ručním přepnutí stěračů krátce k jejich páčce (páčka podle režimu)
      strk = Math.max(0, strk - dt);
      const kS = Math.sin(Math.min(1, (0.5 - strk) / 0.5) * Math.PI) * (strk > 0 ? 1 : 0);
      packaS.rotation.x = [0, 0.18, 0.36, -0.2][rezim];
      if (klak > 0.02) dlane[1].position.lerpVectors(uchop[1], cilRuky.set(0.03, 0, 0), klak);
      else { cilRuky.set(0.04, -0.02, 0.2).applyAxisAngle(V(1, 0, 0), -toc.rotation.x); dlane[1].position.lerpVectors(uchop[1], cilRuky, kS); }
      cilRuky.set(0.04, -0.02, -0.2).applyAxisAngle(V(1, 0, 0), -toc.rotation.x);      // páčka v souřadnicích točené části
      dlane[0].position.lerpVectors(uchop[0], cilRuky, kB);
      g.updateMatrixWorld(true);
      for (let k = 0; k < 2; k++) {                          // předloktí od lokte k dlani na volantu
        dlane[k].getWorldPosition(wp); g.worldToLocal(wp);
        usek(predlokti[k], lokty[k], wp, 0.042);
      }
      // přetížení
      const yr = hlava.h0 === null ? 0 : Math.atan2(Math.sin(c.h - hlava.h0), Math.cos(c.h - hlava.h0)) / dt, ax = hlava.h0 === null ? 0 : (c.v - hlava.v0) / dt;
      hlava.h0 = c.h; hlava.v0 = c.v;
      const boc = Math.max(-9, Math.min(9, yr * c.v)), pod = Math.max(-9, Math.min(9, ax));
      const cz = boc * 0.009, cx = -pod * 0.007;             // v levotočivé zatáčce hlava ven (doprava), při brzdění dopředu
      hlava.vz += ((cz - hlava.z) * 60 - hlava.vz * 9) * dt; hlava.z += hlava.vz * dt;
      hlava.vx += ((cx - hlava.x) * 60 - hlava.vx * 9) * dt; hlava.x += hlava.vx * dt;
      hlava.nahl += ((c.steer || 0) * 0.22 * Math.min(1, Math.abs(c.v) / 6) - hlava.nahl) * Math.min(1, dt * 3);   // pohled do zatáčky
      // budíky 10× za sekundu; otáčky z rychlosti a zařazeného stupně (ilustrace)
      const kmh = Math.abs(c.v) * 3.6, stu = kmh < 18 ? 1 : kmh < 34 ? 2 : kmh < 52 ? 3 : kmh < 75 ? 4 : 5, meze = [0, 0, 18, 34, 52, 75];
      const cil = kmh < 2 ? 850 : 1400 + (kmh - meze[stu]) / ([18, 16, 18, 23, 60][stu - 1]) * 3600 + Math.max(0, pod) * 120;
      otacky += (Math.min(6800, cil) - otacky) * Math.min(1, dt * 6);
      kapkyAStierace(dt, st.dest || 0, st.snih || 0, c.v || 0);
      const sip = st.blik ? (st.blinkr === 2 ? 1 : st.blinkr === 4 ? 2 : st.blinkr === 6 ? 3 : 0) : 0;
      if ((tBud += dt) > 0.1 || sip !== this._sip) { tBud = 0; this._sip = sip; kresliBudiky(kmh, otacky, sip); }
    },
    // kamera řidiče: oči nad sedadlem, pohyb hlavy, rozhlížení myší (yaw, look) a pohled do zatáčky
    kamera(camera, fwd, yaw, look) {
      const oko = new THREE.Vector3(0.02 + hlava.x, 1.27, -0.38 + hlava.z).applyMatrix4(g.matrixWorld);
      camera.position.copy(oko);
      const a = yaw + hlava.nahl;
      fwd.set(Math.cos(a) * Math.cos(look), Math.sin(look) - 0.04, -Math.sin(a) * Math.cos(look)).applyQuaternion(g.quaternion).normalize();
      camera.lookAt(camera.position.clone().add(fwd));
      camera.rotateZ(-hlava.z * 0.6);                        // hlava se v zatáčce i lehce nakloní
    },
  };
}
