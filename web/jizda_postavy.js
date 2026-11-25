// Postavy s kostrou pro 3D jízdu: chodci zblízka a hráč (Quaternius Universal Base Characters + Universal Animation
// Library, CC0; jizda/postavy/*.glb z nastroje/postavy.py). Načítají se až při prvním použití; do té doby (a pro
// vzdálené lidi) zůstávají jednoduché postavy z jizda/lide.js.
// Oblečení: tělo je ve spodním prádle, barvy oblečení kreslí shader podle polohy vrcholu v T-póze (výška a vzdálenost
// od osy těla): boty, kalhoty (nebo kraťasy, sukně), tričko s krátkým nebo dlouhým rukávem, bunda. Kůže a vlasy tónem.
// Souřadnice světa: x východ, y sever, z nahoru; three = (x, z, -y). Postava v souboru míří na +z, proto rotation.y = h + π/2.
const POHYB = { stoji: 'Idle_Loop', mluvi: 'Idle_Talking_Loop', jde: 'Walk_Loop', klus: 'Jog_Fwd_Loop', bezi: 'Sprint_Loop',
  sedi: 'Sitting_Idle_Loop', skok: 'Jump_Loop', uder: 'Punch_Jab', lezi: 'Death01', ridi: 'Driving_Loop' };
const VLASY = { muz: ['simpleparted', 'buzzed', 'simpleparted', 'beard'], zena: ['long', 'buns', 'long'] };
// rychlost chůze v animaci (m/s): animace se zrychlí nebo zpomalí podle skutečné rychlosti, aby nohy neklouzaly
const RYCHLOST = { Walk_Loop: 1.35, Jog_Fwd_Loop: 3.2, Sprint_Loop: 5.8 };

