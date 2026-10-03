import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { SalaryRecord } from '../src/types.ts';
import {
  DEFAULT_FILTERS,
  NOT_STATED,
  computeFacetCounts,
  computePeriodCounts,
  countActiveMoreFilters,
  filterRecords,
  isDefaultFilters,
  normalizeText,
  periodCutoff,
  resetMoreFilters,
} from '../src/lib/filters.ts';
import type { Filters } from '../src/lib/filters.ts';
import { paginate, sortRecords } from '../src/lib/sort.ts';
import { DEFAULT_VIEW, parseViewState, serializeViewState } from '../src/lib/urlState.ts';
import type { ViewState } from '../src/lib/urlState.ts';

const BASE: SalaryRecord = {
  id: 'r0',
  postId: 'r0',
  sourceUrl: 'https://www.reddit.com/r/GehaltAT/comments/r0/',
  postDate: '2026-06-01',
  postTitle: 'Gehalt als Entwickler in Wien',
  flair: null,
  upvotes: 0,
  numComments: 0,
  jobTitle: 'Softwareentwickler',
  standardizedTitle: 'Software Developer',
  roleFamily: null,
  industry: 'IT & Software',
  seniority: 'mid',
  experienceYears: 5,
  region: 'Vienna',
  hoursPerWeek: 38.5,
  employmentType: 'employee',
  salaryKind: 'current',
  paymentsPerYear: 14,
  grossMonthly: 4000,
  grossAnnual: 56000,
  netMonthly: 2700,
  hourlyGross: null,
  bonusAnnual: null,
  allIn: null,
  collectiveAgreement: null,
  salarySource: 'post',
  derived: [],
  figuresVerified: true,
  evidence: [],
  confidence: 0.9,
  notes: '',
  notesDe: null,
  collectiveAgreementGroup: null,
};

let nextId = 1;
function record(overrides: Partial<SalaryRecord> = {}): SalaryRecord {
  const id = `r${nextId++}`;
  return { ...BASE, id, postId: id, ...overrides };
}

const CONTEXT = { referenceDate: '2026-09-25' };
/** Neutral filters: nothing active, so single filters can be tested in isolation. */
const NONE: Filters = { ...DEFAULT_FILTERS, fullTimeOnly: false, minConfidence: 0 };

function ids(records: SalaryRecord[]): string[] {
  return records.map((r) => r.id);
}

function run(records: SalaryRecord[], patch: Partial<Filters>): string[] {
  return ids(filterRecords(records, { ...NONE, ...patch }, CONTEXT));
}

describe('text normalisation', () => {
  test('is case- and diacritics-insensitive and folds ß', () => {
    assert.equal(normalizeText('Notfallsanitäter'), 'notfallsanitater');
    assert.equal(normalizeText('ÖSTERREICH'), 'osterreich');
    assert.equal(normalizeText('Straße'), 'strasse');
  });
});

describe('role search', () => {
  const developer = record();
  const paramedic = record({
    jobTitle: 'Notfallsanitäter',
    standardizedTitle: 'Paramedic',
    postTitle: 'Rettungsdienst OÖ',
    industry: 'Healthcare & Social',
  });
  const agreement = record({
    jobTitle: 'Programmierer',
    standardizedTitle: 'Programmer',
    postTitle: 'Frage',
    collectiveAgreement: 'IT-KV',
  });
  const records = [developer, paramedic, agreement];

  test('matches standardized title, job title, post title and collective agreement', () => {
    assert.deepEqual(run(records, { query: 'software' }), [developer.id]);
    assert.deepEqual(run(records, { query: 'rettungsdienst' }), [paramedic.id]);
    assert.deepEqual(run(records, { query: 'it-kv' }), [agreement.id]);
    assert.deepEqual(run(records, { query: 'wien' }), [developer.id]);
  });

  test('ignores case and diacritics in both directions', () => {
    assert.deepEqual(run(records, { query: 'notfallsanitater' }), [paramedic.id]);
    assert.deepEqual(run(records, { query: 'SANITÄTER' }), [paramedic.id]);
  });

  test('requires every word to match, in any order', () => {
    assert.deepEqual(run(records, { query: 'developer software' }), [developer.id]);
    assert.deepEqual(run(records, { query: 'developer paramedic' }), []);
    assert.deepEqual(run(records, { query: '   ' }), ids(records));
  });

  test('words of up to three letters must start a word, longer ones may sit inside one', () => {
    const support = record({ jobTitle: 'IT-Support', standardizedTitle: 'IT Support', postTitle: 'Gehalt' });
    const staff = record({ jobTitle: 'Mitarbeiter', standardizedTitle: 'Staff', postTitle: 'Gehalt' });
    const pool = [support, staff];
    assert.deepEqual(run(pool, { query: 'it' }), [support.id], '"it" must not match the "it" inside "Mitarbeiter"');
    assert.deepEqual(run(pool, { query: 'sup' }), [support.id], 'a short word still matches while typing');
    assert.deepEqual(run(pool, { query: 'arbeiter' }), [staff.id]);
  });
});

