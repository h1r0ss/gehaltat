import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { de } from '../src/i18n/de.ts';
import { en } from '../src/i18n/en.ts';
import { DEFAULT_LANG, interpolate, isLang, resolveLang, translate } from '../src/i18n/translate.ts';

describe('dictionaries', () => {
  test('de and en have identical key sets', () => {
    const deKeys = Object.keys(de).sort();
    const enKeys = Object.keys(en).sort();
    assert.deepEqual(deKeys, enKeys);
  });

  test('no dictionary value is empty', () => {
    for (const [key, value] of Object.entries(de)) assert.notEqual(value.trim(), '', `de.${key} is empty`);
    for (const [key, value] of Object.entries(en)) assert.notEqual(value.trim(), '', `en.${key} is empty`);
  });

  test('every plural key has both a .one and an .other form', () => {
    const keys = new Set(Object.keys(en));
    for (const key of keys) {
      if (key.endsWith('.one')) assert.ok(keys.has(key.replace(/\.one$/, '.other')), `${key} has no .other counterpart`);
      if (key.endsWith('.other')) assert.ok(keys.has(key.replace(/\.other$/, '.one')), `${key} has no .one counterpart`);
    }
  });

  test('placeholders match between languages for every key', () => {
    const placeholders = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(en)) {
      assert.deepEqual(
        placeholders((de as Record<string, string>)[key]),
        placeholders(en[key as keyof typeof en]),
        `placeholders differ for ${key}`,
      );
    }
  });
});

describe('interpolate', () => {
  test('replaces named placeholders and leaves unknown ones untouched', () => {
    assert.equal(interpolate('Hello {name}', { name: 'World' }), 'Hello World');
    assert.equal(interpolate('{a} and {b}', { a: 1, b: 2 }), '1 and 2');
    assert.equal(interpolate('{missing}'), '{missing}');
    assert.equal(interpolate('{missing}', {}), '{missing}');
  });
});

describe('translate', () => {
  const dictionaries = { en, de };

  test('resolves plural forms from a numeric count param', () => {
    assert.equal(translate(dictionaries, 'en', 'common.nSalaries', { count: 1, n: '1' }), '1 salary');
    assert.equal(translate(dictionaries, 'en', 'common.nSalaries', { count: 3, n: '3' }), '3 salaries');
    assert.equal(translate(dictionaries, 'de', 'common.nSalaries', { count: 1, n: '1' }), '1 Gehalt');
    assert.equal(translate(dictionaries, 'de', 'common.nSalaries', { count: 30, n: '30' }), '30 Gehälter');
  });

  test('falls back to the raw key when nothing matches', () => {
    assert.equal(translate(dictionaries, 'en', 'nonexistent.key'), 'nonexistent.key');
  });

  test('interpolates params into the resolved template', () => {
    assert.equal(translate(dictionaries, 'de', 'finder.nEquals', { n: '42' }), 'n = 42');
  });
});

describe('isLang / resolveLang', () => {
  test('isLang only accepts known languages', () => {
    assert.equal(isLang('de'), true);
    assert.equal(isLang('en'), true);
    assert.equal(isLang('fr'), false);
    assert.equal(isLang(null), false);
    assert.equal(isLang(undefined), false);
  });

  test('URL param wins over stored language and navigator language', () => {
    assert.equal(resolveLang({ urlLang: 'en', storedLang: 'de', navigatorLanguage: 'de-AT' }), 'en');
  });

  test('stored language wins over navigator language', () => {
    assert.equal(resolveLang({ urlLang: null, storedLang: 'en', navigatorLanguage: 'de-AT' }), 'en');
  });

  test('navigator language: de* maps to de, everything else to the default', () => {
    assert.equal(resolveLang({ urlLang: null, storedLang: null, navigatorLanguage: 'de-DE' }), 'de');
    assert.equal(resolveLang({ urlLang: null, storedLang: null, navigatorLanguage: 'de' }), 'de');
    assert.equal(resolveLang({ urlLang: null, storedLang: null, navigatorLanguage: 'en-US' }), DEFAULT_LANG);
    assert.equal(resolveLang({ urlLang: null, storedLang: null, navigatorLanguage: 'fr-FR' }), DEFAULT_LANG);
  });

  test('defaults to de when nothing is available', () => {
    assert.equal(resolveLang({ urlLang: null, storedLang: null, navigatorLanguage: null }), 'de');
    assert.equal(DEFAULT_LANG, 'de');
  });

  test('invalid values are ignored, not just falsy ones', () => {
    assert.equal(resolveLang({ urlLang: 'fr', storedLang: 'de', navigatorLanguage: null }), 'de');
    assert.equal(resolveLang({ urlLang: 'fr', storedLang: 'xx', navigatorLanguage: 'en-GB' }), DEFAULT_LANG);
  });
});
