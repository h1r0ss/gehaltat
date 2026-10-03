// Filter state and matching. Pure functions, imported by Node tests.
import type {
  EmploymentType,
  Industry,
  Region,
  SalaryKind,
  SalaryRecord,
  SalarySource,
} from '../types.ts';

export type Period = 'all' | '12m' | '24m';
export const PERIODS: readonly Period[] = ['all', '12m', '24m'];

export const CONFIDENCE_LEVELS = [0, 0.5, 0.7, 0.85] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

/** Filter value for records whose region is `null`. */
export const NOT_STATED = 'none';
export type RegionFilter = Region | typeof NOT_STATED | '';

/** Inclusive range of years of experience; `max` may be Infinity. */
export type ExperienceRange = { min: number; max: number };

/**
 * `''` means "all" for the categorical filters. `query`, `industry` and
 * `experience` belong to the salary finder; the rest are "More filters".
 */
export type Filters = {
  query: string;
  industry: Industry | '';
  /**
   * Years of experience entered in the finder. Not applied by filterRecords():
   * matchExperience() in finder.ts turns it into a (widening) band.
   */
  experience: number | null;
  region: RegionFilter;
  employmentType: EmploymentType | '';
  salaryKind: SalaryKind | '';
  salarySource: SalarySource | '';
  /** A normalized Kollektivvertrag name (see data/collective-agreements.json). */
  collectiveAgreement: string;
  period: Period;
  /** Drop records with stated hours below FULL_TIME_MIN_HOURS; unknown hours stay in. */
  fullTimeOnly: boolean;
  /** Only records whose figures were all machine-checked (`figuresVerified`). */
  verifiedOnly: boolean;
  minConfidence: ConfidenceLevel;
};

export const DEFAULT_FILTERS: Filters = {
  query: '',
  industry: '',
  region: '',
  employmentType: '',
  salaryKind: '',
  salarySource: '',
  collectiveAgreement: '',
  experience: null,
  period: 'all',
  fullTimeOnly: true,
  verifiedOnly: false,
  minConfidence: 0.5,
};

export const FULL_TIME_MIN_HOURS = 35;

export type FilterContext = {
  /** YYYY-MM-DD date that "last N months" is measured from (the dataset snapshot date). */
  referenceDate: string;
  /** Resolved experience band; records with unknown experience never match it. */
  experienceRange?: ExperienceRange | null;
};

/** Lower-case, strip diacritics (ä → a) and fold ß → ss for forgiving search. */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss');
}

export function queryTokens(query: string): string[] {
  return normalizeText(query).split(/\s+/).filter(Boolean);
}

const searchTextCache = new WeakMap<SalaryRecord, string>();

/** Normalized text the role search runs against; cached per record object. */
export function searchTextOf(record: SalaryRecord): string {
  let text = searchTextCache.get(record);
  if (text === undefined) {
    text = normalizeText(
      [record.standardizedTitle, record.jobTitle, record.postTitle, record.collectiveAgreement ?? ''].join('\n'),
    );
    searchTextCache.set(record, text);
  }
  return text;
}

/** First included post date for a period, or null for "all time" / an invalid reference date. */
export function periodCutoff(period: Period, referenceDate: string): string | null {
  if (period === 'all') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(referenceDate);
  if (!match) return null;
  const months = period === '12m' ? 12 : 24;
  const cutoff = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 - months, Number(match[3])));
  return cutoff.toISOString().slice(0, 10);
}

export type FacetKey = 'industry' | 'region' | 'employmentType' | 'salaryKind' | 'salarySource' | 'collectiveAgreement';
export const FACET_KEYS: readonly FacetKey[] = ['industry', 'region', 'employmentType', 'salaryKind', 'salarySource', 'collectiveAgreement'];

type PreparedFilters = {
  filters: Filters;
  tokenTests: Array<(text: string) => boolean>;
  cutoff: string | null;
  experienceRange: ExperienceRange | null;
};

/** Tokens this short ("IT", "HR", "KV") must start a word: "it" finds "IT-Support" but not "Mitarbeiter". */
const SHORT_TOKEN = 3;