export function vytvorPostavy(THREE, scene, { jenVeDne = [] } = {}) {
  let stav = 'nic';                                          // nic | nacita | ok | chyba
  const S = {}, klipy = {}, vlasy = {};
  async function nacti() {
    stav = 'nacita';
    try {
      const [{ GLTFLoader }, SU] = await Promise.all([import('./three/loaders/GLTFLoader.js'), import('./three/utils/SkeletonUtils.js')]);
      const L = new GLTFLoader(), url = (f) => new URL(`./postavy/${f}.glb`, import.meta.url).href;
      const jmena = ['muz', 'zena', 'pohyby', ...new Set(Object.values(VLASY).flat())];
      const g = await Promise.all(jmena.map((j) => L.loadAsync(url(j.startsWith('muz') || j.startsWith('zena') || j === 'pohyby' ? j : 'vlasy_' + j))));
      S.SU = SU;
      S.muz = g[0].scene; S.zena = g[1].scene;
      for (const c of g[2].animations) klipy[c.name] = c;
      jmena.slice(3).forEach((j, k) => { vlasy[j] = g[3 + k].scene; });
      stav = 'ok';
    } catch (e) { console.warn('Postavy se nenačetly:', e); stav = 'chyba'; }
  }

  // ---------- materiál: textura bez převodu barev (jako ostatní tělesa), oblečení podle kostí ----------
  // Zóna kosti: 0 kůže (hlava, krk, ruce), 1 trup (páteř, klíční kosti), 2 paže, 3 předloktí, 4 stehno a pánev, 5 lýtko, 6 chodidlo.
  // Vrchol dostane váhy zón podle svých kostí, pixel bere zónu s největší vahou (švy jdou po kloubech, ne podle výšky).
  const ZONA = (jm) => /^(pelvis|root|thigh)/.test(jm) ? 4 : /^calf/.test(jm) ? 5 : /^(foot|ball)/.test(jm) ? 6
    : /^(spine|clavicle)/.test(jm) ? 1 : /^upperarm/.test(jm) ? 2 : /^lowerarm/.test(jm) ? 3 : 0;
  function materialTela(src, u, kosti) {
    const map = src.map || null;
    if (map) map.colorSpace = THREE.NoColorSpace;
    const m = new THREE.MeshLambertMaterial({ map });
    const zony = new Float32Array(128); kosti.forEach((b, i) => { zony[i] = ZONA(b.name); });
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u, { uZony: { value: zony } });
      sh.vertexShader = 'uniform float uZony[128]; varying vec4 vZa; varying vec3 vZb;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vZa = vec4(0.0); vZb = vec3(0.0);
        for (int k = 0; k < 4; k++) {
          float z = uZony[int(skinIndex[k])], w = skinWeight[k];
          if (z < 0.5) vZa.x += w; else if (z < 1.5) vZa.y += w; else if (z < 2.5) vZa.z += w; else if (z < 3.5) vZa.w += w;
          else if (z < 4.5) vZb.x += w; else if (z < 5.5) vZb.y += w; else vZb.z += w;
        }`);
      sh.fragmentShader = `varying vec4 vZa; varying vec3 vZb; uniform vec3 uKoze, uTriko, uKalh, uBoty; uniform vec4 uStrih; uniform float uOrez;
` + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      if (length(vViewPosition) < uOrez) discard;   // pohled z očí: hlava a krk u kamery pryč
      {
        // uStrih: x rukáv (0 bez, 1 krátký, 2 dlouhý), y nohavice (0 kraťasy, 1 dlouhé, 2 sukně ke kolenům), z bunda (tmavší, delší)
        float j = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)), latka = mix(0.88, 1.1, smoothstep(0.2, 0.6, j));
        float zona = 0.0, mx = vZa.x;
        if (vZa.y > mx) { mx = vZa.y; zona = 1.0; } if (vZa.z > mx) { mx = vZa.z; zona = 2.0; } if (vZa.w > mx) { mx = vZa.w; zona = 3.0; }
        if (vZb.x > mx) { mx = vZb.x; zona = 4.0; } if (vZb.y > mx) { mx = vZb.y; zona = 5.0; } if (vZb.z > mx) { mx = vZb.z; zona = 6.0; }
        vec3 triko = uTriko * (uStrih.z > 0.5 ? 0.8 : 1.0);
        vec3 c = uKoze * clamp(j / 0.36, 0.55, 1.25);            // kůže: tón chodce, stínování z jasu textury
        if (zona > 0.5 && zona < 1.5) c = triko * latka;
        else if (zona > 1.5 && zona < 2.5 && uStrih.x > 0.5) c = triko * latka;
        else if (zona > 2.5 && zona < 3.5 && uStrih.x > 1.5) c = triko * latka;
        else if (zona > 3.5 && zona < 4.5) c = uKalh * latka;
        else if (zona > 4.5 && zona < 5.5 && uStrih.y > 0.5 && uStrih.y < 1.5) c = uKalh * latka;
        else if (zona > 5.5) c = uBoty * latka;
        diffuseColor.rgb = c;
      }`);
    };
    m.customProgramCacheKey = () => 'postava_telo_kosti';
    return m;
  }
  function materialVlasu(src, barva) {
    const map = src.map || null;
    if (map) map.colorSpace = THREE.NoColorSpace;
    const m = new THREE.MeshLambertMaterial({ map, color: barva, alphaTest: 0.4, side: THREE.DoubleSide });
    return m;
  }

  // ---------- nová postava ----------
  // vz: { zena, sc (výška vůči dospělému), koze, triko, kalh, boty, vlasy (barvy hex), strih: [rukáv, nohavice, bunda], uces }
  function nova(vz) {
    if (stav === 'nic') nacti();
    if (stav !== 'ok') return null;
    const druh = vz.zena ? 'zena' : 'muz';
    const root = S.SU.clone(S[druh]);
    const u = { uKoze: { value: new THREE.Color(vz.koze) }, uTriko: { value: new THREE.Color(vz.triko) }, uKalh: { value: new THREE.Color(vz.kalh) },
      uBoty: { value: new THREE.Color(vz.boty ?? 0x2a2a2e) }, uStrih: { value: new THREE.Vector4(...(vz.strih || [1, 1, 0]), 1) }, uOrez: { value: 0 } };
    let telo = null; const hlava = [];                         // vlasy, oči, obočí: v pohledu z očí schované
    root.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      o.frustumCulled = false;
      const jm = o.material?.name || '';
      if (/Superhero/.test(jm)) { o.material = materialTela(o.material, u, o.skeleton.bones); telo = o; }
      else if (/Hair/.test(jm)) { o.material = materialVlasu(o.material, vz.vlasy); hlava.push(o); }   // obočí
      else { const mp = o.material.map; if (mp) mp.colorSpace = THREE.NoColorSpace; o.material = new THREE.MeshLambertMaterial({ map: mp }); hlava.push(o); }
      jenVeDne.push(o);
    });
    // účes: síť navázaná na kost hlavy, kostru přebere od těla (stejná jména kostí)
    const ucesy = VLASY[druh], uc = vz.uces ?? ucesy[Math.floor((vz.n ?? Math.random()) * ucesy.length)];
    const vzor = vlasy[uc];
    if (vzor && telo) vzor.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      const kosti = o.skeleton.bones.map((b) => telo.skeleton.bones.find((q) => q.name === b.name) || telo.skeleton.bones[0]);
      const v = new THREE.SkinnedMesh(o.geometry, materialVlasu(o.material, vz.vlasy));
      v.bind(new THREE.Skeleton(kosti, o.skeleton.boneInverses), telo.bindMatrix);
      v.frustumCulled = false; telo.parent.add(v); jenVeDne.push(v); hlava.push(v);
    });
    const g = new THREE.Group(); g.add(root); g.scale.setScalar(vz.sc || 1); scene.add(g);
    const mixer = new THREE.AnimationMixer(root), akce = {};
    let ted = null, tedJm = '';
    const loutka = {
      g, u,
      // pohyb: klíč z POHYB nebo jméno animace; rych: skutečná rychlost (m/s) pro chůzi a běh; dt: krok času
      nastav(pohyb, rych, dt) {
        const jm = POHYB[pohyb] || pohyb;
        if (jm !== tedJm && klipy[jm]) {
          let a = akce[jm];
          if (!a) {
            a = akce[jm] = mixer.clipAction(klipy[jm]);
            if (jm === 'Death01' || jm === 'Punch_Jab' || jm === 'Jump_Land') { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
          }
          a.reset().play();
          if (ted) ted.crossFadeTo(a, jm === 'Punch_Jab' ? 0.08 : 0.25, false);
          ted = a; tedJm = jm;
        }
        if (ted && RYCHLOST[tedJm]) ted.timeScale = Math.max(0.4, Math.min(1.8, rych / (RYCHLOST[tedJm] * (vz.sc || 1))));
        else if (ted) ted.timeScale = 1;
        mixer.update(dt);
      },
      poloha(x, y, z, h) { g.position.set(x, z, -y); g.rotation.y = h + Math.PI / 2; },
      skryj(v) { g.visible = !v; },
      // pohled z očí: bez hlavy a vlasů, tělo do 0,5 m od kamery se nekreslí (zbude hruď, ruce a nohy při pohledu dolů)
      prvniOsoba(ano) { for (const o of hlava) o.visible = !ano; u.uOrez.value = ano ? 0.5 : 0; if (telo) telo.castShadow = true; },
      zrus() { scene.remove(g); mixer.stopAllAction(); root.traverse((o) => { if (o.material) o.material.dispose?.(); const i = jenVeDne.indexOf(o); if (i >= 0) jenVeDne.splice(i, 1); }); },
    };
    return loutka;
  }
  return { nova, get pripraveno() { return stav === 'ok'; }, nacti: () => { if (stav === 'nic') nacti(); } };
}
