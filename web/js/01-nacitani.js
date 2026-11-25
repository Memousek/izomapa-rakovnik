  // Načítání (Rakovník): v izometrii se poskládají čtverce mapy tak, jak leží (tiles.json), sever vpravo nahoře.
  // Čtverce naskakují od středu; obrazovku schová initLayers (10-vrstvy.js), jakmile je vidět náhled mapy.
  (() => {
    const svg = document.getElementById('ldIso');
    if (!svg) return;
    const ij = Object.values(TILES.chunks || {}).map((c) => c.chunk).filter(Boolean);
    if (!ij.some(([i, j]) => i === 0 && j === 0)) ij.push([0, 0]);
    const I = ij.map((c) => c[0]), J = ij.map((c) => c[1]);
    const ci = (Math.min(...I) + Math.max(...I)) / 2, cj = (Math.min(...J) + Math.max(...J)) / 2;
    const span = Math.max(...I.map((i, k) => i + J[k])) - Math.min(...I.map((i, k) => i + J[k])) + 1;
    const a = Math.min(52, 400 / (span + 1));          // půl šířky kosočtverce
    ij.sort((p, q) => (p[0] ** 2 + p[1] ** 2) - (q[0] ** 2 + q[1] ** 2));
    ij.forEach(([i, j], n) => {
      const x = (i - ci + j - cj) * a, y = (i - ci - (j - cj)) * a / 2;
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', `M${x} ${y - a / 2}L${x + a} ${y}L${x} ${y + a / 2}L${x - a} ${y}Z`);
      p.style.animationDelay = `${n * 0.16}s`;
      svg.appendChild(p);
    });
  })();
