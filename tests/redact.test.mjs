import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { redactPersonal } from '../scripts/lib/redact.mjs';

describe('redactPersonal', () => {
  test('drops the usual Reddit title markers and tidies the separators', () => {
    assert.equal(redactPersonal('M27 | 5 YOE | Softwareentwickler | Wien'), '5 YOE | Softwareentwickler | Wien');
    assert.equal(redactPersonal('Junior Dev (m, 31) Graz'), 'Junior Dev Graz');
    assert.equal(redactPersonal('[W/24] Pflege, Linz'), 'Pflege, Linz');
    assert.equal(redactPersonal('Lehrling 17w, 2. Lehrjahr'), 'Lehrling, 2. Lehrjahr');
    assert.equal(redactPersonal('Wien, M30, IT'), 'Wien, IT');
    assert.equal(redactPersonal('Software / 25M / Wien'), 'Software / Wien');
    assert.equal(redactPersonal('Quereinsteiger in der IT - M37, 40 Stunden'), 'Quereinsteiger in der IT, 40 Stunden');
    assert.equal(redactPersonal('M20 I Rettungssanitäter I 40h I Wien'), 'Rettungssanitäter I 40h I Wien');
    assert.equal(redactPersonal('Projekte über 50-100M EUR'), 'Projekte über 50-100M EUR');
  });

  test('drops ages and gender words in notes', () => {
    assert.equal(redactPersonal('Quereinsteiger IT, age 35, HTL IT.'), 'Quereinsteiger IT, HTL IT.');
    assert.equal(redactPersonal('M30. 9 years at firm.'), '9 years at firm.');
    assert.equal(redactPersonal('Part-time. Female, 9 years at firm.'), 'Part-time. 9 years at firm.');
    assert.equal(redactPersonal('Bank offer for 28-year-old with law degree'), 'Bank offer for with law degree');
    assert.equal(redactPersonal('Early 30s, comfortable position.'), 'comfortable position.');
    assert.equal(redactPersonal('In industry since 2014 (age 14→26: 12y).'), 'In industry since 2014 (: 12y).');
    assert.equal(redactPersonal('Civil service (Zivildienst). Age 20. Very low pay.'), 'Civil service (Zivildienst). Very low pay.');
  });

  test('drops ages and gender words in the German translations', () => {
    assert.equal(redactPersonal('30-jähriger Mann, Bachelor militärische Führung.'), 'Bachelor militärische Führung.');
    assert.equal(redactPersonal('Konstrukteur (24-jähriger Mann), 1,5 Jahre in der Rolle.'), 'Konstrukteur, 1,5 Jahre in der Rolle.');
    assert.equal(redactPersonal('Sonderschullehrerin, 27-jährige Frau, Stufe 01.'), 'Sonderschullehrerin, Stufe 01.');
    assert.equal(redactPersonal('Jobangebot für einen 28-Jährigen mit Jurastudium.'), 'Jobangebot für einen mit Jurastudium.');
    assert.equal(redactPersonal('26-jährig, M.Sc. Data Science.'), 'M.Sc. Data Science.');
    assert.equal(redactPersonal('Bedienstetenstufe 2. 25 Jahre alt (Mann), neuer Vertrag.'), 'Bedienstetenstufe 2. neuer Vertrag.');
    assert.equal(redactPersonal('Seit 2014 in der Industrie (Alter 14 bis 26: 12 Jahre).'), 'Seit 2014 in der Industrie (: 12 Jahre).');
    assert.equal(redactPersonal('Anfang 30, komfortable Position.'), 'komfortable Position.');
  });

  test('drops an age in brackets after a title', () => {
    assert.equal(redactPersonal('Projektleiter Energiebereich (26) 1 Jahr Berufserfahrung'), 'Projektleiter Energiebereich 1 Jahr Berufserfahrung');
    assert.equal(redactPersonal('M (34), Sozialarbeiter seit 2017, 30h'), 'Sozialarbeiter seit 2017, 30h');
    assert.equal(redactPersonal('M(20) ferialpraktikant in Labor'), 'ferialpraktikant in Labor');
  });

  test('drops family circumstances but keeps the part-time and the job', () => {
    assert.equal(redactPersonal('Elektriker, 38,5h, ohne Üst ca 3045€Netto+166€ Familienbonusplus'), 'Elektriker, 38,5h, ohne Üst ca 3045€Netto');
    assert.equal(redactPersonal('Supply Chain Analyst 30Std. Elternteilzeit, 5 Jahre im Betrieb'), 'Supply Chain Analyst 30Std. Teilzeit, 5 Jahre im Betrieb');
    assert.equal(redactPersonal('Krankenschwester/30h/ 16 Jahre beim selben AG/4 Jahre Karenz dazwischen'), 'Krankenschwester/30h/ 16 Jahre beim selben AG');
    assert.equal(redactPersonal('Karenzvertretung im Controlling'), 'Karenzvertretung im Controlling');
  });

  test('leaves salary figures, ranges, codes and ordinary words alone', () => {
    for (const text of [
      '3.500 brutto, 14x', '3-5 Jahre', 'VG F, 38,5h', 'B2B Sales', 'IT-/Software', 'Maler und Anstreicher', '50k', 'M2 Wohnung',
      '3-jährige Verpflichtung', '1-jährige Sonderausbildung', 'eine 10-jährige Betriebszugehörigkeit', 'Ende 2025', 'Mitte 40 Std./Woche',
      'Pension mit 65', 'Stufe (12)', 'Steeper age progression', 'Ein-Mann-Betrieb',
      'trading company (~25M revenue)', 'leads 2 projects: 20M EUR and 13M EUR', 'multiple projects (€20m annual turnover)',
    ]) {
      assert.equal(redactPersonal(text), text);
    }
  });
});
