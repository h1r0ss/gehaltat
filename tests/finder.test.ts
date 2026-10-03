import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { SalaryRecord } from '../src/types.ts';
import { bandAround, describeExperience, describeWidening, matchExperience } from '../src/lib/finder.ts';

const BASE: SalaryRecord = {
  id: 'r0',
  postId: 'r0',
  sourceUrl: 'https://www.reddit.com/r/GehaltAT/comments/r0/',
  postDate: '2026-06-01',
  postTitle: 'Gehalt',
  flair: null,
  upvotes: 0,
  numComments: 0,
  jobTitle: 'Entwickler',
  standardizedTitle: 'Software Developer',
  roleFamily: null,
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

/** `count` records with the given experience (all with a gross monthly figure). */
function withExperience(years: number | null, count: number, overrides: Partial<SalaryRecord> = {}): SalaryRecord[] {
  return Array.from({ length: count }, () => record({ experienceYears: years, ...overrides }));
}

describe('experience band', () => {
  test('is ±halfWidth years around the input, clamped at zero', () => {
    assert.deepEqual(bandAround(5, 2), { min: 3, max: 7 });
    assert.deepEqual(bandAround(10, 4), { min: 6, max: 14 });
    assert.deepEqual(bandAround(2, 2), { min: 0, max: 4 });
  });

  test('0 and 1 years both map to 0–3 years', () => {
    assert.deepEqual(bandAround(0, 2), { min: 0, max: 3 });
    assert.deepEqual(bandAround(1, 2), { min: 0, max: 3 });
    assert.deepEqual(bandAround(0, 4), { min: 0, max: 5 });
  });
});

describe('matchExperience', () => {
  test('without an experience input every record stays in, including unknown experience', () => {
    const records = [...withExperience(3, 2), ...withExperience(null, 2)];
    const match = matchExperience(records, null);
    assert.equal(match.mode, 'any');
    assert.equal(match.records.length, 4);
    assert.equal(match.range, null);
    assert.equal(describeExperience(match), 'all experience levels');
    assert.equal(describeWidening(match), null);
  });

  test('uses ±2 years when at least 5 salaries match', () => {
    const inBand = [...withExperience(3, 2), ...withExperience(5, 2), ...withExperience(7, 1)];
    const outside = [...withExperience(8, 3), ...withExperience(null, 4)];
    const match = matchExperience([...inBand, ...outside], 5);
    assert.equal(match.mode, 'band');
    assert.equal(match.halfWidth, 2);
    assert.equal(match.widened, false);
    assert.deepEqual(match.range, { min: 3, max: 7 });
    assert.equal(match.records.length, 5);
    assert.equal(match.usable, 5);
    assert.equal(describeExperience(match), '3–7 years experience');
    assert.equal(describeWidening(match), null);
  });

  test('widens to ±4 years when ±2 has fewer than 5 salaries', () => {
    const records = [...withExperience(5, 3), ...withExperience(1, 1), ...withExperience(9, 1), ...withExperience(12, 5)];
    const match = matchExperience(records, 5);
    assert.equal(match.mode, 'band');
    assert.equal(match.halfWidth, 4);
    assert.equal(match.widened, true);
    assert.deepEqual(match.range, { min: 1, max: 9 });
    assert.equal(match.records.length, 5);
    assert.equal(describeExperience(match), '1–9 years experience');
    assert.match(describeWidening(match) ?? '', /widened to ±4 years/);
  });

  test('widens to ±8 years at most and then reports what it found, never all levels', () => {
    const records = [...withExperience(5, 2), ...withExperience(20, 4), ...withExperience(null, 6)];
    const match = matchExperience(records, 5);
    assert.equal(match.mode, 'band');
    assert.equal(match.halfWidth, 8);
    assert.equal(match.widened, true);
    assert.deepEqual(match.range, { min: 0, max: 13 });
    assert.equal(match.records.length, 2, '20 years is outside ±8 and unknown experience never matches');
    assert.equal(match.usable, 2);
    assert.equal(describeExperience(match), '0–13 years experience');
    assert.match(describeWidening(match) ?? '', /widened to ±8 years/);
  });

  test('only salaries with a gross monthly figure count towards the minimum', () => {
    const netOnly = withExperience(5, 4, { grossMonthly: null });
    const gross = withExperience(5, 4);
    const wider = withExperience(8, 1);
    const match = matchExperience([...netOnly, ...gross, ...wider], 5);
    assert.equal(match.halfWidth, 4, '8 records within ±2 but only 4 state gross monthly');
    assert.equal(match.usable, 5);
    assert.equal(match.records.length, 9);
  });

  test('accepts a custom usability test and minimum', () => {
    const records = withExperience(5, 3, { netMonthly: 2500 });
    const match = matchExperience(records, 5, (r) => r.netMonthly !== null, 3);
    assert.equal(match.mode, 'band');
    assert.equal(match.halfWidth, 2);
  });

  test('when nothing has stated experience the result is empty', () => {
    const match = matchExperience(withExperience(null, 10), 4);
    assert.equal(match.mode, 'band');
    assert.equal(match.records.length, 0);
    assert.equal(match.usable, 0);
  });

  test('invalid input behaves like no input', () => {
    assert.equal(matchExperience(withExperience(3, 2), -1).mode, 'any');
    assert.equal(matchExperience(withExperience(3, 2), Number.NaN).mode, 'any');
  });
});
