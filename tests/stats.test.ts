import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { SalaryRecord } from '../src/types.ts';
import {
  computePosition,
  mean,
  median,
  percentileRank,
  quantile,
  quantileSorted,
  reliabilityBadge,
  sampleLevel,
  selectBasis,
  summarize,
} from '../src/lib/stats.ts';
import { buildHistogram, niceCountStep, niceStep, niceStepNear, niceTicks } from '../src/lib/histogram.ts';

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
  grossMonthly: null,
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
function record(overrides: Partial<SalaryRecord>): SalaryRecord {
  const id = `r${nextId++}`;
  return { ...BASE, id, postId: id, ...overrides };
}

function assertClose(actual: number, expected: number, message?: string): void {
  assert.ok(Math.abs(actual - expected) < 1e-9, message ?? `expected ${expected}, got ${actual}`);
}

describe('quantile (type 7, linear interpolation)', () => {
  test('matches R quantile() defaults on 1..4', () => {
    const sorted = [1, 2, 3, 4];
    assertClose(quantileSorted(sorted, 0.1), 1.3);
    assertClose(quantileSorted(sorted, 0.25), 1.75);
    assertClose(quantileSorted(sorted, 0.5), 2.5);
    assertClose(quantileSorted(sorted, 0.75), 3.25);
    assertClose(quantileSorted(sorted, 0.9), 3.7);
  });

  test('interpolates between order statistics on a skewed sample', () => {
    const sorted = [1, 3, 7, 15, 100];
    assertClose(quantileSorted(sorted, 0.1), 1.8);
    assertClose(quantileSorted(sorted, 0.25), 3);
    assertClose(quantileSorted(sorted, 0.5), 7);
    assertClose(quantileSorted(sorted, 0.75), 15);
    assertClose(quantileSorted(sorted, 0.9), 66);
  });

  test('matches Excel PERCENTILE.INC', () => {
    assertClose(quantile([10, 20, 30, 40, 50], 0.9), 46);
  });

  test('quantile() sorts unsorted input without mutating it', () => {
    const values = [15, 1, 100, 7, 3];
    assertClose(quantile(values, 0.9), 66);
    assert.deepEqual(values, [15, 1, 100, 7, 3]);
  });

  test('edge cases: single value, bounds and empty input', () => {
    assert.equal(quantileSorted([42], 0.1), 42);
    assert.equal(quantileSorted([42], 0.9), 42);
    assert.equal(quantileSorted([1, 2, 3], 0), 1);
    assert.equal(quantileSorted([1, 2, 3], 1), 3);
    assert.ok(Number.isNaN(quantileSorted([], 0.5)));
  });
});

describe('median, mean and summary', () => {
  test('median of odd and even samples', () => {
    assert.equal(median([3, 1, 2]), 2);
    assert.equal(median([4, 1, 3, 2]), 2.5);
  });

  test('mean', () => {
    assert.equal(mean([1, 2, 3, 4]), 2.5);
    assert.ok(Number.isNaN(mean([])));
  });

  test('summarize returns all benchmark statistics', () => {
    const summary = summarize([5, 1, 3]);
    assert.ok(summary);
    assert.equal(summary.n, 3);
    assert.equal(summary.min, 1);
    assert.equal(summary.max, 5);
    assert.equal(summary.mean, 3);
    assert.equal(summary.median, 3);
    assertClose(summary.p10, 1.4);
    assertClose(summary.p25, 2);
    assertClose(summary.p75, 4);
    assertClose(summary.p90, 4.6);
  });

  test('summarize of an empty sample is null', () => {
    assert.equal(summarize([]), null);
  });
});

describe('percentile rank', () => {
  test('counts values below and half of the ties', () => {
    const sorted = [1000, 2000, 3000, 4000];
    assert.equal(percentileRank(sorted, 2500), 50);
    assert.equal(percentileRank(sorted, 3000), 62.5);
    assert.equal(percentileRank(sorted, 500), 0);
    assert.equal(percentileRank(sorted, 9000), 100);
    assert.equal(percentileRank([5, 5, 5, 5], 5), 50);
    assert.ok(Number.isNaN(percentileRank([], 5)));
  });
});

describe('sample size levels', () => {
  test('n < 5 is insufficient, n < 30 indicative', () => {
    assert.equal(sampleLevel(0), 'none');
    assert.equal(sampleLevel(1), 'insufficient');
    assert.equal(sampleLevel(4), 'insufficient');
    assert.equal(sampleLevel(5), 'indicative');
    assert.equal(sampleLevel(29), 'indicative');
    assert.equal(sampleLevel(30), 'solid');
  });

  test('reliabilityBadge collapses none/insufficient into "tooFew"', () => {
    assert.equal(reliabilityBadge(0), 'tooFew');
    assert.equal(reliabilityBadge(4), 'tooFew');
    assert.equal(reliabilityBadge(5), 'indicative');
    assert.equal(reliabilityBadge(29), 'indicative');
    assert.equal(reliabilityBadge(30), 'solid');
  });
});

describe('computePosition', () => {
  test('rank and signed EUR/percent difference from the median', () => {
    const values = [3000, 3500, 4000, 4500, 5000];
    const position = computePosition(values, 4000, 4500);
    assert.equal(position.rank, 70);
    assert.equal(position.diff, 500);
    assertClose(position.pctDiff, 12.5);
  });

  test('below the median gives a negative diff', () => {
    const position = computePosition([3000, 4000, 5000], 4000, 3000);
    assert.equal(position.diff, -1000);
    assertClose(position.pctDiff, 25);
  });

  test('pctDiff is 0 (not NaN/Infinity) when the median is 0', () => {
    const position = computePosition([0, 0, 100], 0, 100);
    assert.equal(position.pctDiff, 0);
  });
});

