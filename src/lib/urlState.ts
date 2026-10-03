// Serialise the view (filters, basis, sort) to URL query params and back.
// Only non-default values are written, so the default view has a clean URL.
// The visitor's own salary is deliberately never part of the URL.
import { EMPLOYMENT_TYPES, INDUSTRIES, REGIONS, SALARY_KINDS, SALARY_SOURCES } from '../types.ts';
import { CONFIDENCE_LEVELS, DEFAULT_FILTERS, NOT_STATED, PERIODS } from './filters.ts';
import type { ConfidenceLevel, Filters, Period } from './filters.ts';
import { BASES, DEFAULT_BASIS } from './stats.ts';
import type { Basis } from './stats.ts';
import { DEFAULT_SORT, isSortKey } from './sort.ts';
import type { SortKey } from './sort.ts';

export type ViewState = { filters: Filters; basis: Basis; sort: SortKey };

export const DEFAULT_VIEW: ViewState = { filters: DEFAULT_FILTERS, basis: DEFAULT_BASIS, sort: DEFAULT_SORT };

const MAX_QUERY_LENGTH = 200;
const MAX_YEARS = 70;

function oneOf<T extends string>(list: readonly T[], value: string | null): T | '' {
  return value !== null && (list as readonly string[]).includes(value) ? (value as T) : '';
}

function parseYears(value: string | null): number | null {
  if (value === null || value.trim() === '') return null;
  const years = Number(value);
  return Number.isFinite(years) && years >= 0 && years <= MAX_YEARS ? years : null;
}

function parseConfidence(value: string | null): ConfidenceLevel {
  // Number('') is 0, so an empty param must not silently mean "any confidence".
  if (value === null || value.trim() === '') return DEFAULT_FILTERS.minConfidence;
  const level = CONFIDENCE_LEVELS.find((candidate) => candidate === Number(value));
  return level ?? DEFAULT_FILTERS.minConfidence;
}

export function parseViewState(search: string): ViewState {
  const params = new URLSearchParams(search);
  const region = params.get('region');
  const basis = params.get('basis');
  const sort = params.get('sort');
  const period = oneOf(PERIODS, params.get('period'));
  const filters: Filters = {
    query: (params.get('q') ?? '').slice(0, MAX_QUERY_LENGTH),
    industry: oneOf(INDUSTRIES, params.get('industry')),
    experience: parseYears(params.get('exp')),
    region: region === NOT_STATED ? NOT_STATED : oneOf(REGIONS, region),
    employmentType: oneOf(EMPLOYMENT_TYPES, params.get('type')),
    salaryKind: oneOf(SALARY_KINDS, params.get('kind')),
    salarySource: oneOf(SALARY_SOURCES, params.get('source')),
    collectiveAgreement: (params.get('kv') ?? '').trim().slice(0, MAX_QUERY_LENGTH),
    period: (period || DEFAULT_FILTERS.period) as Period,
    fullTimeOnly: params.has('fulltime') ? params.get('fulltime') !== '0' : DEFAULT_FILTERS.fullTimeOnly,
    verifiedOnly: params.has('verified') ? params.get('verified') === '1' : DEFAULT_FILTERS.verifiedOnly,
    minConfidence: parseConfidence(params.get('conf')),
  };
  return {
    filters,
    basis: oneOf(BASES, basis) || DEFAULT_BASIS,
    sort: sort !== null && isSortKey(sort) ? sort : DEFAULT_SORT,
  };
}

/** Query string without the leading "?"; empty for the default view. */
export function serializeViewState(view: ViewState): string {
  const f = view.filters;
  const params = new URLSearchParams();
  const query = f.query.trim();
  if (query) params.set('q', query);
  if (f.industry) params.set('industry', f.industry);
  if (f.experience !== null) params.set('exp', String(f.experience));
  if (f.region) params.set('region', f.region);
  if (f.employmentType) params.set('type', f.employmentType);
  if (f.salaryKind) params.set('kind', f.salaryKind);
  if (f.salarySource) params.set('source', f.salarySource);
  if (f.collectiveAgreement) params.set('kv', f.collectiveAgreement);
  if (f.period !== DEFAULT_FILTERS.period) params.set('period', f.period);
  if (f.fullTimeOnly !== DEFAULT_FILTERS.fullTimeOnly) params.set('fulltime', f.fullTimeOnly ? '1' : '0');
  if (f.verifiedOnly !== DEFAULT_FILTERS.verifiedOnly) params.set('verified', f.verifiedOnly ? '1' : '0');
  if (f.minConfidence !== DEFAULT_FILTERS.minConfidence) params.set('conf', String(f.minConfidence));
  if (view.basis !== DEFAULT_BASIS) params.set('basis', view.basis);
  if (view.sort !== DEFAULT_SORT) params.set('sort', view.sort);
  return params.toString();
}
