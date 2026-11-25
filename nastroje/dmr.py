"""Terén z laserového skenování ČÚZK (DMR 5G, CC BY 4.0) místo globálního Terraria (SRTM, ~30 m).

python nastroje/dmr.py          # stáhne listy DMR 5G přes mapu do build/dmr/ a vyrobí build/dmr_teren.npz

DMR 5G jsou body povrchu terénu (bez budov a vegetace) s přesností kolem 0,2 m. Body se zprůměrují do mřížky 5 m
v S-JTSK (EPSG:5514). Díry (pod budovami, vodní plochy) se zaplní z okolí. prep.py pak terén bere odtud a Terrarium
použije jen mimo pokrytí. Proti Terrariu: skutečné nivy potoků, náspy tratí a silnic, opěry mostů a hrany teras,
údolí nejsou zaoblená. Po stažení je potřeba nový render všech čtverců (./postav.sh render).
"""
import glob, os, re, subprocess, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import geo
from pyproj import Transformer

D = 'build/dmr'
os.makedirs(D, exist_ok=True)
A = f'{D}/atom.xml'
if not os.path.exists(A):
    subprocess.run(['curl', '-sfL', '-m', '300', '-o', A, 'https://atom.cuzk.gov.cz/DMR5G-SJTSK/DMR5G-SJTSK.xml'], check=True)
s = open(A, encoding='utf8').read()
lon0, lon1, lat0, lat1 = geo.bbox_lonlat(200.0)
T = Transformer.from_crs('EPSG:4326', 'EPSG:5514', always_xy=True)
cx, cy = T.transform([lon0, lon1, lon0, lon1], [lat0, lat0, lat1, lat1])
X0, X1, Y0, Y1 = min(cx), max(cx), min(cy), max(cy)          # obdélník mapy v S-JTSK
listy = []
for e in s.split('<entry>')[1:]:
    p = re.search(r'<georss:polygon>(.*?)<', e); k = re.search(r'DMR5G-SJTSK_([A-Z0-9]+)\.xml', e)
    if not (p and k): continue
    v = list(map(float, p.group(1).split()))                    # lat lon dvojice ve WGS84
    lx, ly = T.transform(v[1::2], v[0::2])
    if max(lx) >= X0 and min(lx) <= X1 and max(ly) >= Y0 and min(ly) <= Y1: listy.append(k.group(1))
print('listů DMR 5G', len(listy))
for n in listy:
    z = f'{D}/{n}.laz'
    if os.path.exists(z): continue
    subprocess.run(['curl', '-sfL', '-m', '180', '-o', f'{D}/{n}.zip', f'https://openzu.cuzk.cz/opendata/DMR5G/epsg-5514/{n}.zip'], check=True)
    subprocess.run(['unzip', '-oq', f'{D}/{n}.zip', '-d', D], check=True); os.remove(f'{D}/{n}.zip')
    print('staženo', n)

import laspy
from scipy import ndimage
R = 5.0
nx, ny = int((X1 - X0) / R) + 1, int((Y1 - Y0) / R) + 1
suma = np.zeros(nx * ny); pocet = np.zeros(nx * ny)
for n in listy:
    l = laspy.read(f'{D}/{n}.laz')
    x, y, h = np.asarray(l.x), np.asarray(l.y), np.asarray(l.z)
    i = ((x - X0) / R).astype(int); j = ((y - Y0) / R).astype(int)
    ok = (i >= 0) & (i < nx) & (j >= 0) & (j < ny)
    k = j[ok] * nx + i[ok]
    suma += np.bincount(k, h[ok], nx * ny); pocet += np.bincount(k, None, nx * ny)
Z = np.where(pocet > 0, suma / np.maximum(pocet, 1), np.nan).reshape(ny, nx)
dira = np.isnan(Z)
print(f'mřížka {nx} × {ny} po {R} m, bez bodů {dira.mean() * 100:.1f} %')
# díry: nejdřív nejbližší změřená hodnota, pak vyhlazení jen uvnitř děr (pod budovou rovná plocha bez schodů na okraji)
idx = ndimage.distance_transform_edt(dira, return_distances=False, return_indices=True)
Z = Z[tuple(idx)]
for _ in range(30):
    Z = np.where(dira, ndimage.uniform_filter(Z, 5, mode='nearest'), Z)
np.savez_compressed('build/dmr_teren.npz', z=Z.astype(np.float32), x0=X0, y0=Y0, r=R)
print('build/dmr_teren.npz', f'{np.nanmin(Z):.1f}–{np.nanmax(Z):.1f} m n. m.')
