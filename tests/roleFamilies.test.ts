import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import type { RoleFamily, SalaryRecord } from '../src/types.ts';
import { parseDataset } from '../src/lib/dataset.ts';
import {
  familyExampleTitles,
  familyLabel,
  familyMatches,
  matchRoleFamilies,
  rankRoleFamilies,
  recordsForFamilies,
  resolveRoleFamilyQuery,
  roleFamilySuggestions,
  roleOptions,
  suggestSimilarFamilies,
} from '../src/lib/roleFamilies.ts';

const PM: RoleFamily = {
  id: 'project-management',
  label: 'Project Management',
  labelDe: 'Projektmanagement',
  aliases: ['Project Manager', 'Project Lead', 'Projektleiter', 'Projektleiterin', 'PM', 'IT Project Manager'],
};
const NURSE: RoleFamily = {
  id: 'registered-nursing',
  label: 'Registered Nursing (DGKP)',
  labelDe: 'Diplomierte Pflege (DGKP)',
  aliases: ['Registered Nurse', 'DGKP', 'Krankenschwester'],
};
const FAMILIES = [PM, NURSE];

const BASE: SalaryRecord = {
  id: 'r0',
  postId: 'r0',
  sourceUrl: '',
  postDate: '2026-06-01',
  postTitle: '',
  flair: null,
  upvotes: 0,
  numComments: 0,
  jobTitle: '',
  standardizedTitle: 'Project Manager',
  roleFamily: 'project-management',
  industry: 'IT & Software',
  seniority: 'mid',
  experienceYears: 5,
  region: null,
  hoursPerWeek: null,
  employmentType: 'employee',
  salaryKind: 'current',
  paymentsPerYear: 14,
  grossMonthly: 4000,
  grossAnnual: null,
  netMonthly: null,
  hourlyGross: null,
  bonusAnnual: null,
  allIn: null,
  collectiveAgreement: null,
  salarySource: 'post',
  derived: [],
  figuresVerified: true,
  evidence: [],
  confidence: 0.9,
  notes: '',
  notesDe: null,
  collectiveAgreementGroup: null,
};

let nextId = 1;
function record(overrides: Partial<SalaryRecord> = {}): SalaryRecord {
  const id = `r${nextId++}`;
  return { ...BASE, id, postId: id, ...overrides };
}

describe('familyMatches / matchRoleFamilies', () => {
  test('matches the English label, the German label, or an alias, case- and diacritics-insensitively', () => {
    assert.equal(familyMatches(PM, 'project'), true);
    assert.equal(familyMatches(PM, 'PROJEKTMANAGEMENT'), true);
    assert.equal(familyMatches(PM, 'projektleiter'), true);
    assert.equal(familyMatches(PM, 'pm'), true);
    assert.equal(familyMatches(NURSE, 'krankenschwester'), true);
    assert.equal(familyMatches(NURSE, 'dgkp'), true);
    assert.equal(familyMatches(PM, 'plumber'), false);
  });

  test("the task's example queries all resolve to the same family", () => {
    for (const query of ['projektleiter', 'project lead', 'pm']) {
      assert.deepEqual(matchRoleFamilies(FAMILIES, query), [PM], `query "${query}" should match Project Management`);
    }
  });

  test('an empty or whitespace-only query matches nothing', () => {
    assert.deepEqual(matchRoleFamilies(FAMILIES, ''), []);
    assert.deepEqual(matchRoleFamilies(FAMILIES, '   '), []);
  });

  test('no families (dataset not delivered yet) resolves to nothing, not a crash', () => {
    assert.deepEqual(matchRoleFamilies([], 'project'), []);
    assert.equal(resolveRoleFamilyQuery([], [record()], 'project'), null);
  });

  test('a query matching no family returns null so the caller falls back to substring search', () => {
    assert.equal(resolveRoleFamilyQuery(FAMILIES, [record()], 'developer'), null);
  });
});

