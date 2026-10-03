import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { Dataset, RoleFamily, SalaryRecord } from './types.ts';
import { evaluateBenchmark, groupBenchmarks } from './lib/benchmark.ts';
import { DatasetError, parseDataset, referenceDateOf } from './lib/dataset.ts';
import {
  DEFAULT_FILTERS,
  computeFacetCounts,
  computePeriodCounts,
  countActiveMoreFilters,
  filterRecords,
  resetMoreFilters,
} from './lib/filters.ts';
import type { FilterContext, Filters } from './lib/filters.ts';
import { DEFAULT_SALARY_INPUT, resolveGrossMonthly } from './lib/calculator.ts';
import type { SalaryInput } from './lib/calculator.ts';
import { describeScope } from './lib/finderScope.ts';
import { formatCount, formatDate, formatMoney, roundToSample } from './lib/format.ts';
import { computeRelaxations } from './lib/relaxations.ts';
import { roleFamilySuggestions, suggestSimilarFamilies } from './lib/roleFamilies.ts';
import { LOAD_MORE_STEP, sortRecords } from './lib/sort.ts';
import type { SortKey } from './lib/sort.ts';
import { MIN_BENCHMARK_N, percentileRank, roundSummary, summarizeSorted } from './lib/stats.ts';
import type { Basis } from './lib/stats.ts';
import { parseViewState, serializeViewState } from './lib/urlState.ts';
import { ActiveFilters } from './components/ActiveFilters.tsx';
import { ChartsCard } from './components/ChartsCard.tsx';
import { FilterBar } from './components/FilterBar.tsx';
import { Finder } from './components/Finder.tsx';
import { Footer } from './components/Footer.tsx';
import { Header } from './components/Header.tsx';
import { Methodology } from './components/Methodology.tsx';
import { MoreFiltersDrawer } from './components/MoreFiltersDrawer.tsx';
import { RecordsList } from './components/RecordsList.tsx';
import { ResultCard } from './components/ResultCard.tsx';
import { ResultPeek } from './components/ResultPeek.tsx';
import { RightRail } from './components/RightRail.tsx';
import { EmptyDatasetPanel, ErrorPanel, LoadingPanel } from './components/StatusPanel.tsx';
import { useI18n } from './i18n/context.tsx';
import type { TranslateParams } from './i18n/context.tsx';

const DATA_URL = `${import.meta.env.BASE_URL}data/salaries.json`;
const URL_SYNC_DELAY_MS = 250;
const BENCHMARK_ID = 'distribution';
const RECORDS_ID = 'entries';
const MORE_FILTERS_ID = 'more-filters';
const EMPTY_RECORDS: SalaryRecord[] = [];
const EMPTY_ROLE_FAMILIES: RoleFamily[] = [];

/** Carries an i18n key (+ params) instead of a fixed-language message, so the load error can be translated. */
class LoadError extends Error {
  params?: TranslateParams;
  constructor(key: string, params?: TranslateParams) {
    super(key);
    this.name = 'LoadError';
    this.params = params;
  }
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; messageKey: string; messageParams?: TranslateParams }
  | { status: 'ready'; dataset: Dataset };

async function fetchDataset(signal: AbortSignal): Promise<Dataset> {
  let response: Response;
  try {
    response = await fetch(DATA_URL, { signal, headers: { Accept: 'application/json' } });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new LoadError('status.errorNetwork');
  }
  if (!response.ok) throw new LoadError('status.errorHttp', { status: response.status });
  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    throw new LoadError('status.errorInvalidJson');
  }
  return parseDataset(raw);
}

