// "Salary by experience" (the key chart): a scatter of individual salaries
// against years of experience for the current role/industry/region selection
// (ignoring only the experience filter), with a median trend line and a
// P25-P75 band over fixed experience buckets, plus the visitor's own
// experience/salary as reference lines. The salaries inside the experience band
// the result card is based on are drawn in full red on a lightly shaded band
// (the others in muted grey), and the caption states both numbers.
import { useId, useMemo, useRef } from 'react';
import type { SalaryRecord } from '../types.ts';
import { useI18n } from '../i18n/context.tsx';
import { niceTicks } from '../lib/histogram.ts';
import {
  countPointsInRange,
  experiencePoints,
  experienceTrend,
  experienceYCap,
  pointInRange,
  yearAxisMax,
  yearTicks,
} from '../lib/experienceChart.ts';
import type { ExperienceBin, ExperiencePoint } from '../lib/experienceChart.ts';
import type { ExperienceMatch } from '../lib/finder.ts';
import { formatCount, formatDecimal, formatMoney } from '../lib/format.ts';
import { useElementWidth } from './useElementWidth.ts';
import { ExternalLinkIcon } from './Icons.tsx';

const HEIGHT = 300;
const MARGIN = { top: 36, right: 20, bottom: 40, left: 58 };
const MIN_POINTS_FOR_CONFIDENCE = 10;

type ExperienceChartProps = {
  sectionId: string;
  /** Records for the current role/industry/region/more-filters selection, before the experience band is applied. */
  records: readonly SalaryRecord[];
  userExperience: number | null;
  userGrossMonthly: number | null;
  /** The finder's experience band: only a real band (not "no input" or "all levels") is highlighted. */
  match: ExperienceMatch;
};

/** Bucket center used to place the trend/band point; the open-ended last bucket gets a nominal +2y offset. */
function binX(bin: ExperienceBin): number {
  return bin.max === Infinity ? bin.min + 2 : (bin.min + bin.max) / 2;
}

function binRangeLabel(bin: ExperienceBin): string {
  return bin.max === Infinity ? `${formatCount(bin.min)}+` : `${formatCount(bin.min)}–${formatCount(bin.max)}`;
}

/** SVG polygon points for a small upward-pointing triangle centered at (cx, cy), used for points above the y-axis cap. */
function trianglePoints(cx: number, cy: number, r: number): string {
  return `${cx},${cy - r} ${cx - r},${cy + r} ${cx + r},${cy + r}`;
}

