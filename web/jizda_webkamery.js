// Webkamery ve 3D jízdě: menu Webkamery vybere kameru a kamera 3D scény se postaví na její místo (střecha domu, směr,
// sklon a zorné pole z jizda/kamery.js, data společná s 2D mapou), aby pohled odpovídal skutečnému záběru. V rohu obraz v obraze: aktuální snímek
// s odkazem zpět (jen kde to provozovatel dovoluje, jinak jen odkaz na jeho stránku). Esc nebo tlačítko = zpět do jízdy.
// Hráč mezitím stojí; čtverce, auta a lidé se načítají kolem kamery (hráč se na dobu pohledu přesune pod ni).
import { KAMERY, snimekUrl } from './kamery.js';

export function vytvorWebkamery(THREE, { CAM, gz, hrac, panel, start, konec }) {
  const seznam = KAMERY.filter((k) => k.pohled);
  const st = { on: false, k: null, ulozeno: null, t: 0 };
  const kratky = (k) => { const s = k.nazev.replace(/^Webkamera:\s*/, ''); return s[0].toUpperCase() + s.slice(1); };   // Centrum Rakovníka
  const svet = (lat, lon) => [(lon - CAM.lon0) * CAM.kx, (lat - CAM.lat0) * CAM.ky];

  // ---------- obraz v obraze ----------
  const pip = document.createElement('aside');
  pip.id = 'webkam'; pip.hidden = true; pip.setAttribute('aria-label', 'Skutečný záběr webkamery');
  pip.innerHTML = '<header><b></b><button type="button" class="px-btn" data-zpet>Zpět do jízdy <kbd>Esc</kbd></button></header><div class="wk-obr"></div><p class="wk-zdroj"></p><nav class="wk-dalsi"></nav>';
  document.body.appendChild(pip);
  pip.querySelector('[data-zpet]').addEventListener('click', () => vypni());
  let obnova = 0;
  function vyplnPip(k) {
    pip.querySelector('b').textContent = kratky(k);
    const box = pip.querySelector('.wk-obr'), z = pip.querySelector('.wk-zdroj');
    box.style.aspectRatio = k.obrazek ? String(k.pohled.pomer || 16 / 9) : '';   // jen odkaz: nízký rámeček
    const a = document.createElement('a'); a.href = k.odkaz; a.target = '_blank'; a.rel = 'noopener';
    if (k.obrazek) {                                         // vložení dovoleno: snímek a pod ním odkaz zpět
      const im = document.createElement('img'); im.alt = `Aktuální snímek: ${k.nazev}`; im.referrerPolicy = 'no-referrer'; im.src = snimekUrl(k);
      box.replaceChildren(im);                                // snímek sám odkazem není, odkaz ven je v popisku pod ním
      z.innerHTML = ''; const l = document.createElement('a'); l.href = k.odkaz; l.target = '_blank'; l.rel = 'noopener'; l.textContent = `Webkamera: ${k.zdroj} ↗`;
      z.append('Snímek: ', l, ' · obnova po 2 min');
      clearInterval(obnova); obnova = setInterval(() => { im.src = snimekUrl(k); }, 120000);
    } else {                                                 // bez souhlasu provozovatele snímek nevkládat, jen odkaz
      a.className = 'wk-odkaz'; a.innerHTML = '<span>Aktuální snímek je na webu provozovatele</span>';
      const s = document.createElement('strong'); s.textContent = `Otevřít ${k.zdroj.split(',').pop().trim()}`;
      const sip = document.createElement('span'); sip.className = 'ven-sipka'; sip.setAttribute('aria-hidden', 'true'); sip.textContent = '↗'; s.append(sip); a.append(s);   // šipka jako u odkazů ven (web/js/02-odkazy-ven.js), ať se nezdvojí
      box.replaceChildren(a); z.textContent = `Zdroj: ${k.zdroj}`;
      clearInterval(obnova);
    }
    const dalsi = pip.querySelector('.wk-dalsi'); dalsi.replaceChildren();
    for (const o of seznam) if (o !== k) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'px-btn'; b.textContent = kratky(o);
      b.addEventListener('click', () => zapni(o)); dalsi.append(b);
    }
  }

  // ---------- menu ----------
  if (panel) {
    const ul = document.createElement('ul'); ul.className = 'wk-seznam';
    for (const k of seznam) {
      const li = document.createElement('li'), b = document.createElement('button');
      b.type = 'button'; b.innerHTML = '<b></b><small></small>';
      b.querySelector('b').textContent = kratky(k);
      b.querySelector('small').textContent = `${k.text.split('. ')[0]}. ${k.obrazek ? 'Se živým snímkem.' : 'Snímek na webu provozovatele.'}`;
      b.addEventListener('click', () => zapni(k));
      li.append(b); ul.append(li);
    }
    const p = document.createElement('p'); p.className = 'wk-pozn';
    p.textContent = 'Kamera 3D scény se postaví tam, kde je skutečná webkamera, a vedle se ukáže její aktuální záběr. Obraz je široký objektiv, 3D pohled ho napodobuje bez zkreslení okrajů.';
    panel.replaceChildren(ul, p);
  }

  function zapni(k) {
    if (!st.on) st.ulozeno = { x: hrac.x, y: hrac.y, z: hrac.z };
    st.on = true; st.k = k;
    const [x, y] = svet(k.pohled.lat, k.pohled.lon);
    hrac.x = x; hrac.y = y; hrac.z = gz(x, y);              // čtverce, auta a chodci kolem kamery
    vyplnPip(k); pip.hidden = false; document.body.classList.add('webkamera');
    start?.(k);
  }
  function vypni() {
    if (!st.on) return;
    st.on = false; st.k = null; clearInterval(obnova);
    pip.hidden = true; document.body.classList.remove('webkamera');
    if (st.ulozeno) Object.assign(hrac, st.ulozeno);
    konec?.();
  }
  // kamera 3D scény podle pohled: poloha, směr, sklon, svislé zorné pole z vodorovného (šířka snímku = šířka obrazovky)
  function kamera(camera, fwd) {
    const p = st.k.pohled, [x, y] = svet(p.lat, p.lon), z = gz(x, y) + p.vyska;
    const a = p.smer * Math.PI / 180, s = p.sklon * Math.PI / 180;
    camera.position.set(x, z, -y);
    fwd.set(Math.sin(a) * Math.cos(s), Math.sin(s), -Math.cos(a) * Math.cos(s));
    camera.up.set(0, 1, 0); camera.lookAt(camera.position.clone().add(fwd));
    // celý záběr vždy na obrazovce: širší obrazovka ukáže víc do stran, užší víc nahoru a dolů
    const t = Math.tan(p.fov * Math.PI / 360), v = 2 * Math.atan(Math.max(t / (camera.aspect || 1), t / (p.pomer || 16 / 9))) * 180 / Math.PI;
    if (Math.abs(camera.fov - v) > 0.01) { camera.fov = v; camera.updateProjectionMatrix(); }
    return v;
  }
  return { get on() { return st.on; }, get kamera_() { return st.k; }, seznam, zapni, vypni, kamera, svet };
}
