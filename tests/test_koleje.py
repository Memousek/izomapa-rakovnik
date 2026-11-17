import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from nastroje.koleje import po_koleji, PRECHOD


def test_vlak_jede_po_staniční_koleji_s_plynulým_přechodem():
    trasa = [(0, 0), (500, 0)]                       # hlavní kolej
    kolej = [(100, 5), (400, 5)]                     # staniční kolej 5 m vedle
    out = po_koleji(trasa, kolej)
    y = lambda x: min(out, key=lambda p: abs(p[0] - x))[1]
    assert abs(y(50)) < 1e-6 and abs(y(450)) < 1e-6  # před a za stanicí beze změny
    assert abs(y(250) - 5) < 1e-6                    # uprostřed na staniční koleji
    assert 0 < y(100 + PRECHOD / 2) < 5              # přes výhybky plynule
    ys = [p[1] for p in out if 100 <= p[0] <= 100 + PRECHOD]
    assert all(b >= a - 1e-9 for a, b in zip(ys, ys[1:]))


def test_kolej_jinde_trasu_nemění():
    trasa = [(0, 0), (500, 0)]
    assert po_koleji(trasa, [(100, 80), (400, 80)])[-1] == (500, 0)
    assert all(abs(p[1]) < 1e-9 for p in po_koleji(trasa, [(100, 80), (400, 80)]))
    assert all(abs(p[1]) < 1e-9 for p in po_koleji(trasa, [(250, -100), (250, 100)]))   # kolmá kolej (jiný směr)
