import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { RoleFamily, SalaryRecord } from '../src/types.ts';
import { evaluateBenchmark } from '../src/lib/benchmark.ts';
import { DEFAULT_FILTERS } from '../src/lib/filters.ts';
import type { Filters } from '../src/lib/filters.ts';
import { MAX_RELAXATIONS, computeRelaxations } from '../src/lib/relaxations.ts';
import { MIN_BENCHMARK_N } from '../src/lib/stats.ts';

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
  region: 'Tyrol',
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
function many(count: number, overrides: Partial<SalaryRecord> = {}): SalaryRecord[] {
  return Array.from({ length: count }, () => {
    const id = `r${nextId++}`;
    return { ...BASE, id, postId: id, ...overrides };
  });
}

const CONTEXT = { referenceDate: '2026-09-25' };
const filters = (patch: Partial<Filters>): Filters => ({ ...DEFAULT_FILTERS, ...patch });
const input = (records: SalaryRecord[], f: Filters, roleFamilies: RoleFamily[] = [PM]) => ({
  records,
  roleFamilies,
  filters: f,
  context: CONTEXT,
});
const nAfter = (records: SalaryRecord[], f: Filters, roleFamilies: RoleFamily[] = [PM]) =>
  evaluateBenchmark(records, roleFamilies, f, CONTEXT).gross.values.length;

/** The brief's dead end: a role plus a region leaves 3 salaries although the role alone has plenty. */
function deadEndData(): SalaryRecord[] {
  return [
    ...many(6, { experienceYears: 5, region: 'Tyrol' }),
    ...many(3, { experienceYears: 4, region: 'Vienna' }),
    ...many(3, { experienceYears: 5, region: 'Vienna', hoursPerWeek: 20 }),
    ...many(10, { experienceYears: 15, region: 'Salzburg' }),
  ];
}