/** Both LoadError and DatasetError carry an i18n key as their `message`; anything else is unexpected. */
function loadFailure(error: unknown): { messageKey: string; messageParams?: TranslateParams } {
  if (error instanceof LoadError) return { messageKey: error.message, messageParams: error.params };
  if (error instanceof DatasetError) return { messageKey: error.message };
  return { messageKey: 'status.errorUnknown' };
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function App() {
  const { t, lang } = useI18n();
  const [initialView] = useState(() => parseViewState(window.location.search));
  const [filters, setFilters] = useState<Filters>(initialView.filters);
  const [basis, setBasis] = useState<Basis>(initialView.basis);
  const [sort, setSort] = useState<SortKey>(initialView.sort);
  const [visibleCount, setVisibleCount] = useState(LOAD_MORE_STEP);
  // The visitor's own salary: kept in memory only, never in the URL (see urlState.ts).
  const [salaryInput, setSalaryInput] = useState<SalaryInput>(DEFAULT_SALARY_INPUT);
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchDataset(controller.signal).then(
      (dataset) => setLoad({ status: 'ready', dataset }),
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setLoad({ status: 'error', ...loadFailure(error) });
      },
    );
    return () => controller.abort();
  }, [attempt]);

  // Shareable views: mirror filters, basis and sort into the query string without new history entries.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const url = new URL(window.location.href);
      url.search = serializeViewState({ filters, basis, sort });
      // A shared link opens in the sender's language (German, the default, needs no parameter).
      if (lang !== 'de') url.searchParams.set('lang', lang);
      if (url.href !== window.location.href) window.history.replaceState(window.history.state, '', url);
    }, URL_SYNC_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [filters, basis, sort, lang]);

  const dataset = load.status === 'ready' ? load.dataset : null;
  const records = dataset?.records ?? EMPTY_RECORDS;
  const roleFamilies = dataset?.roleFamilies ?? EMPTY_ROLE_FAMILIES;
  const referenceDate = dataset ? referenceDateOf(dataset) : todayIso();
  const context = useMemo<FilterContext>(() => ({ referenceDate }), [referenceDate]);

  // Typing stays responsive: heavy derivations run on a deferred copy of the filters.
  const deferredFilters = useDeferredValue(filters);

  // One pipeline (lib/benchmark.ts) produces the headline benchmark: role-family
  // scoping (a resolved family replaces the free-text query), the filters, the
  // finder's experience band, then the gross-monthly values. The recovery
  // suggestions run the very same function, so their counts match the card.
  const { familyMatch, baseRecords, effectiveFilters, allLevels, match, gross } = useMemo(
    () => evaluateBenchmark(records, roleFamilies, deferredFilters, context),
    [records, roleFamilies, deferredFilters, context],
  );
  const familySuggestions = useMemo(() => roleFamilySuggestions(roleFamilies, records, lang), [roleFamilies, records, lang]);
  // An ambiguous role ("Berater") is offered as separate groups, each with its own benchmark,
  // instead of one median pooled across unrelated jobs; a typo ("Projektleitr") gets the closest groups.
  const groupChoices = useMemo(
    () =>
      familyMatch && familyMatch.families.length > 1
        ? groupBenchmarks(records, roleFamilies, familyMatch.families, deferredFilters, context, lang)
        : null,
    [familyMatch, records, roleFamilies, deferredFilters, context, lang],
  );
  const similarGroups = useMemo(() => {
    if (familyMatch !== null || deferredFilters.query.trim() === '') return [];
    const similar = suggestSimilarFamilies(roleFamilies, deferredFilters.query).slice(0, 3);
    return groupBenchmarks(records, roleFamilies, similar, deferredFilters, context, lang);
  }, [familyMatch, deferredFilters, roleFamilies, records, context, lang]);
  // A search that found too little and has no typo fix: offer the most-posted groups instead of a dead end.
  const popularGroups = useMemo(() => {
    if (familyMatch !== null || deferredFilters.query.trim() === '' || similarGroups.length > 0 || gross.values.length >= MIN_BENCHMARK_N) return [];
    const top = familySuggestions.slice(0, 6).map((suggestion) => suggestion.family);
    return groupBenchmarks(records, roleFamilies, top, deferredFilters, context, lang);
  }, [familyMatch, deferredFilters, similarGroups, gross, familySuggestions, records, roleFamilies, context, lang]);
  const facets = useMemo(
    () => computeFacetCounts(baseRecords, effectiveFilters, { ...context, experienceRange: match.range }),
    [baseRecords, effectiveFilters, context, match.range],
  );
  const periodCounts = useMemo(
    () => computePeriodCounts(baseRecords, effectiveFilters, { ...context, experienceRange: match.range }),
    [baseRecords, effectiveFilters, context, match.range],
  );
  // Dead end (fewer than five salaries): which single change would get the benchmark back?
  const relaxations = useMemo(
    () =>
      gross.values.length < MIN_BENCHMARK_N
        ? computeRelaxations({ records, roleFamilies, filters: deferredFilters, context })
        : [],
    [gross, records, roleFamilies, deferredFilters, context],
  );
  // Industry chart: same scope as `allLevels` (role/region/more-filters + experience band) but
  // ignoring the industry filter itself, so every industry stays visible for comparison.
  const industryScopeRecords = useMemo(
    () => filterRecords(baseRecords, { ...effectiveFilters, industry: '' }, { ...context, experienceRange: match.range }),
    [baseRecords, effectiveFilters, context, match.range],
  );
  const sorted = useMemo(() => sortRecords(match.records, sort), [match.records, sort]);
  const userGrossMonthly = useMemo(() => resolveGrossMonthly(salaryInput), [salaryInput]);

  const updateFilters = useCallback((patch: Partial<Filters>) => {
    setFilters((previous) => ({ ...previous, ...patch }));
    setVisibleCount(LOAD_MORE_STEP);
  }, []);
  const updateSalaryInput = useCallback((patch: Partial<SalaryInput>) => {
    setSalaryInput((previous) => ({ ...previous, ...patch }));
  }, []);
  const resetAll = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setVisibleCount(LOAD_MORE_STEP);
  }, []);
  const resetMore = useCallback(() => {
    setFilters((previous) => resetMoreFilters(previous));
    setVisibleCount(LOAD_MORE_STEP);
  }, []);
  const applyRelaxation = useCallback(
    (patch: Partial<Filters>) => {
      // The suggestion button disappears with the dead end: keep focus on the result that replaces it.
      document.getElementById('result')?.focus({ preventScroll: true });
      updateFilters(patch);
    },
    [updateFilters],
  );
  const changeSort = useCallback((next: SortKey) => {
    setSort(next);
    setVisibleCount(LOAD_MORE_STEP);
  }, []);
  const showMore = useCallback(() => {
    setVisibleCount((value) => value + LOAD_MORE_STEP);
  }, []);
  const selectFamily = useCallback(
    (label: string) => {
      updateFilters({ query: label });
    },
    [updateFilters],
  );
  const retry = useCallback(() => {
    setLoad({ status: 'loading' });
    setAttempt((value) => value + 1);
  }, []);

  const ready = dataset !== null && records.length > 0;
  const salaryCount = gross.values.length;
  const salariesText = t('common.nSalaries', { count: salaryCount, n: formatCount(salaryCount) });
  // The phone's sticky peek: the same rounded median as the card, plus the visitor's rank once they entered a salary.
  const peekSummary = salaryCount >= MIN_BENCHMARK_N ? summarizeSorted(gross.values) : null;
  const peekMedian = peekSummary ? formatMoney(roundSummary(peekSummary, roundToSample).median) : '';
  const peekRank = peekSummary && userGrossMonthly !== null ? Math.round(percentileRank(gross.values, userGrossMonthly)) : null;
  const peekText = groupChoices
    ? t('peek.pickRole')
    : !peekSummary
      ? t('peek.tooFew', { salaries: salariesText })
      : peekRank === null
        ? t('peek.median', { median: peekMedian, salaries: salariesText })
        : peekRank <= 0
          ? t('peek.positionLowest', { median: peekMedian })
          : peekRank >= 100
            ? t('peek.positionHighest', { median: peekMedian })
            : t('peek.position', { rank: formatCount(peekRank), median: peekMedian });
  const finderUsed = filters.query.trim() !== '' || filters.experience !== null || salaryInput.amount !== null;

  return (
    <>
      <a className="skip-link" href={ready ? '#finder-query' : '#main'}>
        {ready ? t('app.skipToFinder') : t('app.skipToContent')}
      </a>
      <Header ready={ready} />
      <main id="main" className="container main" tabIndex={-1}>
        {load.status === 'loading' && <LoadingPanel />}
        {load.status === 'error' && (
          <ErrorPanel message={t(load.messageKey, load.messageParams)} onRetry={retry} />
        )}
        {dataset && records.length === 0 && <EmptyDatasetPanel />}
        {dataset && records.length > 0 && (
          <>
            <section id="calculator" className="hero" aria-labelledby="hero-heading">
              <h1 id="hero-heading">{t('hero.title')}</h1>
              <p className="hero-subline">{t('hero.subline')}</p>
              <p className="hero-coverage">
                {t('hero.coverage', {
                  entries: t('common.nEntries', { count: records.length, n: formatCount(records.length) }),
                  posts: t('hero.posts', { count: dataset.coverage.postsWithSalary, n: formatCount(dataset.coverage.postsWithSalary) }),
                  date: formatDate(dataset.coverage.lastPostDate, lang),
                })}
              </p>
              <Finder
                filters={filters}
                onChange={updateFilters}
                salaryInput={salaryInput}
                onSalaryInputChange={updateSalaryInput}
                roleFamilies={roleFamilies}
                familySuggestions={familySuggestions}
              />
            </section>

            <div className="results">
              <FilterBar
                filters={filters}
                onChange={updateFilters}
                facets={facets}
                periodCounts={periodCounts}
                referenceDate={referenceDate}
                moreCount={countActiveMoreFilters(filters)}
                moreOpen={moreOpen}
                onToggleMore={() => setMoreOpen((open) => !open)}
                moreButtonRef={moreButtonRef}
                moreControlsId={MORE_FILTERS_ID}
              />
              <MoreFiltersDrawer
                id={MORE_FILTERS_ID}
                open={moreOpen}
                onClose={() => setMoreOpen(false)}
                filters={filters}
                onChange={updateFilters}
                onReset={resetMore}
                facets={facets}
                salaryCount={gross.values.length}
                openerRef={moreButtonRef}
              />

              <div className="layout">
                <div className="result-zone">
                  <ActiveFilters
                    filters={filters}
                    familyMatch={familyMatch}
                    match={match}
                    onChange={updateFilters}
                    onResetAll={resetAll}
                  />
                  <ResultCard
                    filters={filters}
                    salaryInput={salaryInput}
                    familyMatch={familyMatch}
                    groupChoices={groupChoices}
                    similarGroups={similarGroups}
                    popularGroups={popularGroups}
                    onClearQuery={() => updateFilters({ query: '' })}
                    onPickRole={(label) => updateFilters({ query: label })}
                    match={match}
                    gross={gross}
                    relaxations={relaxations}
                    onApplyRelaxation={applyRelaxation}
                    onResetAll={resetAll}
                    recordsId={RECORDS_ID}
                  />
                </div>
                {allLevels.length > 0 && (
                  <ChartsCard
                    sectionId={BENCHMARK_ID}
                    experienceRecords={allLevels}
                    userExperience={filters.experience}
                    userGrossMonthly={userGrossMonthly}
                    benchmarkRecords={match.records}
                    match={match}
                    basis={basis}
                    onBasisChange={setBasis}
                    industryRecords={industryScopeRecords}
                    selectedIndustry={filters.industry}
                    onSelectIndustry={(industry) => updateFilters({ industry })}
                    industryScope={describeScope(match, t)}
                  />
                )}
                <RightRail dataset={dataset} familySuggestions={familySuggestions} onSelectFamily={selectFamily} />
                <RecordsList
                  sectionId={RECORDS_ID}
                  records={sorted}
                  sort={sort}
                  onSortChange={changeSort}
                  visibleCount={visibleCount}
                  onShowMore={showMore}
                  roleFamilies={roleFamilies}
                  activeFamilyId={familyMatch?.families.length === 1 ? familyMatch.families[0].id : null}
                />
              </div>
            </div>
            <ResultPeek targetId="result" active={finderUsed} text={peekText} />
          </>
        )}
        {load.status !== 'loading' && <Methodology />}
      </main>
      <Footer />
    </>
  );
}
