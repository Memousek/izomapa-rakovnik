"""Náhled složené mapy z dlaždic rendereru (build/.../tiles_<varianta>) – kontrola švů bez DZI a webu.

python compose.py [varianta] [měřítko] [výstup.png] [i,j ...]   např. python compose.py autumn 8 build/nahled.png
(měřítko = kolikrát zmenšit oproti 0,2 m/px, platí stejně pro základní i detailní rozlišení)
Čtverce se skládají od nejvzdálenějšího (pohled od JZ: větší i + j = dál), stejně jako v prohlížeči.
"""
import json, math, os, sys
from PIL import Image
from geo import CHUNKS, chunk_dir

Image.MAX_IMAGE_PIXELS = None
variant = sys.argv[1] if len(sys.argv) > 1 else 'autumn'
scale = int(sys.argv[2]) if len(sys.argv) > 2 else 8
out = sys.argv[3] if len(sys.argv) > 3 else f'build/nahled_{variant}.png'
only = {tuple(int(v) for v in a.split(',')) for a in sys.argv[4:]}


def src(c):
    return f'build/tiles_{variant}' if tuple(c) == (0, 0) else f'{chunk_dir(c)}/tiles_{variant}'


chunks = [c for c in CHUNKS if os.path.exists(f'{src(c)}/info.json') and (not only or c in only)]
chunks.sort(key=lambda c: -(c[0] + c[1]))
infos = {c: json.load(open(f'{src(c)}/info.json')) for c in chunks}
mpp = infos[chunks[0]]['mpp']
scale *= max(1, round(0.2 / mpp))      # měřítko je vůči 0,2 m/px: u detailního rozlišení (0,1) stejně velký náhled
gx0 = min(i['x0'] for i in infos.values()); gy1 = max(i['y1'] for i in infos.values())
W = max(round((i['x0'] - gx0) / mpp) + i['width'] for i in infos.values())
H = max(round((gy1 - i['y1']) / mpp) + i['height'] for i in infos.values())
BG = (0, 0, 0, 0) if os.environ.get('TRANSPARENT') else (27, 35, 51, 255)
img = Image.new('RGBA', (W // scale + 1, H // scale + 1), BG)
TILES = json.load(open('site/tiles.json')) if os.path.exists('site/tiles.json') else {}


def z_webu(c, i):
    """Zmenšenina čtverce z Deep Zoom dlaždic webu (site/tiles), když PNG z renderu dzi.py už smazal."""
    d = TILES.get(variant) if tuple(c) == (0, 0) else TILES.get('chunks', {}).get(f'c{c[0]}_{c[1]}', {}).get(variant)
    if not d: return None
    im_ = d['Image']; W, H, TS = int(im_['Size']['Width']), int(im_['Size']['Height']), int(im_['TileSize'])
    s = 1 << (scale.bit_length() - 1)                 # nejbližší úroveň pyramidy (mocnina 2) do měřítka
    maxl = math.ceil(math.log2(max(W, H))); lvl = maxl - (s.bit_length() - 1)
    w, h = math.ceil(W / s), math.ceil(H / s)
    a = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    for k in range(math.ceil(w / TS)):
        for r in range(math.ceil(h / TS)):
            f = f"site/{im_['Url']}{lvl}/{k}_{r}.{im_['Format']}"
            if os.path.exists(f): a.paste(Image.open(f).convert('RGBA'), (k * TS, r * TS))
    return a if s == scale else a.resize((W // scale, H // scale), Image.Resampling.BOX)


for c in chunks:
    i = infos[c]; T = i['tile']; ox = round((i['x0'] - gx0) / mpp); oy = round((gy1 - i['y1']) / mpp)
    if not os.path.exists(f'{src(c)}/0_0.png') and not variant.startswith('xmas'):
        a = z_webu(c, i)
        if a is None: print('chybí dlaždice', c); continue
        img.alpha_composite(a, (ox // scale, oy // scale)); continue
    for r in range(i['rows']):
        for k in range(i['cols']):
            f = f'{src(c)}/{k}_{r}.png'
            if not os.path.exists(f): continue
            t = Image.open(f).convert('RGBA')
            if scale > 1: t = t.resize((T // scale, T // scale), Image.Resampling.BOX)
            img.alpha_composite(t, ((ox + k * T) // scale, (oy + r * T) // scale))
img.save(out)
json.dump({'x0': gx0, 'y1': gy1, 'mpp': mpp * scale, 'w': img.size[0], 'h': img.size[1]}, open(out.rsplit('.', 1)[0] + '.json', 'w'))
print(out, img.size, 'čtverce', chunks, 'počátek', gx0, gy1)
