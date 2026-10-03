// "Distribution": the detailed benchmark for one basis (gross monthly, gross
// annual or net monthly). Gross and net are never mixed.
import { useMemo } from 'react';
import type { SalaryRecord } from '../types.ts';
import { useI18n } from '../i18n/context.tsx';
import { buildHistogram } from '../lib/histogram.ts';
import {
  BASES,
  MIN_BENCHMARK_N,
  MIN_SOLID_N,
  sampleLevel,
  selectBasis,
  summarizeSorted,
} from '../lib/stats.ts';
import type { Basis, Summary } from '../lib/stats.ts';
import { describeScope } from '../lib/finderScope.ts';
import type { ExperienceMatch } from '../lib/finder.ts';
import { BASIS_LABELS, basisNoun } from '../lib/labels.ts';
import { formatCount, formatMoney } from '../lib/format.ts';
import { Histogram } from './Histogram.tsx';
import { DerivedMark } from './ValueDisplay.tsx';

type BenchmarkPanelProps = {
  sectionId: string;
  /** Records after all filters and the finder's experience band. */
  records: SalaryRecord[];
  match: ExperienceMatch;
  basis: Basis;
  onBasisChange: (basis: Basis) => void;
  salary: number | null;
};

export function BenchmarkPanel({
  sectionId,
  records,
  match,
  basis,
  onBasisChange,
  salary,
}: BenchmarkPanelProps) {
  const { t, lang } = useI18n();
  const selection = useMemo(() => selectBasis(records, basis), [records, basis]);
  const summary = useMemo(() => summarizeSorted(selection.values), [selection]);
  const n = selection.values.length;
  const level = sampleLevel(n);
  const hasBenchmark = summary !== null && (level === 'indicative' || level === 'solid');
  const histogram = useMemo(() => (hasBenchmark ? buildHistogram(selection.values) : null), [hasBenchmark, selection]);
  const basisLabel = BASIS_LABELS[lang][basis];
  const noun = basisNoun(basisLabel, lang);
  const monthly = basis !== 'grossAnnual';
  const marker = salary !== null && basis === 'grossMonthly' ? { value: salary, label: t('finder.youLabel', { salary: formatMoney(salary) }) } : null;

  return (
    <div id={sectionId} className="tab-panel benchmark" role="tabpanel" aria-labelledby="tab-distribution">
      <div className="section-head">
        <div>
          <h2 id="benchmark-heading">{t('benchmark.heading')}</h2>
          <p className="section-sub">
            {records.length === 0
              ? t('benchmark.subEmpty')
              : t('benchmark.sub', {
                  salaries: t('common.nSalaries', { count: n, n: formatCount(n) }),
                  basis: noun,
                  scope: describeScope(match, t),
                })}
          </p>
        </div>
        <fieldset className="basis-toggle">
          <legend>{t('benchmark.basisLegend')}</legend>
          <div className="segmented">
            {BASES.map((option) => (
              <label key={option} className="segment">
                <input
                  type="radio"
                  name="basis"
                  value={option}
                  checked={basis === option}
                  onChange={() => onBasisChange(option)}
                />
                <span>{BASIS_LABELS[lang][option]}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      {selection.missing > 0 && records.length > 0 && (
        <p className="missing-note">{t('benchmark.missingNote', { count: selection.missing, n: formatCount(selection.missing), basis: noun })}</p>
      )}

      {!hasBenchmark && (
        <div className="notice notice-alert">
          <p className="notice-title">{t('benchmark.noneTitle')}</p>
          <p>
            {n === 0 ? t('benchmark.noneAll', { basis: noun }) : t('benchmark.noneSome', { entries: t('common.nEntries', { count: n, n: formatCount(n) }), basis: noun })}{' '}
            {t('benchmark.noneHint', { min: formatCount(MIN_BENCHMARK_N) })}
          </p>
        </div>
      )}

      {hasBenchmark && summary && histogram && (
        <>
          {level === 'indicative' && (
            <div className="notice notice-warning">
              <p className="notice-title">{t('benchmark.indicativeTitle')}</p>
              <p>{t('benchmark.indicativeBody', { values: t('common.nValues', { count: n, n: formatCount(n) }), solid: formatCount(MIN_SOLID_N) })}</p>
            </div>
          )}
          <div className="benchmark-grid">
            <div className="benchmark-chart">
              <Histogram data={histogram} summary={summary} basisLabel={basisLabel} marker={marker} />
              {salary !== null && basis !== 'grossMonthly' && <p className="hint">{t('benchmark.yourSalaryNoteGross')}</p>}
            </div>
            <div className="benchmark-stats">
              <StatsList summary={summary} />
              <ul className="benchmark-notes">
                {selection.derived > 0 && (
                  <li>
                    <DerivedMark /> {t('benchmark.noteDerived', { n: formatCount(selection.derived), total: formatCount(n) })}
                  </li>
                )}
                {monthly && selection.twelvePayments > 0 && (
                  <li>{t('benchmark.noteTwelvePayments', { count: selection.twelvePayments, n: formatCount(selection.twelvePayments) })}</li>
                )}
                {basis === 'netMonthly' && <li>{t('benchmark.noteNetVariance')}</li>}
              </ul>
            </div>
          </div>
        </>
      )}

    </div>
  );
}

function StatsList({ summary }: { summary: Summary }) {
  const { t } = useI18n();
  const rows: Array<[string, string, string?]> = [
    [t('benchmark.stats.median'), formatMoney(summary.median)],
    [t('benchmark.stats.typicalRange'), `${formatMoney(summary.p25)} – ${formatMoney(summary.p75)}`, t('benchmark.stats.typicalRangeSub')],
    [t('benchmark.stats.wideRange'), `${formatMoney(summary.p10)} – ${formatMoney(summary.p90)}`, t('benchmark.stats.wideRangeSub')],
    [t('benchmark.stats.minMax'), `${formatMoney(summary.min)} – ${formatMoney(summary.max)}`, t('benchmark.stats.minMaxSub')],
    [t('benchmark.stats.mean'), formatMoney(summary.mean), t('benchmark.stats.meanSub')],
    [t('benchmark.stats.dataPoints'), t('benchmark.stats.nEquals', { n: formatCount(summary.n) })],
  ];
  return (
    <dl className="stats-list">
      {rows.map(([label, value, sub]) => (
        <div key={label} className={label === t('benchmark.stats.median') ? 'stats-row stats-row-primary' : 'stats-row'}>
          <dt>
            {label}
            {sub && <span className="stats-sub">{sub}</span>}
          </dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
