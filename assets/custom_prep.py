# Rakovník: vlastní úpravy pro prep.py (spouští se v jeho fázích, proměnná HOOK)
# props: rekvizity z assets/rekvizity.json (chmelnice: sloupy a řady drátů, letiště: letadla, kluzák, přívěsy,
# značky dráhy, záhon). Body jsou ve světových metrech od středu mapy [x, y, natočení, …]; výška se bere z terénu.
# Kreslí je assets/custom_models.js (buildProps). Data obnovená z původní mapy (nastroje/obnov z jizda/c*/scene.json).
if HOOK == 'props':
    import json as _json
    if os.path.exists('assets/rekvizity.json'):
        for _k, _v in _json.load(open('assets/rekvizity.json')).items():
            _o = props.setdefault(_k, [])
            for _q in _v:
                _x, _y = _q[0] - CX, _q[1] - CY
                if EXT_P.contains(Point(_x, _y)): _o.append([round(_x, 2), round(_y, 2), round(float(ground(_x, _y)), 2), *_q[2:]])
# cedule obchodů (assets/obchody.json z nastroje/obchody.py): na uliční stěnu domu, ve kterém obchod je (bod uvnitř,
# jinak nejbližší dům do 12 m), nad parter a pod okap; kreslí assets/custom_models.js (buildProps, props.cedule).
# Záznam: [x, y, zem domu, úhel stěny (+t = ven), šířka, spodek nad zemí, výška, klíč značky, pořadí obecné cedule]
if HOOK == 'props' and os.path.exists('assets/obchody.json'):
    import json as _json, math as _m
    from shapely.geometry import Polygon as _Poly, LineString as _LS
    _ulice = [l_ for _a, l_, c_, w_, n_ in roads if c_ != 'rail' and w_ >= 3 and n_]
    _ut = shapely.STRtree(_ulice) if _ulice else None
    _bp = [(b, _Poly(b['p'])) for b in buildings if len(b.get('p', [])) >= 3 and not b.get('only') and b.get('s') != 12]
    _bt = shapely.STRtree([q for _, q in _bp])
    _pouzite = {}                                            # stěna -> obsazené úseky (víc obchodů v jednom domě vedle sebe)
    for _k, _o in enumerate(_json.load(open('assets/obchody.json', encoding='utf-8'))):
        _x, _y = to_local(_o['lon'], _o['lat']); _pt = Point(_x, _y)
        if not EXT_P.contains(_pt) or _ut is None: continue
        _kand = [i for i in _bt.query(_pt.buffer(12)) if _bp[i][1].distance(_pt) < 12]
        if not _kand: continue
        _i = min(_kand, key=lambda i: _bp[i][1].distance(_pt)); _b, _q = _bp[_i]
        if _b.get('lm') == 'znacka': continue                # hala s vlastním modelem a cedulí
        _r = list(_q.exterior.coords)[:-1]; _A = _q.exterior.is_ccw
        _best = None
        for _j in range(len(_r)):
            (_x0, _y0), (_x1, _y1) = _r[_j], _r[(_j + 1) % len(_r)]
            _L = _m.hypot(_x1 - _x0, _y1 - _y0)
            if _L < 3.5: continue
            _ux, _uy = (_x1 - _x0) / _L, (_y1 - _y0) / _L
            _nx, _ny = (_uy, -_ux) if _A else (-_uy, _ux)    # vnější normála
            _mx, _my = (_x0 + _x1) / 2 + _nx * 2, (_y0 + _y1) / 2 + _ny * 2
            _d = min(_ulice[i].distance(Point(_mx, _my)) for i in _ut.query(Point(_mx, _my).buffer(40))) if len(_ut.query(Point(_mx, _my).buffer(40))) else 99
            if _d > 25: continue                              # stěna do dvora
            _t = max(1.6, min(_L - 1.6, (_x - _x0) * _ux + (_y - _y0) * _uy))
            _sk = _d + 0.15 * _m.hypot(_x0 + _ux * _t - _x, _y0 + _uy * _t - _y)
            if _best is None or _sk < _best[0]: _best = (_sk, _j, _x0, _y0, _ux, _uy, _nx, _ny, _L, _t)
        if not _best: continue
        _, _j, _x0, _y0, _ux, _uy, _nx, _ny, _L, _t = _best
        _w = min(4.6 if _o['z'] != 'g' else 3.4, _L - 0.6)
        _obs = _pouzite.setdefault((_b['id'], _j), [])
        for _ in range(6):                                    # posun, ať se cedule v jednom domě nepřekrývají
            _kol = [s for s in _obs if abs(s - _t) < _w + 0.4]
            if not _kol: break
            _t = _kol[0] + (_w + 0.5) * (1 if _t >= _kol[0] and _kol[0] + _w + 0.5 < _L - _w / 2 else -1)
        if _t < _w / 2 or _t > _L - _w / 2: continue
        _obs.append(_t)
        _vys = _b['e'] - _b['g']
        _z0 = min(2.9, max(2.2, _vys - 1.3)); _h = 0.8 if _vys > 4.5 else 0.6
        _cx, _cy = _x0 + _ux * _t + _nx * 0.02, _y0 + _uy * _t + _ny * 0.02
        _ang = _m.atan2(_ny, _nx) - _m.pi / 2                 # rám: s podél stěny, +t ven
        props.setdefault('cedule', []).append([round(_cx, 2), round(_cy, 2), round(_b['g'], 2), round(_ang, 4), round(_w, 2), _z0, _h, _o['z'], _k])
    print('cedulí obchodů', len(props.get('cedule', [])))
