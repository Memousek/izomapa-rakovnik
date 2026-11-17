// Multiplayer 3D jízdy: Cloudflare Worker s Durable Object, jedna místnost na město (/mistnost/<název>).
// Hráči posílají svou polohu 5× za sekundu (web/jizda_sit.js), místnost 5× za sekundu každému pošle hráče do 700 m.
// Server nic nesimuluje a pohybu věří (pohodová hra), jen zahodí nesmysly a hlídá počet zpráv.
// Návod k nasazení je v README (Multiplayer); lokálně: npx wrangler dev --config multiplayer/wrangler.jsonc
import { dekodujStav, zakodujSnimek, vyberBlizke, vymyslJmeno, BARVY, platneAuto, platneJmeno } from '../web/jizda_sit.js';

const MAX_HRACU = 100;                  // na jednu místnost (Worker smí exportovat jen třídy a handler)
const TIK = 200;                         // ms mezi snímky
const ZASTARALY = 15000;                 // hráč bez zprávy déle než 15 s se neposílá (zamrzlá karta; na pozadí posílá aspoň za 2 s)
const JMENO_ZA = 3000;                   // jméno jde změnit nejvýš jednou za 3 s
const LIMIT_ZPRAV = 30;                  // zpráv za sekundu; víc se zahodí, trojnásobek = odpojit

export class Mistnost {
  constructor(state, env) {
    this.state = state; this.env = env;
    this.hraci = new Map();              // ws -> { id, jmeno, barva, stav, t, okno, n }
    this.casovac = null;
    // po probuzení z hibernace (konstruktor běží znovu) obnovit hráče z příloh soketů; polohy přijdou s další zprávou
    for (const ws of state.getWebSockets?.() || []) {
      const a = ws.deserializeAttachment?.();
      if (a) this.hraci.set(ws, { ...a, stav: null, t: 0, okno: 0, n: 0 });
    }
  }

  async fetch(req) {
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('Sem se připojuje WebSocket.', { status: 426 });
    if (this.hraci.size >= MAX_HRACU) return new Response('Místnost je plná.', { status: 503 });
    const [klient, server] = Object.values(new WebSocketPair());
    this.state.acceptWebSocket(server);
    this.pripoj(server);
    return new Response(null, { status: 101, webSocket: klient });
  }

  // nový hráč: id, jméno a barva od serveru, uvítání se seznamem ostatních, ostatním zpráva o příchodu
  pripoj(ws) {
    const ids = new Set([...this.hraci.values()].map((h) => h.id));
    let id = 1; while (ids.has(id)) id++;
    const jmena = new Set([...this.hraci.values()].map((h) => h.jmeno));
    const h = { id, jmeno: vymyslJmeno(Math.random(), jmena), barva: BARVY[(id - 1) % BARVY.length] };
    ws.serializeAttachment?.(h);
    const ostatni = [...this.hraci.values()].map(({ id, jmeno, barva, auto }) => ({ id, jmeno, barva, auto }));
    this.hraci.set(ws, { ...h, stav: null, t: 0, okno: 0, n: 0 });
    this.posli(ws, JSON.stringify({ t: 'ahoj', ...h, hraci: ostatni }));
    this.vsem(JSON.stringify({ t: 'novy', ...h }), ws);
    return h;
  }

