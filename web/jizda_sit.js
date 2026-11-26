// Multiplayer 3D jízdy: zprávy mezi prohlížečem (jizda/hraci.js) a serverem (multiplayer/worker.js).
// Poloha jde binárně (20 B na hráče), ostatní (jména, příchody, odchody) jako JSON text.
// Souřadnice jsou světové metry jako v jizda.html: x na východ, y na sever, z výška.
//
// prohlížeč → server, STAV (20 B): u8 typ=1, u8 režim, u8 příznaky, u8 0, f32 x, f32 y, f32 z, i16 směr (rad·10⁴), i16 rychlost (m/s·100)
// server → prohlížeč, SNIMEK: u8 typ=2, u8 0, u16 počet, pak záznamy po 20 B:
//   u16 id, u8 režim, u8 příznaky, f32 x, f32 y, f32 z, i16 směr, i16 rychlost
export const STAV = 1, SNIMEK = 2, VEL = 20;
export const REZIM = { pesky: 0, auto: 1, bus: 2 };
export const PRIZNAK = { svetla: 1, brzda: 2, vlevo: 4, vpravo: 8, klakson: 16, pryc: 32 };   // pryc: karta na pozadí
export const DOSAH = 700, MAX_BLIZKYCH = 32;                // komu se kdo posílá: do 700 m, nejvýš 32 nejbližších
const MEZ_XY = 100000, MEZ_Z = [-500, 3000];                // rozumný rozsah souřadnic (m); jinak zprávu zahodit

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const i16 = (v) => Math.max(-32767, Math.min(32767, Math.round(v)));
const platny = (s) => s.rezim <= 2 && [s.x, s.y, s.z, s.yaw, s.v].every(Number.isFinite)
  && Math.abs(s.x) < MEZ_XY && Math.abs(s.y) < MEZ_XY && s.z > MEZ_Z[0] && s.z < MEZ_Z[1];

function zapis(dv, o, s) {
  dv.setUint8(o, s.rezim); dv.setUint8(o + 1, s.flags & 255);
  dv.setFloat32(o + 2, s.x, true); dv.setFloat32(o + 6, s.y, true); dv.setFloat32(o + 10, s.z, true);
  dv.setInt16(o + 14, i16(wrap(s.yaw) * 1e4), true); dv.setInt16(o + 16, i16(s.v * 100), true);
}
function cti(dv, o) {
  return { rezim: dv.getUint8(o), flags: dv.getUint8(o + 1), x: dv.getFloat32(o + 2, true), y: dv.getFloat32(o + 6, true),
    z: dv.getFloat32(o + 10, true), yaw: dv.getInt16(o + 14, true) / 1e4, v: dv.getInt16(o + 16, true) / 100 };
}

export function zakodujStav(s) {
  const b = new ArrayBuffer(VEL), dv = new DataView(b);
  dv.setUint8(0, STAV); zapis(dv, 1, s);
  return b;
}
// null = neplatná zpráva (jiná délka, typ, nesmyslné hodnoty)
export function dekodujStav(b) {
  if (!(b instanceof ArrayBuffer) || b.byteLength !== VEL) return null;
  const dv = new DataView(b);
  if (dv.getUint8(0) !== STAV) return null;
  const s = cti(dv, 1);
  return platny(s) ? s : null;
}

export function zakodujSnimek(zaznamy) {
  const b = new ArrayBuffer(4 + zaznamy.length * VEL), dv = new DataView(b);
  dv.setUint8(0, SNIMEK); dv.setUint16(2, zaznamy.length, true);
  zaznamy.forEach(({ id, stav }, k) => { const o = 4 + k * VEL; dv.setUint16(o, id, true); zapis(dv, o + 2, stav); });
  return b;
}
export function dekodujSnimek(b) {
  if (!(b instanceof ArrayBuffer) || b.byteLength < 4) return null;
  const dv = new DataView(b), n = dv.getUint16(2, true);
  if (dv.getUint8(0) !== SNIMEK || b.byteLength !== 4 + n * VEL) return null;
  const out = [];
  for (let k = 0; k < n; k++) { const o = 4 + k * VEL; out.push({ id: dv.getUint16(o, true), ...cti(dv, o + 2) }); }
  return out;
}

