// Pohlednice: obrázek toho, co je právě vidět (mapa + animovaná vrstva), s rozostřenými okraji, názvem a zdroji dat.
// Stejné skládání použije i hlášení nepřesnosti (menší snímek k hlášení). Nápad z minimapa.cz, kód vlastní.

// rozmazání přes zmenšení a zvětšení (filter: blur na plátně Safari neumí)
function rozmazane(src, k) {
  const m = document.createElement('canvas'); m.width = Math.max(1, Math.round(src.width / k)); m.height = Math.max(1, Math.round(src.height / k));
  const g = m.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, m.width, m.height);
  const o = document.createElement('canvas'); o.width = src.width; o.height = src.height;
  const h = o.getContext('2d'); h.imageSmoothingEnabled = true; h.imageSmoothingQuality = 'high'; h.drawImage(m, 0, 0, o.width, o.height);
  return o;
}

// osd: plátno OpenSeadragonu, fx: plátno animací (auta, MHD, počasí); max: nejdelší strana výsledku v px
export function slozSnimek({ osd, fx, max = 2400, rozostrit = true, popisek = null }) {
  const W0 = osd.width, H0 = osd.height, k = Math.min(1, max / Math.max(W0, H0));
  const c = document.createElement('canvas'); c.width = Math.round(W0 * k); c.height = Math.round(H0 * k);
  const g = c.getContext('2d'); g.imageSmoothingEnabled = k < 1;
  g.fillStyle = getComputedStyle(document.getElementById('map')).backgroundColor || '#1b2333'; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(osd, 0, 0, c.width, c.height);
  if (fx && fx.width) g.drawImage(fx, 0, 0, c.width, c.height);
  if (rozostrit) {                                            // „tilt-shift“: nahoře a dole rozmazané, střed ostrý (vypadá jako model)
    const b = rozmazane(c, 10), m = document.createElement('canvas'); m.width = c.width; m.height = c.height;
    const mg = m.getContext('2d'); mg.drawImage(b, 0, 0);
    const gr = mg.createLinearGradient(0, 0, 0, c.height);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.28, 'rgba(0,0,0,0)'); gr.addColorStop(0.66, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
    mg.globalCompositeOperation = 'destination-in'; mg.fillStyle = gr; mg.fillRect(0, 0, c.width, c.height);
    g.drawImage(m, 0, 0);
  }
  if (popisek) {                                              // spodní pruh: název, adresa, zdroje dat (musí zůstat)
    const s = Math.max(1, c.width / 1200), h = Math.round(64 * s);
    g.fillStyle = 'rgba(20,26,40,.86)'; g.fillRect(0, c.height - h, c.width, h);
    g.fillStyle = '#f2c66d'; g.font = `600 ${Math.round(26 * s)}px "Pixelify Sans", "Courier New", monospace`; g.textBaseline = 'middle';
    g.fillText(popisek.nazev, Math.round(18 * s), c.height - h / 2 - 9 * s);
    g.fillStyle = '#eef1e6'; g.font = `${Math.round(13 * s)}px "Atkinson Hyperlegible", system-ui, sans-serif`;
    g.fillText(popisek.adresa, Math.round(18 * s), c.height - h / 2 + 15 * s);
    g.textAlign = 'right'; g.fillStyle = '#a9b3c4';
    g.fillText(popisek.zdroje, c.width - Math.round(18 * s), c.height - h / 2 + 15 * s);
    g.fillText(popisek.datum, c.width - Math.round(18 * s), c.height - h / 2 - 9 * s);
  }
  return c;
}

const blob = (c, typ = 'image/png', q) => new Promise((ok, chyba) => { try { c.toBlob((b) => (b ? ok(b) : chyba(new Error('prázdný obrázek'))), typ, q); } catch (e) { chyba(e); } });

let dlg = null;
// dialog pohlednice: náhled, volby, uložit / sdílet / kopírovat odkaz
export function otevri({ osd, fx, nazev, odkaz, toast }) {
  if (!dlg) {
    dlg = document.createElement('dialog'); dlg.className = 'help pohl'; dlg.setAttribute('aria-labelledby', 'pohlTitle');
    dlg.innerHTML = `<button class="px-btn close" type="button" aria-label="Zavřít" data-a="zavrit">×</button>
      <h3 id="pohlTitle">Pohlednice</h3>
      <p class="muted">Obrázek přesně toho, co teď vidíte, i&nbsp;s&nbsp;auty a&nbsp;počasím.</p>
      <img class="pohl-nahled" alt="Náhled pohlednice">
      <label class="realtime"><input type="checkbox" data-v="rozostrit" checked> Rozostřit okraje (jako model)</label>
      <label class="realtime"><input type="checkbox" data-v="popisek" checked> Název, odkaz a&nbsp;zdroje dat dole</label>
      <div class="pohl-btns"><button class="px-btn" type="button" data-a="ulozit">Uložit obrázek</button>
      <button class="px-btn" type="button" data-a="sdilet" hidden>Sdílet</button>
      <button class="px-btn" type="button" data-a="odkaz">Kopírovat odkaz</button></div>`;
    document.body.append(dlg);
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  }
  let akt = null;
  const vol = (v) => dlg.querySelector(`[data-v="${v}"]`).checked;
  const datum = new Date().toLocaleDateString('cs-CZ');
  const sloz = () => {
    try {
      akt = slozSnimek({ osd, fx, rozostrit: vol('rozostrit'), popisek: vol('popisek') ? { nazev, adresa: odkaz.replace(/^https?:\/\//, '').split('#')[0], datum,
        zdroje: 'izomapa · © OpenStreetMap, Overture Maps, ČÚZK' } : null });
      dlg.querySelector('.pohl-nahled').src = akt.toDataURL('image/jpeg', 0.8);
    } catch (e) { akt = null; toast('Obrázek teď nejde vytvořit (' + e.name + ').'); }
  };
  dlg.querySelectorAll('[data-v]').forEach((i) => { i.onchange = sloz; });
  const soubor = async () => new File([await blob(akt)], `${nazev.replace(/\s+/g, '-').toLowerCase()}-${datum.replace(/\.\s*/g, '-')}.png`, { type: 'image/png' });
  const sd = dlg.querySelector('[data-a="sdilet"]');
  sd.hidden = !(navigator.canShare && navigator.canShare({ files: [new File([''], 'a.png', { type: 'image/png' })] }));
  dlg.querySelector('[data-a="zavrit"]').onclick = () => dlg.close();
  dlg.querySelector('[data-a="ulozit"]').onclick = async () => {
    if (!akt) return;
    const f = await soubor(), a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  sd.onclick = async () => { if (!akt) return; try { await navigator.share({ files: [await soubor()], title: nazev, url: odkaz }); } catch (e) { if (e.name !== 'AbortError') toast('Sdílení se nepovedlo.'); } };
  dlg.querySelector('[data-a="odkaz"]').onclick = async () => { try { await navigator.clipboard.writeText(odkaz); toast('Odkaz na tento pohled je zkopírovaný'); } catch { toast(odkaz); } };
  sloz();
  dlg.showModal();
}