  webSocketMessage(ws, msg) {
    const h = this.hraci.get(ws);
    if (!h) return;
    const ted = Date.now(), okno = Math.floor(ted / 1000);
    if (okno !== h.okno) { h.okno = okno; h.n = 0; }
    if (++h.n > LIMIT_ZPRAV) { if (h.n > 3 * LIMIT_ZPRAV) ws.close(1008, 'Příliš mnoho zpráv.'); return; }
    if (typeof msg === 'string') { this.text(ws, h, msg); return; }
    const s = dekodujStav(msg);
    if (!s) return;
    h.stav = s; h.t = ted;
    this.spustTik();
  }
  // text od hráčů: vzhled auta z garáže a vlastní jméno (žádný chat). Obojí se ověří (jizda_sit.js) a pošle ostatním.
  text(ws, h, msg) {
    if (msg.length > 600) return;
    let m; try { m = JSON.parse(msg); } catch { return; }
    if (m?.t === 'auto') {
      const a = platneAuto(m.a);
      if (!a) return;
      h.auto = a; this.priloha(ws, h);
      this.vsem(JSON.stringify({ t: 'auto', id: h.id, a }), ws);
    } else if (m?.t === 'jmeno') {
      const ted = Date.now();
      if (ted - (h.jmenoT || 0) < JMENO_ZA) { this.posli(ws, JSON.stringify({ t: 'chyba', co: 'jmeno', k: 'limit', d: 'Jméno jde změnit nejvýš jednou za 3 sekundy.' })); return; }
      const j = platneJmeno(m.j);
      if (!j) { this.posli(ws, JSON.stringify({ t: 'chyba', co: 'jmeno', k: 'neplatne', d: 'Jméno musí mít 2–20 znaků (písmena, číslice, mezera, . - _) a nesmí být sprosté.' })); return; }
      const mala = j.toLocaleLowerCase('cs');
      if ([...this.hraci.values()].some((o) => o !== h && o.jmeno.toLocaleLowerCase('cs') === mala)) { this.posli(ws, JSON.stringify({ t: 'chyba', co: 'jmeno', k: 'obsazene', d: 'Tohle jméno už má jiný hráč.' })); return; }
      h.jmenoT = ted; h.jmeno = j; this.priloha(ws, h);
      this.vsem(JSON.stringify({ t: 'jmeno', id: h.id, j }));   // i odesílateli: potvrzení
    }
  }
  priloha(ws, h) { ws.serializeAttachment?.({ id: h.id, jmeno: h.jmeno, barva: h.barva, auto: h.auto }); }
  webSocketClose(ws) { this.odeber(ws); }
  webSocketError(ws) { this.odeber(ws); }

  odeber(ws) {
    const h = this.hraci.get(ws);
    if (!h) return;
    this.hraci.delete(ws);
    this.vsem(JSON.stringify({ t: 'pryc', id: h.id }));
    if (!this.hraci.size && this.casovac) { clearInterval(this.casovac); this.casovac = null; }
  }

  spustTik() { if (!this.casovac) this.casovac = setInterval(() => this.tik(), TIK); }

  // každému hráči jeho blízké; prázdný snímek jen jednou, ať klient smaže, kdo odjel z dosahu
  tik(ted = Date.now()) {
    const aktivni = [...this.hraci.values()].filter((h) => h.stav && ted - h.t < ZASTARALY);
    for (const [ws, h] of this.hraci) {
      if (!h.stav) continue;
      const blizko = vyberBlizke(h.stav, aktivni.filter((o) => o !== h));
      if (!blizko.length && !h.mel) continue;
      h.mel = blizko.length > 0;
      this.posli(ws, zakodujSnimek(blizko));
    }
  }

  posli(ws, data) { try { ws.send(data); } catch { this.odeber(ws); } }
  vsem(data, krome) { for (const ws of [...this.hraci.keys()]) if (ws !== krome) this.posli(ws, data); }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const m = /^\/mistnost\/([a-z0-9-]{1,40})$/.exec(url.pathname);
    if (!m) return new Response('izomapa multiplayer: připojení na /mistnost/<město>', { status: url.pathname === '/' ? 200 : 404 });
    // cizí weby se nepřipojí: POVOLENE_ORIGINY = adresy map oddělené čárkou (prázdné = kdokoli, jen pro zkoušení)
    const povolene = String(env.POVOLENE_ORIGINY || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (povolene.length && !povolene.includes(req.headers.get('Origin'))) return new Response('Nepovolený původ.', { status: 403 });
    return env.MISTNOST.get(env.MISTNOST.idFromName(m[1])).fetch(req);
  },
};
