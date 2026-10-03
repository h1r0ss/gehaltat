import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractAmounts, hasAmount } from '../scripts/lib/numbers.mjs';

const found = (text, value) => hasAmount(extractAmounts(text), value);

test('reads German and English separators', () => {
  assert.ok(found('Brutto 3.450,00 €', 3450));
  assert.ok(found('Netto: 2.312,45', 2312.45));
  assert.ok(found('gross 3,450.00 EUR', 3450));
  assert.ok(found('4200 brutto', 4200));
});

test('reads ambiguous "3.450" both as thousands and as decimal', () => {
  const amounts = extractAmounts('3.450');
  assert.ok(hasAmount(amounts, 3450));
  assert.ok(hasAmount(amounts, 3.45));
});

test('reads the k suffix', () => {
  assert.ok(found('ca. 60k brutto im Jahr', 60000));
  assert.ok(found('früher 4,2k netto', 4200));
  assert.ok(found('55 K', 55000));
});

test('reads space and apostrophe grouping', () => {
  assert.ok(found('Auszahlung 3 450,00', 3450));
  assert.ok(found("CHF 7'500", 7500));
});

test('tolerates common OCR letter/digit confusion', () => {
  assert.ok(found('Bruttobezug 3.45O,00', 3450));
  assert.ok(found('Gehalt l.980,00', 1980));
});

test('keeps decimals such as hours and hourly wages', () => {
  assert.ok(found('38,5h / Woche', 38.5));
  assert.ok(found('18,50 €/h', 18.5));
});

test('rounding tolerance is tight for small values and loose for salaries', () => {
  assert.ok(found('3.805,85', 3806));
  assert.equal(found('18 €/h', 18.5), false);
  assert.equal(found('Brutto 3.450', 3500), false);
});

test('does not glue separate numbers together', () => {
  assert.equal(found('2026-06-12', 20260612), false);
  assert.equal(found('Brutto 3.450 Netto 2.300', 34502300), false);
});
