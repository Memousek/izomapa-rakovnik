// Procedurální zvuky 3D jízdy (Web Audio, žádné soubory): motor, pneu a vítr, město, déšť, přechod, autobus, hlášení.
const KLIC = 'izo-3d-zvuk';
const mez = (v, a, b) => (v < a ? a : v > b ? b : v);
// nejvyšší rychlost (m/s) v jednotlivých stupních
const STUPNE = [8, 14, 22, 32, 60];

export function vytvorZvuky(api) {
  const hrac = api.hrac;
  let zap = false;
  try { zap = localStorage.getItem(KLIC) === '1'; } catch (e) { /* bez úložiště */ }
  let ctx = null, N = null;           // N = uzly
  const tlacitko = document.createElement('button');
  tlacitko.type = 'button';
  const popisek = () => {
    tlacitko.textContent = 'Zvuk: ' + (zap ? 'zapnuto' : 'vypnuto');
    tlacitko.setAttribute('aria-pressed', zap ? 'true' : 'false');
  };
  popisek();

  function sestav() {
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AC && typeof AudioContext === 'undefined') return false;
    ctx = new (AC || AudioContext)();
    const master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination);
    // jeden šum (2 s) sdílený všemi vrstvami
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const sum = () => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(0, Math.random() * 1.5); return s; };
    const gain = (v, cil) => { const g = ctx.createGain(); g.gain.value = v; g.connect(cil || master); return g; };
    const filtr = (typ, f, q, cil) => { const x = ctx.createBiquadFilter(); x.type = typ; x.frequency.value = f; if (q) x.Q.value = q; x.connect(cil); return x; };
    const osc = (typ, f, cil) => { const o = ctx.createOscillator(); o.type = typ; o.frequency.value = f; o.connect(cil); o.start(); return o; };
    const n = {};
    // motor
    n.motG = gain(0);
    n.motLP = filtr('lowpass', 600, 0.8, n.motG);
    n.mot1 = osc('sawtooth', 40, n.motLP);
    n.mot2 = osc('square', 20, gain(0.35, n.motLP));
    n.motSumG = gain(0, n.motG);
    sum().connect(filtr('bandpass', 300, 1, n.motSumG));
    // pneumatiky a vítr
    n.pneuG = gain(0);
    n.pneuF = filtr('bandpass', 500, 0.7, n.pneuG);
    sum().connect(n.pneuF);
    n.vitrG = gain(0);
    sum().connect(filtr('highpass', 1500, 0.5, n.vitrG));
    // město: hukot, míjení, ptáci
    n.mestoG = gain(0);
    sum().connect(filtr('lowpass', 180, 0.7, n.mestoG));
    n.mijG = gain(0);
    n.mijF = filtr('bandpass', 400, 2, n.mijG);
    sum().connect(n.mijF);
    n.ptakG = gain(0);
    n.ptak = osc('sine', 3000, n.ptakG);
    // déšť a sníh
    n.dest = gain(0);
    sum().connect(filtr('highpass', 900, 0.4, filtr('lowpass', 7000, 0.4, n.dest)));
    n.snih = gain(0);
    sum().connect(filtr('lowpass', 1100, 0.4, n.snih));
    // tikání přechodu
    n.tikG = gain(0);
    n.tik = osc('square', 2400, n.tikG);
    // autobus
    n.busG = gain(0);
    n.busO = osc('sawtooth', 50, filtr('lowpass', 160, 0.7, n.busG));
    sum().connect(filtr('lowpass', 250, 0.5, n.busG));
    // policejní siréna (pouliční režim): dva tóny střídavě, hlasitost podle vzdálenosti nejbližšího vozu
    n.sirG = gain(0);
    n.sirO = osc('sawtooth', 650, filtr('lowpass', 2200, 0.7, n.sirG));
    n.master = master;
    N = n;
    return true;
  }

  function start() {
    if (!zap) return;
    try {
      if (!ctx && !sestav()) return;
      if (ctx.state === 'suspended') ctx.resume();
    } catch (e) { /* bez audia */ }
  }
  const gesto = () => {
    if (!zap) return;
    start();
    if (ctx && ctx.state !== 'suspended') odeberGesta();
  };
  let gestaAktivni = false;
  function pripojGesta() {
    if (gestaAktivni || typeof window === 'undefined') return;
    gestaAktivni = true;
    window.addEventListener('pointerdown', gesto, true);
    window.addEventListener('keydown', gesto, true);
  }
  function odeberGesta() {
    if (!gestaAktivni) return;
    gestaAktivni = false;
    window.removeEventListener('pointerdown', gesto, true);
    window.removeEventListener('keydown', gesto, true);
  }
  pripojGesta();

  tlacitko.addEventListener('click', () => {
    zap = !zap;
    try { localStorage.setItem(KLIC, zap ? '1' : '0'); } catch (e) { /* nic */ }
    popisek();
    if (zap) { start(); pripojGesta(); } else {
      if (N) { for (const k of ['motG', 'pneuG', 'vitrG', 'mestoG', 'mijG', 'ptakG', 'dest', 'snih', 'tikG', 'busG', 'motSumG', 'sirG']) N[k].gain.setTargetAtTime(0, ctx.currentTime, 0.05); }
      try { if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel(); } catch (e) { /* nic */ }
    }
  });

  const bezi = () => zap && ctx && ctx.state === 'running' && N;

  // ---------- průběžné řízení ----------
  let akum = 0, vPred = null, plyn = 0.2, rpm = 900;
  let casMij = 6, casPtak = 3, casTik = 0, ptaci = 0, ptakF = 3000;
  const P = (param, v, tc) => param.setTargetAtTime(v, ctx.currentTime, tc || 0.12);

  function update(dt) {
    if (!(dt > 0)) return;
    akum += dt;
    if (bezi()) planovac(dt);
    if (akum < 0.05) return;
    const krok = akum; akum = 0;
    if (!bezi()) { vPred = null; return; }
    const c = hrac.vAuto ? hrac.car : null;
    const bus = api.rychlostAutobusu();
    const vBus = bus != null && !hrac.vAuto;
    const w = api.pocasi() || {};
    const noc = mez(api.doba(), 0, 1);
    const hust = mez(api.hustota() / 900, 0, 1);
    let v = 0;
    if (c) {
      v = Math.abs(c.v);
      const a = vPred == null ? 0 : (v - vPred) / krok;
      vPred = v;
      plyn += (mez(0.2 + a * 0.3, 0, 1) - plyn) * 0.25;
    } else vPred = null;

    // motor
    if (c && !vBus) {
      let g = 0;
      while (g < STUPNE.length - 1 && v > STUPNE[g]) g++;
      const frac = mez(v / STUPNE[g], 0, 1);
      rpm = 900 + 5000 * frac * (0.55 + 0.45 * plyn) + 400 * plyn;
      const f = rpm / 60 * 2;
      P(N.mot1.frequency, f); P(N.mot2.frequency, f / 2);
      P(N.motLP.frequency, 350 + plyn * 900 + rpm * 0.15);
      P(N.motG.gain, 0.05 + plyn * 0.09 + frac * 0.02);
      P(N.motSumG.gain, 0.04 + plyn * 0.08);
    } else {
      P(N.motG.gain, 0, 0.08); P(N.motSumG.gain, 0, 0.08);
    }
    // pneumatiky a vítr
    const vv = c && !vBus ? v : 0;
    P(N.pneuF.frequency, 300 + vv * 22);
    P(N.pneuG.gain, Math.min(0.2, Math.pow(vv / 40, 1.4) * 0.2));
    P(N.vitrG.gain, Math.min(0.2, Math.pow(vv / 45, 2) * 0.2));
    // město (v autě tlumené)
    const utlum = c ? 0.6 : 1;
    P(N.mestoG.gain, hust * 0.16 * utlum, 0.5);
    ptaci = (1 - noc) * (1 - mez((w.dest || 0) * 2, 0, 1)) * (0.3 + 0.7 * (1 - hust));
    // počasí
    P(N.dest.gain, (w.dest || 0) * 0.24 * (c || vBus ? 0.55 : 1), 0.4);
    P(N.snih.gain, (w.snih || 0) * 0.05, 0.6);
    // autobus
    if (vBus) {
      P(N.busO.frequency, 46 + bus * 2.2);
      P(N.busG.gain, 0.12 + Math.min(0.06, bus * 0.004), 0.3);
    } else P(N.busG.gain, 0, 0.3);
    // minimální hlasitost míjení závisí na hustotě
    casMij = Math.min(casMij, 4 + (1 - hust) * 14);
  }

  // události v čase (míjení aut, ptáci, tikání), bez alokací
  function planovac(dt) {
    const t = ctx.currentTime;
    casMij -= dt;
    if (casMij <= 0) {
      const hust = mez(api.hustota() / 900, 0, 1);
      casMij = 4 + Math.random() * 10 * (1.2 - hust);
      if (hust > 0.05) {
        const dlouho = 0.8 + Math.random() * 0.8;
        N.mijF.frequency.cancelScheduledValues(t);
        N.mijF.frequency.setValueAtTime(250, t);
        N.mijF.frequency.linearRampToValueAtTime(900 + Math.random() * 500, t + dlouho * 0.5);
        N.mijF.frequency.linearRampToValueAtTime(300, t + dlouho);
        N.mijG.gain.cancelScheduledValues(t);
        N.mijG.gain.setValueAtTime(0, t);
        N.mijG.gain.linearRampToValueAtTime(0.1 + 0.15 * hust, t + dlouho * 0.5);
        N.mijG.gain.linearRampToValueAtTime(0, t + dlouho);
      }
    }
    casPtak -= dt;
    if (casPtak <= 0) {
      casPtak = 1.5 + Math.random() * 6;
      if (ptaci > 0.15 && Math.random() < ptaci) {
        const o = 2 + Math.floor(Math.random() * 3);
        ptakF = 2400 + Math.random() * 1800;
        for (let i = 0; i < o; i++) {
          const s = t + i * 0.13;
          N.ptak.frequency.setValueAtTime(ptakF, s);
          N.ptak.frequency.linearRampToValueAtTime(ptakF * 1.35, s + 0.07);
          N.ptakG.gain.setValueAtTime(0, s);
          N.ptakG.gain.linearRampToValueAtTime(0.025 * ptaci, s + 0.015);
          N.ptakG.gain.linearRampToValueAtTime(0, s + 0.09);
        }
      }
    }
    // přechod: signál pro zrak. postižené, při zelené rychlé tikání
    const tika = api.prechodTika();
    if (tika) {
      casTik -= dt;
      if (casTik <= 0) {
        casTik = tika === 'cekej' ? 1 / 1.3 : 1 / 5;
        N.tikG.gain.setValueAtTime(0.0001, t);
        N.tikG.gain.linearRampToValueAtTime(0.06, t + 0.003);
        N.tikG.gain.linearRampToValueAtTime(0, t + 0.03);
      }
    } else casTik = 0;
  }

  // ---------- jednorázové zvuky ----------
  function pip(f, od, trv, typ, hlas, f2) {
    const t = ctx.currentTime + od;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = typ || 'sine'; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.linearRampToValueAtTime(f2, t + trv);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(hlas || 0.2, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + trv);
    o.connect(g); g.connect(N.master);
    o.start(t); o.stop(t + trv + 0.05);
  }
  function hraj(nazev) {
    if (!bezi()) return;
    if (nazev === 'pokuta') { pip(220, 0, 0.25, 'square', 0.12); pip(220, 0.32, 0.25, 'square', 0.12); }
    else if (nazev === 'odmena') { pip(523, 0, 0.5, 'sine', 0.2); pip(659, 0.1, 0.5, 'sine', 0.2); pip(784, 0.2, 0.7, 'sine', 0.2); pip(1568, 0.2, 0.7, 'sine', 0.05); }
    else if (nazev === 'nastup') { pip(880, 0, 0.5, 'sine', 0.2); pip(660, 0.35, 0.7, 'sine', 0.2); }
    else if (nazev === 'mise') { pip(440, 0, 0.3, 'triangle', 0.22); pip(554, 0.18, 0.5, 'triangle', 0.22); }
    else if (nazev === 'uder') { bum(0.12, 900, 0.35); pip(140, 0, 0.12, 'sine', 0.3, 60); }
    else if (nazev === 'zasah') { bum(0.2, 500, 0.45); pip(110, 0, 0.2, 'triangle', 0.35, 50); }
    else if (nazev === 'naraz') { bum(0.45, 1400, 0.6); pip(70, 0, 0.4, 'sawtooth', 0.25, 35); }
    else if (nazev === 'vybuch') { bum(1.6, 700, 0.9); pip(55, 0, 1.4, 'sawtooth', 0.4, 25); }
    else if (nazev === 'klakson') { pip(415, 0, 0.45, 'square', 0.08); pip(523, 0, 0.45, 'square', 0.06); }
    else if (nazev === 'sebrat') { pip(988, 0, 0.12, 'square', 0.08); pip(1319, 0.08, 0.18, 'square', 0.08); }
    else if (nazev === 'hvezda') { pip(330, 0, 0.25, 'square', 0.12); pip(247, 0.22, 0.4, 'square', 0.12); }
    else if (nazev === 'zatcen') { pip(392, 0, 0.3, 'square', 0.14); pip(330, 0.3, 0.3, 'square', 0.14); pip(262, 0.6, 0.8, 'square', 0.14); }
  }
  // šumová rána (úder, náraz, výbuch): krátký šum přes dolní propust
  function bum(trv, f, hlas) {
    const t = ctx.currentTime, n = Math.ceil(ctx.sampleRate * trv), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
    const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = b; fl.type = 'lowpass'; fl.frequency.value = f; g.gain.value = hlas;
    s.connect(fl); fl.connect(g); g.connect(N.master); s.start(t);
  }
  // siréna: v = 0 (ticho) až 1 (vůz těsně u hráče)
  function sirena(v) {
    if (!bezi()) return;
    const t = ctx.currentTime;
    N.sirO.frequency.setTargetAtTime(Math.floor(t * 1.6) % 2 ? 870 : 650, t, 0.02);
    N.sirG.gain.setTargetAtTime(mez(v, 0, 1) * 0.07, t, 0.15);
  }

  function hlaseni(text) {
    if (!bezi()) return;
    // dvojtónový gong
    pip(659, 0, 1.0, 'sine', 0.25); pip(1318, 0, 0.6, 'sine', 0.05);
    pip(523, 0.55, 1.2, 'sine', 0.25); pip(1046, 0.55, 0.7, 'sine', 0.05);
    try {
      if (typeof speechSynthesis === 'undefined' || !text) return;
      const hlasy = speechSynthesis.getVoices();
      const cs = hlasy.find((h) => /^cs(-|_|$)/i.test(h.lang));
      if (!cs) return;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'cs-CZ'; u.voice = cs; u.rate = 0.95;
      setTimeout(() => { try { speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (e) { /* nic */ } }, 1300);
    } catch (e) { /* jen gong */ }
  }

  return { update, hraj, hlaseni, tlacitko, sirena };
}
