// "Gehälter" feed: every matching entry as a compact post-like card, linked
// to its Reddit source, with a sort select above and a "Show more" button
// (20 at a time) instead of pagination.
import { useRef, useState } from 'react';
import type { RoleFamily, SalaryRecord } from '../types.ts';
import type { Lang } from '../i18n/translate.ts';
import { useI18n } from '../i18n/context.tsx';
import { SORT_KEYS, paginate } from '../lib/sort.ts';
import type { SortKey } from '../lib/sort.ts';
import { REGION_LABELS } from '../lib/labels.ts';
import { formatCount, formatDate, formatYears } from '../lib/format.ts';
import { RecordDetails } from './RecordDetails.tsx';
import { CheckIcon, ChevronDownIcon } from './Icons.tsx';
import { Money, NotStated, VerificationBadge } from './ValueDisplay.tsx';

type RecordsListProps = {
  sectionId: string;
  records: SalaryRecord[];
  sort: SortKey;
  onSortChange: (sort: SortKey) => void;
  visibleCount: number;
  onShowMore: () => void;
  /** Family lookup by id, for the family label on each entry (empty until Step 2 data arrives). */
  roleFamilies?: readonly RoleFamily[];
  /** The one role group the search resolved to: its label is not repeated on every entry. */
  activeFamilyId?: string | null;
};

/** German UI: the title as posted (usually German); English UI: the normalized English title. */
function titleOf(record: SalaryRecord, lang: Lang, fallback: string): string {
  return (lang === 'de' ? record.jobTitle || record.standardizedTitle : record.standardizedTitle || record.jobTitle) || fallback;
}

function SourceLink({ record }: { record: SalaryRecord }) {
  const { t, lang } = useI18n();
  if (!record.sourceUrl) return <NotStated label={t('records.noLink')} />;
  return (
    <a className="source-link" href={record.sourceUrl} target="_blank" rel="noopener noreferrer">
      {t('records.viewPost')}
      <span aria-hidden="true"> →</span>
      <span className="sr-only">{t('records.sourceForTitle', { title: titleOf(record, lang, t('records.untitled')) })}</span>
    </a>
  );
}

