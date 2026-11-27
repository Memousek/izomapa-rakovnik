  window.Izomapa = {
    libs: pluginLibs,
    registerLib(id, api) { if (id) pluginLibs[id] = api; },
    getLib: (id) => pluginLibs[id] ?? null,
    getPluginData: (id) => OV.doplnky?.[id]?.data ?? null,
    getPluginConfig: (id) => OV.doplnky?.[id]?.config ?? {},
    registerPlugin(id, inst) {
      if (pluginRegistry[id]?.onDestroy) try { pluginRegistry[id].onDestroy(); } catch {}
      pluginRegistry[id] = inst || {};
      if (inst?.onInit) { if (ready) inst.onInit(window.Izomapa); else layersReady.then(() => inst.onInit(window.Izomapa)); }
    },
    onMapClick(fn, options = { priority: 0 }) {
      const entry = { fn, priority: options?.priority ?? 0 };
      pluginClicks.push(entry); pluginClicks.sort((a, b) => b.priority - a.priority);
      return () => { const i = pluginClicks.indexOf(entry); if (i >= 0) pluginClicks.splice(i, 1); };
    },
    onFrame(fn, options = {}) {
      if (typeof fn !== 'function') return () => {};
      const layer = options?.layer === 'world' || options?.layer === 'top' ? options.layer : 'sky';
      const entry = { fn, layer, priority: options?.priority ?? 0 };
      pluginFrames.push(entry); pluginFrames.sort((a, b) => b.priority - a.priority);
      return () => { const i = pluginFrames.indexOf(entry); if (i >= 0) pluginFrames.splice(i, 1); };
    },
    setClickCapture(en) { pluginCapture = Boolean(en); },
    setCursor(cur) { pluginCursor = cur || ''; $('osd').style.cursor = pluginCursor; },
    setPinsVisible(vis) { document.body.classList.toggle('plugins-hide-pins', !vis); },
    getPluginLayer(id) {
      let el = $('pluginLayers').querySelector(`[data-plugin="${id}"]`);
      if (!el) { el = document.createElement('div'); el.dataset.plugin = id; el.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;'; $('pluginLayers').appendChild(el); }
      return el;
    },
    getView() { const c = viewer.viewport.getCenter(true); return { x: c.x * W, y: c.y * W, zoom: viewer.viewport.getZoom(true) }; },
    getCam: () => ({ ...cam, w: W, h: Hh }),
    toImg: (x, y, h = 0) => toImg(x, y, h),
    imgToWorld: (ix, iy) => imgToWorld(ix, iy),
    gz: (x, y) => gz(x, y),
    postava: (v, x, y, opts) => postavaApi(v, x, y, opts),           // chodec jako v mapě: {oi, kid, back, mir, frame, outfit}
    obrysMapy: () => cam.grounds.map((g) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => { const x = g.cx + a * cam.half, y = g.cy + b * cam.half; return toImg(x, y, gz(x, y)); })),   // čtverce mapy v obrázku
    // načtené čtverce (budovy s obrysem hull v obrázku, oid z Overture): fn(k, data) teď pro načtené a pak pro každý další
    onChunkData(fn) { for (const k in CH) if (CH[k].buildings) fn(k, CH[k]); onChunk.push((k, d) => fn(k, d)); },
    vBudove: (x, y) => vBudove(x, y),                                // bod světa leží v půdorysu budovy
    // policejní honička za autem ze simulace (78-honicka.js): {ujede, kmh, limit, hned}; vrací true, když začala
    policie: (auto, opts) => honickaStart(auto, opts),
    honicka: () => (HONI.akce ? { faze: HONI.akce.faze, ujede: HONI.akce.ujede } : null),
    // jedoucí auta ze simulace do R m od bodu světa: [{x, y, v (m/s), dx, dy (směr jízdy, jednotkový)}]; bez vrstvy Doprava prázdné
    auta(x, y, R = 60) {
      if (!$('l-traffic').checked) return [];
      const out = [];
      for (const c of cars) {
        if (!carActive(c) && !c.hold) continue;
        const r = roads[c.r], a = r.w[0], b = r.w[r.w.length - 1];
        if (Math.min(Math.hypot(a[0] - x, a[1] - y), Math.hypot(b[0] - x, b[1] - y)) > r.L + R) continue;   // kus silnice daleko
        const o = along(r, c.s), d = Math.hypot(o.x - x, o.y - y);
        if (d > R) continue;
        const l = Math.hypot(o.dx, o.dy) || 1;
        out.push({ x: o.x, y: o.y, v: c.hold ? 0 : c.v ?? carSpeed(c, r), dx: c.dir * o.dx / l, dy: c.dir * o.dy / l, t: c.t, auto: c });
      }
      return out;
    },
    zakryto: (x, y, h) => zakrytoBod(x, y, h ?? gz(x, y)),          // postava v bodě světa je za stromem, domem nebo výzdobou
    latLonToWorld: (lat, lon) => [(lon - cam.lon0) * cam.kx, (lat - cam.lat0) * cam.ky],
    worldToLatLon: (x, y) => { const [lon, lat] = lonlat(x, y); return [lat, lon]; },
    latLonToImg: (lat, lon, hOffset = 0) => { const x = (lon - cam.lon0) * cam.kx, y = (lat - cam.lat0) * cam.ky; return toImg(x, y, gz(x, y) + hOffset); },
    panTo(x, y, zoom, animated = true) {
      if (Number.isFinite(x) && Number.isFinite(y)) viewer.viewport.panTo(new OpenSeadragon.Point(x / W, y / W), !animated);
      if (Number.isFinite(zoom)) viewer.viewport.zoomTo(zoom, null, !animated);
    },
    getEnvironment: () => ({ night: state.night, rain: state.weather === 'rain', weather: state.weather, season: state.season, realTime: $('realTime').checked, realWeather: $('realWeather').checked }),
    setEnvironment(env = {}) {
      if (env.season) setSeason(env.season);
      if (env.realWeather !== undefined) { $('realWeather').checked = Boolean(env.realWeather); if (env.realWeather) applyRealWeather(); }
      else if (env.weather !== undefined || env.rain !== undefined) $('realWeather').checked = false;
      const w = env.weather !== undefined ? env.weather : (env.rain !== undefined ? (env.rain ? 'rain' : 'clear') : undefined);
      if (w !== undefined) setWeather(w);
      if (env.realTime !== undefined) { $('realTime').checked = Boolean(env.realTime); if (env.realTime) tickReal(); }
      else if (typeof env.night === 'number') $('realTime').checked = false;
      if (typeof env.night === 'number') { state.night = Math.max(0, Math.min(1, env.night)); $('night').value = Math.round(state.night * 100); applyTime(); }
    },
    getUiSlot(slotName = 'sidebar-tabs') { return slotName === 'sidebar-tabs' ? $('pluginTabsSlot') : null; },
  };
  if (OV.doplnky && Object.keys(OV.doplnky).length) {
    const loadedStyles = new Set(), loadedScripts = new Map();
    const loadStyle = (href) => {
      if (!href || loadedStyles.has(href)) return;
      loadedStyles.add(href);
      const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l);
    };
    const loadScript = (src) => {
      if (!src) return Promise.resolve();
      if (loadedScripts.has(src)) return loadedScripts.get(src);
      const p = new Promise((resolve) => {
        const s = document.createElement('script'); s.src = src; s.async = false;
        s.onload = () => resolve(true);
        s.onerror = () => { console.warn('Nepodařilo se načíst skript doplňku:', src); resolve(false); };
        document.body.appendChild(s);
      });
      loadedScripts.set(src, p);
      return p;
    };
    layersReady.then(async () => {
      const list = Object.values(OV.doplnky);
      const libUrls = [];
      for (const p of list) {
        for (const href of p.lib_styles || []) loadStyle(href);
        for (const src of p.lib_scripts || []) if (!libUrls.includes(src)) libUrls.push(src);
      }
      if (libUrls.length) await Promise.all(libUrls.map(loadScript));
      for (const p of list) {
        for (const href of p.styles || []) loadStyle(href);
        for (const src of p.scripts || []) loadScript(src);
      }
    });
  }
  // život na mapě podle kalendáře (web/mapa_zivot.js): náměstí = vánoční strom z mesto.json, radnice z příběhů míst
  {
    const xm = Array.isArray(OV.xmas) ? (typeof OV.xmas[0] === 'number' ? OV.xmas : OV.xmas[0]) : null;
    const rad = (OV.places || []).find((p) => /^Radnice/.test(p.name));
    // akce ve městě (site/akce.json, web/mapa_akce.js): sekce v záložce Dnes, bublina nad místem konání, dav pro život na mapě
    const jdi = (lat, lon) => { const x = (lon - cam.lon0) * cam.kx, y = (lat - cam.lat0) * cam.ky, ip = toImg(x, y, gz(x, y)); goTo(ip[0], ip[1], 1.4); };
    const akce = import('./mapa_akce.js').then((m) => m.spust({ panelPo: $('dnesTop'), jdi })).catch(() => null);
    // živé zdroje (záložky Dnes a Doprava): vodní stav ČHMÚ, ovzduší a pyl, kalendář akcí a zápasy, výluky PID
    const ukaz = (o) => showCard({ target: '_blank', ...o, lon: o.lon ?? OV.cam.lon0, lat: o.lat ?? OV.cam.lat0 });
    if ({{HYDRO}}) import('./mapa_hydro.js').then((m) => m.spust({ panelPo: $('dnesTop'), ukazKartu: ukaz })).catch(() => {});
    import('./mapa_nebe.js').then((m) => m.spust({ lat: OV.cam.lat0, lon: OV.cam.lon0, panelPo: $('dnesTop') })).catch(() => {});
    import('./mapa_firmy.js').then((m) => m.spust({ ukazKartu: ukaz })).catch(() => {});
    import('./mapa_pamatna.js').then((m) => m.spust({ ukazKartu: ukaz })).catch(() => {});   // památná místa (nastroje/pamatna.py)
    import('./mapa_vrtulnik.js').then((m) => m.spust()).catch(() => {});   // řízení vrtulníku (záložka Objevuj)
    import('./mapa_vrstvy.js').then((m) => m.spust()).catch(() => {});   // datové vrstvy: záplavy, stáří domů
    import('./mapa_kamery.js').then((m) => m.spust({ ukazKartu: ukaz })).catch(() => {});   // webkamery (centrum, D6)
    import('./mapa_merice.js').then((m) => m.spust({ ukazKartu: ukaz })).catch(() => {});   // ukazatele rychlosti z OSM (nastroje/merice.py)
    import('./mapa_scenky.js').then((m) => m.spust()).catch(() => {});   // drobné scénky (rybáři, draci, čarodějnice…), site/scenky.json
    import('./mapa_ovzdusi.js').then((m) => m.spust({ lat: OV.cam.lat0, lon: OV.cam.lon0, panelPo: $('predpovedBox') })).catch(() => {});
    if ({{KALENDAR}}) import('./mapa_kalendar.js').then((m) => m.spust({ panelPo: $('dnesTop'), ukazKartu: ukaz, jdi })).catch(() => {});
    if ({{VYLUKY}}) import('./mapa_vyluky.js').then((m) => m.spust({ panelPred: $('puBox'), ukazKartu: ukaz })).catch(() => {});
    if (xm) {
      const [wx, wy] = imgToWorld(xm[0], xm[1]), [lo, la] = lonlat(wx, wy);
      Promise.all([import('./mapa_zivot.js'), akce]).then(([m, stav]) => m.spust({ namesti: [la, lo], radnice: rad ? [rad.lat, rad.lon] : null, akce: stav, namestiSektor: {{NAMESTI_SEKTOR}} })).catch(() => {});
    }
  }
})();
