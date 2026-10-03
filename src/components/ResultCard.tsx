// The page's hero result: the finder's calculated benchmark (median, typical
// range, reliability, ≈ net and the visitor's own position), extracted from
// the old Finder.tsx so it can sit as its own card in the center column while
// Finder.tsx stays a compact input row. Reads the same live filter state, so
// the figures still update as the visitor types. With fewer than five salaries
// it offers one-click ways out of the dead end (see lib/relaxations.ts). An
// ambiguous role ("Berater" matches several role groups) or a typo gets
// one-click ways to the intended role group instead.
import { useI18n } from '../i18n/context.tsx';
import { wasConverted } from '../lib/calculator.ts';
import type { SalaryInput } from '../lib/calculator.ts';
import type { Filters } from '../lib/filters.ts';
import { describePosition, describeRoleScope, describeWidening } from '../lib/finderScope.ts';
import type { ExperienceMatch } from '../lib/finder.ts';
import { formatCount, formatMoney, formatMoneyRange, roundToSample } from '../lib/format.ts';
import { netAnnual, netMonthly } from '../lib/net.ts';
import type { Relaxation } from '../lib/relaxations.ts';
import type { GroupBenchmark } from '../lib/benchmark.ts';
import type { RoleFamilyMatch } from '../lib/roleFamilies.ts';
import { resolveGrossMonthly } from '../lib/calculator.ts';
import { MIN_BENCHMARK_N, MIN_PERCENTILE_N, MIN_SOLID_N, computePosition, reliabilityBadge, roundSummary, summarizeSorted } from '../lib/stats.ts';
import type { BasisSelection, ReliabilityBadge as ReliabilityLevel, Summary } from '../lib/stats.ts';
import { DerivedMark } from './ValueDisplay.tsx';

type ResultCardProps = {
  filters: Filters;
  salaryInput: SalaryInput;
  familyMatch: RoleFamilyMatch | null;
  /** Set when the query matched several role groups: each group's own benchmark, and no pooled one. */
  groupChoices: readonly GroupBenchmark[] | null;
  /** "Did you mean" role groups when the query matched none (see suggestSimilarFamilies). */
  similarGroups: readonly GroupBenchmark[];
  /** Popular role groups offered when a search found nothing and no typo fix either. */
  popularGroups: readonly GroupBenchmark[];
  onClearQuery: () => void;
  onPickRole: (label: string) => void;
  match: ExperienceMatch;
  gross: BasisSelection;
  /** One-click ways out of a dead end; empty unless the benchmark has too few salaries. */
  relaxations: readonly Relaxation[];
  onApplyRelaxation: (patch: Partial<Filters>) => void;
  onResetAll: () => void;
  recordsId: string;
};