describe('word-based matching', () => {
  const family = (id: string, labelDe: string, aliases: string[]): RoleFamily => ({ id, label: id, labelDe, aliases });
  const HR = family('hr', 'Personalwesen', ['HR Manager', 'Recruiter']);
  const TEACHING = family('teaching', 'Schulunterricht', ['Lehrer', 'Lehrerin']);
  const DRIVING = family('driving', 'Transport', ['LKW-Fahrer']);
  const SOFTWARE = family('software', 'Softwareentwicklung', ['Software Engineer', 'Softwareentwickler']);
  const ENGINEERING = family('engineering', 'Ingenieurwesen', ['Engineer', 'Ingenieur']);
  const MEDICINE = family('medicine', 'Medizin', ['Arzt', 'Ärztin']);
  const VETERINARY = family('veterinary', 'Tiermedizin', ['Tierarzt']);
  const CONSULTING = family('consulting', 'Unternehmensberatung', ['Unternehmensberater']);
  const BANKING = family('banking', 'Bankwesen', ['Privatkundenberater']);
  const ALL = [HR, TEACHING, DRIVING, SOFTWARE, ENGINEERING, MEDICINE, VETERINARY, CONSULTING, BANKING];
  const ids = (query: string) => matchRoleFamilies(ALL, query).map((f) => f.id);

  test('a short word matches word starts only, not letters inside other words', () => {
    assert.deepEqual(ids('HR'), ['hr'], '"hr" is inside "Lehrer" and "Fahrer" but must not match them');
    assert.deepEqual(ids('lkw'), ['driving']);
  });

  test('spaces and hyphens do not matter', () => {
    assert.deepEqual(ids('Software Entwickler'), ['software']);
    assert.deepEqual(ids('LKW Fahrer'), ['driving']);
    assert.deepEqual(ids('Lkw-Fahrer'), ['driving']);
  });

  test('seniority words and gender markers are ignored, feminine forms fold to the alias', () => {
    assert.deepEqual(ids('Senior Software Engineer'), ['software'], 'the longer alias beats the bare "Engineer"');
    assert.deepEqual(ids('Softwareentwickler (m/w/d)'), ['software']);
    assert.deepEqual(ids('Lehrer:in'), ['teaching']);
    assert.deepEqual(ids('Softwareentwicklerin'), ['software'], 'only the masculine alias exists');
  });

  test('an exact alias beats a compound that merely contains it', () => {
    assert.deepEqual(ids('Arzt'), ['medicine'], '"Tierarzt" contains "arzt" but is a weaker match');
    assert.deepEqual(ids('Tierarzt'), ['veterinary']);
  });

  test('the head of a compound matches, and an ambiguous word keeps every family', () => {
    assert.deepEqual(ids('Entwickler'), ['software']);
    assert.deepEqual(ids('Berater'), ['consulting', 'banking']);
  });

  test('when the whole query matches nothing, its last word is tried and reported', () => {
    const fallback = resolveRoleFamilyQuery(ALL, [], 'SAP Berater');
    assert.ok(fallback);
    assert.deepEqual(fallback.families.map((f) => f.id), ['consulting', 'banking']);
    assert.equal(fallback.headWord, 'Berater', 'reported as typed, for display');
    assert.equal(resolveRoleFamilyQuery(ALL, [], 'Berater')?.headWord, null);
    assert.equal(resolveRoleFamilyQuery(ALL, [], 'Lehrling'), null);
  });

  test('rankRoleFamilies lists looser matches too, best first', () => {
    assert.deepEqual(rankRoleFamilies(ALL, 'arzt').map((f) => f.id), ['medicine', 'veterinary']);
    assert.deepEqual(rankRoleFamilies(ALL, ''), []);
  });

  test('roleOptions: popular roles for an empty field, matches by tier then count, else typo guesses', () => {
    const suggestions = [
      { family: VETERINARY, label: 'Tiermedizin', count: 9 },
      { family: MEDICINE, label: 'Medizin', count: 4 },
      { family: SOFTWARE, label: 'Softwareentwicklung', count: 20 },
    ];
    assert.deepEqual(roleOptions(ALL, suggestions, '  ', 2), { kind: 'popular', options: suggestions.slice(0, 2) });
    const arzt = roleOptions(ALL, suggestions, 'arzt');
    assert.equal(arzt.kind, 'matches');
    assert.deepEqual(arzt.options.map((o) => o.label), ['Medizin', 'Tiermedizin'], 'the exact alias first, despite fewer salaries');
    assert.deepEqual(roleOptions(ALL, suggestions, 'sofware'), { kind: 'similar', options: [suggestions[2]] });
    assert.deepEqual(roleOptions(ALL, suggestions, 'Recruiter').options, [], 'a family without salaries is never offered');
  });

  test('suggestSimilarFamilies tolerates a typo, also inside a compound', () => {
    assert.deepEqual(suggestSimilarFamilies(ALL, 'Sofware').map((f) => f.id), ['software']);
    assert.deepEqual(suggestSimilarFamilies(ALL, 'Entwikler').map((f) => f.id), ['software']);
    assert.deepEqual(suggestSimilarFamilies(ALL, 'Lehrling'), []);
    assert.deepEqual(suggestSimilarFamilies(ALL, 'IT'), [], 'words under five letters are never guessed');
  });
});

