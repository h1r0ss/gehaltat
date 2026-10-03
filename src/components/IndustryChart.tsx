// "How fields compare": horizontal bars of median gross monthly salary per
// industry, for the current role/region/experience-band selection (ignoring
// only the industry filter, so every industry stays comparable). Clicking a
// bar selects that industry in the finder.
import { useId, useMemo, useRef } from 'react';
import type { Industry, SalaryRecord } from '../types.ts';
import { useI18n } from '../i18n/context.tsx';
import { niceTicks } from '../lib/histogram.ts';
import { MIN_INDUSTRY_CHART_N, hiddenIndustryCount, industryCounts, industryMedians } from '../lib/industryChart.ts';
import { INDUSTRY_LABELS } from '../lib/labels.ts';
import { formatCount, formatMoney } from '../lib/format.ts';
import { useElementWidth } from './useElementWidth.ts';

// `right` leaves room for the "€ X.XXX" value label printed after each bar
// (the longest bars can otherwise push a wide value label off the edge).
// The bottom margin holds the tick labels and, below them, the axis title.
const MARGIN = { top: 4, right: 100, bottom: 46, left: 148 };
const ROW_HEIGHT = 30;
const BAR_THICKNESS = 18;
const MAX_LABEL_CHARS_PER_LINE = 20;

type IndustryChartProps = {
  sectionId: string;
  records: readonly SalaryRecord[];
  selectedIndustry: Industry | '';
  onSelectIndustry: (industry: Industry) => void;
  scope: string;
};

/** Greedy 1-2 line word wrap; a still-too-long second line is truncated with an ellipsis. */
function wrapLabel(label: string): [string, string | null] {
  if (label.length <= MAX_LABEL_CHARS_PER_LINE) return [label, null];
  const words = label.split(' ');
  let line1 = '';
  let index = 0;
  for (; index < words.length; index += 1) {
    const candidate = line1 ? `${line1} ${words[index]}` : words[index];
    if (candidate.length > MAX_LABEL_CHARS_PER_LINE && line1) break;
    line1 = candidate;
  }
  let line2 = words.slice(index).join(' ');
  if (line2.length > MAX_LABEL_CHARS_PER_LINE) line2 = `${line2.slice(0, MAX_LABEL_CHARS_PER_LINE - 1)}…`;
  return [line1, line2 || null];
}

