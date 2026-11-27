// Příjem JSDI (functions/api/jsdi.js): třídění situací na uzavírky, kolony a nehody, životnost kolony, ořez na mapu.
import assert from 'node:assert/strict';
import { rozeber, druhSituace, ZIVOT_KOLONY } from '../functions/api/jsdi.js';

const BBOX = [50.07, 13.68, 50.14, 13.78];                 // Rakovník
const TED = Date.parse('2026-11-27T12:00:00Z');
const MIMO = '49.20 16.60 49.21 16.61';                     // Brno
const UVNITR = '50.105 13.73 50.106 13.735 50.107 13.74';

// DATEX II 3.x (prefix sit:, xsi:type s prefixem, poloha v posList)
const sit3 = (id, typ, telo, pos = UVNITR, verze = '2026-11-27T11:30:00Z') => `
<sit:situation id="${id}"><sit:situationVersionTime>${verze}</sit:situationVersionTime>
<sit:situationRecord xsi:type="sit:${typ}" id="${id}-r" version="1">
<sit:validity><com:validityStatus>active</com:validityStatus><com:validityTimeSpecification><com:overallStartTime>2026-11-27T11:20:00Z</com:overallStartTime></com:validityTimeSpecification></sit:validity>
<sit:generalPublicComment><com:comment><com:values><com:value lang="cs">silnice I/6, Krupá, okr. Rakovník, kolona vozidel</com:value></com:values></com:comment></sit:generalPublicComment>
${telo}
<loc:gmlLineString><loc:posList>${pos}</loc:posList></loc:gmlLineString>
</sit:situationRecord></sit:situation>`;

// DATEX II 2.3 (bez prefixů, uzavírka jako dřív)
const sit23 = `
<situation id="U1"><situationVersionTime>2026-11-01T08:00:00Z</situationVersionTime>
<situationRecord xsi:type="MaintenanceWorks" id="U1-r">
<validity><validityStatus>active</validityStatus><validityTimeSpecification><overallStartTime>2026-11-01T00:00:00Z</overallStartTime><overallEndTime>2026-12-15T00:00:00Z</overallEndTime></validityTimeSpecification></validity>
<generalPublicComment><comment><values><value>Lubenská, Rakovník, uzavřeno</value></values></comment></generalPublicComment>
<posList>${UVNITR}</posList></situationRecord>
<situationRecord xsi:type="RoadOrCarriagewayOrLaneManagement" id="U1-r2"><roadOrCarriagewayOrLaneManagementType>roadClosed</roadOrCarriagewayOrLaneManagementType></situationRecord>
</situation>`;

const xml = sit23
  + sit3('K1', 'AbnormalTraffic', '<sit:abnormalTrafficType>stationaryTraffic</sit:abnormalTrafficType><sit:queueLength>1200</sit:queueLength><sit:delays><sit:delayTimeValue>900</sit:delayTimeValue></sit:delays>')
  + sit3('N1', 'Accident', '<sit:accidentType>collision</sit:accidentType>')
  + sit3('P1', 'PoorEnvironmentConditions', '<sit:poorEnvironmentType>fog</sit:poorEnvironmentType>')
  + sit3('K2', 'AbnormalTraffic', '<sit:abnormalTrafficType>slowTraffic</sit:abnormalTrafficType>', MIMO)
  + sit3('K3', 'AbnormalTraffic', '<sit:abnormalTrafficType>queuingTraffic</sit:abnormalTrafficType>', UVNITR, '2026-11-27T07:00:00Z');

const z = rozeber(xml, BBOX, TED);

assert.equal(z.U1.druh, undefined, 'práce = uzavírka bez druhu');
assert.equal(z.U1.castecna, undefined, 'roadClosed = úplná');
assert.equal(z.U1.do, '2026-12-15');

assert.equal(z.K1.druh, 'kolona');
assert.equal(z.K1.typ, 'stationaryTraffic');
assert.equal(z.K1.delka, 1200);
assert.equal(z.K1.zdrzeni, 15, 'zdržení v minutách');
assert.equal(z.K1.nazev, 'I/6, Krupá', 'název bez „kolona vozidel“');
assert.equal(z.K1.konec, new Date(Date.parse('2026-11-27T11:30:00Z') + ZIVOT_KOLONY).toISOString(), 'kolona bez konce: 3 h od verze');
assert.equal(z.K1.od, null); assert.equal(z.K1.do, null);
assert.equal(z.K1.castecna, undefined, 'kolona není uzavírka');

assert.equal(z.N1.druh, 'nehoda');
assert.equal(z.P1, null, 'mlha do mapy nepatří');
assert.equal(z.K2, null, 'kolona mimo mapu se maže');
assert.equal(z.K3, null, 'kolona starší než 3 h bez obnovy prošla');

// stejná zpráva dvakrát = stejný záznam (reset odběru nezapisuje do KV)
assert.deepEqual(rozeber(xml, BBOX, TED + 60e3).K1, z.K1);

// situace bez xsi:type (starší zprávy) zůstává uzavírkou; nehoda s uzavřením silnice je uzavírka
assert.equal(druhSituace('<situation id="x"><situationRecord id="y"></situationRecord></situation>'), 'uzavirka');
assert.equal(druhSituace('<situationRecord xsi:type="Accident"/><situationRecord xsi:type="RoadOrCarriagewayOrLaneManagement"/>'), 'uzavirka');

console.log('OK: uzavírka 2.3, kolona a nehoda 3.x, počasí ven, mimo mapu, životnost kolony, stabilní záznam');
