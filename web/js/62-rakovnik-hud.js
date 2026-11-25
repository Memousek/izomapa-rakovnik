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
    const dok = $('tabs');
    for (const id of ['histBtn', 'jizda3d']) { const a = $(id); if (a) { a.classList.add('dok-akce'); dok.append(a); } }
    // stavový pruh: hodiny a počasí z předpovědi (00-zaklad.js píše do #predpovedVal)
    const stav = $('stav');
    const obnov = () => {
      const d = new Date();
      $('stavCas').textContent = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
      $('stavPopis').textContent = ($('predpovedVal') && $('predpovedVal').textContent) || '';
      stav.hidden = false;
    };
    obnov(); setInterval(obnov, 15000);
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
