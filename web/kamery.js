// Webkamery: společná data pro 2D mapu (web/mapa_kamery.js) i 3D jízdu (web/jizda_webkamery.js).
// build_html.py kopíruje soubor do site/kamery.js, nastroje/jizda.py do site/jizda/kamery.js.
//
// Položka: nazev, lat/lon (dům, kde kamera je: ikona v mapě), text, odkaz (stránka kamery), zdroj.
// obrazek: adresa aktuálního snímku, jen když provozovatel dovoluje snímek vložit (vždy s odkazem zpět na odkaz).
// pohled: kamera ve 3D jízdě, aby záběr odpovídal skutečnému: lat/lon objektivu, vyska nad terénem (m), smer (azimut
// ve ° od severu po směru hodinek), sklon (° nad vodorovnou, dolů záporný), fov (vodorovné zorné pole ve °), pomer (šířka
// / výška snímku). Kalibrace: polohy orientačních bodů (věže z assets/dominanty.json) na snímku z kamery proti 3D pohledu.
//
// Centrum: webkamera webcamlive.cz (provoz unitednetworks.cz); web dovoluje vložit obrázek s odkazem zpět na stránku kamery.
// Husovo náměstí: kamera CBCNET (now.jpg, obnova ~10 s, cache 10 let → při vložení nutný parametr ?t=); podmínky nejsou
// zveřejněné, proto zatím jen odkaz. Se souhlasem CBC stačí doplnit obrazek: 'https://cbcnet.cz/wp-content/uploads/kamera/now.jpg?x=1'.
// Dálnice D6: kamery ŘSD; podmínky použití obrázků nejsou zveřejněné, proto jen odkaz na dopravniinfo.gov.cz (bez snímku).
export const KAMERY = [
  { id: 'centrum', nazev: 'Webkamera: centrum Rakovníka', lat: 50.10614, lon: 13.72287,
    text: 'Kamera na domě Dukelských hrdinů 1804, pohled k východu na centrum přes Havlíčkovu a Palackého ulici. Snímek se obnovuje po několika minutách.',
    obrazek: 'https://www.webcamlive.cz/camera_image.php?idCamera=955', odkaz: 'https://www.webcamlive.cz/en/webcam/town-of-rakovnik/955', zdroj: 'webcamlive.cz',
    pohled: { lat: 50.106023, lon: 13.722673, vyska: 35.3, smer: 110.5, sklon: -5, fov: 84, pomer: 16 / 9 } },   // střecha věžáku, kalibrace 27. 11. 2026: komín, Vysoká brána, kostel, modrý panelák
  { id: 'husovo', nazev: 'Webkamera: Husovo náměstí', lat: 50.10481, lon: 13.72748,
    text: 'Kamera na domě Husovo náměstí 54, pohled k východu podél náměstí: vpravo radnice, uprostřed kostel sv. Bartoloměje, vlevo Vysoká brána. Aktuální snímek je na webu CBCNET.',
    odkaz: 'https://cbcnet.cz/o-nas/kamera/', zdroj: 'CBCNET, cbcnet.cz',
    pohled: { lat: 50.104621, lon: 13.727533, vyska: 17.3, smer: 97, sklon: -10, fov: 78, pomer: 4 / 3 } },   // nad západním koncem náměstí, kalibrace 27. 11. 2026: radnice, Vysoká brána, kostel, ostrůvek
  ...[[3615, 40.7, 50.178, 13.779], [4245, 43.2, 50.170, 13.745], [4246, 45.4, 50.168, 13.716], [4247, 47.2, 50.170, 13.691]].map(([id, km, lat, lon]) => ({
    id: `rsd${id}`, nazev: `Kamera ŘSD: D6, km ${String(km).replace('.', ',')}`, lat, lon, text: 'Dopravní kamera Ředitelství silnic a dálnic. Aktuální snímek je na webu Dopravní info.',
    odkaz: 'https://dopravniinfo.gov.cz/cameras-overview/D6', zdroj: 'ŘSD ČR, dopravniinfo.gov.cz' })),
];

// adresa snímku s parametrem proti mezipaměti (nový každé 2 min)
export const snimekUrl = (k) => `${k.obrazek}${k.obrazek.includes('?') ? '&' : '?'}t=${Math.floor(Date.now() / 120000)}`;