describe('categorical filters', () => {
  test('industry', () => {
    const it = record();
    const legal = record({ industry: 'Legal' });
    assert.deepEqual(run([it, legal], { industry: 'Legal' }), [legal.id]);
  });

  test('region, including "not stated"', () => {
    const vienna = record({ region: 'Vienna' });
    const tyrol = record({ region: 'Tyrol' });
    const unknown = record({ region: null });
    assert.deepEqual(run([vienna, tyrol, unknown], { region: 'Tyrol' }), [tyrol.id]);
    assert.deepEqual(run([vienna, tyrol, unknown], { region: NOT_STATED }), [unknown.id]);
  });

  test('employment type, salary kind and salary source', () => {
    const a = record({ employmentType: 'freelancer', salaryKind: 'offer', salarySource: 'image' });
    const b = record({ employmentType: 'employee', salaryKind: 'current', salarySource: 'comment' });
    assert.deepEqual(run([a, b], { employmentType: 'employee' }), [b.id]);
    assert.deepEqual(run([a, b], { salaryKind: 'offer' }), [a.id]);
    assert.deepEqual(run([a, b], { salarySource: 'comment' }), [b.id]);
  });

  test('collective agreement matches the normalized name', () => {
    const it = record({ collectiveAgreement: 'IT-KV', collectiveAgreementGroup: 'ST2' });
    const trade = record({ collectiveAgreement: 'Handel' });
    const none = record({ collectiveAgreement: null });
    assert.deepEqual(run([it, trade, none], { collectiveAgreement: 'IT-KV' }), [it.id]);
    assert.equal(countActiveMoreFilters({ ...DEFAULT_FILTERS, collectiveAgreement: 'Handel' }), 1);
  });

  test('apprentices and interns count only when that employment type is chosen', () => {
    const apprentice = record({ employmentType: 'apprentice' });
    const intern = record({ employmentType: 'intern' });
    const employee = record({ employmentType: 'employee' });
    const pool = [apprentice, intern, employee];
    assert.deepEqual(run(pool, {}), [employee.id]);
    assert.deepEqual(run(pool, { employmentType: 'apprentice' }), [apprentice.id]);
    assert.deepEqual(run(pool, { employmentType: 'intern' }), [intern.id]);
  });
});

