  // Odkazy na jiný web (Rakovník): u každého odkazu mimo tuto mapu je vidět šipka ↗ a čtečka obrazovky slyší
  // „jiný web“, u nového okna i „otevře se v novém okně“ (WCAG 2.4.4 a 3.2.5). Hlídá celou stránku včetně karet
  // a podoken, které moduly přidávají až za běhu, takže jednotlivé moduly nic řešit nemusí.
  // Šipka už napsaná v textu („Otevřít na cbcnet.cz ↗“) se nezdvojí, jen se schová před čtečkou.
  (() => {
    const ven = (a) => {
      if (a.dataset.ven || !a.href) return;
      let u; try { u = new URL(a.href, location.href); } catch { return; }
      if (!/^https?:$/.test(u.protocol) || u.origin === location.origin) return;
      a.dataset.ven = '1';
      const nove = a.target === '_blank';
      if (nove && !/noopener/.test(a.rel)) a.rel = (a.rel + ' noopener').trim();
      const popis = nove ? 'jiný web, otevře se v novém okně' : 'jiný web';
      if (a.hasAttribute('aria-label')) { if (!a.getAttribute('aria-label').includes(popis)) a.setAttribute('aria-label', `${a.getAttribute('aria-label')} (${popis})`); }
      else {
        const vh = document.createElement('span'); vh.className = 'vh'; vh.textContent = ` (${popis})`; a.append(vh);
      }
      const t = [...a.childNodes].find((n) => n.nodeType === 3 && n.textContent.includes('↗'));
      if (t) {                                                        // šipka z textu: obalit, ať ji čtečka nečte jako „šipka severovýchod“
        const i = t.textContent.lastIndexOf('↗'), pred = t.textContent.slice(0, i).replace(/\s+$/, '');
        const s = document.createElement('span'); s.className = 'ven-sipka'; s.setAttribute('aria-hidden', 'true'); s.textContent = '↗';
        t.replaceWith(pred, s, t.textContent.slice(i + 1));
      } else if (a.textContent.trim() && !a.querySelector('.ven-sipka')) {   // šipku ve vlastním prvku (cedule sousední mapy) nezdvojit
        const s = document.createElement('span'); s.className = 'ven-sipka'; s.setAttribute('aria-hidden', 'true'); s.textContent = '↗';
        a.insertBefore(s, a.querySelector('.vh'));
      }
    };
    const projdi = (n) => { if (n.nodeType !== 1) return; if (n.tagName === 'A') ven(n); n.querySelectorAll?.('a[href]').forEach(ven); };
    projdi(document.body);
    new MutationObserver((zm) => {
      for (const z of zm) {
        if (z.type === 'attributes') { ven(z.target); continue; }       // nová adresa u neoznačeného odkazu
        z.addedNodes.forEach(projdi);
        const a = z.target.closest?.('a[data-ven]');                  // text odkazu přepsaný po vložení smaže i značku: znovu
        if (a && !a.hasAttribute('aria-label') && !a.querySelector('.vh')) { delete a.dataset.ven; ven(a); }
      }
    })
      .observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });
  })();
