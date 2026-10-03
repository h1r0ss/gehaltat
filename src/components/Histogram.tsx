// Hand-made SVG histogram. Rendered at the container's real pixel width
// (ResizeObserver) so text never scales down on small screens.
import { useId, useRef } from 'react';
import { useI18n } from '../i18n/context.tsx';
import type { Translate } from '../i18n/context.tsx';
import { niceCountStep, niceTicks } from '../lib/histogram.ts';
import type { Histogram as HistogramData, HistogramBin } from '../lib/histogram.ts';
import { basisNoun } from '../lib/labels.ts';
import type { Summary } from '../lib/stats.ts';
import { formatCount, formatMoney } from '../lib/format.ts';
import { useElementWidth } from './useElementWidth.ts';

const HEIGHT = 240;
const MARGIN = { top: 34, right: 14, bottom: 30, left: 38 };

export type HistogramMarker = { value: number; label: string };

type HistogramProps = {
  data: HistogramData;
  summary: Summary;
  basisLabel: string;
  marker?: HistogramMarker | null;
};

function binLabel(bin: HistogramBin, index: number, data: HistogramData, t: Translate): string {
  const isLast = index === data.bins.length - 1;
  if (index === 0 && data.clippedLow > 0) return t('histogram.binBelow', { max: formatMoney(bin.x1) });
  if (isLast && data.clippedHigh > 0) return t('histogram.binAndAbove', { min: formatMoney(bin.x0) });
  if (isLast) return t('histogram.binRange', { min: formatMoney(bin.x0), max: formatMoney(bin.x1) });
  return t('histogram.binRangeUnder', { min: formatMoney(bin.x0), max: formatMoney(bin.x1) });
}

type Anchor = 'start' | 'middle' | 'end';
type LabelPosition = { x: number; y: number; anchor: Anchor };

function anchorFor(x: number, width: number, halfLabel: number): Anchor {
  if (x - halfLabel < 2) return 'start';
  if (x + halfLabel > width - 2) return 'end';
  return 'middle';
}

const LABEL_WIDTH = 110;

/**
 * Places the median and "You" labels above the plot so that no line crosses a
 * label: centred when far apart, on opposite sides when close, otherwise both
 * stacked on the side that has room.
 */
function layoutLabels(
  medianX: number,
  markerX: number | null,
  width: number,
): { median: LabelPosition; marker: LabelPosition | null } {
  const top = MARGIN.top - 20;
  const second = top + 15;
  const median: LabelPosition = { x: medianX, y: top, anchor: anchorFor(medianX, width, LABEL_WIDTH / 2) };
  if (markerX === null) return { median, marker: null };
  if (Math.abs(markerX - medianX) >= LABEL_WIDTH + 10) {
    return { median, marker: { x: markerX, y: top, anchor: anchorFor(markerX, width, LABEL_WIDTH / 2) } };
  }
  const markerRight = markerX >= medianX;
  const leftLine = Math.min(markerX, medianX);
  const rightLine = Math.max(markerX, medianX);
  if (leftLine - 6 - LABEL_WIDTH >= 0 && rightLine + 6 + LABEL_WIDTH <= width) {
    const left: LabelPosition = { x: leftLine - 6, y: top, anchor: 'end' };
    const right: LabelPosition = { x: rightLine + 6, y: top, anchor: 'start' };
    return markerRight ? { median: left, marker: right } : { median: right, marker: left };
  }
  if (rightLine + 6 + LABEL_WIDTH <= width) {
    return {
      median: { x: rightLine + 6, y: top, anchor: 'start' },
      marker: { x: rightLine + 6, y: second, anchor: 'start' },
    };
  }
  return {
    median: { x: leftLine - 6, y: top, anchor: 'end' },
    marker: { x: leftLine - 6, y: second, anchor: 'end' },
  };
}