describe('numeric and date filters', () => {
  test('the finder experience value is not applied by filterRecords itself', () => {
    const junior = record({ experienceYears: 1 });
    const unknown = record({ experienceYears: null });
    assert.deepEqual(run([junior, unknown], { experience: 12 }), [junior.id, unknown.id]);
  });

  test('an experience range in the context is inclusive and excludes unknown experience', () => {
    const junior = record({ experienceYears: 1 });
    const mid = record({ experienceYears: 4 });
    const senior = record({ experienceYears: 12 });
    const unknown = record({ experienceYears: null });
    const all = [junior, mid, senior, unknown];
    const within = (min: number, max: number) =>
      ids(filterRecords(all, NONE, { ...CONTEXT, experienceRange: { min, max } }));
    assert.deepEqual(within(1, 4), [junior.id, mid.id]);
    assert.deepEqual(within(4, Infinity), [mid.id, senior.id]);
    assert.deepEqual(within(0, Infinity), [junior.id, mid.id, senior.id]);
  });

  test('period cutoff is measured from the reference date', () => {
    assert.equal(periodCutoff('all', '2026-09-25'), null);
    assert.equal(periodCutoff('12m', '2026-09-25'), '2025-09-25');
    assert.equal(periodCutoff('24m', '2026-09-25'), '2024-09-25');
    assert.equal(periodCutoff('12m', 'not a date'), null);

    const recent = record({ postDate: '2026-01-10' });
    const onCutoff = record({ postDate: '2025-09-25' });
    const older = record({ postDate: '2025-09-24' });
    const oldest = record({ postDate: '2023-01-01' });
    const all = [recent, onCutoff, older, oldest];
    assert.deepEqual(run(all, { period: '12m' }), [recent.id, onCutoff.id]);
    assert.deepEqual(run(all, { period: '24m' }), [recent.id, onCutoff.id, older.id]);
    assert.deepEqual(run(all, { period: 'all' }), ids(all));
  });

  test('full-time only drops stated part-time hours but keeps unknown hours', () => {
    const fullTime = record({ hoursPerWeek: 38.5 });
    const threshold = record({ hoursPerWeek: 35 });
    const partTime = record({ hoursPerWeek: 20 });
    const justBelow = record({ hoursPerWeek: 34.9 });
    const unknown = record({ hoursPerWeek: null });
    const all = [fullTime, threshold, partTime, justBelow, unknown];
    assert.deepEqual(run(all, { fullTimeOnly: true }), [fullTime.id, threshold.id, unknown.id]);
    assert.deepEqual(run(all, { fullTimeOnly: false }), ids(all));
  });

  test('minimum confidence is inclusive', () => {
    const low = record({ confidence: 0.49 });
    const edge = record({ confidence: 0.5 });
    const high = record({ confidence: 0.9 });
    assert.deepEqual(run([low, edge, high], { minConfidence: 0.5 }), [edge.id, high.id]);
    assert.deepEqual(run([low, edge, high], { minConfidence: 0.85 }), [high.id]);
    assert.deepEqual(run([low, edge, high], { minConfidence: 0 }), [low.id, edge.id, high.id]);
  });

  test('machine-checked only keeps records whose figures were all verified', () => {
    assert.equal(DEFAULT_FILTERS.verifiedOnly, false, 'the filter must be off by default');
    const checked = record({ figuresVerified: true });
    const fromImage = record({ figuresVerified: false, salarySource: 'image', confidence: 0.8 });
    assert.deepEqual(run([checked, fromImage], {}), [checked.id, fromImage.id]);
    assert.deepEqual(run([checked, fromImage], { verifiedOnly: true }), [checked.id]);
  });

  test('defaults: full-time only and confidence ≥ 0.5 are active', () => {
    const partTime = record({ hoursPerWeek: 20 });
    const reviewOnly = record({ confidence: 0.1 });
    const normal = record();
    assert.deepEqual(ids(filterRecords([partTime, reviewOnly, normal], DEFAULT_FILTERS, CONTEXT)), [normal.id]);
  });
});

