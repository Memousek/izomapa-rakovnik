  // Rozhraní Rakovníka (css/50-rakovnik.css): štítek města s výběrem obcí, stavový pruh s časem a počasím,
  // tlačítka 3D a Dřív a teď v doku vedle záložek, tmavé panely v noci. Úvodní pohlednice je ve funkci vitej().
  const OBCE_ODKAZY = {{OBCE_ODKAZY}};
  (() => {
    // výběr obce: jen když má mapa víc obcí (obce/*.json)
    if (OBCE_ODKAZY.length > 1) {
      const btn = $('obceBtn'), ul = $('obceList');
      for (const o of OBCE_ODKAZY) {
        const li = document.createElement('li'), a = document.createElement('a');
        a.href = o.u; a.textContent = o.n;
        if (o.ja) a.setAttribute('aria-current', 'page');
        li.append(a); ul.append(li);
      }
      btn.hidden = false;
      const prepni = (on) => { ul.hidden = !on; btn.setAttribute('aria-expanded', String(on)); };
      btn.addEventListener('click', () => prepni(ul.hidden));
      document.addEventListener('pointerdown', (e) => { if (!ul.hidden && !e.target.closest('#obceList, #obceBtn')) prepni(false); });
    }
    // 3D jízda a srovnání s 50. lety patří do doku hned za záložky
    // (na telefonu 3D nahoru do sloupce ovládání: v doku by ho schovalo backdrop-filter, Dřív a teď se nevejde)
    const dok = isMobile() ? document.querySelector('.controls') : $('tabs');
    for (const id of ['histBtn', 'jizda3d']) { const a = $(id); if (a) { a.classList.add('dok-akce'); if (isMobile()) dok.prepend(a); else dok.append(a); } }
    // stavový pruh: čas na mapě. Právě teď = skutečný čas a počasí (ŽIVĚ); Vlastní = dnešní hodina, kdy je slunce
    // nad městem tam, kde stojí posuvník (odpoledne, plná noc = 22:00); Samo = herní hodiny (poledne až půlnoc a zpět)
    const stav = $('stav');
    const hhmm = (d) => `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
    const OBD = { spring: 'jaro', summer: 'léto', autumn: 'podzim', winter: 'zima' }, POC = { clear: 'jasno', rain: 'déšť', snow: 'sníh', fog: 'mlha' };
    let odhad = { n: -1, t: '' };
    const casZNoci = (n) => {                       // první čas po poledni, kdy je tma aspoň n (sunAlt, nightFromSun z 10-vrstvy.js)
      if (odhad.n === n) return odhad.t;
      const d = new Date(); d.setHours(12, 0, 0, 0);
      let t = n >= 0.99 ? '22:00' : '12:00';
      if (n > 0 && n < 0.99) for (let m = 0; m < 12 * 60; m += 5) { const x = new Date(d.getTime() + m * 60000); if (nightFromSun(sunAlt(x)) >= n) { t = hhmm(x); break; } }
      odhad = { n, t }; return t;
    };
    const obnov = () => {
      const ziva = casRezim === 'ted';
      let t;
      if (ziva) t = hhmm(new Date());
      else if (casRezim === 'samo') {
        const f = ((performance.now() / 1000 - samoT0) % SAMO_S) / SAMO_S, min = Math.round((12 + 24 * f) * 60) % 1440;
        t = `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
      } else t = casZNoci(Math.round(state.night * 100) / 100);
      $('stavCas').textContent = t;
      $('stavPopis').textContent = ziva ? (($('predpovedVal') && $('predpovedVal').textContent) || 'skutečný čas') : `${OBD[state.season]} · ${POC[state.weather]}`;
      stav.classList.toggle('ziva', ziva);
      stav.title = ziva ? 'Skutečný čas a počasí nad městem' : 'Čas na mapě (nastavíte ve Vzhledu)';
      stav.hidden = false;
    };
    obnov(); setInterval(obnov, 1000);
    // Escape zavře otevřené podokno doku (otevřenou kartu zavře nejdřív 40-karta.js, podokno až dalším stiskem)
    addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !paneOpen || !$('card').hidden || document.querySelector('dialog[open]') || !$('vitej').hidden) return;
      if (e.target.matches && e.target.matches('input, textarea, select') && e.target.id !== 'night') return;
      openPane(null); try { localStorage.setItem('izo-tab', '-'); } catch {}
    }, true);
    // noc: panely přejdou do tmavé varianty (stejný práh jako odkaz „-noc“)
    let noc = null;
    setInterval(() => {
      const n = state.night > 0.55;
      if (n !== noc) { noc = n; document.body.classList.toggle('noc', n); }
    }, 400);
    $('znak').addEventListener('click', () => vitej(null, true));
  })();

  // Úvodní pohlednice: poprvé bez sdíleného odkazu (10-vrstvy.js) a po kliknutí na znak ve štítku.
  // Nesmí sahat na konstanty deklarované níž v kódu (volá se dřív, než se k nim běh dostane).
  function vitej(dal, vzdy) {
    const el = document.getElementById('vitej');
    let videl = false;
    try { videl = localStorage.getItem('izo-vitej') === '1'; } catch {}
    if (!el || (videl && !vzdy)) { if (dal) dal(); return; }
    const obce = document.getElementById('vitejObce');
    if (!obce.childElementCount) {
      for (const o of {{OBCE_ODKAZY}}) {
        const a = document.createElement('a'); a.href = o.u; a.textContent = o.n; a.className = 'pk-obec';
        if (o.ja) a.setAttribute('aria-current', 'page');
        obce.append(a);
      }
      const j = document.getElementById('jizda3d');
      if (j && !j.hidden) document.getElementById('vitejJizda').hidden = false;
    }
    const zavri = (pak) => {
      el.hidden = true;
      removeEventListener('keydown', klavesy, true);
      try { localStorage.setItem('izo-vitej', '1'); } catch {}
      if (dal) dal();
      if (pak) pak();
    };
    const klavesy = (e) => {
      if (e.key === 'Enter' && !e.target.closest('a, button')) { e.preventDefault(); zavri(); }
      else if (e.key === 'Escape') zavri();
      if (e.key !== 'Tab') e.stopImmediatePropagation();   // zkratky mapy pod pohlednicí nefungují
    };
    document.getElementById('vitejGo').onclick = () => zavri();
    document.getElementById('vitejPrelet').onclick = () => zavri(() => prelet());
    document.getElementById('vitejJizda').onclick = () => zavri(() => document.getElementById('jizda3d').click());
    el.onclick = (e) => { if (e.target === el) zavri(); };
    addEventListener('keydown', klavesy, true);
    el.hidden = false;
    document.getElementById('vitejGo').focus({ preventScroll: true });
  }

  // Počasí podle skutečnosti: přepínač místo malého odkazu a pod ním, co teď nad městem je a co se z toho kreslí
  // (zataženo bez srážek se kreslí jako jasno, mapa nemá mraky přes celé nebe)
  (() => {
    const b = $('pocasiRealne');
    if (!b || b.hidden) return;
    b.classList.add('prepinac');
    b.innerHTML = '<span class="pr-kolej" aria-hidden="true"></span>Skutečné počasí';
    const p = document.createElement('p'); p.className = 'pocasi-ted'; p.id = 'pocasiTed';
    $('weather').after(p);
    const POC = { clear: 'jasno', rain: 'déšť', snow: 'sníh', fog: 'mlha' };
    const obnov = () => {
      const on = b.getAttribute('aria-pressed') === 'true', ted = ($('predpovedVal') && $('predpovedVal').textContent) || '';
      p.hidden = !on;
      if (on) p.textContent = ted ? `Nad městem teď ${ted.replace(/^(-?\d+ °C), /, '$1, ')}. Na mapě: ${POC[state.weather]}.` : 'Čekám na údaje z Open-Meteo…';
    };
    obnov(); setInterval(obnov, 2000);
    b.addEventListener('click', () => setTimeout(obnov, 50));
  })();
