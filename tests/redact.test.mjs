import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { redactAgeGender } from '../scripts/lib/redact.mjs';

describe('redactAgeGender', () => {
  test('drops the usual Reddit title markers and tidies the separators', () => {
    assert.equal(redactAgeGender('M27 | 5 YOE | Softwareentwickler | Wien'), '5 YOE | Softwareentwickler | Wien');
    assert.equal(redactAgeGender('Junior Dev (m, 31) Graz'), 'Junior Dev Graz');
    assert.equal(redactAgeGender('[W/24] Pflege, Linz'), 'Pflege, Linz');
    assert.equal(redactAgeGender('Lehrling 17w, 2. Lehrjahr'), 'Lehrling, 2. Lehrjahr');
    assert.equal(redactAgeGender('Wien, M30, IT'), 'Wien, IT');
    assert.equal(redactAgeGender('Software / 25M / Wien'), 'Software / Wien');
    assert.equal(redactAgeGender('Quereinsteiger in der IT - M37, 40 Stunden'), 'Quereinsteiger in der IT, 40 Stunden');
    assert.equal(redactAgeGender('M20 I Rettungssanitäter I 40h I Wien'), 'Rettungssanitäter I 40h I Wien');
    assert.equal(redactAgeGender('Projekte über 50-100M EUR'), 'Projekte über 50-100M EUR');
  });

  test('drops ages and gender words in notes', () => {
    assert.equal(redactAgeGender('Quereinsteiger IT, age 35, HTL IT.'), 'Quereinsteiger IT, HTL IT.');
    assert.equal(redactAgeGender('M30. 9 years at firm.'), '9 years at firm.');
    assert.equal(redactAgeGender('Part-time. Female, 9 years at firm.'), 'Part-time. 9 years at firm.');
  });

  test('leaves salary figures, ranges, codes and ordinary words alone', () => {
    for (const text of ['3.500 brutto, 14x', '3-5 Jahre', 'VG F, 38,5h', 'B2B Sales', 'IT-/Software', 'Maler und Anstreicher', '50k', 'M2 Wohnung']) {
      assert.equal(redactAgeGender(text), text);
    }
  });
});