describe('facets, suggestions and active filter count', () => {
  test('facet counts ignore their own filter but apply the others', () => {
    const a = record({ industry: 'IT & Software', region: 'Vienna' });
    const b = record({ industry: 'IT & Software', region: 'Vienna' });
    const c = record({ industry: 'IT & Software', region: null });
    const d = record({ industry: 'Legal', region: 'Vienna' });
    const facets = computeFacetCounts([a, b, c, d], { ...NONE, industry: 'IT & Software' }, CONTEXT);
    assert.equal(facets.industry.get('IT & Software'), 3);
    assert.equal(facets.industry.get('Legal'), 1);
    assert.equal(facets.region.get('Vienna'), 2);
    assert.equal(facets.region.get(NOT_STATED), 1);
  });

  test('period counts apply every other filter but not the period itself', () => {
    const recent = record({ postDate: '2026-03-01', region: 'Vienna' });
    const lastYear = record({ postDate: '2025-11-01', region: 'Vienna' });
    const old = record({ postDate: '2024-12-01', region: 'Vienna' });
    const ancient = record({ postDate: '2023-01-01', region: 'Vienna' });
    const elsewhere = record({ postDate: '2026-03-01', region: 'Tyrol' });
    const all = [recent, lastYear, old, ancient, elsewhere];
    // The selected period must not influence the counts: a 12-month view still reports the other options.
    for (const period of ['all', '12m', '24m'] as const) {
      assert.deepEqual(computePeriodCounts(all, { ...NONE, period }, CONTEXT), { all: 5, '12m': 3, '24m': 4 });
    }
    assert.deepEqual(computePeriodCounts(all, { ...NONE, region: 'Vienna' }, CONTEXT), { all: 4, '12m': 2, '24m': 3 });
    assert.deepEqual(computePeriodCounts([], NONE, CONTEXT), { all: 0, '12m': 0, '24m': 0 });
  });

  test('period counts respect the experience band from the context', () => {
    const inBand = record({ experienceYears: 4, postDate: '2026-03-01' });
    const outside = record({ experienceYears: 15, postDate: '2026-03-01' });
    const unknown = record({ experienceYears: null, postDate: '2026-03-01' });
    const counts = computePeriodCounts([inBand, outside, unknown], NONE, {
      ...CONTEXT,
      experienceRange: { min: 2, max: 6 },
    });
    assert.deepEqual(counts, { all: 1, '12m': 1, '24m': 1 });
  });

  test('"More filters" (the drawer) are counted against the defaults; the top bar and finder inputs are not', () => {
    assert.equal(countActiveMoreFilters(DEFAULT_FILTERS), 0);
    assert.equal(countActiveMoreFilters({ ...DEFAULT_FILTERS, query: 'nurse', experience: 4, industry: 'Legal' }), 0);
    // region, period and fullTimeOnly live in the top filter bar, not the drawer.
    assert.equal(countActiveMoreFilters({ ...DEFAULT_FILTERS, region: 'Tyrol', fullTimeOnly: false, period: '12m' }), 0);
    assert.equal(countActiveMoreFilters({ ...DEFAULT_FILTERS, employmentType: 'freelancer', verifiedOnly: true }), 2);
    assert.equal(countActiveMoreFilters({ ...DEFAULT_FILTERS, salaryKind: 'offer', minConfidence: 0.85 }), 2);
  });

  test('isDefaultFilters compares every filter with its default and ignores a blank query', () => {
    assert.equal(isDefaultFilters(DEFAULT_FILTERS), true);
    assert.equal(isDefaultFilters({ ...DEFAULT_FILTERS, query: '   ' }), true);
    assert.equal(isDefaultFilters({ ...DEFAULT_FILTERS, query: 'nurse' }), false);
    assert.equal(isDefaultFilters({ ...DEFAULT_FILTERS, experience: 0 }), false);
    // Turning off a filter that is on by default is a change too.
    assert.equal(isDefaultFilters({ ...DEFAULT_FILTERS, fullTimeOnly: false }), false);
    assert.equal(isDefaultFilters({ ...DEFAULT_FILTERS, minConfidence: 0.85 }), false);
    assert.equal(isDefaultFilters({ ...DEFAULT_FILTERS, region: 'Tyrol' }), false);
  });

  test('resetting "More filters" keeps the finder inputs and the top bar filters', () => {
    const reset = resetMoreFilters({
      ...DEFAULT_FILTERS,
      query: 'nurse',
      industry: 'Healthcare & Social',
      experience: 4,
      region: 'Tyrol',
      fullTimeOnly: false,
      verifiedOnly: true,
      salarySource: 'image',
    });
    assert.deepEqual(reset, {
      ...DEFAULT_FILTERS,
      query: 'nurse',
      industry: 'Healthcare & Social',
      experience: 4,
      region: 'Tyrol',
      fullTimeOnly: false,
    });
  });
});

