// Right-rail sidebar: a discovery shortcut to the most-posted role families,
// and an "about the data" card (coverage numbers, source, disclaimer,
// methodology link) — the content that used to sit in the page header.
import { useMemo, useState } from 'react';
import type { Dataset } from '../types.ts';
import { useI18n } from '../i18n/context.tsx';
import { groupBenchmarks } from '../lib/benchmark.ts';
import { referenceDateOf } from '../lib/dataset.ts';
import { DEFAULT_FILTERS } from '../lib/filters.ts';
import type { RoleFamilySuggestion } from '../lib/roleFamilies.ts';
import { formatCount, formatDate, formatMoney, roundToSample } from '../lib/format.ts';

const TOP_COUNT = 8;

type RightRailProps = {
  dataset: Dataset;
  familySuggestions: readonly RoleFamilySuggestion[];
  onSelectFamily: (label: string) => void;
};

export function RightRail({ dataset, familySuggestions, onSelectFamily }: RightRailProps) {
  return (
    <div className="right-rail">
      <PopularRoles dataset={dataset} familySuggestions={familySuggestions} onSelectFamily={onSelectFamily} />
      <AboutData dataset={dataset} />
    </div>
  );
}

function PopularRoles({
  dataset,
  familySuggestions,
  onSelectFamily,
}: {
  dataset: Dataset;
  familySuggestions: readonly RoleFamilySuggestion[];
  onSelectFamily: (label: string) => void;
}) {
  const { t, lang } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? familySuggestions : familySuggestions.slice(0, TOP_COUNT);
  // The same pipeline and default filters as the result card, so a row's median is what a click shows.
  const groups = useMemo(
    () =>
      groupBenchmarks(
        dataset.records,
        dataset.roleFamilies,
        shown.map((suggestion) => suggestion.family),
        DEFAULT_FILTERS,
        { referenceDate: referenceDateOf(dataset) },
        lang,
      ),
    [dataset, shown, lang],
  );

  const select = (label: string) => {
    onSelectFamily(label);
    document.getElementById('result')?.scrollIntoView({ block: 'start' });
  };

  return (
    <div className="card right-rail-card">
      <h2>{t('rightRail.popularRoles')}</h2>
      {groups.length === 0 ? (
        <p className="muted">{t('rightRail.noRoles')}</p>
      ) : (
        <ul className="popular-roles">
          {groups.map((group) => (
            <li key={group.family.id} className="popular-role">
              <button
                type="button"
                className="popular-role-btn"
                onClick={() => select(group.label)}
                aria-label={t('rightRail.viewRoleAria', { label: group.label })}
              >
                <span className="popular-role-info">
                  <span className="popular-role-label">{group.label}</span>
                  <span className="popular-role-meta">
                    {group.median === null
                      ? t('finder.choiceTooFew', { salaries: t('common.nSalaries', { count: group.n, n: formatCount(group.n) }) })
                      : t('common.nSalaries', { count: group.n, n: formatCount(group.n) })}
                  </span>
                </span>
                {group.median !== null && <span className="popular-role-median">{formatMoney(roundToSample(group.median, group.n))}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {familySuggestions.length > TOP_COUNT && (
        <button type="button" className="link-button popular-roles-toggle" onClick={() => setExpanded((value) => !value)}>
          {expanded ? t('rightRail.showLess') : t('rightRail.allRoles')}
        </button>
      )}
    </div>
  );
}

function AboutData({ dataset }: { dataset: Dataset }) {
  const { t, lang } = useI18n();
  const { coverage, subreddit } = dataset;
  // Bold number + muted label below, instead of one long sentence per stat.
  const stats: Array<{ value: string; label: string }> = [
    { value: formatCount(dataset.records.length), label: t('coverage.recordsNoun', { count: dataset.records.length }) },
    { value: formatCount(coverage.postsCollected), label: t('coverage.postsCollectedNoun', { count: coverage.postsCollected }) },
    {
      value: formatCount(coverage.commentsCollected),
      label: t('coverage.commentsAnalysedNoun', { count: coverage.commentsCollected }),
    },
  ];
  // Sentence-style facts (a date range, a generation date) don't fit the
  // number/label grid, so they stay as plain text lines beneath it.
  const extra: string[] = [];
  if (coverage.firstPostDate && coverage.lastPostDate) {
    extra.push(t('coverage.postsRange', { from: formatDate(coverage.firstPostDate, lang), to: formatDate(coverage.lastPostDate, lang) }));
  }
  if (dataset.generatedAt) extra.push(t('coverage.generated', { date: formatDate(dataset.generatedAt, lang) }));

  return (
    <div className="card right-rail-card">
      <h2>{t('rightRail.aboutData')}</h2>
      <p className="about-data-lead">
        {t('header.leadBefore')}
        <a href={`https://www.reddit.com/r/${subreddit || 'GehaltAT'}/`} target="_blank" rel="noopener noreferrer">
          r/{subreddit || 'GehaltAT'}
          <span className="sr-only">{t('header.opensNewTab')}</span>
        </a>
        {t('header.leadAfter')}
      </p>
      <dl className="coverage" aria-label={t('coverage.label')}>
        {stats.map((stat) => (
          <div key={stat.label} className="coverage-stat">
            <dt className="coverage-stat-value">{stat.value}</dt>
            <dd className="coverage-stat-label">{stat.label}</dd>
          </div>
        ))}
      </dl>
      {extra.length > 0 && (
        <p className="about-data-extra">
          {extra.map((line, index) => (
            <span key={line}>
              {index > 0 && <br />}
              {line}
            </span>
          ))}
        </p>
      )}
      <p className="disclaimer">
        <strong>{t('header.disclaimerStrong')}</strong>
        {t('header.disclaimerText')}
      </p>
      <a className="link-arrow" href="#methodology">
        {t('rightRail.methodologyLink')}
      </a>
    </div>
  );
}
