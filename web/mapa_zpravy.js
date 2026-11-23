// Aktuality z webu města (functions/api/zpravy.js): běžící titulek pod hledáním a seznam v panelu (inspirace izomapa.fun).
export async function spust({ panelPred, lista }) {
  let d;
  try { const r = await fetch('api/zpravy', { signal: AbortSignal.timeout(20000) }); if (!r.ok) return; d = await r.json(); } catch { return; }
  const zp = (d && d.zpravy) || [];
  if (!zp.length) return;
  const box = document.createElement('details'); box.className = 'sec'; box.id = 'aktualityBox';
  box.innerHTML = '<summary>Aktuality <span class="sum-val"></span></summary><ul class="places zpravy-list"></ul><p class="predpoved-zdroj"></p>';
  box.querySelector('.sum-val').textContent = zp[0].datum || '';
  for (const z of zp) {
    const li = document.createElement('li'), a = document.createElement('a'); a.href = z.url; a.target = '_blank'; a.rel = 'noopener'; a.className = 'zprava';
    const n = document.createElement('span'); n.textContent = z.nadpis;
    const s = document.createElement('small'); s.textContent = [z.datum, z.perex].filter(Boolean).join(' · ');
    a.append(n, s); li.append(a); box.querySelector('ul').append(li);
  }
  const zdroj = box.querySelector('.predpoved-zdroj'), odkaz = document.createElement('a');
  odkaz.href = d.odkaz; odkaz.target = '_blank'; odkaz.rel = 'noopener'; odkaz.textContent = d.zdroj || 'web města';
  zdroj.append('Zdroj: ', odkaz);
  panelPred.before(box);
  // titulek pod hledáním: nejnovější zprávy se po 8 s střídají, klik otevře článek
  if (lista) {
    let i = 0;
    const a = document.createElement('a'); a.target = '_blank'; a.rel = 'noopener'; a.className = 'zpravy-lista';
    const ukaz = () => { const z = zp[i % Math.min(5, zp.length)]; a.href = z.url; a.textContent = z.nadpis; a.title = z.perex || z.nadpis; i++; };
    ukaz(); lista.append(a); lista.hidden = false;
    setInterval(() => { if (!document.hidden && !matchMedia('(prefers-reduced-motion: reduce)').matches) ukaz(); }, 8000);
  }
}