// nejbližší hráči kolem stavu `ja` (ostatní: [{ id, stav }]), seřazení od nejbližšího
export function vyberBlizke(ja, ostatni, dosah = DOSAH, max = MAX_BLIZKYCH) {
  const d2 = dosah * dosah;
  return ostatni.map((o) => [o, (o.stav.x - ja.x) ** 2 + (o.stav.y - ja.y) ** 2]).filter(([, d]) => d <= d2)
    .sort((a, b) => a[1] - b[1]).slice(0, max).map(([o]) => o);
}

// jména přiděluje server; hráč si je může změnit (platneJmeno níže, server hlídá i obsazená jména)
const PRIDAVNA = ['Rychlý', 'Líný', 'Veselý', 'Tichý', 'Bystrý', 'Statečný', 'Ospalý', 'Zvědavý', 'Mlsný', 'Chytrý', 'Hbitý',
  'Klidný', 'Noční', 'Ranní', 'Toulavý', 'Uprášený', 'Zelený', 'Modrý', 'Rozvážný', 'Nebojácný'];
const ZVIRATA = ['jezevec', 'ježek', 'bobr', 'kos', 'čáp', 'sokol', 'rys', 'jelen', 'zajíc', 'kapr', 'sumec', 'mlok', 'dudek',
  'datel', 'výr', 'krtek', 'svišť', 'tchoř', 'havran', 'netopýr'];
export function vymyslJmeno(u, obsazena = new Set()) {   // u: náhodné číslo 0–1
  const n = PRIDAVNA.length * ZVIRATA.length, k0 = Math.floor(u * n);
  for (let k = 0; k < n; k++) {
    const i = (k0 + k * 37) % n, j = `${PRIDAVNA[i % PRIDAVNA.length]} ${ZVIRATA[Math.floor(i / PRIDAVNA.length)]}`;
    if (!obsazena.has(j)) return j;
  }
  return `Hráč ${obsazena.size + 1}`;
}
// barvy hráčů: dobře rozlišitelné od sebe i od šedivých a bílých aut v provozu
export const BARVY = ['#e8443a', '#2f8cff', '#2fbf71', '#ffb020', '#b65cff', '#00c2c7', '#ff6fb1', '#9ccc2a', '#ff7a1a', '#5b6cff', '#e0c400', '#14a38b'];

