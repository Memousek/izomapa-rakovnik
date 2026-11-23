import sys, unittest
sys.path.insert(0, 'nastroje')
import semafory_osm as semafory   # naše OSM semafory pro 3D jízdu (nastroje/semafory.py je upstreamový)


class TestSemafory(unittest.TestCase):
    P = [[0, 0, 0], [100, 0, 0]]          # kus silnice 100 m na východ

    def test_krizovatka_na_konci_stoji_jen_prijizdejici(self):
        out = semafory.na_kusu(self.P, [(98, 2, 'k')])
        self.assertEqual(out, [[92.0, 98.0, 0.0, 'k', 1, 0]])   # stop čára 8 m před koncem kusu
        out = semafory.na_kusu(self.P, [(3, -1, 'k')])
        self.assertEqual(out[0][4], -1)

    def test_prechod_uprostred_stoji_oba_smery(self):
        self.assertEqual(semafory.na_kusu(self.P, [(50, 3, 'p')])[0][4], 0)

    def test_radic_se_prenasi(self):
        self.assertEqual(semafory.na_kusu(self.P, [(98, 2, 'k', 7)])[0][5], 7)

    def test_daleko_od_silnice_nic(self):
        self.assertEqual(semafory.na_kusu(self.P, [(50, 20, 'k')]), [])

    def test_dva_uzly_krizovatky_jedna_stop_cara(self):
        # OSM: semafor na nájezdu (90 m) i uprostřed křižovatky (99 m) -> jen jedna stop čára, ta dřívější
        out = semafory.na_kusu(self.P, [(86, 1, 'k'), (99, 0, 'k')])
        self.assertEqual([o[0] for o in out], [86.0])
        out = semafory.na_kusu(self.P, [(14, 1, 'k'), (1, 0, 'k')])     # u začátku kusu (směr -1): zůstane větší staničení
        self.assertEqual([o[0] for o in out], [14.0])

    def test_dvojice_blizko_jen_jednou(self):
        self.assertEqual(len(semafory.na_kusu(self.P, [(97, 1, 'k'), (98.5, -1, 'k')])), 1)


if __name__ == '__main__':
    unittest.main()
