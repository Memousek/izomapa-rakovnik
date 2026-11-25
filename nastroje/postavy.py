# postavy pro 3D jízdu (chodci a hráč): Quaternius Universal Base Characters + Universal Animation Library (CC0)
# Ze stažených balíků v podklady/postavy/ (Standard verze zdarma z quaternius.itch.io, viz web/jizda_postavy/ZDROJ.txt)
# vyrobí malé GLB do web/jizda_postavy/:
#   muz.glb, zena.glb   postava (tělo, oči, obočí) se skinem; jen poloha, normála, UV, kosti; textura těla 512 px JPEG
#   vlasy_<styl>.glb    účesy navázané na kost hlavy (stejná kostra se 65 kostmi)
#   pohyby.glb          jen vybrané animace (bez sítí), kosti podle jmen
# Barvy oblečení dělá shader ve web/jizda_postavy.js podle polohy v T-póze (tričko, kalhoty, boty).
# spouštět z kořene repa: python nastroje/postavy.py
import io, json, os, struct, sys
from PIL import Image

SRC = 'podklady/postavy'
OUT = 'web/jizda_postavy'
BC = f'{SRC}/postavy/Universal Base Characters[Standard]'
POSTAVY = {'muz': f'{BC}/Base Characters/Godot - UE/Superhero_Male_FullBody.gltf',
           'zena': f'{BC}/Base Characters/Godot - UE/Superhero_Female_FullBody.gltf'}
VLASY = ['Hair_SimpleParted', 'Hair_Buzzed', 'Hair_Long', 'Hair_Buns', 'Hair_Beard']
ANIM = f'{SRC}/anim/Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb'
POHYBY = ['Idle_Loop', 'Idle_Talking_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Sitting_Idle_Loop',
          'Jump_Start', 'Jump_Loop', 'Jump_Land', 'Punch_Jab', 'Death01', 'Driving_Loop']
ATRIBUTY = {'POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0'}
TEX_PX = 512
SIZE = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
NCOMP = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def nacti(path):
    """glTF (s .bin vedle) nebo GLB -> (json, bytes bufferu 0)"""
    if path.endswith('.glb'):
        b = open(path, 'rb').read()
        jl = struct.unpack_from('<I', b, 12)[0]
        g = json.loads(b[20:20 + jl])
        bl = struct.unpack_from('<I', b, 20 + jl)[0]
        return g, b[28 + jl:28 + jl + bl]
    g = json.load(open(path))
    return g, open(os.path.join(os.path.dirname(path), g['buffers'][0]['uri']), 'rb').read()


class Balic:
    """nový GLB: kopíruje accessory ze zdroje do jednoho bufferu (bez prokládání), přidává obrázky"""
    def __init__(self):
        self.bin = bytearray(); self.views = []; self.acc = []; self.mapa = {}

    def view(self, data, target=None):
        while len(self.bin) % 4: self.bin.append(0)
        v = {'buffer': 0, 'byteOffset': len(self.bin), 'byteLength': len(data)}
        if target: v['target'] = target
        self.bin += data; self.views.append(v)
        return len(self.views) - 1

    def accessor(self, g, src, i, target=None):
        if (id(g), i) in self.mapa: return self.mapa[(id(g), i)]
        a = dict(g['accessors'][i]); bv = g['bufferViews'][a['bufferView']]
        es = SIZE[a['componentType']] * NCOMP[a['type']]
        st = bv.get('byteStride', es); o = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
        data = b''.join(src[o + k * st:o + k * st + es] for k in range(a['count'])) if st != es else src[o:o + es * a['count']]
        a['bufferView'] = self.view(data, target); a.pop('byteOffset', None); a.pop('sparse', None)
        self.acc.append(a); self.mapa[(id(g), i)] = len(self.acc) - 1
        return len(self.acc) - 1

    def glb(self, g, path):
        g['buffers'] = [{'byteLength': len(self.bin)}]; g['bufferViews'] = self.views; g['accessors'] = self.acc
        while len(self.bin) % 4: self.bin.append(0)
        js = json.dumps(g, separators=(',', ':')).encode()
        js += b' ' * ((4 - len(js) % 4) % 4)
        with open(path, 'wb') as f:
            f.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(self.bin)))
            f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
            f.write(struct.pack('<II', len(self.bin), 0x004E4942)); f.write(self.bin)
        print(path, round((28 + len(js) + len(self.bin)) / 1024), 'kB')