// ---------- univerzální auto hráče (konfigurátor jizda/garaz.js, model jizda/vozidla.js autoHrace) ----------
// Stejná pravidla platí v prohlížeči i na serveru: cizí auto se postaví jen z hodnot z těchto seznamů a barev #rrggbb.
export const AUTO_VOLBY = {
  k: { hatch: 'Hatchback', sedan: 'Sedan', kombi: 'Kombi', suv: 'SUV', pickup: 'Pick-up', sport: 'Sporťák', van: 'Dodávka',
    // hotové modely (m_…, soubory a měřítko v jizda/vozidla.js HOTOVE): Kenney Car Kit, CC0
    m_sedan: 'Sedan', m_sedan_sport: 'Sportovní sedan', m_hatch_sport: 'Hot hatch', m_suv: 'SUV', m_suv_lux: 'Luxusní SUV',
    m_van: 'Van', m_taxi: 'Taxi', m_policie: 'Policie', m_zavodni: 'Formule', m_futur: 'Formule budoucnosti', m_sanitka: 'Sanitka',
    m_dodavka: 'Dodávka', m_nakladak: 'Náklaďák', m_hasici: 'Hasiči', m_popelar: 'Popeláři', m_traktor: 'Traktor' },
  v: { zadny: 'Jednobarevné', pruhy: 'Závodní pruhy', bok: 'Boční pruh', strecha: 'Barevná střecha', dvoubarevne: 'Dvoubarevné' },
  kola: { ocel: 'Ocelová', alu: 'Hliníková', cerna: 'Černá', zlata: 'Zlatá', barva: 'V barvě doplňku' },
  vys: { nizky: 'Snížený', normal: 'Normální', vysoky: 'Zvýšený' },
  dopl: { spoiler: 'Spoiler', box: 'Střešní box', rampa: 'Světelná rampa', vyfuky: 'Dvojitý výfuk' },
  // postavička hráče (Kenney Mini Characters, jizda/kenney.js); nepovinná, bez ní model podle id hráče
  p: { 'character-male-a': 'Muž 1', 'character-male-b': 'Muž 2', 'character-male-c': 'Muž 3', 'character-male-d': 'Muž 4',
    'character-male-e': 'Muž 5', 'character-male-f': 'Muž 6', 'character-male-g': 'Muž 7', 'character-female-a': 'Žena 1',
    'character-female-b': 'Žena 2', 'character-female-c': 'Žena 3', 'character-female-d': 'Žena 4', 'character-female-e': 'Žena 5',
    'character-female-f': 'Žena 6', 'character-worker': 'Dělník' },
};
export const AUTO_VYCHOZI = { k: 'hatch', b1: '#c0392b', b2: '#f2f2ee', v: 'zadny', kola: 'ocel', vys: 'normal', dopl: [] };
const BARVA = /^#[0-9a-f]{6}$/;
// null = nepoužitelné; jinak očištěná kopie (neznámé doplňky vypadnou, pořadí podle AUTO_VOLBY)
export function platneAuto(a) {
  if (!a || typeof a !== 'object') return null;
  const b1 = String(a.b1 || '').toLowerCase(), b2 = String(a.b2 || '').toLowerCase();
  const ma = (klic) => typeof a[klic] === 'string' && Object.hasOwn(AUTO_VOLBY[klic], a[klic]);   // ne zděděné klíče (toString…)
  if (!ma('k') || !ma('v') || !ma('kola') || !ma('vys')) return null;
  if (!BARVA.test(b1) || !BARVA.test(b2) || (a.dopl !== undefined && !Array.isArray(a.dopl))) return null;
  const dopl = Object.keys(AUTO_VOLBY.dopl).filter((d) => (a.dopl || []).includes(d));
  const o = { k: a.k, b1, b2, v: a.v, kola: a.kola, vys: a.vys, dopl };
  if (ma('p')) o.p = a.p;
  return o;
}

// ---------- vlastní jméno hráče ----------
// 2–20 znaků: písmena (i s diakritikou), číslice, mezera, tečka, pomlčka, podtržítko; aspoň jedno písmeno.
// Hrubý filtr sprostých a nenávistných slov (bez diakritiky, s náhradami 0→o, 1→i, 3→e, 4→a, 5→s, @→a, $→s).
// Nic nezachytí všechno: kdo se vyhne filtru, zůstane jen jménem nad autem, chat ve hře není.
const ZAKAZANA = ['kurv', 'kurev', 'pica', 'picus', 'kokot', 'curak', 'zmrd', 'mrdk', 'prdel', 'hovn', 'buzna', 'buzerant',
  'negr', 'cigan', 'cikan', 'hitler', 'nacist', 'fuck', 'shit', 'bitch', 'cunt', 'nigg', 'penis', 'vagin', 'porn', 'debil',
  'retard', 'kreten', 'hajzl', 'sracka', 'chcip', 'admin', 'moderator'];
const ZAKAZANA_SLOVA = ['nazi', 'dick', 'suka', 'mrd', 'pic', 'idiot', 'server'];   // krátké: jen na začátku slova (Špička, Epicentrum projdou)
export function platneJmeno(s) {
  if (typeof s !== 'string') return null;
  const j = s.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (j.length < 2 || j.length > 20 || !/^[\p{L}\p{N} ._-]+$/u.test(j) || !/\p{L}/u.test(j)) return null;
  const slova = j.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's').split(/[^a-z]+/).filter(Boolean);
  const holy = slova.join('');
  if (ZAKAZANA.some((z) => holy.includes(z)) || slova.some((w) => ZAKAZANA_SLOVA.some((z) => w.startsWith(z)))) return null;
  return j;
}
