import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { SalaryRecord } from '../src/types.ts';
import { evaluateBenchmark } from '../src/lib/benchmark.ts';
import {
  countPointsInRange,
  experienceChartBin,
  experiencePoints,
  experienceTrend,
  experienceYCap,
  pointInRange,
  yearAxisMax,
  yearTicks,
} from '../src/lib/experienceChart.ts';
import { DEFAULT_FILTERS } from '../src/lib/filters.ts';

const BASE: SalaryRecord = {
  id: 'r0',
  postId: 'r0',
  sourceUrl: 'https://www.reddit.com/r/GehaltAT/comments/r0/',
  postDate: '2026-06-01',
  postTitle: '',
  flair: null,
  upvotes: 0,
  numComments: 0,
  jobTitle: 'Entwickler',
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

describe('experienceChartBin', () => {
  test('bins match the task-specified buckets: 0-1, 2-3, 4-5, 6-7, 8-10, 11-15, 16+', () => {
    assert.deepEqual(experienceChartBin(0), { min: 0, max: 1 });
    assert.deepEqual(experienceChartBin(1.9), { min: 0, max: 1 });
    assert.deepEqual(experienceChartBin(2), { min: 2, max: 3 });
    assert.deepEqual(experienceChartBin(5.5), { min: 4, max: 5 });
    assert.deepEqual(experienceChartBin(7), { min: 6, max: 7 });
    assert.deepEqual(experienceChartBin(10), { min: 8, max: 10 });
    assert.deepEqual(experienceChartBin(15.9), { min: 11, max: 15 });
    assert.deepEqual(experienceChartBin(16), { min: 16, max: Infinity });
    assert.deepEqual(experienceChartBin(40), { min: 16, max: Infinity });
  });

  test('invalid years are null', () => {
    assert.equal(experienceChartBin(-1), null);
    assert.equal(experienceChartBin(NaN), null);
  });
});

describe('experiencePoints', () => {
  test('only records with both stated experience and a gross-monthly figure become points', () => {
    const withBoth = record({ experienceYears: 3, grossMonthly: 4000 });
    const noExperience = record({ experienceYears: null, grossMonthly: 4000 });
    const noGross = record({ experienceYears: 3, grossMonthly: null, grossAnnual: null });
    const points = experiencePoints([withBoth, noExperience, noGross]);
    assert.deepEqual(
      points.map((p) => p.id),
      [withBoth.id],
    );
  });

  test('a 12-payment salary is converted to its 14-payment equivalent, like the rest of the app', () => {
    const twelvePayments = record({ experienceYears: 4, paymentsPerYear: 12, grossMonthly: null, grossAnnual: 48000 });
    const [point] = experiencePoints([twelvePayments]);
    assert.equal(point.grossMonthly, 48000 / 14);
  });

  test('carries the title and source link through', () => {
    const r = record({ standardizedTitle: 'Nurse', sourceUrl: 'https://example.com/x' });
    const [point] = experiencePoints([r]);
    assert.equal(point.title, 'Nurse');
    assert.equal(point.sourceUrl, 'https://example.com/x');
  });
});

describe('experienceTrend', () => {
  test('only buckets with at least 3 points get a trend/band row', () => {
    const points = experiencePoints([
      record({ experienceYears: 0, grossMonthly: 3000 }),
      record({ experienceYears: 1, grossMonthly: 3200 }),
      record({ experienceYears: 0, grossMonthly: 3400 }),
      record({ experienceYears: 5, grossMonthly: 4000 }), // alone in its bucket -> excluded
    ]);
    const trend = experienceTrend(points);
    assert.equal(trend.length, 1);
    assert.deepEqual(trend[0].bin, { min: 0, max: 1 });
    assert.equal(trend[0].n, 3);
    assert.equal(trend[0].median, 3200);
  });

  test('rows are in bucket order, not by size', () => {
    const points = experiencePoints([
      ...[16, 17, 18].map((years) => record({ experienceYears: years, grossMonthly: 6000 })),
      ...[0, 0, 1].map((years) => record({ experienceYears: years, grossMonthly: 3000 })),
    ]);
    const trend = experienceTrend(points);
    assert.deepEqual(
      trend.map((row) => row.bin),
      [
        { min: 0, max: 1 },
        { min: 16, max: Infinity },
      ],
    );
  });
});

describe('experienceYCap', () => {
  test('empty input has a zero cap and nothing above it', () => {
    const cap = experienceYCap([]);
    assert.equal(cap.max, 0);
    assert.equal(cap.aboveCount, 0);
  });

  test('caps at the 98th percentile rounded up to a nice tick when there are no outliers', () => {
    const cap = experienceYCap([1000, 2000, 3000, 4000, 5000]);
    assert.equal(cap.max, 5000);
    assert.equal(cap.aboveCount, 0);
  });

  test('a handful of high outliers land above the cap instead of stretching it', () => {
    const values = [...Array(147).fill(4000), 15000, 15000, 15000];
    const cap = experienceYCap(values);
    assert.equal(cap.max, 5000);
    assert.equal(cap.aboveCount, 3);
  });
});

describe('highlighting the experience band', () => {
  test('a point is in the band with inclusive bounds, fractional years included', () => {
    const [low, edgeLow, inside, edgeHigh, above] = experiencePoints(
      [2.9, 3, 5, 7, 7.5].map((years) => record({ experienceYears: years })),
    );
    const range = { min: 3, max: 7 };
    assert.deepEqual(
      [low, edgeLow, inside, edgeHigh, above].map((point) => pointInRange(point, range)),
      [false, true, true, true, false],
    );
    assert.equal(countPointsInRange([low, edgeLow, inside, edgeHigh, above], range), 3);
  });

  test('an open-ended range (all experience levels) contains every point', () => {
    const points = experiencePoints([0, 4, 30].map((years) => record({ experienceYears: years })));
    assert.equal(countPointsInRange(points, { min: 0, max: Infinity }), 3);
  });

  test('the highlighted count is the number of salaries behind the result card', () => {
    // 4 salaries at 5 years, 3 at 9 (inside the widened band), 6 at 20, plus entries the chart cannot plot:
    // unknown experience, and a net-only entry without a gross monthly figure.
    const records = [
      ...Array.from({ length: 4 }, () => record({ experienceYears: 5 })),
      ...Array.from({ length: 3 }, () => record({ experienceYears: 9 })),
      ...Array.from({ length: 6 }, () => record({ experienceYears: 20 })),
      record({ experienceYears: null }),
      record({ experienceYears: 5, grossMonthly: null, grossAnnual: null, netMonthly: 2500 }),
    ];
    const evaluation = evaluateBenchmark(records, [], { ...DEFAULT_FILTERS, experience: 5 }, { referenceDate: '2026-09-25' });
    assert.equal(evaluation.match.mode, 'band');
    assert.ok(evaluation.match.range);

    const points = experiencePoints(evaluation.allLevels);
    assert.equal(points.length, 13, 'all levels: every plottable salary');
    assert.equal(countPointsInRange(points, evaluation.match.range), evaluation.gross.values.length);
    assert.equal(evaluation.gross.values.length, 7);
  });
});

describe('years axis', () => {
  test('the domain covers the largest value in whole-year steps', () => {
    assert.equal(yearAxisMax(3), 3);
    assert.equal(yearAxisMax(5), 5);
    assert.equal(yearAxisMax(14), 15);
    assert.equal(yearAxisMax(18), 20);
    assert.equal(yearAxisMax(20), 20);
    assert.equal(yearAxisMax(41), 50);
  });

  test('ticks are whole years, so a label never rounds a fractional tick', () => {
    for (const [max, maxTicks] of [[20, 10], [20, 5], [15, 8], [50, 10], [5, 3], [12, 12]] as const) {
      const ticks = yearTicks(max, maxTicks);
      assert.ok(ticks.every((tick) => Number.isInteger(tick)), `${max}/${maxTicks}: ${ticks.join(',')}`);
      assert.equal(ticks[0], 0);
      assert.ok(ticks[ticks.length - 1] <= max);
      assert.ok(ticks.length <= maxTicks + 1);
    }
    assert.deepEqual(yearTicks(20, 10), [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);
    assert.deepEqual(yearTicks(20, 5), [0, 5, 10, 15, 20]);
    assert.deepEqual(yearTicks(0, 5), [0]);
  });
});
