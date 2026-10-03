// Runtime validation of public/data/salaries.json. The UI must not crash on a
// partially malformed file, so records are normalised field by field and
// unusable entries are dropped.
import { EMPLOYMENT_TYPES, INDUSTRIES, REGIONS, SALARY_KINDS, SALARY_SOURCES, SENIORITIES } from '../types.ts';
import type { Dataset, DerivedField, RoleFamily, SalaryRecord } from '../types.ts';

export class DatasetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatasetError';
  }
}

const DERIVED_FIELDS: readonly DerivedField[] = ['grossMonthly', 'grossAnnual', 'paymentsPerYear'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;
const IMAGE_PREFIX = /^\[image\]\s*/i;

type RawObject = Record<string, unknown>;

function isObject(value: unknown): value is RawObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function textOrNull(value: unknown): string | null {
  const result = text(value);
  return result === '' ? null : result;
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function positive(value: unknown): number | null {
  const result = finite(value);
  return result !== null && result > 0 ? result : null;
}

function nonNegative(value: unknown): number | null {
  const result = finite(value);
  return result !== null && result >= 0 ? result : null;
}

function member<T extends string>(list: readonly T[], value: unknown): T | null {
  return typeof value === 'string' && (list as readonly string[]).includes(value) ? (value as T) : null;
}

function isoDateOrNull(value: unknown): string | null {
  const result = text(value);
  return ISO_DATE.test(result) ? result.slice(0, 10) : null;
}

/** Only http(s) links are rendered; anything else (e.g. `javascript:`) is dropped. */
function safeUrl(value: unknown): string {
  try {
    const url = new URL(text(value));
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch {
    return '';
  }
}

/**
 * `validFamilyIds` lets callers (parseDataset) drop a reference to a role
 * family that is not actually listed in the dataset's `roleFamilies`; omitted,
 * any non-empty string is accepted (used when normalising a record in
 * isolation, e.g. in tests).
 */
export function normalizeRecord(raw: unknown, validFamilyIds?: ReadonlySet<string>): SalaryRecord | null {
  if (!isObject(raw)) return null;
  const id = text(raw.id) || text(raw.postId);
  if (!id) return null;
  const jobTitle = text(raw.jobTitle);
  const roleFamily = textOrNull(raw.roleFamily);
  return {
    id,
    postId: text(raw.postId) || id,
    sourceUrl: safeUrl(raw.sourceUrl),
    postDate: isoDateOrNull(raw.postDate) ?? '',
    postTitle: text(raw.postTitle),
    flair: textOrNull(raw.flair),
    upvotes: finite(raw.upvotes) ?? 0,
    numComments: finite(raw.numComments) ?? 0,
    jobTitle,
    standardizedTitle: text(raw.standardizedTitle) || jobTitle,
    roleFamily: roleFamily !== null && (validFamilyIds === undefined || validFamilyIds.has(roleFamily)) ? roleFamily : null,
    industry: member(INDUSTRIES, raw.industry) ?? 'Other',
    seniority: member(SENIORITIES, raw.seniority),
    experienceYears: nonNegative(raw.experienceYears),
    region: member(REGIONS, raw.region),
    hoursPerWeek: positive(raw.hoursPerWeek),
    employmentType: member(EMPLOYMENT_TYPES, raw.employmentType) ?? 'employee',
    salaryKind: member(SALARY_KINDS, raw.salaryKind) ?? 'current',
    paymentsPerYear: raw.paymentsPerYear === 12 ? 12 : 14,
    grossMonthly: positive(raw.grossMonthly),
    grossAnnual: positive(raw.grossAnnual),
    netMonthly: positive(raw.netMonthly),
    hourlyGross: positive(raw.hourlyGross),
    bonusAnnual: positive(raw.bonusAnnual),
    allIn: typeof raw.allIn === 'boolean' ? raw.allIn : null,
    collectiveAgreement: textOrNull(raw.collectiveAgreement),
    collectiveAgreementGroup: textOrNull(raw.collectiveAgreementGroup),
    salarySource: member(SALARY_SOURCES, raw.salarySource) ?? 'post',
    derived: Array.isArray(raw.derived)
      ? raw.derived.filter((field): field is DerivedField => member(DERIVED_FIELDS, field) !== null)
      : [],
    // Missing flag: treat as not machine-checked (the conservative reading).
    figuresVerified: raw.figuresVerified === true,
    evidence: Array.isArray(raw.evidence)
      ? raw.evidence.filter((snippet): snippet is string => typeof snippet === 'string' && snippet.trim() !== '')
      : [],
    confidence: Math.min(1, Math.max(0, finite(raw.confidence) ?? 0)),
    notes: text(raw.notes),
    notesDe: textOrNull(raw.notesDe),
  };
}

/** A family needs at least an id and an English label; malformed entries are dropped. */
function normalizeRoleFamily(raw: unknown): RoleFamily | null {
  if (!isObject(raw)) return null;
  const id = text(raw.id);
  const label = text(raw.label);
  if (!id || !label) return null;
  return {
    id,
    label,
    labelDe: text(raw.labelDe) || label,
    aliases: Array.isArray(raw.aliases)
      ? raw.aliases.filter((alias): alias is string => typeof alias === 'string' && alias.trim() !== '')
      : [],
  };
}

/** The dataset may not carry role families yet (data pipeline delivers them separately); `[]` is valid. */
function normalizeRoleFamilies(raw: unknown): RoleFamily[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const families: RoleFamily[] = [];
  for (const item of raw) {
    const family = normalizeRoleFamily(item);
    if (family === null || seen.has(family.id)) continue;
    seen.add(family.id);
    families.push(family);
  }
  return families;
}

export function parseDataset(raw: unknown): Dataset {
  // Messages are i18n keys (see src/i18n/en.ts / de.ts), translated where the UI renders them.
  if (!isObject(raw)) throw new DatasetError('dataset.notObject');
  if (!Array.isArray(raw.records)) throw new DatasetError('dataset.noRecords');

  const roleFamilies = normalizeRoleFamilies(raw.roleFamilies);
  const familyIds = new Set(roleFamilies.map((family) => family.id));

  const seen = new Set<string>();
  const records: SalaryRecord[] = [];
  for (const item of raw.records) {
    const record = normalizeRecord(item, familyIds);
    if (record === null || seen.has(record.id)) continue;
    seen.add(record.id);
    records.push(record);
  }

  const coverage: RawObject = isObject(raw.coverage) ? raw.coverage : {};
  const dates = records
    .map((record) => record.postDate)
    .filter(Boolean)
    .sort();

  return {
    generatedAt: text(raw.generatedAt),
    subreddit: text(raw.subreddit) || 'GehaltAT',
    roleFamilies,
    coverage: {
      postsCollected: nonNegative(coverage.postsCollected) ?? 0,
      commentsCollected: nonNegative(coverage.commentsCollected) ?? 0,
      postsWithSalary: nonNegative(coverage.postsWithSalary) ?? 0,
      // The number of records actually loaded is the honest count.
      records: records.length,
      firstPostDate: isoDateOrNull(coverage.firstPostDate) ?? dates[0] ?? null,
      lastPostDate: isoDateOrNull(coverage.lastPostDate) ?? dates[dates.length - 1] ?? null,
    },
    records,
  };
}

/** Date that "last N months" is measured from: the snapshot date, else today (UTC). */
export function referenceDateOf(dataset: Dataset, now: Date = new Date()): string {
  return isoDateOrNull(dataset.generatedAt) ?? now.toISOString().slice(0, 10);
}

export type EvidenceSnippet = { text: string; fromImage: boolean };

/** Snippets prefixed "[image] " were transcribed from a payslip image, not quoted from text. */
export function parseEvidence(snippet: string): EvidenceSnippet {
  const fromImage = IMAGE_PREFIX.test(snippet);
  return { text: (fromImage ? snippet.replace(IMAGE_PREFIX, '') : snippet).trim(), fromImage };
}
