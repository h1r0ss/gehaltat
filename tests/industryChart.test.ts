import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { SalaryRecord } from '../src/types.ts';
import { hiddenIndustryCount, industryMedians } from '../src/lib/industryChart.ts';

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
  standardizedTitle: 'Software Developer',
  roleFamily: null,
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

function many(industry: SalaryRecord['industry'], count: number, grossMonthly: number): SalaryRecord[] {
  return Array.from({ length: count }, () => record({ industry, grossMonthly }));
}

describe('industryMedians', () => {
  test('only industries with at least 5 salaries get a bar', () => {
    const bars = industryMedians([...many('IT & Software', 5, 4000), ...many('Legal', 4, 6000)]);
    assert.deepEqual(
      bars.map((b) => b.industry),
      ['IT & Software'],
    );
  });

  test('sorted by median descending (highest paid first)', () => {
    const bars = industryMedians([...many('IT & Software', 5, 4000), ...many('Legal', 5, 6000), ...many('Retail & Sales', 5, 2500)]);
    assert.deepEqual(
      bars.map((b) => b.industry),
      ['Legal', 'IT & Software', 'Retail & Sales'],
    );
  });

  test('records without a gross monthly figure are excluded from both the count and the median', () => {
    const withGross = many('IT & Software', 5, 4000);
    const withoutGross = record({ industry: 'IT & Software', grossMonthly: null, grossAnnual: null });
    const bars = industryMedians([...withGross, withoutGross]);
    assert.equal(bars[0].n, 5);
  });
});

describe('hiddenIndustryCount', () => {
  test('counts industries with 1..4 salaries, ignoring industries with zero', () => {
    const records = [...many('IT & Software', 5, 4000), ...many('Legal', 3, 6000), ...many('Retail & Sales', 1, 2500)];
    assert.equal(hiddenIndustryCount(records), 2);
  });

  test('zero when every present industry has enough salaries', () => {
    assert.equal(hiddenIndustryCount(many('IT & Software', 5, 4000)), 0);
  });
});