def jpeg(path, px=TEX_PX):
    im = Image.open(path).convert('RGB')
    im.thumbnail((px, px), Image.LANCZOS)
    b = io.BytesIO(); im.save(b, 'JPEG', quality=86)
    return b.getvalue()


def postava(path, out):
    """sítě se skinem, uzly a kostra beze změny; jen základní atributy a barevné textury (bez normálových a drsnosti)"""
    g, src = nacti(path)
    B = Balic(); d = os.path.dirname(path)
    for m in g['meshes']:
        for p in m['primitives']:
            p['attributes'] = {k: B.accessor(g, src, v, 34962) for k, v in p['attributes'].items() if k in ATRIBUTY}
            if 'indices' in p: p['indices'] = B.accessor(g, src, p['indices'], 34963)
            p.pop('targets', None)
    for s in g.get('skins', []):
        if 'inverseBindMatrices' in s: s['inverseBindMatrices'] = B.accessor(g, src, s['inverseBindMatrices'])
    # textury: jen baseColor, zmenšené do JPEG
    imgs, texs = [], []
    for mat in g['materials']:
        pbr = mat.get('pbrMetallicRoughness', {})
        t = pbr.get('baseColorTexture')
        for k in ('normalTexture', 'occlusionTexture', 'emissiveTexture'): mat.pop(k, None)
        pbr.pop('metallicRoughnessTexture', None)
        if t is not None:
            uri = g['images'][g['textures'][t['index']]['source']]['uri']
            imgs.append({'mimeType': 'image/jpeg', 'bufferView': B.view(jpeg(os.path.join(d, uri)))})
            texs.append({'source': len(imgs) - 1})
            pbr['baseColorTexture'] = {'index': len(texs) - 1}
    g['images'] = imgs; g['textures'] = texs; g.pop('samplers', None)
    for t in g['textures']: t.pop('sampler', None)
    g.pop('extensionsUsed', None); g.pop('extensionsRequired', None)
    B.glb(g, out)


def pohyby(out):
    g, src = nacti(ANIM)
    B = Balic()
    anims = [a for a in g['animations'] if a['name'] in POHYBY]
    for a in anims:
        for s in a['samplers']:
            s['input'] = B.accessor(g, src, s['input']); s['output'] = B.accessor(g, src, s['output'])
    used_nodes = {c['target']['node'] for a in anims for c in a['channels']}
    nodes = [{k: v for k, v in n.items() if k not in ('mesh', 'skin')} for n in g['nodes']]
    g2 = {'asset': g['asset'], 'nodes': nodes, 'scenes': g['scenes'], 'scene': g.get('scene', 0), 'animations': anims}
    print('animace', [a['name'] for a in anims], 'uzlů s kanály', len(used_nodes))
    B.glb(g2, out)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for k, p in POSTAVY.items(): postava(p, f'{OUT}/{k}.glb')
    hd = f'{BC}/Hairstyles/Rigged to Head Bone/glTF (Godot -Unreal)'
    for v in VLASY: postava(f'{hd}/{v}.gltf', f'{OUT}/vlasy_{v[5:].lower()}.glb')
    pohyby(f'{OUT}/pohyby.glb')
    with open(f'{OUT}/ZDROJ.txt', 'w') as f:
        f.write('Postavy a animace: Quaternius (quaternius.com), Universal Base Characters a Universal Animation Library,\n'
                'verze Standard z quaternius.itch.io. Licence CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/).\n'
                'Převedeno nástrojem nastroje/postavy.py (zmenšené textury, jen vybrané animace).\n')