export function ExperienceChart({ sectionId, records, userExperience, userGrossMonthly, match }: ExperienceChartProps) {
  const { t, lang } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(containerRef);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const titleId = `exp-title-${uid}`;
  const descId = `exp-desc-${uid}`;

  const points = useMemo(() => experiencePoints(records), [records]);
  const trend = useMemo(() => experienceTrend(points), [points]);

  const innerWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
  const innerHeight = HEIGHT - MARGIN.top - MARGIN.bottom;

  const maxYears = Math.max(5, userExperience ?? 0, ...points.map((p) => p.years));
  const xDomainMax = yearAxisMax(maxYears);
  // Capped at the 98th percentile (rounded up to a nice tick) so a handful of high earners
  // cannot stretch the axis and squash the main mass of points; the floor is always 0.
  const yCap = useMemo(() => experienceYCap(points.map((p) => p.grossMonthly)), [points]);
  const yDomainMin = 0;
  const yDomainMax = Math.max(yCap.max, 1);
  const yTicks = innerHeight > 0 ? niceTicks(yDomainMin, yDomainMax, 5) : [];

  const x = (years: number) => MARGIN.left + (Math.min(years, xDomainMax) / (xDomainMax || 1)) * innerWidth;
  // Values above the cap are clamped to the top edge (MARGIN.top) instead of overflowing the chart.
  const y = (value: number) =>
    MARGIN.top + innerHeight - ((Math.min(value, yDomainMax) - yDomainMin) / (yDomainMax - yDomainMin || 1)) * innerHeight;
  const xTicks = innerWidth > 0 ? yearTicks(xDomainMax, Math.max(3, Math.floor(innerWidth / 70))) : [];

  const trendLine = trend.map((row) => `${x(binX(row.bin))},${y(row.median)}`).join(' ');
  const bandTop = trend.map((row) => `${x(binX(row.bin))},${y(row.p75)}`);
  const bandBottom = trend
    .slice()
    .reverse()
    .map((row) => `${x(binX(row.bin))},${y(row.p25)}`);
  const bandPath = trend.length > 0 ? `${bandTop.join(' ')} ${bandBottom.join(' ')}` : '';

  const youX = userExperience !== null ? x(userExperience) : null;
  const youY = userGrossMonthly !== null ? y(userGrossMonthly) : null;

  // The band the result card is based on; `null` when no experience was entered or every level is shown.
  const range = match.mode === 'band' ? match.range : null;
  const highlighted = range ? countPointsInRange(points, range) : 0;
  const rangeMin = range ? formatDecimal(range.min) : '';
  const rangeMax = range ? formatDecimal(range.max) : '';
  const salaries = t('common.nSalaries', { count: points.length, n: formatCount(points.length) });
  const caption = range
    ? t('chart.experience.captionRange', { salaries, min: rangeMin, max: rangeMax, highlighted: formatCount(highlighted) })
    : t('chart.experience.captionAll', { salaries });
  const description =
    t('chart.experience.desc', { n: formatCount(points.length) }) +
    (range
      ? ` ${t('chart.experience.descRange', { highlighted: formatCount(highlighted), min: rangeMin, max: rangeMax })}`
      : '');
  const rangeLeft = range ? x(range.min) : 0;
  const rangeRight = range ? x(range.max) : 0;
  const yearsUnit = lang === 'de' ? 'J.' : 'yrs';
  // Muted points first, so the highlighted ones are never covered by them.
  const orderedPoints = range
    ? [...points.filter((point) => !pointInRange(point, range)), ...points.filter((point) => pointInRange(point, range))]
    : points;

  return (
    <div id={sectionId} className="tab-panel" role="tabpanel" aria-labelledby="tab-experience">
      <div className="section-head">
        <div>
          <h2 id={`${sectionId}-heading`}>{t('chart.experience.title')}</h2>
          <p className="section-sub">{caption}</p>
        </div>
      </div>

      {points.length === 0 ? (
        <p className="muted">{t('chart.experience.empty')}</p>
      ) : (
        <>
          <figure className="histogram">
            <div ref={containerRef} className="histogram-canvas" style={{ height: HEIGHT }}>
              {width > 0 && (
                <svg width={width} height={HEIGHT} role="img" aria-labelledby={`${titleId} ${descId}`}>
                  <title id={titleId}>{t('chart.experience.title')}</title>
                  <desc id={descId}>{description}</desc>

                  {range && (
                    <g aria-hidden="true">
                      <rect
                        className="exp-range"
                        x={rangeLeft}
                        y={MARGIN.top}
                        width={Math.max(0, rangeRight - rangeLeft)}
                        height={innerHeight}
                      />
                      <line className="exp-range-edge" x1={rangeLeft} x2={rangeLeft} y1={MARGIN.top} y2={HEIGHT - MARGIN.bottom} />
                      <line className="exp-range-edge" x1={rangeRight} x2={rangeRight} y1={MARGIN.top} y2={HEIGHT - MARGIN.bottom} />
                    </g>
                  )}

                  {yTicks.map((tick) => (
                    <g key={`y-${tick}`}>
                      <line className="hist-grid" x1={MARGIN.left} x2={width - MARGIN.right} y1={y(tick)} y2={y(tick)} />
                      <text className="hist-axis-label" x={MARGIN.left - 8} y={y(tick)} dy="0.32em" textAnchor="end">
                        {formatMoney(tick)}
                      </text>
                    </g>
                  ))}

                  {bandPath && <polygon className="exp-band" points={bandPath} />}

                  {orderedPoints.map((point) => {
                    const px = x(point.years);
                    const py = y(point.grossMonthly);
                    const isCapped = point.grossMonthly > yCap.max;
                    const inRange = range ? pointInRange(point, range) : true;
                    const dotClass = `exp-dot${range ? (inRange ? ' exp-dot-in' : ' exp-dot-out') : ''}`;
                    const tooltip =
                      `${point.title} · ${formatMoney(point.grossMonthly)} · ${formatDecimal(point.years)} ${yearsUnit}` +
                      (range ? ` · ${t(inRange ? 'chart.experience.inRange' : 'chart.experience.outsideRange')}` : '');
                    return (
                      <g key={point.id}>
                        <circle className="exp-hit" cx={px} cy={py} r={12} />
                        {isCapped ? (
                          <polygon className={`${dotClass} exp-dot-capped`} points={trianglePoints(px, py, 4)}>
                            <title>{tooltip}</title>
                          </polygon>
                        ) : (
                          <circle className={dotClass} cx={px} cy={py} r={3}>
                            <title>{tooltip}</title>
                          </circle>
                        )}
                      </g>
                    );
                  })}

                  {trendLine && <polyline className="exp-trend-line" points={trendLine} />}
                  {trend.map((row) => (
                    <circle key={row.bin.min} className="exp-trend-dot" cx={x(binX(row.bin))} cy={y(row.median)} r={4}>
                      <title>
                        {t('chart.experience.binSummary', {
                          range: binRangeLabel(row.bin),
                          median: formatMoney(row.median),
                          salaries: t('common.nSalaries', { count: row.n, n: formatCount(row.n) }),
                        })}
                      </title>
                    </circle>
                  ))}

                  {youY !== null && (
                    <g>
                      <line className="exp-you-halo" x1={MARGIN.left} x2={width - MARGIN.right} y1={youY} y2={youY} />
                      <line className="exp-you-line" x1={MARGIN.left} x2={width - MARGIN.right} y1={youY} y2={youY} />
                      <text className="exp-you-label" x={width - MARGIN.right - 4} y={youY - 6} textAnchor="end">
                        {t('finder.youLabel', { salary: formatMoney(userGrossMonthly ?? 0) })}
                      </text>
                    </g>
                  )}
                  {youX !== null && (
                    <g>
                      <line className="exp-you-halo" x1={youX} x2={youX} y1={MARGIN.top} y2={HEIGHT - MARGIN.bottom} />
                      <line className="exp-you-line" x1={youX} x2={youX} y1={MARGIN.top} y2={HEIGHT - MARGIN.bottom} />
                      <text className="exp-you-label" x={youX} y={MARGIN.top - 10} textAnchor="middle">
                        {t('chart.experience.legendYouExperience')}
                      </text>
                    </g>
                  )}
                  {youX !== null && youY !== null && (
                    <circle className="exp-you-point" cx={youX} cy={youY} r={5} />
                  )}

                  <line
                    className="hist-baseline"
                    x1={MARGIN.left}
                    x2={width - MARGIN.right}
                    y1={HEIGHT - MARGIN.bottom}
                    y2={HEIGHT - MARGIN.bottom}
                  />
                  {xTicks.map((tick) => {
                    const tickX = x(tick);
                    return (
                      <g key={`x-${tick}`}>
                        <line className="hist-tick" x1={tickX} x2={tickX} y1={HEIGHT - MARGIN.bottom} y2={HEIGHT - MARGIN.bottom + 4} />
                        <text className="hist-axis-label" x={tickX} y={HEIGHT - MARGIN.bottom + 19} textAnchor="middle">
                          {formatCount(tick)}
                        </text>
                      </g>
                    );
                  })}
                  <text className="hist-axis-label exp-axis-title" x={MARGIN.left + innerWidth / 2} y={HEIGHT - 4} textAnchor="middle">
                    {t('chart.experience.axisX')}
                  </text>
                </svg>
              )}
            </div>
            <figcaption className="histogram-legend">
              {range ? (
                <>
                  <span className="legend-item">
                    <span className="legend-dot" aria-hidden="true" />
                    {t('chart.experience.legendInRange', { min: rangeMin, max: rangeMax })}
                  </span>
                  <span className="legend-item">
                    <span className="legend-dot legend-dot-out" aria-hidden="true" />
                    {t('chart.experience.legendOutside')}
                  </span>
                </>
              ) : (
                <span className="legend-item">
                  <span className="legend-dot" aria-hidden="true" />
                  {t('chart.experience.legendPoints')}
                </span>
              )}
              <span className="legend-item">
                <span className="legend-line legend-trend" aria-hidden="true" />
                {t('chart.experience.legendTrend')}
              </span>
              <span className="legend-item">
                <span className="legend-swatch legend-band" aria-hidden="true" />
                {t('chart.experience.legendBand')}
              </span>
              {(youX !== null || youY !== null) && (
                <span className="legend-item">
                  <span className="legend-line legend-marker" aria-hidden="true" />
                  {youX !== null ? t('chart.experience.legendYouExperience') : t('chart.experience.legendYouSalary')}
                </span>
              )}
              {points.length < MIN_POINTS_FOR_CONFIDENCE && (
                <span className="histogram-note">{t('chart.experience.fewPoints')}</span>
              )}
              {yCap.aboveCount > 0 && (
                <span className="histogram-note">
                  {t('chart.experience.cappedNote', {
                    count: yCap.aboveCount,
                    n: formatCount(yCap.aboveCount),
                    cap: formatMoney(yCap.max),
                  })}
                </span>
              )}
            </figcaption>
          </figure>

          <details className="data-disclosure">
            <summary>{t('chart.experience.tableToggle')}</summary>
            <table className="data-table compact">
              <caption className="sr-only">{t('chart.experience.tableCaption')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('records.colRole')}</th>
                  <th scope="col" className="num">
                    {t('records.colGrossMonthSr')}
                  </th>
                  <th scope="col" className="num">
                    {t('records.colExperienceSr')}
                  </th>
                  {range && <th scope="col">{t('chart.experience.colRange')}</th>}
                  <th scope="col">{t('chart.colPost')}</th>
                </tr>
              </thead>
              <tbody>
                {points.map((point) => (
                  <ExperienceTableRow key={point.id} point={point} inRange={range ? pointInRange(point, range) : null} />
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </div>
  );
}

function ExperienceTableRow({ point, inRange }: { point: ExperiencePoint; inRange: boolean | null }) {
  const { t } = useI18n();
  return (
    <tr>
      <th scope="row">{point.title}</th>
      <td className="num">{formatMoney(point.grossMonthly)}</td>
      <td className="num">{formatDecimal(point.years)}</td>
      {inRange !== null && <td>{inRange ? t('chart.experience.yes') : '–'}</td>}
      <td>
        {point.sourceUrl ? (
          <a className="source-link" href={point.sourceUrl} target="_blank" rel="noopener noreferrer">
            {t('chart.experience.viewPost')}
            <ExternalLinkIcon />
          </a>
        ) : (
          '–'
        )}
      </td>
    </tr>
  );
}
