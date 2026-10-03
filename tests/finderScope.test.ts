import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { RoleFamily } from '../src/types.ts';
import { DEFAULT_FILTERS } from '../src/lib/filters.ts';
import type { Filters } from '../src/lib/filters.ts';
import type { ExperienceMatch } from '../src/lib/finder.ts';
import { describePosition, describeRoleScope, describeScope, describeWidening } from '../src/lib/finderScope.ts';
import { computePosition } from '../src/lib/stats.ts';
import { formatMoney } from '../src/lib/format.ts';
import { de } from '../src/i18n/de.ts';
import { en } from '../src/i18n/en.ts';
import { translate } from '../src/i18n/translate.ts';
import type { Lang } from '../src/i18n/translate.ts';

const EUR = (value: number) => formatMoney(value); // avoids hardcoding the U+00A0 currency-format space

const dictionaries = { en, de };
function t(lang: Lang) {
  return (key: string, params?: Record<string, string | number>) => translate(dictionaries, lang, key, params);
}

function match(overrides: Partial<ExperienceMatch>): ExperienceMatch {
  return { mode: 'any', years: null, halfWidth: null, range: null, widened: false, records: [], usable: 0, ...overrides };
}

describe('describeScope', () => {
  test('a band renders "min–max years experience" in both languages', () => {
    const m = match({ mode: 'band', range: { min: 3, max: 7 } });
    assert.equal(describeScope(m, t('en')), '3–7 years experience');
    assert.equal(describeScope(m, t('de')), '3–7 Jahre Erfahrung');
  });

  test('"any" mode renders "all experience levels"', () => {
    assert.equal(describeScope(match({ mode: 'any' }), t('en')), 'all experience levels');
    assert.equal(describeScope(match({ mode: 'any' }), t('de')), 'alle Erfahrungsstufen');
  });
});

describe('describeWidening', () => {
  test('null when the match was not widened', () => {
    assert.equal(describeWidening(match({ mode: 'band', years: 5, widened: false }), t('en')), null);
  });

  test('band widened to ±4 years', () => {
    const m = match({ mode: 'band', years: 5, halfWidth: 4, widened: true });
    assert.equal(describeWidening(m, t('en')), 'Fewer than 5 salaries within ±2 years of 5 years, so the band was widened to ±4 years.');
    assert.equal(describeWidening(m, t('de')), 'Weniger als 5 Gehälter innerhalb von ±2 Jahren um 5 Jahre, daher wurde die Spanne auf ±4 Jahre erweitert.');
  });

  test('widened to ±8 years, using the singular "year" for 1', () => {
    const m = match({ mode: 'band', years: 1, halfWidth: 8, widened: true });
    assert.equal(describeWidening(m, t('en')), 'Fewer than 5 salaries within ±2 years of 1 year, so the band was widened to ±8 years.');
    assert.equal(describeWidening(m, t('de')), 'Weniger als 5 Gehälter innerhalb von ±2 Jahren um 1 Jahr, daher wurde die Spanne auf ±8 Jahre erweitert.');
  });
});

describe('describePosition', () => {
  const values = [3000, 3500, 4000, 4500, 5000];

  test("the task's own example sentence, in German", () => {
    // "Du verdienst mehr als 62 % von 30 vergleichbaren Gehältern: 350 € (7 %) über dem Median"
    const position = { rank: 62, diff: 350, pctDiff: 7 };
    assert.equal(
      describePosition(position, 30, 5350, t('de')),
      `Du verdienst mehr als 62\u00a0% von 30 vergleichbaren Gehältern: ${EUR(350)} (7\u00a0%) über dem Median.`,
    );
  });

  test('above the median in English', () => {
    const position = computePosition(values, 4000, 4500);
    assert.equal(
      describePosition(position, values.length, 4500, t('en')),
      `You earn more than 70% of 5 comparable salaries: ${EUR(500)} (13%) above the median.`,
    );
  });

  test('below the median uses the "below" direction', () => {
    const position = computePosition(values, 4000, 3000);
    assert.match(describePosition(position, values.length, 3000, t('en')), /below the median\.$/);
  });

  test('at or below every salary uses the dedicated sentences', () => {
    assert.equal(
      describePosition({ rank: 0, diff: -1000, pctDiff: 25 }, 5, 3000, t('en')),
      `Your ${EUR(3000)} is lower than every one of the 5 comparable salaries.`,
    );
    assert.equal(
      describePosition({ rank: 100, diff: 1000, pctDiff: 25 }, 5, 5000, t('en')),
      `Your ${EUR(5000)} is higher than every one of the 5 comparable salaries.`,
    );
  });

  test('a near-zero difference reads as "at the median" instead of "€0 above"', () => {
    assert.equal(describePosition({ rank: 50, diff: 0.2, pctDiff: 0.005 }, 10, 4000, t('en')), 'You earn about the median of 10 comparable salaries.');
  });
});

describe('describeRoleScope', () => {
  const PM: RoleFamily = {
    id: 'project-management',
    label: 'Project Management',
    labelDe: 'Projektmanagement',
    aliases: ['Project Manager', 'Project Lead', 'PM'],
  };

  test('no query and no family match reads "All roles"', () => {
    assert.equal(describeRoleScope(DEFAULT_FILTERS, null, 'en', t('en')), 'All roles');
    assert.equal(describeRoleScope(DEFAULT_FILTERS, null, 'de', t('de')), 'Alle Berufe');
  });

  test('a plain (non-family) query is quoted', () => {
    const filters: Filters = { ...DEFAULT_FILTERS, query: 'nurse' };
    assert.equal(describeRoleScope(filters, null, 'en', t('en')), '“nurse”');
  });

  test("a resolved family renders the task's merged-group format", () => {
    const filters: Filters = { ...DEFAULT_FILTERS, query: 'pm' };
    const records = [
      { standardizedTitle: 'Project Manager' },
      { standardizedTitle: 'Project Manager' },
      { standardizedTitle: 'Project Lead' },
      { standardizedTitle: 'IT Project Manager' },
    ] as unknown as RoleFamilyMatch['records'];
    const familyMatch: RoleFamilyMatch = { families: [PM], records, headWord: null };
    // "Project Lead" and "IT Project Manager" are tied at 1 mention each; familyExampleTitles
    // breaks ties alphabetically, so "IT Project Manager" (I < P) comes first.
    assert.equal(
      describeRoleScope(filters, familyMatch, 'de', t('de')),
      'Projektmanagement · umfasst Project Manager, IT Project Manager, Project Lead (4 Einträge insgesamt)',
    );
  });
});
