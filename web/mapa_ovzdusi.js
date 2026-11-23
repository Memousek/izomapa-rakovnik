// Ovzduší, pyl a UV index z Open-Meteo Air Quality API (modely CAMS, Copernicus; CC BY 4.0), volá se přímo z prohlížeče.
// Sekce v záložce Dnes a při špatném ovzduší (evropský index EAQI od 60) lehký opar nad mapou.
const EAQI = [[20, 'dobrá', '#50f0e6'], [40, 'přijatelná', '#50ccaa'], [60, 'mírně znečištěné', '#f0e641'], [80, 'znečištěné', '#ff5050'], [100, 'velmi znečištěné', '#960032'], [1e9, 'extrémně znečištěné', '#7d2181']];
const PYL = { alder_pollen: 'olše', birch_pollen: 'bříza', grass_pollen: 'trávy', mugwort_pollen: 'pelyněk', olive_pollen: 'oliva', ragweed_pollen: 'ambrozie' };
const UV = [[3, 'nízký'], [6, 'střední'], [8, 'vysoký'], [11, 'velmi vysoký'], [1e9, 'extrémní']];
const pylSlovo = (v) => (v >= 100 ? 'vysoká' : v >= 20 ? 'střední' : 'nízká');

export async function spust({ lat, lon, panelPo }) {
  const p = new URLSearchParams({ latitude: lat.toFixed(4), longitude: lon.toFixed(4), timezone: 'Europe/Prague', forecast_days: '1',
    current: 'european_aqi,pm10,pm2_5,nitrogen_dioxide,ozone,uv_index,' + Object.keys(PYL).join(','), hourly: 'uv_index' });
  let d;
  try { const r = await fetch('https://air-quality-api.open-meteo.com/v1/air-quality?' + p, { signal: AbortSignal.timeout(20000) }); if (!r.ok) return; d = await r.json(); } catch { return; }
  const c = d.current || {}; if (c.european_aqi == null) return;
  const q = EAQI.find((e) => c.european_aqi < e[0]), uvMax = Math.max(0, ...((d.hourly || {}).uv_index || []).filter((x) => x != null));
  const pyly = Object.entries(PYL).map(([k, n]) => [n, c[k] || 0]).filter(([, v]) => v >= 1).sort((a, b) => b[1] - a[1]);
  const box = document.createElement('details'); box.className = 'sec'; box.id = 'ovzdusiBox';
  box.innerHTML = '<summary>Ovzduší a pyl <span class="sum-val"></span></summary><dl class="ovzdusi"></dl><p class="predpoved-zdroj">Model: <a href="https://open-meteo.com/en/docs/air-quality-api" target="_blank" rel="noopener">Open-Meteo</a>, CAMS (Copernicus), CC BY 4.0. Odhad modelu, ne měření stanice.</p>';
  box.querySelector('.sum-val').textContent = q[1];
  const dl = box.querySelector('dl'), radek = (k, v, barva) => { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = k; dd.textContent = v; if (barva) { const s = document.createElement('span'); s.className = 'vy-ico'; s.style.background = barva; dd.prepend(s, ' '); } dl.append(dt, dd); };
  radek('Kvalita ovzduší', `${q[1]} (index ${Math.round(c.european_aqi)})`, q[2]);
  radek('Prach PM10 / PM2,5', `${Math.round(c.pm10)} / ${Math.round(c.pm2_5)} µg/m³`);
  if (c.ozone != null) radek('Ozon / NO₂', `${Math.round(c.ozone)} / ${Math.round(c.nitrogen_dioxide ?? 0)} µg/m³`);
  radek('UV index dnes', uvMax > 0.5 ? `max ${uvMax.toFixed(1).replace('.', ',')} (${UV.find((u) => uvMax < u[0])[1]})` : 'zanedbatelný');
  radek('Pyl', pyly.length ? pyly.slice(0, 3).map(([n, v]) => `${n} – ${pylSlovo(v)}`).join(', ') : 'bez pylu');
  panelPo.after(box);
  // opar při znečištěném ovzduší (nebe, přes celou mapu, slabě)
  const I = window.Izomapa; if (!I || c.european_aqi < 60) return;
  const a = Math.min(0.16, 0.05 + (c.european_aqi - 60) / 400);
  I.onFrame((ctx, v) => { ctx.fillStyle = `rgba(176,160,128,${a.toFixed(3)})`; ctx.fillRect(0, 0, v.cw, v.ch); }, { layer: 'sky', priority: -5 });
}