describe('computeRelaxations', () => {
  test('offers nothing while the benchmark already has enough salaries', () => {
    const records = many(MIN_BENCHMARK_N);
    assert.deepEqual(computeRelaxations(input(records, filters({ region: 'Tyrol' }))), []);
    assert.deepEqual(computeRelaxations(input(records, filters({}))), []);
  });

  test('offers the relaxations that reach the minimum, the largest count first', () => {
    const records = deadEndData();
    const current = filters({ query: 'projektleiter', experience: 5, region: 'Vienna' });
    assert.equal(nAfter(records, current), 3, 'the dead end: 3 salaries');

    const result = computeRelaxations(input(records, current));
    // Without the region: the 9 salaries of the 3-7 year band. With part-time allowed: 3 + 3 = 6 in Vienna.
    assert.deepEqual(
      result.map((r) => [r.id, r.count]),
      [
        ['region', 9],
        ['fullTime', 6],
      ],
    );
    // Clearing the experience stays at Vienna's 3 full-time salaries: below the minimum, so not offered.
    assert.ok(!result.some((r) => r.id === 'experience'));
  });

  test('the promised count is exactly what the result pipeline gives after applying the patch', () => {
    const records = deadEndData();
    const current = filters({ query: 'projektleiter', experience: 5, region: 'Vienna' });
    const result = computeRelaxations(input(records, current));
    assert.ok(result.length > 0);
    for (const relaxation of result) {
      assert.equal(nAfter(records, { ...current, ...relaxation.patch }), relaxation.count, relaxation.id);
    }
  });

  test('only filters that are actually set can be relaxed', () => {
    // 4 salaries match; the 3 part-time ones only return when full-time-only is switched off.
    const records = [...many(4), ...many(3, { hoursPerWeek: 20 })];
    assert.deepEqual(
      computeRelaxations(input(records, filters({ fullTimeOnly: true }))).map((r) => r.id),
      ['fullTime'],
    );
    // Nothing is narrowing the result (no region, industry, experience, period or drawer filter): nothing to offer.
    assert.deepEqual(computeRelaxations(input(records, filters({ fullTimeOnly: false }))), []);
  });

  test('a suggestion that stays below the minimum is dropped', () => {
    const records = [...many(3), ...many(1, { region: 'Vienna' })];
    assert.deepEqual(computeRelaxations(input(records, filters({ region: 'Salzburg' }))), [], 'still only 4 without the region');
  });

  test('keeps at most three suggestions; equal counts keep the candidate priority order', () => {
    const f = filters({ region: 'Tyrol', industry: 'Legal', period: '12m', fullTimeOnly: true });
    const matching = many(4, { region: 'Tyrol', industry: 'Legal', postDate: '2026-08-01' });
    // Two records per filter that violate only that filter: relaxing any one of them gives 4 + 2 = 6.
    const records = [
      ...matching,
      ...many(2, { region: 'Vienna', industry: 'Legal', postDate: '2026-08-01' }),
      ...many(2, { region: 'Tyrol', industry: 'Retail & Sales', postDate: '2026-08-01' }),
      ...many(2, { region: 'Tyrol', industry: 'Legal', postDate: '2026-08-01', hoursPerWeek: 20 }),
      ...many(2, { region: 'Tyrol', industry: 'Legal', postDate: '2024-01-01' }),
    ];
    assert.equal(nAfter(records, f, []), 4);
    const result = computeRelaxations(input(records, f, []));
    assert.equal(result.length, MAX_RELAXATIONS);
    assert.deepEqual(
      result.map((r) => [r.id, r.count]),
      [
        ['region', 6],
        ['industry', 6],
        ['fullTime', 6],
      ],
    );
    assert.equal(computeRelaxations(input(records, f, []), 4).length, 4);
    assert.equal(computeRelaxations(input(records, f, []), 1).length, 1);
  });

  test('clearing the experience also brings in entries with unknown experience, like the finder without input', () => {
    const records = [...many(3, { experienceYears: 5 }), ...many(4, { experienceYears: null })];
    const current = filters({ experience: 5 });
    assert.equal(nAfter(records, current, []), 3);
    const result = computeRelaxations(input(records, current, []));
    assert.deepEqual(
      result.map((r) => [r.id, r.count]),
      [['experience', 7]],
    );
    assert.deepEqual(result[0].patch, { experience: null });
  });

  test('the period suggestion resets to all time', () => {
    const records = [...many(3, { postDate: '2026-08-01' }), ...many(3, { postDate: '2023-01-01' })];
    const result = computeRelaxations(input(records, filters({ period: '12m' }), []));
    assert.deepEqual(
      result.map((r) => [r.id, r.count, r.patch]),
      [['period', 6, { period: 'all' }]],
    );
  });

  test('the advanced suggestion resets exactly the "Mehr Filter" fields and nothing else', () => {
    const records = [...many(3), ...many(3, { employmentType: 'freelancer', figuresVerified: false, confidence: 0.6 })];
    const current = filters({ region: 'Tyrol', employmentType: 'employee', verifiedOnly: true, minConfidence: 0.85 });
    assert.equal(nAfter(records, current, []), 3);
    const result = computeRelaxations(input(records, current, []));
    const advanced = result.find((r) => r.id === 'advanced');
    assert.ok(advanced);
    assert.deepEqual(advanced.patch, {
      employmentType: '',
      salaryKind: '',
      salarySource: '',
      collectiveAgreement: '',
      verifiedOnly: false,
      minConfidence: DEFAULT_FILTERS.minConfidence,
    });
    assert.equal(advanced.count, nAfter(records, { ...current, ...advanced.patch }, []));
  });

  test('only salaries with a gross monthly figure count towards a suggestion', () => {
    const records = [
      ...many(3, { region: 'Vienna' }),
      ...many(2, { region: 'Tyrol' }),
      ...many(4, { region: 'Tyrol', grossMonthly: null, grossAnnual: null, netMonthly: 2500 }),
    ];
    // Without the region 9 entries match, but only 5 of them state a gross monthly figure.
    const result = computeRelaxations(input(records, filters({ region: 'Vienna' }), []));
    assert.deepEqual(
      result.map((r) => [r.id, r.count]),
      [['region', 5]],
    );
    // One gross salary fewer and it no longer reaches the minimum, although 8 entries would still match.
    const fewer = records.filter((r) => r !== records[3]);
    assert.deepEqual(computeRelaxations(input(fewer, filters({ region: 'Vienna' }), [])), []);
  });
});