describe('sorting and pagination', () => {
  const a = record({ postDate: '2026-05-01', grossMonthly: 3000, experienceYears: 2 });
  const b = record({ postDate: '2026-06-01', grossMonthly: null, experienceYears: null });
  const c = record({ postDate: '2026-04-01', grossMonthly: 5000, experienceYears: 10 });
  const records = [a, b, c];

  test('default sort is newest first', () => {
    assert.deepEqual(ids(sortRecords(records, 'date-desc')), [b.id, a.id, c.id]);
    assert.deepEqual(ids(sortRecords(records, 'date-asc')), [c.id, a.id, b.id]);
  });

  test('missing values sort last in both directions', () => {
    assert.deepEqual(ids(sortRecords(records, 'gross-desc')), [c.id, a.id, b.id]);
    assert.deepEqual(ids(sortRecords(records, 'gross-asc')), [a.id, c.id, b.id]);
    assert.deepEqual(ids(sortRecords(records, 'experience-asc')), [a.id, c.id, b.id]);
  });

  test('sorting does not mutate the input', () => {
    sortRecords(records, 'gross-desc');
    assert.deepEqual(ids(records), [a.id, b.id, c.id]);
  });

  test('pagination clamps the page and reports the visible range', () => {
    const items = Array.from({ length: 120 }, (_, i) => i);
    const last = paginate(items, 3, 50);
    assert.equal(last.pageCount, 3);
    assert.equal(last.items.length, 20);
    assert.equal(last.start, 101);
    assert.equal(last.end, 120);
    assert.equal(paginate(items, 99, 50).page, 3);
    assert.equal(paginate(items, 0, 50).page, 1);
    const empty = paginate([], 1, 50);
    assert.equal(empty.pageCount, 1);
    assert.equal(empty.start, 0);
    assert.equal(empty.end, 0);
  });
});

describe('URL state', () => {
  test('the default view has an empty query string and parses back to defaults', () => {
    assert.equal(serializeViewState(DEFAULT_VIEW), '');
    assert.deepEqual(parseViewState(''), DEFAULT_VIEW);
  });

  test('round-trips every filter, the basis and the sort', () => {
    const view: ViewState = {
      filters: {
        query: 'Sanitäter & Co',
        industry: 'Healthcare & Social',
        region: NOT_STATED,
        employmentType: 'civil_servant',
        salaryKind: 'offer',
        salarySource: 'image',
        collectiveAgreement: 'Sozialwirtschaft (SWÖ)',
        experience: 3.5,
        period: '24m',
        fullTimeOnly: false,
        verifiedOnly: true,
        minConfidence: 0.85,
      },
      basis: 'netMonthly',
      sort: 'gross-asc',
    };
    const search = serializeViewState(view);
    assert.match(search, /verified=1/);
    assert.match(search, /fulltime=0/);
    assert.deepEqual(parseViewState(`?${search}`), view);
  });

  test('invalid values fall back to the defaults', () => {
    const view = parseViewState(
      '?industry=Mining&region=Atlantis&seniority=guru&conf=0.3&basis=gross&sort=random&exp=-1&period=5y',
    );
    assert.deepEqual(view, DEFAULT_VIEW);
  });

  test('non-numeric experience is ignored', () => {
    assert.equal(parseViewState('?exp=abc').filters.experience, null);
    assert.equal(parseViewState('?exp=').filters.experience, null);
    assert.equal(parseViewState('?exp=7').filters.experience, 7);
  });

  test('an empty confidence param keeps the default instead of meaning "any"', () => {
    assert.equal(parseViewState('?conf=').filters.minConfidence, DEFAULT_FILTERS.minConfidence);
    assert.equal(parseViewState('?conf=0').filters.minConfidence, 0);
  });

  test('an old seniority param (removed filter) is ignored, even a value that used to be valid', () => {
    assert.deepEqual(parseViewState('?seniority=lead').filters, DEFAULT_FILTERS);
    assert.deepEqual(parseViewState('?seniority=lead&region=Tyrol').filters, { ...DEFAULT_FILTERS, region: 'Tyrol' });
  });
});
