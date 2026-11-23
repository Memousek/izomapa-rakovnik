// Zvuky prostředí mapy (výchozí vypnuto, nápad z minimapa.cz, kód vlastní). Vše se skládá ve Web Audio z šumu
// a oscilátorů, žádné nahrávky: hukot města podle přiblížení a dopravy, ptáci ve dne na jaře a v létě,
// cvrčci v letní noci, déšť, vítr při sněžení a v mlze; zvon Velké zvonice na celou hodinu a vlak u nádraží (podle jízdních řádů),
// když se díváš do jejich okolí. stav() vrací {noc 0–1, obdobi, pocasi, km, doprava, zvon, nadrazi, vlak (m)}.
let ctx = null, hlavni = null, vrstvy = null, casovac = null, ptaciT = null;

function sum(ctx, druh) {                                       // smyčka 4 s šumu: bílý nebo hnědý
  const n = ctx.sampleRate * 4, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; if (druh === 'hnedy') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w; }
  const s = ctx.createBufferSource(); s.buffer = b; s.loop = true; s.start(); return s;
}
function vrstva(ctx, zdroj, filtr, f, q = 0.7) {
  const fl = ctx.createBiquadFilter(); fl.type = filtr; fl.frequency.value = f; fl.Q.value = q;
  const g = ctx.createGain(); g.gain.value = 0; zdroj.connect(fl).connect(g).connect(hlavni); return g;
}
function cvrlik() {                                             // jeden ptačí trylek: pár rychlých stoupajících tónů
  const t0 = ctx.currentTime, f = 2600 + Math.random() * 2200, n = 2 + Math.floor(Math.random() * 4);
  for (let k = 0; k < n; k++) {
    const o = ctx.createOscillator(), g = ctx.createGain(), t = t0 + k * (0.09 + Math.random() * 0.05);
    o.type = 'sine'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * (1.2 + Math.random() * 0.4), t + 0.07);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vrstvy.ptaci, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    o.connect(g).connect(hlavni); o.start(t); o.stop(t + 0.1);
  }
}
const hladce = (g, v) => g.gain.setTargetAtTime(v, ctx.currentTime, 0.8);
function uder(t, hlas) {                                         // úder zvonu: nesouzvučné alikvoty s dlouhým doznívaním
  for (const [k, a, dob] of [[0.5, 0.5, 5], [1, 1, 4], [1.19, 0.5, 3], [1.5, 0.35, 2.6], [2, 0.3, 2.2], [2.74, 0.2, 1.6], [3.76, 0.12, 1.2]]) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = 392 * k;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(hlas * a, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dob);
    o.connect(g).connect(hlavni); o.start(t); o.stop(t + dob + 0.1);
  }
}
function znelka(hlas) {                                          // nádražní znělka: tři tóny nahoru
  const t0 = ctx.currentTime;
  [523, 659, 784].forEach((f, k) => { const o = ctx.createOscillator(), g = ctx.createGain(), t = t0 + k * 0.42; o.type = 'triangle'; o.frequency.value = f;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(hlas, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1); o.connect(g).connect(hlavni); o.start(t); o.stop(t + 1.2); });
}
let posledniHodina = -1, vlakBlizko = false;

export function zapni(stav) {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    hlavni = ctx.createGain(); hlavni.gain.value = 0.5; hlavni.connect(ctx.destination);
    const bily = sum(ctx, 'bily'), hnedy = sum(ctx, 'hnedy');
    vrstvy = { mesto: vrstva(ctx, hnedy, 'lowpass', 380), dest: vrstva(ctx, bily, 'bandpass', 1800, 0.4), vitr: vrstva(ctx, hnedy, 'bandpass', 520, 0.9), ptaci: 0 };
    const cv = ctx.createOscillator(), am = ctx.createOscillator(), amg = ctx.createGain(); // cvrčci: 4,4 kHz modulovaný rychlým pulzem
    cv.frequency.value = 4400; am.frequency.value = 28; amg.gain.value = 0.5; am.connect(amg.gain);
    const cg = ctx.createGain(); cg.gain.value = 0; cv.connect(amg).connect(cg).connect(hlavni); cv.start(); am.start(); vrstvy.cvrcci = cg;
    vrstvy.vlak = vrstva(ctx, hnedy, 'lowpass', 140, 0.8);       // dunění projíždějícího vlaku
  }
  ctx.resume();
  const krok = () => {
    const s = stav(), blizko = Math.max(0, Math.min(1, (3 - s.km) / 2.6)), den = 1 - s.noc;
    hladce(vrstvy.mesto, (s.doprava ? 0.05 + 0.25 * blizko : 0.03) * (0.4 + 0.6 * den));
    hladce(vrstvy.dest, s.pocasi === 'rain' ? 0.32 : 0);
    hladce(vrstvy.vitr, s.pocasi === 'snow' ? 0.22 : s.pocasi === 'fog' ? 0.1 : 0.03);
    hladce(vrstvy.cvrcci, s.obdobi === 'summer' && s.noc > 0.6 && s.pocasi !== 'rain' ? 0.012 : 0);
    vrstvy.ptaci = (s.obdobi === 'spring' || s.obdobi === 'summer') && den > 0.5 && s.pocasi !== 'rain' ? 0.05 * (0.5 + blizko) : 0;
    // zvon: na celou hodinu (7–21 h podle pražského času) tolik úderů, kolik je hodin (1–12), slyšet do ~900 m od středu pohledu
    const p = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Prague' })), hod = p.getHours();
    if (p.getMinutes() === 0 && hod !== posledniHodina) {
      posledniHodina = hod;
      const hl = Math.max(0, 1 - s.zvon / 900) * 0.16;
      if (hl > 0.005 && hod >= 7 && hod <= 21 && ctx.state === 'running') for (let k = 0; k < (hod % 12 || 12); k++) uder(ctx.currentTime + 0.3 + k * 2.4, hl);
    }
    // vlak u nádraží: přijíždí (do 350 m) → znělka a dunění podle vzdálenosti
    const blizkoVlak = s.vlak < 350 && s.nadrazi < 900;
    if (blizkoVlak && !vlakBlizko && ctx.state === 'running') znelka(Math.max(0, 1 - s.nadrazi / 900) * 0.06);
    vlakBlizko = blizkoVlak;
    hladce(vrstvy.vlak, s.vlak < 600 && s.nadrazi < 900 ? (1 - s.vlak / 600) * (1 - s.nadrazi / 900) * 0.35 : 0);
  };
  krok(); clearInterval(casovac); casovac = setInterval(krok, 600);
  clearTimeout(ptaciT);
  const dalsi = () => { if (vrstvy.ptaci > 0 && !document.hidden && ctx.state === 'running') cvrlik(); ptaciT = setTimeout(dalsi, 700 + Math.random() * 3200); };   // pozastavený kontext: uzly by se jen hromadily
  dalsi();
}

export function vypni() {
  clearInterval(casovac); clearTimeout(ptaciT);
  if (ctx) ctx.suspend();
}