function tokenTest(token: string): (text: string) => boolean {
  if (token.length > SHORT_TOKEN) return (text) => text.includes(token);
  const wordStart = new RegExp(`(?:^|[^a-z0-9])${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
  return (text) => wordStart.test(text);
}

function prepare(filters: Filters, context: FilterContext): PreparedFilters {
  return {
    filters,
    tokenTests: queryTokens(filters.query).map(tokenTest),
    cutoff: periodCutoff(filters.period, context.referenceDate),
    experienceRange: context.experienceRange ?? null,
  };
}

export function inExperienceRange(years: number | null, range: ExperienceRange): boolean {
  return years !== null && years >= range.min && years <= range.max;
}

/**
 * Apprentice and intern pay is not a salary benchmark: those records count
 * only when that employment type is chosen explicitly.
 */
const TRAINEE_TYPES: ReadonlySet<EmploymentType> = new Set(['apprentice', 'intern']);

function matches(record: SalaryRecord, prepared: PreparedFilters, ignore?: FacetKey): boolean {
  const f = prepared.filters;
  if (ignore !== 'industry' && f.industry && record.industry !== f.industry) return false;
  if (ignore !== 'region' && f.region) {
    if (f.region === NOT_STATED ? record.region !== null : record.region !== f.region) return false;
  }
  if (ignore !== 'employmentType') {
    if (f.employmentType ? record.employmentType !== f.employmentType : TRAINEE_TYPES.has(record.employmentType)) return false;
  }
  if (ignore !== 'salaryKind' && f.salaryKind && record.salaryKind !== f.salaryKind) return false;
  if (ignore !== 'salarySource' && f.salarySource && record.salarySource !== f.salarySource) return false;
  if (ignore !== 'collectiveAgreement' && f.collectiveAgreement && record.collectiveAgreement !== f.collectiveAgreement) return false;
  if (record.confidence < f.minConfidence) return false;
  if (f.verifiedOnly && !record.figuresVerified) return false;
  if (f.fullTimeOnly && record.hoursPerWeek !== null && record.hoursPerWeek < FULL_TIME_MIN_HOURS) return false;
  if (prepared.experienceRange !== null && !inExperienceRange(record.experienceYears, prepared.experienceRange)) {
    return false;
  }
  if (prepared.cutoff !== null && record.postDate < prepared.cutoff) return false;
  if (prepared.tokenTests.length > 0) {
    const text = searchTextOf(record);
    for (const test of prepared.tokenTests) {
      if (!test(text)) return false;
    }
  }
  return true;
}

export function filterRecords(
  records: readonly SalaryRecord[],
  filters: Filters,
  context: FilterContext,
): SalaryRecord[] {
  const prepared = prepare(filters, context);
  return records.filter((record) => matches(record, prepared));
}

export type FacetCounts = Record<FacetKey, Map<string, number>>;

/**
 * For each categorical filter, how many records each option would yield given
 * all *other* active filters. Region `null` counts under NOT_STATED.
 */
export function computeFacetCounts(
  records: readonly SalaryRecord[],
  filters: Filters,
  context: FilterContext,
): FacetCounts {
  const prepared = prepare(filters, context);
  const result = {} as FacetCounts;
  for (const key of FACET_KEYS) {
    const counts = new Map<string, number>();
    for (const record of records) {
      if (!matches(record, prepared, key)) continue;
      const value = record[key] ?? NOT_STATED;
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    result[key] = counts;
  }
  return result;
}

/**
 * How many records each period option would yield given all *other* active
 * filters. The period is not a record field, so it has no entry in
 * computeFacetCounts(); this is its counterpart for the "Zeitraum" pill.
 */
export function computePeriodCounts(
  records: readonly SalaryRecord[],
  filters: Filters,
  context: FilterContext,
): Record<Period, number> {
  const result = { all: 0, '12m': 0, '24m': 0 } satisfies Record<Period, number>;
  for (const period of PERIODS) {
    const prepared = prepare({ ...filters, period }, context);
    for (const record of records) if (matches(record, prepared)) result[period] += 1;
  }
  return result;
}

/** True when every filter is at its default (a whitespace-only query counts as empty). */
export function isDefaultFilters(filters: Filters): boolean {
  return (Object.keys(DEFAULT_FILTERS) as Array<keyof Filters>).every((key) =>
    key === 'query' ? filters.query.trim() === DEFAULT_FILTERS.query : filters[key] === DEFAULT_FILTERS[key],
  );
}

/**
 * Number of filters active in the "Mehr Filter" drawer (employment type, salary
 * kind, salary source, collective agreement, machine-checked-only, minimum confidence) that differ
 * from the defaults. Role, industry, experience, region, period and
 * full-time-only live in the top filter bar instead and are not counted here.
 */
export function countActiveMoreFilters(filters: Filters): number {
  let count = 0;
  if (filters.employmentType) count += 1;
  if (filters.salaryKind) count += 1;
  if (filters.salarySource) count += 1;
  if (filters.collectiveAgreement) count += 1;
  if (filters.verifiedOnly !== DEFAULT_FILTERS.verifiedOnly) count += 1;
  if (filters.minConfidence !== DEFAULT_FILTERS.minConfidence) count += 1;
  return count;
}

/**
 * Resets only the "Mehr Filter" drawer fields (see countActiveMoreFilters) and
 * keeps everything else — the finder inputs as well as the top bar's region,
 * period and full-time-only, which the drawer does not show.
 */
export function resetMoreFilters(filters: Filters): Filters {
  return {
    ...filters,
    employmentType: DEFAULT_FILTERS.employmentType,
    salaryKind: DEFAULT_FILTERS.salaryKind,
    salarySource: DEFAULT_FILTERS.salarySource,
    collectiveAgreement: DEFAULT_FILTERS.collectiveAgreement,
    verifiedOnly: DEFAULT_FILTERS.verifiedOnly,
    minConfidence: DEFAULT_FILTERS.minConfidence,
  };
}
