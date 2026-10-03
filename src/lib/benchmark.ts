// The one pipeline that turns a set of filters into the headline benchmark:
// role-family scoping -> filters -> the finder's experience band -> gross
// monthly values. App.tsx renders its result from it and relaxations.ts runs
// it once per candidate, so a suggested "-> 9 salaries" can never disagree
// with what the result card shows after the click. Pure; imported by Node tests.
import type { Lang } from '../i18n/translate.ts';
import type { RoleFamily, SalaryRecord } from '../types.ts';
import { filterRecords } from './filters.ts';
import type { FilterContext, Filters } from './filters.ts';
import { matchExperience } from './finder.ts';
import type { ExperienceMatch } from './finder.ts';
import { familyLabel, resolveRoleFamilyQuery } from './roleFamilies.ts';
import type { RoleFamilyMatch } from './roleFamilies.ts';
import { MIN_BENCHMARK_N, median, selectBasis } from './stats.ts';
import type { BasisSelection } from './stats.ts';

export type BenchmarkEvaluation = {
  /** The role family the query resolved to, or `null` when the plain substring search applies. */
  familyMatch: RoleFamilyMatch | null;
  /** Records the filters run on: the family's records, or all records. */
  baseRecords: readonly SalaryRecord[];
  /**
   * The filters as applied. A resolved family scopes the records itself, so the
   * free-text query is cleared; otherwise it would also filter those records by
   * whether the query literally appears in their own title.
   */
  effectiveFilters: Filters;
  /** After every filter, before the experience band ("all experience levels"). */
  allLevels: SalaryRecord[];
  /** After the experience band (widened when too few salaries match). */
  match: ExperienceMatch;
  /** Gross-monthly values of `match.records`: its length is the "n" the result card shows. */
  gross: BasisSelection;
};

export function evaluateBenchmark(
  records: readonly SalaryRecord[],
  roleFamilies: readonly RoleFamily[],
  filters: Filters,
  context: FilterContext,
): BenchmarkEvaluation {
  const familyMatch = resolveRoleFamilyQuery(roleFamilies, records, filters.query);
  const baseRecords = familyMatch ? familyMatch.records : records;
  const effectiveFilters = familyMatch ? { ...filters, query: '' } : filters;
  const allLevels = filterRecords(baseRecords, effectiveFilters, context);
  const match = matchExperience(allLevels, filters.experience);
  const gross = selectBasis(match.records, 'grossMonthly');
  return { familyMatch, baseRecords, effectiveFilters, allLevels, match, gross };
}

/** One role group's own benchmark under the current filters, for "pick a group" choices. */
export type GroupBenchmark = {
  family: RoleFamily;
  label: string;
  /** Gross-monthly salaries the group's benchmark would use (the card's "n"). */
  n: number;
  /** `null` below MIN_BENCHMARK_N, like the result card. */
  median: number | null;
};

/**
 * Each family's benchmark as if its label had been searched: an ambiguous
 * query ("Berater") is offered as separate groups instead of one median
 * pooled across unrelated jobs. Most salaries first.
 */
export function groupBenchmarks(
  records: readonly SalaryRecord[],
  roleFamilies: readonly RoleFamily[],
  families: readonly RoleFamily[],
  filters: Filters,
  context: FilterContext,
  lang: Lang,
): GroupBenchmark[] {
  return families
    .map((family) => {
      const label = familyLabel(family, lang);
      const { gross } = evaluateBenchmark(records, roleFamilies, { ...filters, query: label }, context);
      const n = gross.values.length;
      return { family, label, n, median: n >= MIN_BENCHMARK_N ? median(gross.values) : null };
    })
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, lang));
}
