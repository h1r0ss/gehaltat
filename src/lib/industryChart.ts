// Data preparation for the "How fields compare" chart: median gross monthly
// salary per industry. Pure functions, imported by Node tests; the SVG lives
// in components/IndustryChart.tsx.
import type { Industry, SalaryRecord } from '../types.ts';
import { basisValue, quantileSorted } from './stats.ts';

/** An industry needs at least this many salaries before it gets a bar. */
export const MIN_INDUSTRY_CHART_N = 5;

export type IndustryBar = { industry: Industry; n: number; median: number };

/**
 * Median gross monthly salary per industry, most highly paid first. Industries
 * with fewer than `MIN_INDUSTRY_CHART_N` salaries are omitted (still counted
 * in `hiddenCount` so the UI can say how many were hidden).
 */
export function industryMedians(records: readonly SalaryRecord[]): IndustryBar[] {
  const groups = new Map<Industry, number[]>();
  for (const record of records) {
    const value = basisValue(record, 'grossMonthly');
    if (value === null) continue;
    const list = groups.get(record.industry);
    if (list) list.push(value);
    else groups.set(record.industry, [value]);
  }
  const bars: IndustryBar[] = [];
  for (const [industry, values] of groups) {
    if (values.length < MIN_INDUSTRY_CHART_N) continue;
    const sorted = values.slice().sort((a, b) => a - b);
    bars.push({ industry, n: sorted.length, median: quantileSorted(sorted, 0.5) });
  }
  return bars.sort((a, b) => b.median - a.median);
}

/** Industries that had at least one salary but were hidden for having too few. */
/** Salaries per industry (gross monthly basis), most first: also the ones below the chart's minimum. */
export function industryCounts(records: readonly SalaryRecord[]): Array<{ industry: Industry; n: number }> {
  const counts = new Map<Industry, number>();
  for (const record of records) {
    if (basisValue(record, 'grossMonthly') === null) continue;
    counts.set(record.industry, (counts.get(record.industry) ?? 0) + 1);
  }
  return [...counts.entries()].map(([industry, n]) => ({ industry, n })).sort((a, b) => b.n - a.n);
}

export function hiddenIndustryCount(records: readonly SalaryRecord[]): number {
  const groups = new Map<Industry, number>();
  for (const record of records) {
    if (basisValue(record, 'grossMonthly') === null) continue;
    groups.set(record.industry, (groups.get(record.industry) ?? 0) + 1);
  }
  let hidden = 0;
  for (const count of groups.values()) if (count < MIN_INDUSTRY_CHART_N) hidden += 1;
  return hidden;
}
