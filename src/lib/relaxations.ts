// Recovery from dead ends: when the benchmark has fewer than MIN_BENCHMARK_N
// salaries, which single filter change brings it back to a usable size?
// Every candidate is evaluated with the pipeline the result card uses
// (benchmark.ts), so the count promised on a suggestion is exactly what the
// card shows after the click. Pure; imported by Node tests.
import type { RoleFamily, SalaryRecord } from '../types.ts';
import { evaluateBenchmark } from './benchmark.ts';
import { DEFAULT_FILTERS, countActiveMoreFilters } from './filters.ts';
import type { FilterContext, Filters } from './filters.ts';
import { MIN_BENCHMARK_N } from './stats.ts';

export type RelaxationId = 'region' | 'industry' | 'experience' | 'fullTime' | 'period' | 'advanced';

export type Relaxation = {
  id: RelaxationId;
  /** The filter fields this suggestion changes: apply it with a plain merge. */
  patch: Partial<Filters>;
  /** Gross-monthly salaries in the benchmark once applied: the "n" of the result card. */
  count: number;
};

/** At most this many suggestions are offered. */
export const MAX_RELAXATIONS = 3;

type Candidate = {
  id: RelaxationId;
  /** Only filters that are actually narrowing the result can be relaxed. */
  applies: (filters: Filters) => boolean;
  patch: Partial<Filters>;
};

/** In priority order: it breaks ties between suggestions that reach the same count. */
const CANDIDATES: readonly Candidate[] = [
  { id: 'region', applies: (f) => f.region !== DEFAULT_FILTERS.region, patch: { region: DEFAULT_FILTERS.region } },
  { id: 'industry', applies: (f) => f.industry !== DEFAULT_FILTERS.industry, patch: { industry: DEFAULT_FILTERS.industry } },
  {
    id: 'experience',
    applies: (f) => f.experience !== null,
    patch: { experience: DEFAULT_FILTERS.experience },
  },
  {
    id: 'fullTime',
    applies: (f) => f.fullTimeOnly,
    patch: { fullTimeOnly: false },
  },
  { id: 'period', applies: (f) => f.period !== DEFAULT_FILTERS.period, patch: { period: DEFAULT_FILTERS.period } },
  {
    id: 'advanced',
    applies: (f) => countActiveMoreFilters(f) > 0,
    // The "Mehr Filter" drawer fields, as resetMoreFilters() defines them.
    patch: {
      employmentType: DEFAULT_FILTERS.employmentType,
      salaryKind: DEFAULT_FILTERS.salaryKind,
      salarySource: DEFAULT_FILTERS.salarySource,
      collectiveAgreement: DEFAULT_FILTERS.collectiveAgreement,
      verifiedOnly: DEFAULT_FILTERS.verifiedOnly,
      minConfidence: DEFAULT_FILTERS.minConfidence,
    },
  },
];

export type RelaxationInput = {
  records: readonly SalaryRecord[];
  roleFamilies: readonly RoleFamily[];
  filters: Filters;
  context: FilterContext;
};

/**
 * Up to `limit` one-click suggestions, best first. Empty when the current
 * benchmark already has enough salaries. Only suggestions that reach
 * MIN_BENCHMARK_N are kept, ordered by the count they would give.
 */
export function computeRelaxations(input: RelaxationInput, limit: number = MAX_RELAXATIONS): Relaxation[] {
  const { records, roleFamilies, filters, context } = input;
  const countFor = (candidate: Filters) => evaluateBenchmark(records, roleFamilies, candidate, context).gross.values.length;
  if (countFor(filters) >= MIN_BENCHMARK_N) return [];

  const found: Relaxation[] = [];
  for (const candidate of CANDIDATES) {
    if (!candidate.applies(filters)) continue;
    const count = countFor({ ...filters, ...candidate.patch });
    if (count >= MIN_BENCHMARK_N) found.push({ id: candidate.id, patch: { ...candidate.patch }, count });
  }
  // Array.prototype.sort is stable: equal counts keep the candidate order above.
  return found.sort((a, b) => b.count - a.count).slice(0, limit);
}