export function ResultCard({
  filters,
  salaryInput,
  familyMatch,
  groupChoices,
  similarGroups,
  popularGroups,
  onClearQuery,
  onPickRole,
  match,
  gross,
  relaxations,
  onApplyRelaxation,
  onResetAll,
  recordsId,
}: ResultCardProps) {
  const { t, lang } = useI18n();
  const n = gross.values.length;
  const badge = reliabilityBadge(n);
  const exact = summarizeSorted(gross.values);
  // What the card shows; the visitor's position is still computed from the exact values.
  const summary = exact && roundSummary(exact, roundToSample);
  const userGrossMonthly = resolveGrossMonthly(salaryInput);
  const converted = wasConverted(salaryInput);
  const roleScope = describeRoleScope(filters, familyMatch, lang, t);
  const widening = describeWidening(match, t);
  const ambiguous = groupChoices !== null;
  const hasBenchmark = !ambiguous && summary !== null && badge !== 'tooFew';
  const salariesText = t('common.nSalaries', { count: n, n: formatCount(n) });
  const query = filters.query.trim();
  const status = ambiguous
    ? t('finder.statusAmbiguous', { query, n: formatCount(groupChoices.length) })
    : hasBenchmark && summary
      ? t('finder.statusHasBenchmark', { median: formatMoney(summary.median), salaries: salariesText })
      : t('finder.statusTooFew', { count: n, salaries: salariesText });

  return (
    <section id="result" className="card result-card" aria-labelledby="result-heading" tabIndex={-1}>
      <h2 id="result-heading" className="sr-only">
        {t('finder.heading')}
      </h2>
      <p className="sr-only" role="status">
        {status}
      </p>
      {/* Industry, experience band and the other filters are the chips above this card. */}
      {familyMatch?.headWord && (
        <p className="result-note result-note-muted">
          {t('finder.headWordNote', { query: filters.query.trim(), word: familyMatch.headWord })}
        </p>
      )}
      {ambiguous ? (
        <RoleChoices
          intro={t('finder.ambiguous', { query: familyMatch?.headWord ?? query, n: formatCount(groupChoices.length) })}
          choices={groupChoices}
          onPick={onPickRole}
        />
      ) : (
        <p className="result-scope">
          <span className="chip chip-scope">{roleScope}</span>
        </p>
      )}
      {!familyMatch && similarGroups.length > 0 && (
        <RoleChoices intro={t('finder.didYouMean')} choices={similarGroups} onPick={onPickRole} />
      )}
      {!familyMatch && similarGroups.length === 0 && popularGroups.length > 0 && (
        <RoleChoices intro={t('finder.popularGroups')} choices={popularGroups} onPick={onPickRole} />
      )}
      {!ambiguous && widening && <p className="result-note">{widening}</p>}

      {!ambiguous && !hasBenchmark && (
        <div className="notice notice-alert">
          <p className="notice-title">{t('finder.tooFewTitle')}</p>
          <p>
            {n === 0 ? t('finder.tooFewNone') : t('finder.tooFewSome', { count: n, salaries: salariesText })}{' '}
            {t('finder.tooFewHint', { min: formatCount(MIN_BENCHMARK_N) })}
          </p>
          {relaxations.length > 0 && (
            <div className="recovery">
              <p className="recovery-title">{t('recovery.title')}</p>
              <ul className="recovery-list">
                {relaxations.map((relaxation) => {
                  const action = t(`recovery.${relaxation.id}`);
                  const count = t('common.nSalaries', { count: relaxation.count, n: formatCount(relaxation.count) });
                  return (
                    <li key={relaxation.id}>
                      <button
                        type="button"
                        className="recovery-option"
                        aria-label={t('recovery.optionSr', { action, salaries: count })}
                        onClick={() => onApplyRelaxation(relaxation.patch)}
                      >
                        <span className="recovery-action">{action}</span>
                        <span className="recovery-result">
                          <span aria-hidden="true">→</span>
                          <span className="recovery-count">{count}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {match.records.length === 0 && (
            <div className="recovery-actions">
              {query && (
                <button type="button" className="btn btn-secondary" onClick={onClearQuery}>
                  {t('finder.clearSearch')}
                </button>
              )}
              <button type="button" className={query ? 'link-button' : 'btn btn-secondary'} onClick={onResetAll}>
                {t('common.resetAllFilters')}
              </button>
            </div>
          )}
        </div>
      )}

      {hasBenchmark && summary && (
        <>
          <div className="result-main">
            <div className="result-block">
              <p className="result-label">{t('finder.medianLabel')}</p>
              <p className="result-value">{formatMoney(summary.median)}</p>
              <p className="result-sub">{t('finder.medianSub')}</p>
              <p className="result-sub result-sub-meta">
                <ReliabilityBadge level={badge} /> ·{' '}
                {match.records.length > n
                  ? t('finder.basis', { count: match.records.length, n: formatCount(match.records.length), salaries: salariesText })
                  : salariesText}
                {badge === 'indicative' && <> · {t('calc.reliabilityIndicativeShort', { solid: formatCount(MIN_SOLID_N) })}</>}
              </p>
              <p className="result-sub result-disclaimer">{t('finder.disclaimerInline')}
              </p>
            </div>
            <div className="result-block">
              <p className="result-label">{t('finder.rangeLabel')}</p>
              <p className="result-range">
                <span className="nowrap">{formatMoney(summary.p25)}</span> –{' '}
                <span className="nowrap">{formatMoney(summary.p75)}</span>
              </p>
              <p className="result-sub">{t('finder.rangeSub')}</p>
            </div>
          </div>
          {userGrossMonthly !== null && (
            <YourPosition input={salaryInput} grossMonthly={userGrossMonthly} values={gross.values} median={exact?.median ?? summary.median} />
          )}
          <RangeBar summary={summary} salary={userGrossMonthly} />
          <CalculatorSecondary summary={summary} />
          {converted && <p className="hint">{t('calc.netConvertedNote')}</p>}
        </>
      )}

      {match.records.length > 0 && (
        <p className="result-link">
          <a href={`#${recordsId}`}>{t('finder.seeEntries', { count: match.records.length, n: formatCount(match.records.length) })}</a>
        </p>
      )}
    </section>
  );
}

/** How many role groups the "narrow down" row lists before summarising the rest as "+ n more". */
const MAX_ROLE_CHOICES = 6;

function RoleChoices({
  intro,
  choices,
  onPick,
}: {
  intro: string;
  choices: readonly GroupBenchmark[];
  onPick: (label: string) => void;
}) {
  const { t } = useI18n();
  const shown = choices.slice(0, MAX_ROLE_CHOICES);
  const hidden = choices.length - shown.length;
  return (
    <div className="role-choices">
      <p className="role-choices-intro">{intro}</p>
      <ul className="role-choices-list">
        {shown.map((choice) => (
          <li key={choice.family.id}>
            <button type="button" className="role-choice" onClick={() => onPick(choice.label)}>
              <span>{choice.label}</span>
              <span className="role-choice-count">
                {choice.median === null
                  ? t('finder.choiceTooFew', { salaries: t('common.nSalaries', { count: choice.n, n: formatCount(choice.n) }) })
                  : t('finder.choiceMedian', {
                      median: formatMoney(choice.median),
                      salaries: t('common.nSalaries', { count: choice.n, n: formatCount(choice.n) }),
                    })}
              </span>
            </button>
          </li>
        ))}
        {hidden > 0 && <li className="role-choices-more">{t('finder.moreFamilies', { n: formatCount(hidden) })}</li>}
      </ul>
    </div>
  );
}

function ReliabilityBadge({ level }: { level: ReliabilityLevel }) {
  const { t } = useI18n();
  const labelKey =
    level === 'solid' ? 'calc.reliabilitySolid' : level === 'indicative' ? 'calc.reliabilityIndicative' : 'calc.reliabilityTooFew';
  const hint =
    level === 'solid'
      ? t('calc.reliabilitySolidHint', { solid: formatCount(MIN_SOLID_N) })
      : level === 'indicative'
        ? t('calc.reliabilityIndicativeHint', { min: formatCount(MIN_BENCHMARK_N), solidMinusOne: formatCount(MIN_SOLID_N - 1) })
        : t('calc.reliabilityTooFewHint', { min: formatCount(MIN_BENCHMARK_N) });
  return (
    <span className={`reliability-badge reliability-${level}`} title={hint}>
      <span className="sr-only">{t('calc.reliabilityLegend')}: </span>
      {t(labelKey)}
    </span>
  );
}

const roundTo10 = (value: number) => Math.round(value / 10) * 10;

/** The approximate net figures and gross/net per year, all derived from the gross-monthly benchmark via net.ts. */
function CalculatorSecondary({ summary }: { summary: Summary }) {
  const { t } = useI18n();
  return (
    <>
      <dl className="result-secondary">
        <div>
          <dt>
            {t('calc.approxNetMedian')} <DerivedMark />
          </dt>
          <dd>{formatMoney(roundTo10(netMonthly(summary.median)))}</dd>
        </div>
        <div>
          <dt>
            {t('calc.approxNetRange')} <DerivedMark />
          </dt>
          <dd>{formatMoneyRange(roundTo10(netMonthly(summary.p25)), roundTo10(netMonthly(summary.p75)))}</dd>
        </div>
        <div>
          <dt>
            {t('calc.grossPerYear')} <DerivedMark />
          </dt>
          <dd>{formatMoney(summary.median * 14)}</dd>
        </div>
        <div>
          <dt>
            {t('calc.netPerYear')} <DerivedMark />
          </dt>
          <dd>{formatMoney(roundTo10(netAnnual(summary.median)))}</dd>
        </div>
      </dl>
      <p className="result-secondary-note" title={t('common.approxHint')}>
        {t('calc.netApproxNote')}
      </p>
    </>
  );
}

/**
 * Compact position bar: the track spans P10–P90, the coral box is the typical
 * range, the black line the median and the pointer the visitor's salary.
 * Decorative (aria-hidden); the same facts are available as text.
 */
function RangeBar({ summary, salary }: { summary: Summary; salary: number | null }) {
  const { t } = useI18n();
  // Below MIN_PERCENTILE_N, P10/P90 sit next to the extremes: the track then spans every value.
  const wide = summary.n >= MIN_PERCENTILE_N;
  const low = wide ? summary.p10 : summary.min;
  const high = wide ? summary.p90 : summary.max;
  const span = high - low;
  const pct = (value: number) => (span > 0 ? Math.min(100, Math.max(0, ((value - low) / span) * 100)) : 50);
  let youLabel = '';
  if (salary !== null) {
    youLabel = t('finder.youLabel', { salary: formatMoney(salary) });
    if (salary < low) youLabel += wide ? t('finder.belowP10') : t('finder.belowMin');
    if (salary > high) youLabel += wide ? t('finder.aboveP90') : t('finder.aboveMax');
  }
  const you = salary === null ? null : pct(salary);
  const youAnchor = you === null ? '' : you < 18 ? 'start' : you > 82 ? 'end' : 'middle';
  return (
    <div className="range-bar">
      <p className="result-label">{t('finder.whereSalariesFall')}</p>
      <div className={salary === null ? 'range-graphic' : 'range-graphic has-you'} aria-hidden="true">
        {you !== null && (
          <span className={`range-you range-you-${youAnchor}`} style={{ left: `${you}%` }}>
            <span className="range-you-label">{youLabel}</span>
          </span>
        )}
        <div className="range-track">
          <span
            className="range-box"
            style={{ left: `${pct(summary.p25)}%`, width: `${Math.max(1, pct(summary.p75) - pct(summary.p25))}%` }}
          />
          <span className="range-median" style={{ left: `${pct(summary.median)}%` }} />
        </div>
        <div className="range-scale">
          <span>
            {formatMoney(low)} <span className="range-scale-note">{wide ? 'P10' : t('finder.rangeMin')}</span>
          </span>
          <span>
            <span className="range-scale-note">{wide ? 'P90' : t('finder.rangeMax')}</span> {formatMoney(high)}
          </span>
        </div>
      </div>
      <p className="sr-only">
        {wide
          ? t('finder.rangeSrText', { p10: formatMoney(low), p90: formatMoney(high) })
          : t('finder.rangeSrTextMinMax', { min: formatMoney(low), max: formatMoney(high) })}
      </p>
      <p className="range-legend" aria-hidden="true">
        <span>
          <span className="range-key range-key-track" /> {wide ? t('finder.rangeLegendTrack') : t('finder.rangeLegendTrackAll')}
        </span>
        <span>
          <span className="range-key range-key-box" /> {t('finder.rangeLegendBox')}
        </span>
        <span>
          <span className="range-key range-key-median" /> {t('finder.rangeLegendMedian')}
        </span>
      </p>
    </div>
  );
}

const UNIT_KEYS = {
  'gross-month': 'calc.unitGrossMonth',
  'net-month': 'calc.unitNetMonth',
  'gross-year': 'calc.unitGrossYear',
  'net-year': 'calc.unitNetYear',
} as const;

/**
 * Where the visitor stands, in the unit they typed: the rank comes from the
 * gross values (the order is the same in net), the euro gap is measured
 * against the median converted into that unit.
 */
function YourPosition({ input, grossMonthly, values, median }: { input: SalaryInput; grossMonthly: number; values: readonly number[]; median: number }) {
  const { t } = useI18n();
  const position = computePosition(values, median, grossMonthly);
  const amount = input.amount ?? grossMonthly;
  const yearly = input.frequency === 'year';
  const medianInUnit = input.basis === 'net' ? (yearly ? netAnnual(median) : netMonthly(median)) : yearly ? median * 14 : median;
  const diff = amount - medianInUnit;
  const shown = { ...position, diff, pctDiff: medianInUnit > 0 ? (Math.abs(diff) / medianInUnit) * 100 : 0 };
  const sentence = describePosition(shown, values.length, grossMonthly, t, {
    salaryText: `${formatMoney(amount)} ${t(UNIT_KEYS[`${input.basis}-${input.frequency}`])}`,
    diffSuffix: yearly ? t('calc.perYearSuffix') : '',
    net: input.basis === 'net',
  });
  return (
    <p className="your-position">
      <span className="your-position-marker" aria-hidden="true" />
      <span>
        {sentence} {t('finder.positionChartNote')}
      </span>
    </p>
  );
}
