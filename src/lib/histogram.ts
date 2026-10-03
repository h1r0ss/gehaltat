// Histogram binning and axis ticks. Pure functions, imported by Node tests.
import { quantileSorted } from './stats.ts';

export type HistogramBin = { x0: number; x1: number; count: number };

export type Histogram = {
  bins: HistogramBin[];
  step: number;
  /** Lower edge of the first bin. */
  start: number;
  /** Upper edge of the last bin. */
  end: number;
  /** Values below `start`, folded into the first bin. */
  clippedLow: number;
  /** Values above `end`, folded into the last bin. */
  clippedHigh: number;
  total: number;
};

export type HistogramOptions = {
  minBins?: number;
  maxBins?: number;
  /** Tukey fence multiplier: values beyond Q1 − k·IQR or Q3 + k·IQR are folded into the edge bins. */
  fence?: number;
};

const NICE_MULTIPLIERS = [1, 2, 2.5, 5];

/** Smallest "nice" number (1, 2, 2.5 or 5 × 10^k) that is ≥ raw. */
export function niceStep(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(raw));
  for (const multiplier of [...NICE_MULTIPLIERS, 10]) {
    const step = multiplier * power;
    if (step >= raw * (1 - 1e-9)) return step;
  }
  return 10 * power;
}

/** Nice step (1, 2, 2.5 or 5 × 10^k) closest to raw on a log scale. */
export function niceStepNear(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(raw));
  let best = power;
  for (const scale of [power / 10, power, power * 10]) {
    for (const multiplier of NICE_MULTIPLIERS) {
      const candidate = multiplier * scale;
      if (Math.abs(Math.log(candidate / raw)) < Math.abs(Math.log(best / raw))) best = candidate;
    }
  }
  return best;
}

/** The nice step just above or below `step`. */
function adjacentNiceStep(step: number, direction: 1 | -1): number {
  const power = 10 ** Math.floor(Math.log10(step) + 1e-9);
  const ladder = [0.5, 1, 2, 2.5, 5, 10, 20].map((multiplier) => multiplier * power);
  const index = ladder.findIndex((candidate) => Math.abs(candidate - step) < step * 1e-9);
  return ladder[Math.min(ladder.length - 1, Math.max(0, index + direction))];
}

/** Integer step (1, 2 or 5 × 10^k) for count axes. */
export function niceCountStep(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 1) return 1;
  const power = 10 ** Math.floor(Math.log10(raw));
  for (const multiplier of [1, 2, 5, 10]) {
    const step = multiplier * power;
    if (step >= raw) return step;
  }
  return 10 * power;
}

/** Ticks at multiples of a nice step inside [start, end], at most about maxTicks + 1 of them. */
export function niceTicks(start: number, end: number, maxTicks: number): number[] {
  if (!(end > start) || maxTicks < 1) return [start];
  const step = niceStep((end - start) / maxTicks);
  const ticks: number[] = [];
  for (let tick = Math.ceil(start / step) * step; tick <= end + step * 1e-9; tick += step) {
    ticks.push(Math.round(tick * 1e6) / 1e6);
  }
  return ticks;
}

/**
 * Bins for an ascending array. Bin width follows Freedman–Diaconis, clamped to
 * [minBins, maxBins] bins and rounded to a nice step. Far outliers (3 × IQR by
 * default) are folded into the first/last bin so one extreme value cannot
 * squash the chart; `clippedLow`/`clippedHigh` report how many were folded.
 */
export function buildHistogram(sorted: readonly number[], options: HistogramOptions = {}): Histogram | null {
  const { minBins = 6, maxBins = 30, fence = 3 } = options;
  const n = sorted.length;
  if (n === 0) return null;

  const min = sorted[0];
  const max = sorted[n - 1];
  const q1 = quantileSorted(sorted, 0.25);
  const q3 = quantileSorted(sorted, 0.75);
  const iqr = q3 - q1;

  let lo = min;
  let hi = max;
  if (iqr > 0) {
    lo = Math.max(min, q1 - fence * iqr);
    hi = Math.min(max, q3 + fence * iqr);
  }

  const binCount = (candidate: number) => Math.max(1, Math.ceil(hi / candidate) - Math.floor(lo / candidate));
  let step: number;
  if (hi <= lo) {
    // All values identical: a single bin around the value.
    step = niceStep(Math.max(Math.abs(lo) * 0.05, 1));
  } else {
    const span = hi - lo;
    const freedmanDiaconis = iqr > 0 ? (2 * iqr) / Math.cbrt(n) : span / minBins;
    step = niceStepNear(Math.min(Math.max(freedmanDiaconis, span / maxBins), span / minBins));
    // Rounding to a nice number can overshoot the bin limits; step back towards them.
    for (let guard = 0; guard < 6 && binCount(step) > maxBins; guard += 1) step = adjacentNiceStep(step, 1);
    for (let guard = 0; guard < 6 && binCount(step) < minBins; guard += 1) {
      const smaller = adjacentNiceStep(step, -1);
      if (binCount(smaller) > maxBins) break;
      step = smaller;
    }
  }

  const start = Math.floor(lo / step) * step;
  let end = Math.ceil(hi / step) * step;
  if (end <= start) end = start + step;
  const count = Math.max(1, Math.round((end - start) / step));

  const bins: HistogramBin[] = [];
  for (let i = 0; i < count; i += 1) {
    bins.push({ x0: start + i * step, x1: start + (i + 1) * step, count: 0 });
  }

  let clippedLow = 0;
  let clippedHigh = 0;
  for (const value of sorted) {
    if (value < start) clippedLow += 1;
    else if (value > end) clippedHigh += 1;
    const index = Math.min(count - 1, Math.max(0, Math.floor((value - start) / step)));
    bins[index].count += 1;
  }

  return { bins, step, start, end, clippedLow, clippedHigh, total: n };
}