describe('basis selection never mixes gross and net', () => {
  const both = record({ grossMonthly: 3000, grossAnnual: 42000, netMonthly: 2000, derived: ['grossAnnual'] });
  const netOnly = record({ netMonthly: 2500 });
  const grossOnly = record({ grossMonthly: 4000, grossAnnual: 48000, paymentsPerYear: 12 });
  const records = [both, netOnly, grossOnly];

  test('gross monthly ignores net-only records and counts them as missing', () => {
    const selection = selectBasis(records, 'grossMonthly');
    assert.deepEqual(selection.values, [3000, 48000 / 14]);
    assert.equal(selection.missing, 1);
    assert.equal(selection.derived, 1, 'the 12-payment salary is converted to its 14-payment equivalent');
    assert.equal(selection.twelvePayments, 1);
    assert.ok(!selection.values.includes(2500), 'a net figure leaked into the gross basis');
  });

  test('net monthly ignores gross-only records', () => {
    const selection = selectBasis(records, 'netMonthly');
    assert.deepEqual(selection.values, [2000, 2500]);
    assert.equal(selection.missing, 1);
    assert.equal(selection.derived, 0);
  });

  test('gross annual counts derived values', () => {
    const selection = selectBasis(records, 'grossAnnual');
    assert.deepEqual(selection.values, [42000, 48000]);
    assert.equal(selection.missing, 1);
    assert.equal(selection.derived, 1);
  });

  test('values come back sorted ascending', () => {
    const selection = selectBasis(
      [record({ grossMonthly: 5000 }), record({ grossMonthly: 2000 }), record({ grossMonthly: 3500 })],
      'grossMonthly',
    );
    assert.deepEqual(selection.values, [2000, 3500, 5000]);
  });
});


describe('histogram', () => {
  test('niceStep rounds up to 1, 2, 2.5 or 5 × 10^k', () => {
    assert.equal(niceStep(0.3), 0.5);
    assert.equal(niceStep(2.4), 2.5);
    assert.equal(niceStep(120), 200);
    assert.equal(niceStep(294), 500);
    assert.equal(niceStep(862), 1000);
    assert.equal(niceStep(1000), 1000);
    assert.equal(niceStep(0), 1);
  });

  test('niceStepNear picks the closest nice number on a log scale', () => {
    assert.equal(niceStepNear(1016), 1000);
    assert.equal(niceStepNear(1400), 1000);
    assert.equal(niceStepNear(1700), 2000);
    assert.equal(niceStepNear(2300), 2500);
    assert.equal(niceStepNear(380), 500);
    assert.equal(niceStepNear(0), 1);
  });

  test('niceCountStep returns integer steps', () => {
    assert.equal(niceCountStep(0.5), 1);
    assert.equal(niceCountStep(1.75), 2);
    assert.equal(niceCountStep(2.5), 5);
    assert.equal(niceCountStep(12), 20);
    assert.equal(niceCountStep(100), 100);
  });

  test('niceTicks stays inside the domain', () => {
    assert.deepEqual(niceTicks(1500, 11000, 5), [2000, 4000, 6000, 8000, 10000]);
  });

  test('empty input has no histogram', () => {
    assert.equal(buildHistogram([]), null);
  });

  test('a single value yields one bin', () => {
    const histogram = buildHistogram([5000]);
    assert.ok(histogram);
    assert.equal(histogram.bins.length, 1);
    assert.equal(histogram.bins[0].count, 1);
    assert.ok(histogram.bins[0].x0 <= 5000 && histogram.bins[0].x1 > 5000);
  });

  test('bins are contiguous and cover every value', () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    const histogram = buildHistogram(values);
    assert.ok(histogram);
    assert.equal(
      histogram.bins.reduce((sum, bin) => sum + bin.count, 0),
      100,
    );
    assert.equal(histogram.clippedLow + histogram.clippedHigh, 0);
    assert.ok(histogram.bins[0].x0 <= 1);
    assert.ok(histogram.bins[histogram.bins.length - 1].x1 >= 100);
    for (let i = 1; i < histogram.bins.length; i += 1) {
      assert.equal(histogram.bins[i].x0, histogram.bins[i - 1].x1);
    }
  });

  test('a far outlier is folded into the last bin instead of stretching the axis', () => {
    const histogram = buildHistogram([2000, 2500, 3000, 3000, 3500, 4000, 4500, 5000, 55000]);
    assert.ok(histogram);
    assert.equal(histogram.step, 1000);
    assert.equal(histogram.clippedHigh, 1);
    assert.equal(histogram.clippedLow, 0);
    assert.equal(histogram.end, 9000);
    assert.deepEqual(
      histogram.bins.map((bin) => bin.count),
      [2, 3, 2, 1, 0, 0, 1],
    );
  });

  test('bin count stays within the configured limits', () => {
    const skewed = Array.from({ length: 400 }, (_, i) => 1500 + (i % 40) * 150 + Math.floor(i / 40) * 10);
    for (const values of [skewed, [1, 2], [100, 100, 100, 5000]]) {
      const histogram = buildHistogram(values.slice().sort((a, b) => a - b));
      assert.ok(histogram);
      assert.ok(histogram.bins.length <= 32, `${histogram.bins.length} bins`);
      assert.equal(
        histogram.bins.reduce((sum, bin) => sum + bin.count, 0),
        values.length,
      );
    }
  });
});
