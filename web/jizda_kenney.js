// Postavy Kenney Mini Characters (www.kenney.nl, CC0; jizda/kenney/*.glb) pro část chodců ve 3D jízdě.
// Všechny postavy s kostrou: nejbližší chodci (jizda/lide.js), hráč (jizda/ulice.js) a ostatní hráči v multiplayeru (jizda/hraci.js).
// nova(vz) -> loutka s poloha / nastav / skryj / prvniOsoba / zrus; model a pomůcku určí semínko vz.n (bez semínka a s vz.bez
// pomůcky: hráči), vz.model vybere model přímo.
// Pomůcky jsou funkční: na vozíku jede postava animací jízdy na vozíku (i elektrický vozík), nevidomý ťuká slepeckou holí,
// zraněný jde o berli, cestovatel táhne kufr, někdo nosí brýle nebo sluneční brýle (ty jen v létě a na jaře), dělník
// je v montérkách s přilbou. Model míří na +z, vlevo je +x; svět x východ, y sever, z nahoru, three = (x, z, -y).
const MUZI = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((k) => 'character-male-' + k);
const ZENY = ['a', 'b', 'c', 'd', 'e', 'f'].map((k) => 'character-female-' + k);
const POMUCKY = ['wheelchair', 'wheelchair-power', 'aid-cane-blind', 'aid-crutch', 'item-luggage-upright', 'aid-glasses', 'aid-sunglasses'];
const VYSKA = 2.2;                                           // model měří 0,78 jednotky: dospělý ~1,7 m
// pohyb chodce (jizda/lide.js) -> animace v souboru; na vozíku vlastní
const POHYB = { stoji: 'idle', mluvi: 'idle', jde: 'walk', klus: 'sprint', bezi: 'sprint', sedi: 'sit', skok: 'jump', uder: 'attack-melee-right', lezi: 'die', ridi: 'drive' };
const NA_VOZIKU = { stoji: 'wheelchair-sit', mluvi: 'wheelchair-look-left', sedi: 'wheelchair-sit', jde: 'wheelchair-move-forward', klus: 'wheelchair-move-forward', bezi: 'wheelchair-move-forward' };
const RYCHLOST = { walk: 1.25, sprint: 3.6, 'wheelchair-move-forward': 1.1 };   // m/s v animaci při VYSKA (nohy neklouzou)
const fr = (x) => x - Math.floor(x);

