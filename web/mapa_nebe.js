// Noční obloha a přelety ISS: hvězdy a Měsíc ve správné fázi mimo plochu mapy, skutečné viditelné přelety Mezinárodní
// vesmírné stanice nad městem (dráha CelesTrak, výpočet satellite.js) se seznamem v záložce Dnes a během přeletu světelná
// tečka s upozorněním. Viditelný přelet: stanice výš než 10° nad obzorem, sama na slunci, u nás po soumraku (Slunce pod −6°).
const RAD = Math.PI / 180, SMER = ['S', 'SV', 'V', 'JV', 'J', 'JZ', 'Z', 'SZ'];
const smer = (az) => SMER[Math.round(((az / RAD) % 360 + 360) % 360 / 45) % 8];
const hm = (d) => `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
const den = (d) => { const t = new Date(); return d.toDateString() === t.toDateString() ? 'dnes' : d.getDate() === new Date(t.getTime() + 864e5).getDate() ? 'zítra' : `${d.getDate()}. ${d.getMonth() + 1}.`; };

function slunce(d) {                                         // jednotkový vektor ke Slunci v rovníkových souřadnicích + RA, dec
  const n = d.getTime() / 864e5 - 10957.5, L = (280.46 + 0.9856474 * n) * RAD, g = (357.528 + 0.9856003 * n) * RAD;
  const l = L + (1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD, e = (23.439 - 4e-7 * n) * RAD;
  const v = [Math.cos(l), Math.cos(e) * Math.sin(l), Math.sin(e) * Math.sin(l)];
  return { v, ra: Math.atan2(v[1], v[0]), dec: Math.asin(v[2]) };
}
function mesic(d) {                                           // Měsíc nízkou přesností (~1°): RA, dec, osvětlení 0–1 a fáze 0–1
  const n = d.getTime() / 864e5 - 10957.5, L = (218.316 + 13.176396 * n) * RAD, M = (134.963 + 13.064993 * n) * RAD, F = (93.272 + 13.22935 * n) * RAD;
  const l = L + 6.289 * RAD * Math.sin(M), b = 5.128 * RAD * Math.sin(F), e = 23.439 * RAD;
  const x = Math.cos(b) * Math.cos(l), y = Math.cos(e) * Math.cos(b) * Math.sin(l) - Math.sin(e) * Math.sin(b), z = Math.sin(e) * Math.cos(b) * Math.sin(l) + Math.cos(e) * Math.sin(b);
  const s = slunce(d), faze = ((((l - Math.atan2(Math.cos(e) * Math.sin(0), 1)) - Math.atan2(s.v[1] / Math.cos(e), s.v[0])) / (2 * Math.PI)) % 1 + 1) % 1;
  return { ra: Math.atan2(y, x), dec: Math.asin(z), faze, osv: (1 - Math.cos(faze * 2 * Math.PI)) / 2 };
}
function altAz(ra, dec, lat, lon, gmst) {                     // výška a azimut (od severu) objektu nad obzorem
  const H = gmst + lon - ra, sa = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(H), alt = Math.asin(sa);
  const az = Math.atan2(-Math.sin(H) * Math.cos(dec), Math.cos(lat) * Math.sin(dec) - Math.sin(lat) * Math.cos(dec) * Math.cos(H));
  return { alt, az: (az + 2 * Math.PI) % (2 * Math.PI) };
}
const fazeNazev = (f) => (f < 0.03 || f > 0.97 ? 'nov' : f < 0.22 ? 'dorůstající srpek' : f < 0.28 ? 'první čtvrť' : f < 0.47 ? 'dorůstající Měsíc' : f < 0.53 ? 'úplněk' : f < 0.72 ? 'couvající Měsíc' : f < 0.78 ? 'poslední čtvrť' : 'couvající srpek');

async function nactiSat() {
  if (!window.satellite) await new Promise((ok, chyba) => {
    const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/satellite.js/5.0.0/satellite.min.js';
    s.integrity = 'sha384-e6V1JVpc+kVNTxT0gEOla7yL4c92Romsw7itPoipfzHbEjzUwPhTv6oeVDMHHzqT'; s.crossOrigin = 'anonymous'; s.onload = ok; s.onerror = chyba; document.head.append(s);
  });
  let tle = null;
  try { const c = JSON.parse(localStorage.getItem('izo-iss') || 'null'); if (c && Date.now() - c.t < 12 * 3600e3) tle = c.tle; } catch {}
  if (!tle) {
    const r = await fetch('https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE', { signal: AbortSignal.timeout(20000) });
    const t = (await r.text()).trim().split('\n').map((q) => q.trim()); if (t.length < 3) throw new Error('TLE');
    tle = [t[1], t[2]]; try { localStorage.setItem('izo-iss', JSON.stringify({ t: Date.now(), tle })); } catch {}
  }
  return window.satellite.twoline2satrec(tle[0], tle[1]);
}

export async function spust({ lat, lon, panelPo }) {
  const I = window.Izomapa; if (!I) return;
  const la = lat * RAD, lo = lon * RAD, S = window.satellite ? window.satellite : null;
  let sat = null;
  try { sat = await nactiSat(); } catch { sat = null; }
  const sat_ = window.satellite;
  const stav = (d) => {                                       // ISS v čase d: výška, azimut, na slunci, u nás tma
    const pv = sat_.propagate(sat, d); if (!pv.position) return null;
    const gmst = sat_.gstime(d), obs = { longitude: lo, latitude: la, height: 0.35 };
    const la_ = sat_.ecfToLookAngles(obs, sat_.eciToEcf(pv.position, gmst));
    const r = pv.position, s = slunce(d), rs = r.x * s.v[0] + r.y * s.v[1] + r.z * s.v[2];
    const stin = rs < 0 && Math.hypot(r.x - rs * s.v[0], r.y - rs * s.v[1], r.z - rs * s.v[2]) < 6371;
    const sAlt = altAz(s.ra, s.dec, la, lo, gmst).alt;
    return { alt: la_.elevation, az: la_.azimuth, sviti: !stin, tma: sAlt < -6 * RAD };
  };
  // přelety na 2 dny dopředu (krok 20 s), jen viditelné
  const prelety = [];
  if (sat) {
    let akt = null;
    for (let t = Date.now() - 600e3; t < Date.now() + 2 * 864e5; t += 20e3) {
      const q = stav(new Date(t)), vid = q && q.alt > 10 * RAD && q.sviti && q.tma;
      if (vid && !akt) akt = { od: t, az0: q.az, max: q.alt, do: t, az1: q.az };
      else if (vid) { akt.do = t; akt.az1 = q.az; if (q.alt > akt.max) akt.max = q.alt; }
      else if (akt) { if (akt.do - akt.od >= 60e3) prelety.push(akt); akt = null; }
    }
  }
  // panel: Na obloze
  const box = document.createElement('details'); box.className = 'sec'; box.id = 'nebeBox';
  box.innerHTML = '<summary>Na obloze <span class="sum-val"></span></summary><ul class="places nebe-list"></ul><p class="predpoved-zdroj">Dráha ISS: <a href="https://celestrak.org/" target="_blank" rel="noopener">CelesTrak</a>, výpočet v prohlížeči (satellite.js). Časy jsou orientační (±1 min).</p>';
  const ul = box.querySelector('ul'), li = (a, b) => { const l = document.createElement('li'); const s1 = document.createElement('span'); s1.className = 'nebe-co'; s1.textContent = a; const s2 = document.createElement('span'); s2.textContent = b; l.append(s1, s2); ul.append(l); };
  const m0 = mesic(new Date());
  li('Měsíc', `${fazeNazev(m0.faze)}, osvětlený z ${Math.round(m0.osv * 100)} %`);
  const dalsi = prelety.filter((p) => p.do > Date.now()).slice(0, 4);
  if (sat) {
    if (!dalsi.length) li('ISS', 'v příštích 2 dnech nebude nad městem vidět');
    for (const p of dalsi) li(`ISS ${den(new Date(p.od))} ${hm(new Date(p.od))}`, `${Math.max(1, Math.round((p.do - p.od) / 60e3))} min, z ${smer(p.az0)} na ${smer(p.az1)}, nejvýš ${Math.round(p.max / RAD)}° nad obzorem`);
  }
  box.querySelector('.sum-val').textContent = dalsi.length ? `ISS ${den(new Date(dalsi[0].od))} ${hm(new Date(dalsi[0].od))}` : fazeNazev(m0.faze);
  panelPo.after(box);

  // upozornění během přeletu
  const pruh = document.createElement('button'); pruh.type = 'button'; pruh.className = 'vystraha-pruh iss-pruh'; pruh.hidden = true; pruh.style.setProperty('--vc', '#7fc8ff');
  pruh.addEventListener('click', () => { document.querySelector('.tab[data-tab=dnes]')?.click(); box.open = true; box.scrollIntoView({ block: 'nearest' }); });
  document.body.append(pruh);
  let iss = null;
  if (sat) setInterval(() => {
    const q = stav(new Date());
    iss = q && q.alt > 10 * RAD && q.sviti && q.tma ? q : null;
    pruh.hidden = !iss;
    if (iss) pruh.textContent = `Právě teď nad městem letí ISS: hledej ji na ${smer(iss.az)}, ${Math.round(iss.alt / RAD)}° nad obzorem`;
  }, 2000);

  // obloha: hvězdy a Měsíc mimo plochu mapy (v noci), ISS jako jasná tečka
  const HV = Array.from({ length: 260 }, (_, i) => { const r = (k) => { const x = Math.sin((i * 7.13 + k) * 127.1) * 43758.5453; return x - Math.floor(x); }; return [r(1), r(2), 0.4 + r(3) * 1.2, r(4) * 6.28]; });
  const naObrazovce = (az, alt, cw, ch) => [cw * (0.5 + 0.5 * Math.sin(az - Math.PI / 4)), ch * (0.04 + 0.42 * (1 - alt / (Math.PI / 2)))];   // pohled na severovýchod
  I.onFrame((ctx, v) => {
    if (v.night < 0.55) return;
    const a = Math.min(1, (v.night - 0.55) / 0.3), t = performance.now() / 1000;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, v.cw, v.ch);                // mimo mapu: obdélník a díry po čtvercích mapy (opačný směr)
    for (const q of I.obrysMapy()) {
      const P = q.map(([ix, iy]) => v.toScreen(ix, iy)); let A = 0; for (let i = 0; i < 4; i++) { const [x1, y1] = P[i], [x2, y2] = P[(i + 1) % 4]; A += x1 * y2 - x2 * y1; }
      const R = A > 0 ? P.slice().reverse() : P; ctx.moveTo(...R[0]); for (const p of R.slice(1)) ctx.lineTo(...p); ctx.closePath();
    }
    ctx.clip('nonzero');
    for (const [x, y, s, f] of HV) { ctx.fillStyle = `rgba(235,240,255,${(a * (0.45 + 0.45 * Math.sin(t * 1.3 + f))).toFixed(2)})`; ctx.fillRect(Math.round(x * v.cw), Math.round(y * v.ch), s > 1.2 ? 2 : 1, s > 1.2 ? 2 : 1); }
    const d = new Date(), gm = sat_ ? sat_.gstime(d) : 0, m = mesic(d), mp = altAz(m.ra, m.dec, la, lo, gm);
    if (sat_ && mp.alt > 0) {                                     // Měsíc: kotouč a stín podle fáze
      const [X, Y] = naObrazovce(mp.az, mp.alt, v.cw, v.ch), r = 11;
      ctx.fillStyle = `rgba(245,240,215,${a})`; ctx.beginPath(); ctx.arc(X, Y, r, 0, 2 * Math.PI); ctx.fill();
      ctx.fillStyle = `rgba(20,26,40,${(a * 0.92).toFixed(2)})`; ctx.beginPath();
      const k = Math.cos(m.faze * 2 * Math.PI), vpravo = m.faze < 0.5;
      ctx.ellipse(X + (vpravo ? -1 : 1) * r * (1 - Math.abs(k)) * (k > 0 ? 1 : 0), Y, r * Math.abs(k), r, 0, 0, 2 * Math.PI); if (m.osv < 0.5) ctx.arc(X, Y, r, vpravo ? Math.PI / 2 : -Math.PI / 2, vpravo ? -Math.PI / 2 : Math.PI / 2); ctx.fill();
    }
    ctx.restore();
    if (iss) {                                                    // ISS: jasná tečka se stopou a popiskem (i nad mapou, letí po obloze)
      const [X, Y] = naObrazovce(iss.az, iss.alt, v.cw, v.ch);
      ctx.fillStyle = 'rgba(255,255,240,.95)'; ctx.fillRect(Math.round(X) - 2, Math.round(Y) - 2, 4, 4);
      ctx.fillStyle = 'rgba(255,255,240,.35)'; ctx.fillRect(Math.round(X) - 4, Math.round(Y) - 4, 8, 8);
      ctx.font = '700 11px "Atkinson Hyperlegible", system-ui, sans-serif'; ctx.fillStyle = '#eef1e6'; ctx.fillText('ISS', X + 7, Y - 5);
    }
  }, { layer: 'sky', priority: -10 });
}
