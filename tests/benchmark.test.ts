import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { RoleFamily, SalaryRecord } from '../src/types.ts';
import { evaluateBenchmark } from '../src/lib/benchmark.ts';
import { DEFAULT_FILTERS, filterRecords } from '../src/lib/filters.ts';
import type { Filters } from '../src/lib/filters.ts';
import { matchExperience } from '../src/lib/finder.ts';
import { selectBasis } from '../src/lib/stats.ts';

const PM: RoleFamily = {
  id: 'project-management',
  label: 'Project Management',
  labelDe: 'Projektmanagement',
  aliases: ['Project Manager', 'Projektleiter'],
};

const BASE: SalaryRecord = {
  id: 'r0',
  postId: 'r0',
  sourceUrl: '',
  postDate: '2026-06-01',
  postTitle: '',
  flair: null,
  upvotes: 0,
  numComments: 0,
  jobTitle: 'Projektleiter',
  standardizedTitle: 'Project Manager',
  roleFamily: 'project-management',
  industry: 'IT & Software',
  seniority: 'mid',
  experienceYears: 5,
  region: 'Vienna',
  hoursPerWeek: 38.5,
  employmentType: 'employee',
  salaryKind: 'current',
  paymentsPerYear: 14,
  grossMonthly: 4000,
  grossAnnual: 56000,
  netMonthly: 2700,
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
function many(count: number, overrides: Partial<SalaryRecord> = {}): SalaryRecord[] {
  return Array.from({ length: count }, () => record(overrides));
}

const CONTEXT = { referenceDate: '2026-09-25' };
const filters = (patch: Partial<Filters>): Filters => ({ ...DEFAULT_FILTERS, ...patch });

describe('evaluateBenchmark', () => {
  test('a role family scopes the records and replaces the free-text query', () => {
    // "Projektleiter" appears in the job title of the family's records only, yet the
    // unrelated record that also says it (no family) must not sneak in via the substring search.
    const inFamily = many(6, { experienceYears: 4 });
    const stray = record({ roleFamily: null, jobTitle: 'Projektleiter Bau', standardizedTitle: 'Site Manager' });
    const other = record({ roleFamily: 'registered-nursing', jobTitle: 'DGKP', standardizedTitle: 'Nurse' });
    const evaluation = evaluateBenchmark([...inFamily, stray, other], [PM], filters({ query: 'projektleiter' }), CONTEXT);
    assert.deepEqual(evaluation.familyMatch?.families, [PM]);
    assert.equal(evaluation.effectiveFilters.query, '');
    assert.equal(evaluation.baseRecords.length, 6);
    assert.equal(evaluation.allLevels.length, 6);
  });

  test('without a matching family the plain substring search applies', () => {
    const records = [...many(3, { standardizedTitle: 'Welder', jobTitle: 'Schweisser', roleFamily: null }), ...many(2)];
    const evaluation = evaluateBenchmark(records, [PM], filters({ query: 'schweisser' }), CONTEXT);
    assert.equal(evaluation.familyMatch, null);
    assert.equal(evaluation.effectiveFilters.query, 'schweisser');
    assert.equal(evaluation.allLevels.length, 3);
  });

  test('matches the composition of filterRecords, matchExperience and selectBasis', () => {
    const records = [
      ...many(4, { experienceYears: 3 }),
      ...many(3, { experienceYears: 6, region: 'Tyrol' }),
      ...many(2, { experienceYears: 12, grossMonthly: null, grossAnnual: null }),
      ...many(2, { experienceYears: null }),
    ];
    const f = filters({ query: 'projektleiter', experience: 5 });
    const evaluation = evaluateBenchmark(records, [PM], f, CONTEXT);

    const allLevels = filterRecords(records, { ...f, query: '' }, CONTEXT);
    const match = matchExperience(allLevels, 5);
    const gross = selectBasis(match.records, 'grossMonthly');
    assert.deepEqual(evaluation.allLevels, allLevels);
    assert.deepEqual(evaluation.match, match);
    assert.deepEqual(evaluation.gross, gross);
  });

  test('n is the number of gross-monthly values, not of matching entries', () => {
    const records = [...many(4), ...many(3, { grossMonthly: null, grossAnnual: null, netMonthly: 2500 })];
    const evaluation = evaluateBenchmark(records, [], filters({ experience: 5 }), CONTEXT);
    assert.equal(evaluation.match.records.length, 7);
    assert.equal(evaluation.gross.values.length, 4);
  });

  test('the experience band widens exactly as the finder does (±2 -> ±4 -> ±8)', () => {
    const records = [...many(3, { experienceYears: 5 }), ...many(2, { experienceYears: 9 }), ...many(10, { experienceYears: 20 })];
    const widened = evaluateBenchmark(records, [], filters({ experience: 5 }), CONTEXT);
    assert.equal(widened.match.mode, 'band');
    assert.equal(widened.match.halfWidth, 4);
    assert.equal(widened.gross.values.length, 5);

    const tooFew = evaluateBenchmark(records.slice(0, 3), [], filters({ experience: 5 }), CONTEXT);
    assert.equal(tooFew.match.mode, 'band');
    assert.equal(tooFew.match.halfWidth, 8);
    assert.equal(tooFew.gross.values.length, 3);
  });

  test('no role families (empty list) behaves like an unresolved query', () => {
    const evaluation = evaluateBenchmark(many(5), [], filters({ query: 'projektleiter' }), CONTEXT);
    assert.equal(evaluation.familyMatch, null);
    assert.equal(evaluation.allLevels.length, 5);
  });
});
