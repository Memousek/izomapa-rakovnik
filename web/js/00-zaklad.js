(async () => {

  const [TILES, OV] = await Promise.all([fetch('tiles.json').then((r) => r.json()), fetch('overlay.json').then((r) => r.json())]);
  // real wind for chimney smoke; the map camera looks from the south-west, so east is right and up, north is left and up
  let realWind = null, realWeather = null, applyRealWeather = () => {};
  // model hlásí kód srážek i při 0 mm: padat smí jen to, co opravdu padá
  const wmoWeather = (c, mm) => mm === 0 && ((c >= 51 && c <= 67) || (c >= 71 && c <= 77) || (c >= 80 && c <= 86) || c >= 95) ? 'clear' : (c >= 51 && c <= 67) || (c >= 80 && c <= 82) || c >= 95 ? 'rain' : (c >= 71 && c <= 77) || c === 85 || c === 86 ? 'snow' : c === 45 || c === 48 ? 'fog' : 'clear';
  const loadWind = () => fetch(`https://api.open-meteo.com/v1/forecast?latitude=${OV.cam.lat0}&longitude=${OV.cam.lon0}&current=precipitation,wind_speed_10m,wind_direction_10m,weather_code&wind_speed_unit=ms`)
    .then((r) => r.json()).then(({ current: c }) => {
      if ({{POCASI}}) { realWeather = wmoWeather(c.weather_code, c.precipitation); applyRealWeather(); }
      if (!{{VITR}}) return;
      const from = c.wind_direction_10m * Math.PI / 180, e = -Math.sin(from), n = -Math.cos(from);
      realWind = { dx: 0.7071 * (e - n), dy: -0.3536 * (e + n), strength: Math.min(2.2, Math.max(0.15, c.wind_speed_10m / 3)) };
    }).catch(() => {});
  if ({{VITR}} || {{POCASI}}) { loadWind(); setInterval(loadWind, 30 * 60 * 1000); }
  // předpověď na 5 dní do panelu a výška sněhu: v listopadu a březnu se sněhem se mapa otevře v zimě
  const POPIS_POCASI = (c) => c === 0 ? 'jasno' : c <= 2 ? 'polojasno' : c === 3 ? 'zataženo' : c === 45 || c === 48 ? 'mlha' : (c >= 51 && c <= 57) ? 'mrholení'
    : (c >= 61 && c <= 67) || (c >= 80 && c <= 82) ? 'déšť' : (c >= 71 && c <= 77) || c === 85 || c === 86 ? 'sníh' : c >= 95 ? 'bouřky' : 'oblačno';
  fetch(`https://api.open-meteo.com/v1/forecast?latitude=${OV.cam.lat0}&longitude=${OV.cam.lon0}&current=temperature_2m,weather_code,snow_depth&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=Europe%2FPrague&forecast_days=5`)
    .then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!d || !d.daily) return;
      const c = d.current || {}, dny = ['ne', 'po', 'út', 'st', 'čt', 'pá', 'so'], ul = $('predpoved'), t = (v) => `${Math.round(v)} °C`;
      if (c.temperature_2m !== undefined) $('predpovedVal').textContent = `${t(c.temperature_2m)}, ${POPIS_POCASI(c.weather_code)}`;
      d.daily.time.forEach((den, i) => {
        const li = document.createElement('li'), dt = new Date(den + 'T12:00');
        const a = document.createElement('span'); a.textContent = i === 0 ? 'dnes' : i === 1 ? 'zítra' : dny[dt.getDay()] + ' ' + dt.getDate() + '.';
        const b = document.createElement('span'); b.textContent = POPIS_POCASI(d.daily.weather_code[i]);
        const e = document.createElement('span'); e.className = 'tepl'; e.textContent = `${Math.round(d.daily.temperature_2m_max[i])}° / ${Math.round(d.daily.temperature_2m_min[i])}°`;
        const f = document.createElement('small'); f.textContent = d.daily.precipitation_sum[i] >= 0.5 ? `${d.daily.precipitation_sum[i].toFixed(1).replace('.', ',')} mm` : '';
        li.append(a, b, e, f); ul.append(li);
      });
      $('predpovedBox').hidden = false;
      const m = new Date().getMonth();
      if (!obdobiZOdkazu && (m === 10 || m === 2) && (c.snow_depth || 0) >= 0.02 && state.season !== 'winter') setSeason('winter');
    }).catch(() => {});
  // aktuality z webu města (functions/api/zpravy.js, web/mapa_zpravy.js): titulek pod hledáním a seznam v panelu
  if ({{ZPRAVY}}) import('./mapa_zpravy.js').then((m) => m.spust({ panelPred: $('uzBox'), lista: $('zpravyLista') })).catch(() => {});
  // výstrahy ČHMÚ (functions/api/vystrahy.js, web/mapa_vystrahy.js): pruh nahoře a seznam v panelu nad počasím
  import('./mapa_vystrahy.js').then((m) => m.spust({ oblasti: {{VYSTRAHY_OBLASTI}}, panelPred: $('dnesTop'),
    ukazKartu: (o) => showCard({ ...o, lon: OV.cam.lon0, lat: OV.cam.lat0, target: '_blank' }) })).catch(() => {});
  const W = OV.w, Hh = OV.h;
  const $ = (id) => document.getElementById(id);
  const isMobile = () => matchMedia('(max-width: 640px)').matches;
  let uiDepth = 0, uiPop = false, uiBackAt = 0, uiSelf = 0;
  const state = { season: 'summer', night: 0, weather: 'clear', sel: null, hover: null, wip: false };
  const hashTokens = (location.hash || '').slice(1).split('@')[0].split('-');
  const SEASON_TOKEN = { jaro: 'spring', leto: 'summer', podzim: 'autumn', zima: 'winter' };
  // bez sdíleného odkazu se mapa otevře v aktuálním ročním období (zima jen v prosinci až únoru, v listopadu a březnu jen se sněhem)
  const OBDOBI_MESIC = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter'];
  const obdobiZOdkazu = hashTokens.some((t) => SEASON_TOKEN[t]);
  if (!obdobiZOdkazu) state.season = OBDOBI_MESIC[new Date().getMonth()];
  for (const t of hashTokens) { if (SEASON_TOKEN[t]) state.season = SEASON_TOKEN[t]; if (t === 'noc') state.night = 1; if (t === 'soumrak') state.night = 0.42; if (t === 'vse') state.wip = true; }
  if (state.season === 'winter') state.weather = 'snow';
  const WIP = Object.values(TILES.chunks || {}).some((c) => c.status !== 'hotovo');