describe('resolveRoleFamilyQuery / recordsForFamilies', () => {
  test('resolves to every record whose roleFamily is one of the matched families', () => {
    const pmRecord = record({ roleFamily: 'project-management' });
    const nurseRecord = record({ roleFamily: 'registered-nursing', standardizedTitle: 'Registered Nurse' });
    const otherRecord = record({ roleFamily: 'other-family', standardizedTitle: 'Baker' });
    const unmapped = record({ roleFamily: null, standardizedTitle: 'Project Manager' });
    const all = [pmRecord, nurseRecord, otherRecord, unmapped];

    const result = resolveRoleFamilyQuery(FAMILIES, all, 'pm');
    assert.ok(result);
    assert.deepEqual(result.families, [PM]);
    assert.deepEqual(result.records, [pmRecord], 'a record with roleFamily=null must not be included even if its title matches');
  });

  test('recordsForFamilies is empty for an empty family list', () => {
    assert.deepEqual(recordsForFamilies([record()], []), []);
  });
});

describe('familyLabel', () => {
  test('picks the label for the requested language', () => {
    assert.equal(familyLabel(PM, 'de'), 'Projektmanagement');
    assert.equal(familyLabel(PM, 'en'), 'Project Management');
  });
});

describe('familyExampleTitles', () => {
  test('most frequent distinct titles first, capped at the limit', () => {
    const records = [
      record({ standardizedTitle: 'Project Manager' }),
      record({ standardizedTitle: 'Project Manager' }),
      record({ standardizedTitle: 'Project Lead' }),
      record({ standardizedTitle: 'IT Project Manager' }),
      record({ standardizedTitle: '  ' }),
    ];
    assert.deepEqual(familyExampleTitles(records), ['Project Manager', 'IT Project Manager', 'Project Lead']);
    assert.deepEqual(familyExampleTitles(records, 2), ['Project Manager', 'IT Project Manager']);
  });
});

describe('roleFamilySuggestions', () => {
  test('only families with at least one record are suggested, ranked by count', () => {
    const records = [
      record({ roleFamily: 'project-management' }),
      record({ roleFamily: 'project-management' }),
      record({ roleFamily: 'registered-nursing' }),
    ];
    const suggestions = roleFamilySuggestions(FAMILIES, records, 'de');
    assert.deepEqual(
      suggestions.map((s) => [s.label, s.count]),
      [
        ['Projektmanagement', 2],
        ['Diplomierte Pflege (DGKP)', 1],
      ],
    );
  });

  test('a family with zero matching records is omitted', () => {
    assert.deepEqual(roleFamilySuggestions(FAMILIES, [], 'en'), []);
  });
});

describe('against the shipped dataset', () => {
  const url = new URL('../public/data/salaries.json', import.meta.url);
  const available = existsSync(url);

  test('every record with a roleFamily resolves to a family listed in roleFamilies', (t) => {
    if (!available) return t.skip('public/data/salaries.json not present');
    const dataset = parseDataset(JSON.parse(readFileSync(url, 'utf8')));
    const ids = new Set(dataset.roleFamilies.map((f) => f.id));
    for (const rec of dataset.records) {
      if (rec.roleFamily !== null) assert.ok(ids.has(rec.roleFamily), `${rec.id} references unknown family ${rec.roleFamily}`);
    }
  });

  test("the task's example queries resolve against the real data", (t) => {
    if (!available) return t.skip('public/data/salaries.json not present');
    const dataset = parseDataset(JSON.parse(readFileSync(url, 'utf8')));
    for (const query of ['projektleiter', 'project lead', 'pm']) {
      const result = resolveRoleFamilyQuery(dataset.roleFamilies, dataset.records, query);
      assert.ok(result, `query "${query}" should match a family`);
      assert.ok(result.families.some((f) => f.id === 'project-management'), `query "${query}" should include Project Management`);
      assert.ok(result.records.length > 0, `query "${query}" should match at least one record`);
    }
  });
});
