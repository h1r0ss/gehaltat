// Salary finder: "I have N years of experience in field X - what do people earn?"
// Turns the entered years into an experience band that widens automatically
// until enough salaries match. It never drops the entered experience: when
// even the widest band has too few salaries, the caller reports "too few"
// (and offers "all experience levels" as an explicit choice) instead of
// silently comparing with juniors and seniors alike. Pure functions, imported
// by Node tests.
import type { SalaryRecord } from '../types.ts';
import { inExperienceRange } from './filters.ts';
import type { ExperienceRange } from './filters.ts';
import { formatDecimal } from './format.ts';
import { MIN_BENCHMARK_N } from './stats.ts';

/** Half-widths tried in order: ±2, ±4, then ±8 years. */
export const EXPERIENCE_HALF_WIDTHS: readonly number[] = [2, 4, 8];

export type ExperienceMatchMode = 'any' | 'band';

export type ExperienceMatch = {
  /**
   * any: no experience entered, every record stays in (including unknown experience).
   * band: records within `range` (±2, widened to ±4 or ±8). The widest band
   * is returned even when it still holds fewer than the minimum.
   */
  mode: ExperienceMatchMode;
  years: number | null;
  halfWidth: number | null;
  range: ExperienceRange | null;
  widened: boolean;
  records: SalaryRecord[];
  /** Matched records that count towards the minimum (see `isUsable`). */
  usable: number;
};

/**
 * Band of ±halfWidth years around `years`, clamped at 0. Near zero the upper
 * end is kept at halfWidth + 1 so that 0 and 1 years both give 0–3 (±2).
 */
export function bandAround(years: number, halfWidth: number): ExperienceRange {
  return { min: Math.max(0, years - halfWidth), max: Math.max(years + halfWidth, halfWidth + 1) };
}

/** Default usability test: the headline benchmark is gross monthly, so a salary must state it. */
export function hasGrossMonthly(record: SalaryRecord): boolean {
  return record.grossMonthly !== null;
}

function countUsable(records: readonly SalaryRecord[], isUsable: (record: SalaryRecord) => boolean): number {
  let count = 0;
  for (const record of records) if (isUsable(record)) count += 1;
  return count;
}

/**
 * Applies the finder's experience input. Tries ±2, ±4 and ±8 years and keeps
 * the first band with at least `minMatches` usable salaries, else the widest
 * one. Records with unknown experience are excluded whenever experience is
 * entered.
 */
export function matchExperience(
  records: readonly SalaryRecord[],
  years: number | null,
  isUsable: (record: SalaryRecord) => boolean = hasGrossMonthly,
  minMatches: number = MIN_BENCHMARK_N,
): ExperienceMatch {
  if (years === null || !Number.isFinite(years) || years < 0) {
    const all = records.slice();
    return {
      mode: 'any',
      years: null,
      halfWidth: null,
      range: null,
      widened: false,
      records: all,
      usable: countUsable(all, isUsable),
    };
  }

  const known = records.filter((record) => record.experienceYears !== null);
  let widest: ExperienceMatch | null = null;
  for (const [index, halfWidth] of EXPERIENCE_HALF_WIDTHS.entries()) {
    const range = bandAround(years, halfWidth);
    const matched = known.filter((record) => inExperienceRange(record.experienceYears, range));
    const usable = countUsable(matched, isUsable);
    widest = { mode: 'band', years, halfWidth, range, widened: index > 0, records: matched, usable };
    if (usable >= minMatches) return widest;
  }
  return widest!;
}

/** Short label for the experience scope, e.g. "3–7 years experience". */
export function describeExperience(match: ExperienceMatch): string {
  if (match.mode !== 'band' || match.range === null) return 'all experience levels';
  return `${formatDecimal(match.range.min)}–${formatDecimal(match.range.max)} years experience`;
}

/** Explanation shown when the band had to be widened; `null` when it did not. */
export function describeWidening(match: ExperienceMatch): string | null {
  if (!match.widened || match.years === null) return null;
  const entered = `${formatDecimal(match.years)} ${match.years === 1 ? 'year' : 'years'}`;
  return `Fewer than ${MIN_BENCHMARK_N} salaries within ±2 years of ${entered}, so the band was widened to ±${match.halfWidth} years.`;
}
