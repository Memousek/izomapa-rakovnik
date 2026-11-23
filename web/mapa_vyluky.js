// Výluky a mimořádnosti PID (functions/api/vyluky.js) pro linky v mapě: sekce v záložce Doprava a varování v kartě spoje
// (Izomapa.vyluky(linka) vrátí platné záznamy pro linku). Obnovuje se po 15 min.
const kdy = (s) => { if (!s) return ''; const d = new Date(s * 1000); return `${d.getDate()}. ${d.getMonth() + 1}.`; };

export async function spust({ panelPred, ukazKartu }) {
  let V = [];
  const box = document.createElement('details'); box.className = 'sec'; box.id = 'vylukyBox'; box.hidden = true;
  box.innerHTML = '<summary>Výluky a mimořádnosti <span class="sum-val"></span></summary><ul class="places vyluky-list"></ul><p class="predpoved-zdroj">Zdroj: <a href="https://pid.cz/vyluky/" target="_blank" rel="noopener">PID</a></p>';
  panelPred.before(box);
  const detail = (v) => ukazKartu({ title: (v.druh === 'mimoradnost' ? '⚠ ' : '') + v.nazev, text: v.text,
    rows: [['Linky', v.linky.join(', ')], ['Kdy', v.kdy || [kdy(v.od), kdy(v.do)].filter(Boolean).join(' – ')], ['Druh', v.druh === 'mimoradnost' ? 'mimořádnost' : 'plánovaná výluka'], ['Zdroj', 'PID']],
    link: v.odkaz, linkText: 'Podrobnosti na pid.cz ↗' });
  const nacti = async () => {
    try { const r = await fetch('api/vyluky', { signal: AbortSignal.timeout(20000) }); if (!r.ok) return; V = (await r.json()).vyluky || []; } catch { return; }
    const ul = box.querySelector('ul'); ul.replaceChildren();
    const ted = Date.now() / 1000, plati = V.filter((v) => !v.od || v.od <= ted);
    box.querySelector('.sum-val').textContent = V.length ? `${plati.length} platí${V.length > plati.length ? `, ${V.length - plati.length} chystané` : ''}` : '';
    for (const v of V) {
      const li = document.createElement('li'), b = document.createElement('button'); b.type = 'button';
      const ico = document.createElement('span'); ico.className = 'vy-ico'; ico.style.background = v.druh === 'mimoradnost' ? '#e5484d' : (!v.od || v.od <= ted) ? '#f08a1c' : '#7aa7d9'; ico.setAttribute('aria-hidden', 'true');
      const n = document.createElement('span'); n.textContent = v.nazev;
      const s = document.createElement('small'); s.textContent = `${v.linky.join(', ')} · ${v.kdy || ''}`;
      b.append(ico, n, s); b.addEventListener('click', () => detail(v)); li.append(b); ul.append(li);
    }
    box.hidden = !V.length;
  };
  await nacti(); setInterval(nacti, 15 * 60000);
  if (window.Izomapa) window.Izomapa.vyluky = (linka) => { const t = Date.now() / 1000; return V.filter((v) => v.linky.includes(String(linka)) && (!v.od || v.od <= t)).map((v) => ({ ...v, ukaz: () => detail(v) })); };
}
