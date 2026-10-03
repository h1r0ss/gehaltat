// Data preparation for the "Salary by experience" chart: a scatter of
// individual salaries against years of experience, with a median trend line
// and a P25-P75 band over fixed experience buckets. Pure functions, imported
// by Node tests; the SVG lives in components/ExperienceChart.tsx.
import type { SalaryRecord } from '../types.ts';
import { inExperienceRange } from './filters.ts';
import type { ExperienceRange } from './filters.ts';
import { niceCountStep, niceStep } from './histogram.ts';
import { basisValue, quantileSorted } from './stats.ts';

export type ExperienceBin = { min: number; max: number };

/** Fixed buckets for the trend line/band (not the same bands as the "By experience" table). */
export const EXPERIENCE_CHART_BINS: readonly ExperienceBin[] = [
  { min: 0, max: 1 },
  { min: 2, max: 3 },
  { min: 4, max: 5 },
  { min: 6, max: 7 },
  { min: 8, max: 10 },
  { min: 11, max: 15 },
  { min: 16, max: Infinity },
];

/** A bucket needs at least this many points before it gets a trend/band segment. */
export const MIN_CHART_BIN_N = 3;

export type ExperiencePoint = {
  id: string;
  years: number;
  grossMonthly: number;
  title: string;
  sourceUrl: string;
};

/** One point per record with both stated experience and a gross-monthly figure (12-payment records are converted). */
export function experiencePoints(records: readonly SalaryRecord[]): ExperiencePoint[] {
  const points: ExperiencePoint[] = [];
  for (const record of records) {
    const years = record.experienceYears;
    const value = basisValue(record, 'grossMonthly');
    if (years === null || value === null) continue;
    points.push({
      id: record.id,
      years,
      grossMonthly: value,
      title: record.standardizedTitle || record.jobTitle,
      sourceUrl: record.sourceUrl,
    });
  }
  return points;
}

/**
 * Whether a point lies inside the finder's experience band. This is the very
 * predicate that selects the result card's records (inclusive bounds), so the
 * number of highlighted points equals the salaries the card is based on.
 */
export function pointInRange(point: ExperiencePoint, range: ExperienceRange): boolean {
  return inExperienceRange(point.years, range);
}

export function countPointsInRange(points: readonly ExperiencePoint[], range: ExperienceRange): number {
  let count = 0;
  for (const point of points) if (pointInRange(point, range)) count += 1;
  return count;
}

/** Target tick count used to pick the x-domain's step. */
const X_DOMAIN_TICKS = 6;

/**
 * Upper end of the years axis: a multiple of a whole-year step (1, 2, 5, 10, …)
 * that covers `maxYears`, so no point is squeezed onto the right edge.
 */
export function yearAxisMax(maxYears: number): number {
  const span = Math.max(1, maxYears);
  const step = niceCountStep(span / X_DOMAIN_TICKS);
  return Math.max(step, Math.ceil(span / step) * step);
}

/**
 * Tick values for the years axis at multiples of a whole-year step. Always
 * integers: a fractional step (2.5) would be rounded by the label formatter
 * ("3" at 2.5) and sit at the wrong place next to the shaded experience band.
 */
export function yearTicks(max: number, maxTicks: number): number[] {
  if (!(max > 0)) return [0];
  const step = niceCountStep(max / Math.max(1, maxTicks));
  const ticks: number[] = [];
  for (let tick = 0; tick <= max; tick += step) ticks.push(tick);
  return ticks;
}

/** The fixed bucket a completed-years value falls into, or `null` for negative/invalid input. */
export function experienceChartBin(years: number): ExperienceBin | null {
  if (!Number.isFinite(years) || years < 0) return null;
  const completed = Math.floor(years);
  return EXPERIENCE_CHART_BINS.find((bin) => completed >= bin.min && completed <= bin.max) ?? null;
}

export type ExperienceTrendBin = {
  bin: ExperienceBin;
  n: number;
  median: number;
  p25: number;
  p75: number;
};

/** Median + P25-P75 per bucket, skipping buckets with fewer than `MIN_CHART_BIN_N` points. */
export function experienceTrend(points: readonly ExperiencePoint[]): ExperienceTrendBin[] {
  const groups = new Map<ExperienceBin, number[]>();
  for (const bin of EXPERIENCE_CHART_BINS) groups.set(bin, []);
  for (const point of points) {
    const bin = experienceChartBin(point.years);
    if (bin) groups.get(bin)?.push(point.grossMonthly);
  }
  const rows: ExperienceTrendBin[] = [];
  for (const bin of EXPERIENCE_CHART_BINS) {
    const values = groups.get(bin);
    if (!values || values.length < MIN_CHART_BIN_N) continue;
    const sorted = values.slice().sort((a, b) => a - b);
    rows.push({
      bin,
      n: sorted.length,
      median: quantileSorted(sorted, 0.5),
      p25: quantileSorted(sorted, 0.25),
      p75: quantileSorted(sorted, 0.75),
    });
  }
  return rows;
}

/** Percentile used to cap the experience chart's y-axis (see `experienceYCap`). */
const Y_CAP_PERCENTILE = 0.98;

/** Target tick count used to pick the "nice" rounding granularity for the cap. */
const Y_CAP_TICKS = 5;

export type ExperienceYCap = {
  /** Y-axis domain max: the 98th percentile of the plotted values, rounded up to a nice tick. The domain floor is always 0. */
  max: number;
  /** Number of values strictly above `max` (drawn as capped markers at the top edge instead of stretching the axis). */
  aboveCount: number;
};

/**
 * Caps the experience chart's y-axis at the 98th percentile of `values`
 * (rounded up to a nice axis tick), with the domain floor fixed at 0. This
 * keeps a handful of high earners from stretching the axis and squashing the
 * main mass of points; values above the cap are drawn at the top edge instead
 * (see ExperienceChart.tsx).
 */
export function experienceYCap(values: readonly number[]): ExperienceYCap {
  if (values.length === 0) return { max: 0, aboveCount: 0 };
  const sorted = values.slice().sort((a, b) => a - b);
  const p98 = Math.max(0, quantileSorted(sorted, Y_CAP_PERCENTILE));
  const step = niceStep(p98 / Y_CAP_TICKS);
  const max = Math.ceil(p98 / step) * step;
  let aboveCount = 0;
  for (const value of sorted) if (value > max) aboveCount += 1;
  return { max, aboveCount };
}
