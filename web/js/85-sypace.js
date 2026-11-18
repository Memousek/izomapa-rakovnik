  // ---------- sypače a pluhy ŘSD (živě z udrzba.rsd.cz přes api/pluhy): dálnice a silnice I. třídy ----------
  // Polohy chodí po ~5 s, mezi nimi vůz plynule dojíždí. Trasy za posledních 12 h se kreslí na silnici: oranžově
  // zásah (posyp, pluh) podle stáří, šedě pojezd bez zásahu. Vůz je oranžový nákladní sypač s radlicí a majákem.
  const PLOW = { on: {{PLUHY}}, list: new Map(), trasy: [], last: 0, off: false };
  if (PLOW.on) $('l-pluhy-w').hidden = false;
  const llW = (lon, lat) => [(lon - cam.lon0) * cam.kx, (lat - cam.lat0) * cam.ky];
  async function fetchPlows() {
    const pad = 0.12, la0 = (cam.lat0 - pad).toFixed(4), la1 = (cam.lat0 + pad).toFixed(4), lo0 = (cam.lon0 - pad * 1.6).toFixed(4), lo1 = (cam.lon0 + pad * 1.6).toFixed(4);
    try {
      const r = await fetch(`api/pluhy?lamin=${la0}&lamax=${la1}&lomin=${lo0}&lomax=${lo1}`, { signal: AbortSignal.timeout(8000) });
      if (r.status === 404) { PLOW.off = true; return; }
      if (!r.ok) return;
      const d = await r.json(), now = performance.now(), seen = new Set();
      PLOW.trasy = (d.trasy || []).map((t) => ({ a: t.a, z: t.z, w: t.l.map(([lo, la]) => { const [x, y] = llW(lo, la); return [x, y]; }) }));
      for (const p of d.pts || []) {
        const [x, y] = llW(p.lon, p.lat); seen.add(p.id);
        let q = PLOW.list.get(p.id);
        if (!q) { q = { x, y, tx: x, ty: y, hd: 0, trail: [], seen: now, ph: rnd(PLOW.list.size + 3) * 6 }; PLOW.list.set(p.id, q); }
        const dx = x - q.tx, dy = y - q.ty;
        if (Math.hypot(dx, dy) > 2) q.hd = Math.atan2(dy, dx);
        if (Math.hypot(x - q.x, y - q.y) > 400) { q.x = x; q.y = y; q.trail = []; }       // skok (nová trasa): bez dojíždění
        q.tx = x; q.ty = y; q.v = p.v; q.z = p.z; q.s = p.s; q.seen = now;
      }
      for (const [id, q] of PLOW.list) if (!seen.has(id) && now - q.seen > 120000) PLOW.list.delete(id);
      const inMap = [...PLOW.list.values()].filter((q) => Math.abs(q.tx) < 6000 && Math.abs(q.ty) < 6000).length;
      $('pluhy-n').textContent = inMap ? `(${inMap})` : '';
    } catch {}
  }
  const PLOWC = { body: [242, 128, 24], cab: [250, 150, 40], blade: [250, 200, 40], dark: [52, 54, 60], salt: [214, 214, 206] };
  function drawPlow(q, sx, ox, oy, t) {
    const z0 = gz(q.x, q.y), fx_ = Math.cos(q.hd), fy_ = Math.sin(q.hd), sxv = -fy_, syv = fx_;
    const P = (s, tt, h) => { const p = toImg(q.x + fx_ * s + sxv * tt, q.y + fy_ * s + syv * tt, z0 + h); return [ox + p[0] * sx, oy + p[1] * sx]; };
    const c0 = toImg(q.x, q.y, z0 + 1.5); if (occluded(c0[0], c0[1], depth(q.x, q.y, z0 + 1.5))) return;
    const poly = (pts, col) => { ctx.fillStyle = col; ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.fill(); };
    const box = (s0, s1, t0, t1, h0, h1, rgb) => {             // kvádr: viditelné boky (normála k jihozápadu) a víko
      const sides = [[s1, t0, s1, t1, fx_, fy_], [s0, t1, s0, t0, -fx_, -fy_], [s0, t0, s1, t0, -sxv, -syv], [s1, t1, s0, t1, sxv, syv]];
      for (const [a, b, c, d, nx, ny] of sides) if (nx + ny < 0) poly([P(a, b, h0), P(c, d, h0), P(c, d, h1), P(a, b, h1)], lit(rgb, nx * SUNV[0] + ny * SUNV[1]));
      poly([P(s0, t0, h1), P(s1, t0, h1), P(s1, t1, h1), P(s0, t1, h1)], lit(rgb, SUNV[2]));
    };
    box(-4.2, 2.6, -1.25, 1.25, 0.4, 3.0, PLOWC.body);          // nástavba se solí
    box(-4.2, 2.6, -1.25, 1.25, 3.0, 3.15, PLOWC.salt);
    box(2.6, 4.4, -1.2, 1.2, 0.4, 3.1, PLOWC.cab);             // kabina
    box(-4.3, 4.4, -1.2, 1.2, 0.0, 0.6, PLOWC.dark);           // podvozek
    if (q.z === 0) box(4.6, 5.2, -1.6, 1.6, 0.0, 1.1, PLOWC.blade);  // radlice (při zásahu dole)
    const on = Math.sin(t * 9 + q.ph) > 0, b = P(3.5, 0, 3.5);  // maják na kabině
    ctx.fillStyle = on ? '#ffb000' : '#8a5a10'; ctx.fillRect(Math.round(b[0] - 1.5 * Math.max(1, sx * 2)), Math.round(b[1] - 1.5 * Math.max(1, sx * 2)), Math.ceil(3 * Math.max(1, sx * 2)), Math.ceil(3 * Math.max(1, sx * 2)));
    if (on) { ctx.fillStyle = 'rgba(255,176,0,0.25)'; ctx.beginPath(); ctx.arc(b[0], b[1], 8 * Math.max(1, sx * 2), 0, 7); ctx.fill(); }
    if (q.z === 0 && q.v > 3) {                                // posyp za vozem
      ctx.fillStyle = 'rgba(235,235,228,0.75)';
      for (let k = 0; k < 14; k++) { const r1 = rnd(k + Math.floor(t * 20)), r2 = rnd(k * 7 + Math.floor(t * 20)); const p = P(-4.6 - r1 * 3, (r2 - 0.5) * 5, 0.3 + r1 * 0.6); ctx.fillRect(p[0], p[1], Math.max(1, sx * 1.5), Math.max(1, sx * 1.5)); }
    }
  }
  function stepDrawPlows(dt, sx, ox, oy, vis, t, now) {
    if (PLOW.off) return;
    if (now - PLOW.last > 10000) { PLOW.last = now; fetchPlows(); }
    // projeté trasy na silnici
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const tr of PLOW.trasy) {
      ctx.strokeStyle = tr.z ? 'rgba(130,130,136,0.45)' : `rgba(255,${120 + tr.a * 20},20,${[0.85, 0.7, 0.55, 0.4, 0.28][tr.a] || 0.25})`;
      ctx.lineWidth = Math.max(1.5, sx * (tr.z ? 3 : 5)); ctx.beginPath();
      tr.w.forEach(([x, y], i) => { const p = toImg(x, y, gz(x, y) + 0.3), X_ = ox + p[0] * sx, Y_ = oy + p[1] * sx; i ? ctx.lineTo(X_, Y_) : ctx.moveTo(X_, Y_); });
      ctx.stroke();
    }
    for (const q of PLOW.list.values()) {
      const dx = q.tx - q.x, dy = q.ty - q.y, d = Math.hypot(dx, dy);
      if (d > 0.05) { const st = Math.min(d, Math.max((q.v || 30) / 3.6, d / 6) * dt); q.x += dx / d * st; q.y += dy / d * st; }
      if (!q.trail.length || Math.hypot(q.x - q.trail[q.trail.length - 1][0], q.y - q.trail[q.trail.length - 1][1]) > 6) { q.trail.push([q.x, q.y]); if (q.trail.length > 300) q.trail.shift(); }
      if (q.trail.length > 1 && q.z === 0) {                   // čerstvá stopa vozu (od otevření mapy)
        ctx.strokeStyle = 'rgba(255,140,20,0.9)'; ctx.lineWidth = Math.max(1.5, sx * 5); ctx.beginPath();
        q.trail.forEach(([x, y], i) => { const p = toImg(x, y, gz(x, y) + 0.3), X_ = ox + p[0] * sx, Y_ = oy + p[1] * sx; i ? ctx.lineTo(X_, Y_) : ctx.moveTo(X_, Y_); });
        ctx.stroke();
      }
      if (sx > 0.06 && vis(...toImg(q.x, q.y, gz(q.x, q.y)), 60)) drawPlow(q, sx, ox, oy, t);
    }
  }

