// Pure statistics for the benchmark panel. No DOM access; imported by Node tests.
import type { SalaryRecord } from '../types.ts';

export type Basis = 'grossMonthly' | 'grossAnnual' | 'netMonthly';
export const BASES: readonly Basis[] = ['grossMonthly', 'grossAnnual', 'netMonthly'];
export const DEFAULT_BASIS: Basis = 'grossMonthly';

/** Below this many values no benchmark is shown at all. */
export const MIN_BENCHMARK_N = 5;
/** Below this many values a benchmark is labelled "indicative only". */
export const MIN_SOLID_N = 30;
/** Below this many values P10/P90 are too close to the extremes to show; min and max are shown instead. */
export const MIN_PERCENTILE_N = 20;

/** The summary as displayed: location and spread rounded to the sample (see roundToSample in format.ts). */
export function roundSummary(summary: Summary, round: (value: number, n: number) => number): Summary {
  const r = (value: number) => round(value, summary.n);
  return { ...summary, mean: r(summary.mean), median: r(summary.median), p10: r(summary.p10), p25: r(summary.p25), p75: r(summary.p75), p90: r(summary.p90) };
}

export function sortAscending(values: readonly number[]): number[] {
  return values.slice().sort((a, b) => a - b);
}

/**
 * Quantile of an ascending array with linear interpolation between order
 * statistics (Hyndman & Fan type 7: R's default, Excel PERCENTILE.INC, NumPy "linear").
 */
export function quantileSorted(sorted: readonly number[], p: number): number {
  const n = sorted.length;
  if (n === 0 || Number.isNaN(p)) return NaN;
  if (p <= 0) return sorted[0];
  if (p >= 1) return sorted[n - 1];
  const h = (n - 1) * p;
  const lower = Math.floor(h);
  const fraction = h - lower;
  const base = sorted[lower];
  if (fraction === 0 || lower + 1 >= n) return base;
  return base + fraction * (sorted[lower + 1] - base);
}

export function quantile(values: readonly number[], p: number): number {
  return quantileSorted(sortAscending(values), p);
}

export function median(values: readonly number[]): number {
  return quantile(values, 0.5);
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) return NaN;
  let sum = 0;
  for (const value of values) sum += value;
  return sum / values.length;
}

export type Summary = {
  n: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  p10: number;
  p25: number;
  p75: number;
  p90: number;
};

/** Summary statistics of an ascending array; `null` when empty. */
export function summarizeSorted(sorted: readonly number[]): Summary | null {
  const n = sorted.length;
  if (n === 0) return null;
  return {
    n,
    min: sorted[0],
    max: sorted[n - 1],
    mean: mean(sorted),
    median: quantileSorted(sorted, 0.5),
    p10: quantileSorted(sorted, 0.1),
    p25: quantileSorted(sorted, 0.25),
    p75: quantileSorted(sorted, 0.75),
    p90: quantileSorted(sorted, 0.9),
  };
}

export function summarize(values: readonly number[]): Summary | null {
  return summarizeSorted(sortAscending(values));
}

/**
 * Percentile rank of `value` in an ascending array: the share of values below
 * it, counting ties as half (mid-rank). Returns 0–100, or NaN when empty.
 */
export function percentileRank(sorted: readonly number[], value: number): number {
  const n = sorted.length;
  if (n === 0 || !Number.isFinite(value)) return NaN;
  let below = 0;
  let equal = 0;
  for (const current of sorted) {
    if (current < value) below += 1;
    else if (current === value) equal += 1;
    else break;
  }
  return ((below + equal / 2) / n) * 100;
}

export type SampleLevel = 'none' | 'insufficient' | 'indicative' | 'solid';

export function sampleLevel(n: number): SampleLevel {
  if (n <= 0) return 'none';
  if (n < MIN_BENCHMARK_N) return 'insufficient';
  if (n < MIN_SOLID_N) return 'indicative';
  return 'solid';
}

/** The calculator's three-way reliability badge: 'none'/'insufficient' both read as "too few". */
export type ReliabilityBadge = 'solid' | 'indicative' | 'tooFew';

export function reliabilityBadge(n: number): ReliabilityBadge {
  const level = sampleLevel(n);
  if (level === 'solid') return 'solid';
  if (level === 'indicative') return 'indicative';
  return 'tooFew';
}

export type Position = {
  /** Percentile rank (0-100) of the visitor's salary among the compared values. */
  rank: number;
  /** Signed EUR difference from the median (positive = above). */
  diff: number;
  /** Absolute difference from the median as a percentage of the median (0 when median is 0). */
  pctDiff: number;
};

/** Where `salary` falls among `values` (ascending), relative to their median. */
export function computePosition(values: readonly number[], median: number, salary: number): Position {
  const diff = salary - median;
  return {
    rank: percentileRank(values, salary),
    diff,
    pctDiff: median > 0 ? (Math.abs(diff) / median) * 100 : 0,
  };
}

/**
 * The record's value for the chosen basis. Gross and net are never mixed:
 * there is deliberately no fallback to another field. Monthly gross is compared
 * as paid 14 times a year, so salaries paid 12 times use their 14-payment
 * equivalent (annual ÷ 14).
 */
export function basisValue(record: SalaryRecord, basis: Basis): number | null {
  if (basis === 'grossMonthly' && record.paymentsPerYear === 12) {
    const annual = finite(record.grossAnnual) ?? (finite(record.grossMonthly) === null ? null : record.grossMonthly! * 12);
    return annual === null ? null : annual / 14;
  }
  return finite(record[basis]);
}

function finite(value: number | null): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** True when the value was computed (by the pipeline or the 14-payment conversion) instead of stated. */
export function isDerivedValue(record: SalaryRecord, basis: Basis): boolean {
  if (basis === 'grossMonthly' && record.paymentsPerYear === 12) return true;
  return basis !== 'netMonthly' && record.derived.includes(basis);
}

export type BasisSelection = {
  basis: Basis;
  /** Ascending values of the records that state the basis. */
  values: number[];
  /** Matching records without a value for the basis (excluded from the benchmark). */
  missing: number;
  /** Included values that were derived by the pipeline. */
  derived: number;
  /** Included values from records paid 12 times a year. */
  twelvePayments: number;
};

export function selectBasis(records: readonly SalaryRecord[], basis: Basis): BasisSelection {
  const values: number[] = [];
  let missing = 0;
  let derived = 0;
  let twelvePayments = 0;
  for (const record of records) {
    const value = basisValue(record, basis);
    if (value === null) {
      missing += 1;
      continue;
    }
    values.push(value);
    if (isDerivedValue(record, basis)) derived += 1;
    if (record.paymentsPerYear === 12) twelvePayments += 1;
  }
  values.sort((a, b) => a - b);
  return { basis, values, missing, derived, twelvePayments };
}