export function Histogram({ data, summary, basisLabel, marker = null }: HistogramProps) {
  const { t, lang } = useI18n();
  const basisLabelNoun = basisNoun(basisLabel, lang);
  const containerRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(containerRef);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const titleId = `hist-title-${uid}`;
  const descId = `hist-desc-${uid}`;
  const hatchId = `hist-hatch-${uid}`;

  const innerWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
  const innerHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const maxCount = data.bins.reduce((max, bin) => Math.max(max, bin.count), 0);
  const yStep = niceCountStep(maxCount / 4);
  const yMax = Math.max(yStep, Math.ceil(maxCount / yStep) * yStep);
  const domain = data.end - data.start || 1;
  const x = (value: number) =>
    MARGIN.left + ((Math.min(Math.max(value, data.start), data.end) - data.start) / domain) * innerWidth;
  const y = (count: number) => MARGIN.top + innerHeight - (count / yMax) * innerHeight;
  const baseline = y(0);
  const xTicks = innerWidth > 0 ? niceTicks(data.start, data.end, Math.max(3, Math.floor(innerWidth / 85))) : [];
  const yTicks: number[] = [];
  for (let tick = 0; tick <= yMax; tick += yStep) yTicks.push(tick);

  const medianX = x(summary.median);
  const markerX = marker ? x(marker.value) : null;
  const labels = layoutLabels(medianX, markerX, width);

  const description = t('histogram.desc', {
    values: t('common.nValues', { count: summary.n, n: formatCount(summary.n) }),
    min: formatMoney(summary.min),
    max: formatMoney(summary.max),
    median: formatMoney(summary.median),
    p25: formatMoney(summary.p25),
    p75: formatMoney(summary.p75),
    markerNote: marker ? t('histogram.markerNote', { salary: formatMoney(marker.value) }) : '',
  });

  return (
    <>
      <figure className="histogram">
        <div ref={containerRef} className="histogram-canvas" style={{ height: HEIGHT }}>
          {width > 0 && (
            <svg width={width} height={HEIGHT} role="img" aria-labelledby={`${titleId} ${descId}`}>
              <title id={titleId}>{t('histogram.title', { basis: basisLabelNoun })}</title>
              <desc id={descId}>{description}</desc>
              <defs>
                <pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <rect width="6" height="6" className="hist-hatch-bg" />
                  <line x1="0" y1="0" x2="0" y2="6" className="hist-hatch-line" />
                </pattern>
              </defs>

              {yTicks.map((tick) => (
                <g key={`y-${tick}`}>
                  <line className="hist-grid" x1={MARGIN.left} x2={width - MARGIN.right} y1={y(tick)} y2={y(tick)} />
                  <text className="hist-axis-label" x={MARGIN.left - 8} y={y(tick)} dy="0.32em" textAnchor="end">
                    {tick}
                  </text>
                </g>
              ))}

              <rect
                className="hist-iqr"
                x={x(summary.p25)}
                y={MARGIN.top}
                width={Math.max(0, x(summary.p75) - x(summary.p25))}
                height={innerHeight}
              />

              {data.bins.map((bin, index) => {
                if (bin.count === 0) return null;
                const x0 = x(bin.x0);
                const x1 = x(bin.x1);
                const gap = Math.min(2, (x1 - x0) * 0.15);
                const folded =
                  (index === 0 && data.clippedLow > 0) || (index === data.bins.length - 1 && data.clippedHigh > 0);
                return (
                  <rect
                    key={bin.x0}
                    className="hist-bar"
                    // Inline style: a fill attribute would lose against the .hist-bar CSS rule.
                    style={folded ? { fill: `url(#${hatchId})` } : undefined}
                    x={x0 + gap / 2}
                    y={y(bin.count)}
                    width={Math.max(1, x1 - x0 - gap)}
                    height={baseline - y(bin.count)}
                    rx={2}
                  >
                    <title>
                      {t('histogram.binTitle', {
                        range: binLabel(bin, index, data, t),
                        salaries: t('common.nSalaries', { count: bin.count, n: formatCount(bin.count) }),
                      })}
                    </title>
                  </rect>
                );
              })}

              <line className="hist-baseline" x1={MARGIN.left} x2={width - MARGIN.right} y1={baseline} y2={baseline} />
              {xTicks.map((tick) => {
                const tickX = x(tick);
                return (
                  <g key={`x-${tick}`}>
                    <line className="hist-tick" x1={tickX} x2={tickX} y1={baseline} y2={baseline + 4} />
                    <text
                      className="hist-axis-label"
                      x={tickX}
                      y={baseline + 19}
                      textAnchor={anchorFor(tickX, width, 32)}
                    >
                      {formatMoney(tick)}
                    </text>
                  </g>
                );
              })}

              <line className="hist-quartile" x1={x(summary.p25)} x2={x(summary.p25)} y1={MARGIN.top} y2={baseline} />
              <line className="hist-quartile" x1={x(summary.p75)} x2={x(summary.p75)} y1={MARGIN.top} y2={baseline} />

              <line className="hist-median" x1={medianX} x2={medianX} y1={MARGIN.top - 16} y2={baseline} />
              <text
                className="hist-median-label"
                x={labels.median.x}
                y={labels.median.y}
                textAnchor={labels.median.anchor}
              >
                {`Median ${formatMoney(summary.median)}`}
              </text>

              {marker && markerX !== null && labels.marker && (
                <g>
                  <line className="hist-marker-halo" x1={markerX} x2={markerX} y1={MARGIN.top - 16} y2={baseline} />
                  <line className="hist-marker" x1={markerX} x2={markerX} y1={MARGIN.top - 16} y2={baseline} />
                  <text
                    className="hist-marker-label"
                    x={labels.marker.x}
                    y={labels.marker.y}
                    textAnchor={labels.marker.anchor}
                  >
                    {marker.label}
                  </text>
                </g>
              )}
            </svg>
          )}
        </div>
        <figcaption className="histogram-legend">
          <span className="legend-item">
            <span className="legend-swatch" aria-hidden="true" />
            {t('histogram.salariesPerBand', { step: formatMoney(data.step) })}
          </span>
          <span className="legend-item">
            <span className="legend-line legend-median" aria-hidden="true" />
            {t('benchmark.stats.median')}
          </span>
          <span className="legend-item">
            <span className="legend-line legend-quartile" aria-hidden="true" />
            {t('histogram.legendQuartile')}
          </span>
          {marker && (
            <span className="legend-item">
              <span className="legend-line legend-marker" aria-hidden="true" />
              {t('histogram.legendYourSalary')}
            </span>
          )}
          {data.clippedHigh > 0 && (
            <span className="histogram-note">
              {t('histogram.clippedHighNote', {
                salaries: t('common.nSalaries', { count: data.clippedHigh, n: formatCount(data.clippedHigh) }),
                end: formatMoney(data.end),
              })}
            </span>
          )}
          {data.clippedLow > 0 && (
            <span className="histogram-note">
              {t('histogram.clippedLowNote', {
                salaries: t('common.nSalaries', { count: data.clippedLow, n: formatCount(data.clippedLow) }),
                start: formatMoney(data.start),
              })}
            </span>
          )}
        </figcaption>
      </figure>
      <details className="data-disclosure">
        <summary>{t('histogram.tableToggle')}</summary>
        <table className="data-table compact">
          <caption className="sr-only">{t('histogram.tableCaption', { basis: basisLabelNoun })}</caption>
          <thead>
            <tr>
              <th scope="col">{t('histogram.tableColRange')}</th>
              <th scope="col" className="num">
                {t('histogram.tableColSalaries')}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.bins.map((bin, index) => (
              <tr key={bin.x0}>
                <th scope="row">{binLabel(bin, index, data, t)}</th>
                <td className="num">{bin.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  );
}