export function RecordsList({
  sectionId,
  records,
  sort,
  onSortChange,
  visibleCount,
  onShowMore,
  roleFamilies = [],
  activeFamilyId = null,
}: RecordsListProps) {
  const { t, lang } = useI18n();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const headingRef = useRef<HTMLHeadingElement>(null);
  const current = paginate(records, 1, visibleCount);
  const sortLabel = t(`records.sort.${sort}`);
  const familyById = new Map(roleFamilies.map((family) => [family.id, family]));
  const familyLabelOf = (record: SalaryRecord): string | null => {
    if (!record.roleFamily) return null;
    const family = familyById.get(record.roleFamily);
    if (!family) return null;
    return lang === 'de' ? family.labelDe : family.label;
  };

  const toggle = (id: string) =>
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <section id={sectionId} className="card records" aria-labelledby="records-heading">
      <div className="section-head">
        <div>
          <h2 id="records-heading" ref={headingRef} tabIndex={-1}>
            {t('records.heading')}
          </h2>
          <p className="section-sub">
            {current.total === 0
              ? t('records.subEmpty')
              : t('records.sub', { start: formatCount(current.start), end: formatCount(current.end), total: formatCount(current.total) })}
          </p>
        </div>
        <div className="sort-control">
          <label htmlFor="records-sort">{t('records.sortBy')}</label>
          <select
            id="records-sort"
            className="select"
            value={sort}
            onChange={(e) => onSortChange(e.target.value as SortKey)}
          >
            {SORT_KEYS.map((key) => (
              <option key={key} value={key}>
                {t(`records.sort.${key}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {current.total > 0 && (
        <>
          <p className="sr-only">
            {t('records.caption', { shown: formatCount(current.end), total: formatCount(current.total), sortLabel: sortLabel.toLowerCase(), derivedHint: t('common.derivedHint') })}
          </p>
          <ul className="records-legend" aria-label={t('records.legendAria')}>
            <li>
              <span className="derived-mark" aria-hidden="true">
                ≈
              </span>{' '}
              {t('records.legendDerived')}
            </li>
            <li>
              <span className="not-stated" aria-hidden="true">
                –
              </span>{' '}
              {t('records.legendNotStated')}
            </li>
            <li>
              <span className="check-mark" aria-hidden="true">
                <CheckIcon />
              </span>{' '}
              {t('records.legendChecked')}
            </li>
            <li>
              <span className="badge badge-unchecked" aria-hidden="true">
                {t('common.uncheckedLabel')}
              </span>{' '}
              {t('records.legendUnchecked')}
            </li>
          </ul>

          <ul className="record-cards">
            {current.items.map((record) => {
              const isOpen = expanded.has(record.id);
              const detailsId = `entry-details-${record.id}`;
              const familyLabel = familyLabelOf(record);
              const title = titleOf(record, lang, t('records.untitled'));
              const metaParts = [
                ...(familyLabel && record.roleFamily !== activeFamilyId ? [familyLabel] : []),
                record.region ? REGION_LABELS[lang][record.region] : t('records.regionNotStated'),
                record.experienceYears !== null ? formatYears(record.experienceYears, lang) : t('records.experienceNotStated'),
                formatDate(record.postDate, lang),
              ];
              return (
                <li key={record.id} className="record-card">
                  <div className="record-card-top">
                    <h3 className="record-card-title">{title}</h3>
                    <p className="record-card-meta">
                      {metaParts.map((part, index) => (
                        <span key={index}>
                          {index > 0 && <span aria-hidden="true"> · </span>}
                          {part}
                          {index < metaParts.length - 1 && <span className="sr-only">,</span>}
                        </span>
                      ))}
                    </p>
                  </div>

                  <div className="record-card-figures">
                    {/* The figure the entry has in the big slot: gross, or net when only net is known. */}
                    {(record.grossMonthly !== null || record.netMonthly === null) && (
                      <div className="record-card-figure record-card-figure-primary">
                        <span className="record-card-figure-value">
                          <Money value={record.grossMonthly} derived={record.derived.includes('grossMonthly')} />
                        </span>
                        <span className="record-card-figure-label">{t('records.figureGrossMonth')}</span>
                      </div>
                    )}
                    {record.netMonthly !== null && (
                      <div className={record.grossMonthly === null ? 'record-card-figure record-card-figure-primary' : 'record-card-figure'}>
                        <span className="record-card-figure-value">
                          <Money value={record.netMonthly} />
                        </span>
                        <span className="record-card-figure-label">{t('records.figureNetMonth')}</span>
                      </div>
                    )}
                  </div>

                  <div className="record-card-chips">
                    {record.allIn === true && <span className="chip">All-In</span>}
                    {record.collectiveAgreement && (
                      <span className="chip" title={t('filters.kvLabel')}>
                        <span className="sr-only">{t('filters.kvLabel')}: </span>
                        {record.collectiveAgreement}
                        {record.collectiveAgreementGroup && ` · ${record.collectiveAgreementGroup}`}
                      </span>
                    )}
                    {record.derived.includes('paymentsPerYear') ? (
                      <span className="chip" title={t('records.paymentsAssumed')}>
                        ≈{record.paymentsPerYear}×
                      </span>
                    ) : (
                      <span className="chip">{record.paymentsPerYear}×</span>
                    )}
                    <VerificationBadge verified={record.figuresVerified} />
                  </div>

                  <div className="record-card-foot">
                    <SourceLink record={record} />
                    <button
                      type="button"
                      className="btn btn-ghost btn-small details-toggle"
                      aria-expanded={isOpen}
                      aria-controls={detailsId}
                      aria-label={t('records.detailsFor', { title })}
                      onClick={() => toggle(record.id)}
                    >
                      {t('records.detailsToggle')}
                      <ChevronDownIcon className="chevron" />
                    </button>
                  </div>
                  {isOpen && (
                    <div id={detailsId} className="record-card-details">
                      <RecordDetails record={record} familyLabel={familyLabel} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {current.end < current.total && (
            <div className="load-more">
              <button type="button" className="btn btn-secondary btn-pill" onClick={onShowMore}>
                {t('records.showMore')}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