export function IndustryChart({ sectionId, records, selectedIndustry, onSelectIndustry, scope }: IndustryChartProps) {
  const { t, lang } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(containerRef);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const titleId = `ind-title-${uid}`;
  const descId = `ind-desc-${uid}`;

  const bars = useMemo(() => industryMedians(records), [records]);
  const hidden = useMemo(() => hiddenIndustryCount(records), [records]);
  const counts = useMemo(() => industryCounts(records), [records]);

  const innerWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
  const height = MARGIN.top + MARGIN.bottom + Math.max(1, bars.length) * ROW_HEIGHT;
  const maxMedian = bars.reduce((max, bar) => Math.max(max, bar.median), 0);
  const xTicks = innerWidth > 0 ? niceTicks(0, maxMedian, Math.max(3, Math.floor(innerWidth / 90))) : [];
  // niceTicks's last tick can fall short of maxMedian (it steps up to, not
  // necessarily past, the domain end), which would otherwise let the longest
  // bar's width exceed innerWidth and push its value label off the chart.
  const xDomainMax = Math.max(xTicks.length > 0 ? xTicks[xTicks.length - 1] : 0, maxMedian) || 1;
  const barWidth = (median: number) => (median / xDomainMax) * innerWidth;

  const description = t('chart.industry.desc', { scope });

  return (
    <div id={sectionId} className="tab-panel" role="tabpanel" aria-labelledby="tab-industry">
      <div className="section-head">
        <div>
          <h2 id={`${sectionId}-heading`}>{t('chart.industry.title')}</h2>
          <p className="section-sub">{description}</p>
        </div>
      </div>

      {bars.length === 0 ? (
        <p className="muted">{t('benchmark.noneHint', { min: formatCount(5) })}</p>
      ) : bars.length === 1 ? (
        // One bar is no comparison: say so, and show what the other industries would need.
        <div className="industry-single">
          <p>
            {t('chart.industry.singleOnly', {
              industry: INDUSTRY_LABELS[lang][bars[0].industry],
              median: formatMoney(bars[0].median),
              salaries: t('common.nSalaries', { count: bars[0].n, n: formatCount(bars[0].n) }),
            })}
          </p>
          {counts.length > 1 && (
            <p className="muted">
              {t('chart.industry.singleOthers', {
                min: formatCount(MIN_INDUSTRY_CHART_N),
                list: counts
                  .filter((entry) => entry.industry !== bars[0].industry)
                  .map((entry) => `${INDUSTRY_LABELS[lang][entry.industry]} (${formatCount(entry.n)})`)
                  .join(', '),
              })}
            </p>
          )}
        </div>
      ) : (
        <>
          <figure className="histogram">
            <div ref={containerRef} className="histogram-canvas industry-canvas" style={{ height }}>
              {width > 0 && (
                <svg width={width} height={height} role="img" aria-labelledby={`${titleId} ${descId}`}>
                  <title id={titleId}>{t('chart.industry.title')}</title>
                  <desc id={descId}>{description}</desc>

                  {xTicks.map((tick) => (
                    <line
                      key={tick}
                      className="hist-grid"
                      x1={MARGIN.left + barWidth(tick)}
                      x2={MARGIN.left + barWidth(tick)}
                      y1={MARGIN.top}
                      y2={height - MARGIN.bottom}
                    />
                  ))}

                  {bars.map((bar, index) => {
                    const rowY = MARGIN.top + index * ROW_HEIGHT;
                    const barY = rowY + (ROW_HEIGHT - BAR_THICKNESS) / 2;
                    const isSelected = bar.industry === selectedIndustry;
                    const [line1, line2] = wrapLabel(INDUSTRY_LABELS[lang][bar.industry]);
                    const w = Math.max(2, barWidth(bar.median));
                    return (
                      <g key={bar.industry}>
                        <text
                          className="industry-label"
                          x={MARGIN.left - 10}
                          y={line2 ? rowY + ROW_HEIGHT / 2 - 5 : rowY + ROW_HEIGHT / 2}
                          dy="0.32em"
                          textAnchor="end"
                        >
                          {line1}
                        </text>
                        {line2 && (
                          <text className="industry-label" x={MARGIN.left - 10} y={rowY + ROW_HEIGHT / 2 + 9} dy="0.32em" textAnchor="end">
                            {line2}
                          </text>
                        )}
                        <rect
                          className={isSelected ? 'industry-bar is-selected' : 'industry-bar'}
                          x={MARGIN.left}
                          y={barY}
                          width={w}
                          height={BAR_THICKNESS}
                          rx={4}
                        />
                        <text className="industry-value" x={MARGIN.left + w + 8} y={rowY + ROW_HEIGHT / 2} dy="0.32em">
                          {formatMoney(bar.median)}
                        </text>
                        <foreignObject x={0} y={rowY} width={width} height={ROW_HEIGHT}>
                          <button
                            type="button"
                            className="industry-bar-button"
                            aria-pressed={isSelected}
                            onClick={() => onSelectIndustry(bar.industry)}
                            title={t('chart.industry.selectBar', { industry: INDUSTRY_LABELS[lang][bar.industry] })}
                          >
                            <span className="sr-only">
                              {t('chart.industry.selectBar', { industry: INDUSTRY_LABELS[lang][bar.industry] })} —{' '}
                              {formatMoney(bar.median)}, {t('common.nSalaries', { count: bar.n, n: formatCount(bar.n) })}
                            </span>
                          </button>
                        </foreignObject>
                      </g>
                    );
                  })}

                  <line
                    className="hist-baseline"
                    x1={MARGIN.left}
                    x2={MARGIN.left}
                    y1={MARGIN.top}
                    y2={height - MARGIN.bottom + 4}
                  />
                  {xTicks.map((tick) => (
                    <text key={tick} className="hist-axis-label" x={MARGIN.left + barWidth(tick)} y={height - MARGIN.bottom + 19} textAnchor="middle">
                      {formatMoney(tick)}
                    </text>
                  ))}
                  <text className="hist-axis-label" x={MARGIN.left + innerWidth / 2} y={height - 4} textAnchor="middle">
                    {t('chart.industry.axisX')}
                  </text>
                </svg>
              )}
            </div>
            {hidden > 0 && (
              <figcaption className="histogram-legend">
                <span className="histogram-note">{t('chart.industry.tooFewNote', { min: formatCount(5) })}</span>
              </figcaption>
            )}
          </figure>

          <details className="data-disclosure">
            <summary>{t('chart.industry.tableToggle')}</summary>
            <table className="data-table compact">
              <caption className="sr-only">{t('chart.industry.tableCaption')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('records.colIndustry')}</th>
                  <th scope="col" className="num">
                    {t('benchmark.stats.median')}
                  </th>
                  <th scope="col" className="num">
                    {t('chart.industry.colN')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {bars.map((bar) => (
                  <tr key={bar.industry}>
                    <th scope="row">{INDUSTRY_LABELS[lang][bar.industry]}</th>
                    <td className="num">{formatMoney(bar.median)}</td>
                    <td className="num">{formatCount(bar.n)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </div>
  );
}
