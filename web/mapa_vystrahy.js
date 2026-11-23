// Výstrahy ČHMÚ v mapě (functions/api/vystrahy.js): pruh nahoře při platné výstraze a seznam v panelu.
// Stupně podle ČHMÚ: Moderate = nízký (žlutá), Severe = vysoký (oranžová), Extreme = extrémní (červená), Unknown = výhled.
const STUPEN = { Moderate: ['nízký stupeň', '#f2c66d'], Severe: ['vysoký stupeň', '#f08a1c'], Extreme: ['extrémní stupeň', '#e5484d'], Unknown: ['výhled', '#7aa7d9'], Minor: ['informace', '#a9b3c4'] };
const kdy = (s) => { if (!s) return ''; const d = new Date(s); return `${d.getDate()}. ${d.getMonth() + 1}. ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

export async function spust({ oblasti, panelPred, ukazKartu }) {
  if (!oblasti || !oblasti.length) return;
  let d;
  try {
    const r = await fetch('api/vystrahy?' + oblasti.map((o) => 'o=' + encodeURIComponent(o)).join('&'), { signal: AbortSignal.timeout(20000) });
    if (!r.ok) return; d = await r.json();
  } catch { return; }
  const vs = (d.vystrahy || []).sort((a, b) => (['Extreme', 'Severe', 'Moderate', 'Unknown', 'Minor'].indexOf(a.stupen)) - (['Extreme', 'Severe', 'Moderate', 'Unknown', 'Minor'].indexOf(b.stupen)));
  if (!vs.length) return;
  const detail = (v) => ukazKartu({ title: v.jev, text: v.popis, rows: [['Stupeň', (STUPEN[v.stupen] || STUPEN.Minor)[0]], ['Platí', `${kdy(v.od)}${v.do ? ' – ' + kdy(v.do) : ''}`], ['Oblast', v.oblasti.join(', ')], ['Co dělat', v.pokyny], ['Zdroj', 'ČHMÚ']], link: v.web, linkText: 'Výstrahy na chmi.cz ↗' });
  // pruh nahoře jen pro skutečnou výstrahu (ne výhled)
  const hl = vs.find((v) => v.stupen !== 'Unknown' && v.stupen !== 'Minor');
  if (hl) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'vystraha-pruh';
    b.style.setProperty('--vc', (STUPEN[hl.stupen] || STUPEN.Minor)[1]);
    b.textContent = `Výstraha ČHMÚ: ${hl.jev}${hl.do ? ' do ' + kdy(hl.do) : ''}${vs.length > 1 ? ` (+${vs.length - 1})` : ''}`;
    b.addEventListener('click', () => detail(hl));
    document.body.append(b);
  }
  // panel: seznam
  const box = document.createElement('details'); box.className = 'sec'; box.id = 'vystrahyBox';
  box.innerHTML = '<summary>Varování ČHMÚ <span class="sum-val"></span></summary><ul class="places vystrahy-list"></ul><p class="predpoved-zdroj">Zdroj: <a href="https://www.chmi.cz/" target="_blank" rel="noopener">ČHMÚ</a>, výstražná služba</p>';
  box.querySelector('.sum-val').textContent = hl ? (STUPEN[hl.stupen] || STUPEN.Minor)[0] : 'výhled';
  for (const v of vs) {
    const li = document.createElement('li'), b = document.createElement('button'); b.type = 'button';
    const ico = document.createElement('span'); ico.className = 'vy-ico'; ico.style.background = (STUPEN[v.stupen] || STUPEN.Minor)[1]; ico.setAttribute('aria-hidden', 'true');
    const n = document.createElement('span'); n.textContent = v.jev;
    const s = document.createElement('small'); s.textContent = `${(STUPEN[v.stupen] || STUPEN.Minor)[0]} · ${kdy(v.od)}${v.do ? ' – ' + kdy(v.do) : ''}`;
    b.append(ico, n, s); b.addEventListener('click', () => detail(v)); li.append(b); box.querySelector('ul').append(li);
  }
  if (hl) box.open = true;
  panelPred.before(box);
}
