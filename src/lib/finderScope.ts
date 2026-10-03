// Localises the experience scope of a finder/benchmark match (see finder.ts)
// and the calculator's "your position" sentence. Kept separate from finder.ts
// so that module can stay English-only and unit tested against fixed
// strings, while the UI-facing text lives here and in the i18n dictionaries.
// Pure aside from the injected `t`; imported by Node tests.
import type { Lang, TranslateParams } from '../i18n/translate.ts';
import type { Filters } from './filters.ts';
import type { ExperienceMatch } from './finder.ts';
import { formatCount, formatDecimal, formatMoney } from './format.ts';
import { familyExampleTitles, familyLabel } from './roleFamilies.ts';
import type { RoleFamilyMatch } from './roleFamilies.ts';
import type { Position } from './stats.ts';
import { MIN_BENCHMARK_N } from './stats.ts';

export type Translate = (key: string, params?: TranslateParams) => string;

/** "3–7 years experience" / "all experience levels", localised. */
export function describeScope(match: ExperienceMatch, t: Translate): string {
  if (match.mode !== 'band' || match.range === null) return t('finder.scopeAllLevels');
  return t('finder.scopeExperienceBand', { min: formatDecimal(match.range.min), max: formatDecimal(match.range.max) });
}

/**
 * The role part of the finder's "Based on N salaries · …" scope line: the
 * merged family group (e.g. "Projektmanagement · umfasst …") when the query
 * resolved to one, else the plain query or "all roles".
 */
export function describeRoleScope(filters: Filters, familyMatch: RoleFamilyMatch | null, lang: Lang, t: Translate): string {
  if (familyMatch) {
    const family = familyMatch.families.map((f) => familyLabel(f, lang)).join(', ');
    const examples = familyExampleTitles(familyMatch.records).join(', ');
    const salaries = t('common.nEntriesTotal', { count: familyMatch.records.length, n: formatCount(familyMatch.records.length) });
    return t('finder.roleFamilyGroup', { family, examples, salaries });
  }
  const query = filters.query.trim();
  return query ? t('finder.scopeQuery', { query }) : t('finder.scopeAllRoles');
}

/** Explanation shown when the band had to be widened to find enough salaries; `null` when it did not. */
export function describeWidening(match: ExperienceMatch, t: Translate): string | null {
  if (!match.widened || match.years === null) return null;
  const years = t('common.nYears', { count: match.years, n: formatDecimal(match.years) });
  return t('finder.widenedBand', { min: String(MIN_BENCHMARK_N), years, halfWidth: String(match.halfWidth) });
}

/** A near-zero EUR difference (rounding noise) reads as "at the median" rather than "0 above the median". */
const AT_MEDIAN_THRESHOLD_EUR = 0.5;

/**
 * Plain-language sentence for where the visitor's salary falls among `n`
 * comparable salaries, e.g. "You earn more than 62% of 30 comparable
 * salaries: €350 (7%) above the median."
 */
/**
 * How the visitor typed their salary, so the sentence answers in that unit:
 * a net entry is compared with the estimated net median, not in gross.
 */
export type PositionUnit = {
  /** The visitor's figure as typed, e.g. "€ 3.800 netto/Monat" (default: the gross number). */
  salaryText?: string;
  /** Appended to the difference, e.g. " pro Jahr". */
  diffSuffix?: string;
  net?: boolean;
};

export function describePosition(position: Position, n: number, salary: number, t: Translate, unit: PositionUnit = {}): string {
  const salaryText = unit.salaryText ?? formatMoney(salary);
  const nText = formatCount(n);
  if (position.rank <= 0) return t('finder.positionBelowAll', { salary: salaryText, n: nText });
  if (position.rank >= 100) return t('finder.positionAboveAll', { salary: salaryText, n: nText });
  // Rounding noise, or a gap that would read "(0 %)": say "about the median".
  if (Math.abs(position.diff) < AT_MEDIAN_THRESHOLD_EUR || position.pctDiff < 0.5) return t('finder.positionAtMedian', { n: nText });
  return t(unit.net ? 'finder.positionRelativeNet' : 'finder.positionRelative', {
    rank: formatCount(Math.round(position.rank)),
    n: nText,
    diff: `${formatMoney(Math.abs(position.diff))}${unit.diffSuffix ?? ''}`,
    pct: formatCount(Math.round(position.pctDiff)),
    direction: position.diff > 0 ? t('finder.directionAbove') : t('finder.directionBelow'),
  });
}
