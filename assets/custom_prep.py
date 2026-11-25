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