export function vytvorKenney(THREE, scene, { jenVeDne = [], obdobi = 'summer' } = {}) {
  let stav = 'nic';
  const vzory = {}, klipy = {};
  let SU = null, mat = null;
  async function nacti() {
    stav = 'nacita';
    try {
      const [{ GLTFLoader }, su] = await Promise.all([import('./three/loaders/GLTFLoader.js'), import('./three/utils/SkeletonUtils.js')]);
      SU = su;
      const L = new GLTFLoader(), url = (f) => new URL(`./kenney/${f}.glb`, import.meta.url).href;
      const jmena = [...MUZI, ...ZENY, 'character-worker', ...POMUCKY];
      const g = await Promise.all(jmena.map((j) => L.loadAsync(url(j))));
      jmena.forEach((j, i) => { vzory[j] = g[i].scene; if (j.startsWith('character')) for (const c of g[i].animations) klipy[c.name] = klipy[c.name] || c; });
      // jeden materiál pro všechny (paleta colormap.png), bez převodu barev jako ostatní tělesa
      g[0].scene.traverse((o) => { if (o.isMesh && !mat) { const mp = o.material.map; if (mp) mp.colorSpace = THREE.NoColorSpace; mat = new THREE.MeshLambertMaterial({ map: mp }); } });
      stav = 'ok';
    } catch (e) { console.warn('Postavy Kenney se nenačetly:', e); stav = 'chyba'; }
  }

  // role podle semínka: vozík, slepecká hůl, berle, kufr, brýle, dělník, nic
  function role(vz) {
    if (vz.n === undefined || vz.bez) return '';               // hráči chodí bez pomůcek
    const r = fr(vz.n * 977.3), dite = (vz.sc || 1) < 0.85;
    if (dite) return r < 0.25 ? 'bryle' : '';
    if (r < 0.04) return 'vozik';
    if (r < 0.06) return 'vozik_el';
    if (r < 0.09) return 'slepy';
    if (r < 0.115) return 'berle';
    if (r < 0.24) return 'kufr';
    if (r < 0.36) return (obdobi === 'summer' || obdobi === 'spring') && r > 0.3 ? 'slunce' : 'bryle';
    if (r < 0.43 && !vz.zena) return 'delnik';
    return '';
  }

  function nova(vz, sc_ = scene) {                           // sc_: jiná scéna (náhled v garáži)
    if (stav === 'nic') nacti();
    if (stav !== 'ok') return null;
    const ro = role(vz), u = fr((vz.n ?? 0) * 131.7);
    const jm = vz.model && vzory[vz.model] ? vz.model : ro === 'delnik' ? 'character-worker' : vz.zena ? ZENY[Math.floor(u * ZENY.length)] : MUZI[Math.floor(u * MUZI.length)];
    const root = SU.clone(vzory[jm]);
    const kosti = {}, hlava = [];
    root.traverse((o) => {
      if (o.isMesh && /head/.test(o.name)) hlava.push(o);
      if (o.isBone || /^(arm|head|torso|leg)/.test(o.name)) kosti[o.name] = kosti[o.name] || o;
      if (o.isMesh) { o.material = mat; o.castShadow = true; o.frustumCulled = false; jenVeDne.push(o); }
    });
    const pridej = (f, kost, poz, rot = [0, 0, 0], sc = 1) => {
      const m = vzory[f].clone(true);
      m.traverse((o) => { if (o.isMesh) { o.material = mat; o.castShadow = true; jenVeDne.push(o); } });
      m.position.set(...poz); m.rotation.set(...rot); m.scale.setScalar(sc);
      (kost ? kosti[kost] || root : root).add(m); return m;
    };
    // pomůcky: souřadnice v prostoru kosti (ruka je na konci paže, ~0,3 od ramene dolů v klidové póze)
    let vozik = null, hul = null;
    if (ro === 'vozik' || ro === 'vozik_el') vozik = pridej(ro === 'vozik' ? 'wheelchair' : 'wheelchair-power', null, [0, 0, -0.02]);
    if (ro === 'slepy') { hul = pridej('aid-cane-blind', 'arm-right', [-0.02, -0.3, 0.05], [0.5, 0, 0], 1.6); pridej('aid-sunglasses', 'head', [0, 0.1, 0.19]); }
    if (ro === 'berle') pridej('aid-crutch', 'arm-left', [0.03, -0.42, 0.0], [0, 0, 0], 1.25);
    if (ro === 'kufr') pridej('item-luggage-upright', 'arm-right', [-0.02, -0.52, -0.08], [0.35, 0, 0]);
    if (ro === 'bryle') pridej('aid-glasses', 'head', [0, 0.1, 0.19]);
    if (ro === 'slunce') pridej('aid-sunglasses', 'head', [0, 0.1, 0.19]);

    const g = new THREE.Group(); g.add(root); g.scale.setScalar(VYSKA * (vz.sc || 1)); sc_.add(g);
    const mixer = new THREE.AnimationMixer(root), akce = {};
    let ted = null, tedJm = '', t = 0;
    return {
      g, u: { uOrez: { value: 0 }, uTriko: { value: new THREE.Color() } }, role: ro, model: jm,   // uTriko: hráč nastavuje barvu trička (tady jen pro rozhraní)
      nastav(pohyb, rych, dt) {
        t += dt;
        let a_ = (vozik ? NA_VOZIKU[pohyb] : null) || POHYB[pohyb] || pohyb;
        if (ro === 'berle' && a_ === 'sprint') a_ = 'walk';            // o berli se neběhá
        if (a_ !== tedJm && klipy[a_]) {
          let a = akce[a_];
          if (!a) { a = akce[a_] = mixer.clipAction(klipy[a_]); if (a_ === 'die' || a_ === 'attack-melee-right' || a_ === 'jump') { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; } }
          a.reset().play();
          if (ted) ted.crossFadeTo(a, 0.25, false);
          ted = a; tedJm = a_;
        }
        if (ted) ted.timeScale = RYCHLOST[tedJm] ? Math.max(0.4, Math.min(1.8, rych / (RYCHLOST[tedJm] * (vz.sc || 1)))) : 1;
        if (ro === 'berle' && ted) ted.timeScale *= 0.75;
        mixer.update(dt);
        if (hul) hul.rotation.z = (tedJm === 'walk' ? Math.sin(t * 4.2) * 0.35 : 0);   // slepecká hůl ťuká ze strany na stranu
      },
      poloha(x, y, z, h) { g.position.set(x, z, -y); g.rotation.y = h + Math.PI / 2; },
      skryj(v) { g.visible = !v; },
      prvniOsoba(ano) { for (const o of hlava) o.visible = !ano; },   // pohled z očí: hlava (i s brýlemi) u kamery pryč
      zrus() {
        sc_.remove(g); mixer.stopAllAction();
        g.traverse((o) => { const i = jenVeDne.indexOf(o); if (i >= 0) jenVeDne.splice(i, 1); });
      },
    };
  }
  return { nova, role, MODELY: [...MUZI, ...ZENY, 'character-worker'], get pripraveno() { return stav === 'ok'; }, nacti: () => { if (stav === 'nic') nacti(); } };
}
