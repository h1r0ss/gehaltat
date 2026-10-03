// "Mehr Filter": the niche filters that do not earn a place in the filter bar
// (employment type, salary kind, where the figures were found, machine-checked
// only, minimum confidence). A right-hand drawer on desktop and a bottom sheet
// on small screens; every change applies live to the result behind it.
import { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { RefObject } from 'react';
import { EMPLOYMENT_TYPES, SALARY_KINDS, SALARY_SOURCES } from '../types.ts';
import type { EmploymentType, SalaryKind, SalarySource } from '../types.ts';
import { useI18n } from '../i18n/context.tsx';
import { CONFIDENCE_LEVELS, DEFAULT_FILTERS, NOT_STATED } from '../lib/filters.ts';
import type { ConfidenceLevel, FacetCounts, FacetKey, Filters } from '../lib/filters.ts';
import { EMPLOYMENT_TYPE_LABELS, SALARY_KIND_LABELS, SALARY_SOURCE_LABELS } from '../lib/labels.ts';
import { formatConfidence, formatCount } from '../lib/format.ts';
import { CloseIcon } from './Icons.tsx';
import { useModal } from './useModal.ts';

type Option = { value: string; label: string };

type MoreFiltersDrawerProps = {
  /** DOM id of the dialog: the "Mehr Filter" button points its aria-controls at it. */
  id: string;
  open: boolean;
  onClose: () => void;
  filters: Filters;
  onChange: (patch: Partial<Filters>) => void;
  /** Resets only the fields in this drawer. */
  onReset: () => void;
  facets: FacetCounts;
  /** Gross-monthly salaries behind the current result, shown live so the effect of a change is visible. */
  salaryCount: number;
  /** The "Mehr Filter" button: focus returns to it on close. */
  openerRef: RefObject<HTMLElement | null>;
};

type MoreFiltersFormProps = {
  filters: Filters;
  onChange: (patch: Partial<Filters>) => void;
  facets: FacetCounts;
};

function SelectField({
  id,
  label,
  value,
  allLabel,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  allLabel: string;
  options: Array<Option & { count: number }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} className="select" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{allLabel}</option>
        {options.map((option) => (
          // An option without results is unavailable, unless it is the one currently chosen.
          <option key={option.value} value={option.value} disabled={option.count === 0 && option.value !== value}>
            {`${option.label} (${formatCount(option.count)})`}
          </option>
        ))}
      </select>
    </div>
  );
}

export function MoreFiltersDrawer({
  id,
  open,
  onClose,
  filters,
  onChange,
  onReset,
  facets,
  salaryCount,
  openerRef,
}: MoreFiltersDrawerProps) {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useModal(dialogRef, open, { onClose, returnFocusRef: openerRef, initialFocusSelector: 'select' });
  if (!open) return null;

  // Rendered into <body>, outside the app root that useModal makes inert.
  return createPortal(
    <div className="drawer-root">
      <div className="drawer-scrim" onClick={onClose} aria-hidden="true" />
      <div ref={dialogRef} id={id} className="drawer" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="drawer-head">
          <h2 id={titleId}>{t('filters.more')}</h2>
          <button type="button" className="icon-button" aria-label={t('filters.close')} onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        <div className="drawer-body">
          <p className="hint">{t('filters.drawerHint')}</p>
          <MoreFiltersForm filters={filters} onChange={onChange} facets={facets} />
        </div>
        <div className="drawer-foot">
          <p className="drawer-status" role="status">
            {t('filters.drawerStatus', { salaries: t('common.nSalaries', { count: salaryCount, n: formatCount(salaryCount) }) })}
          </p>
          <div className="drawer-actions">
            <button type="button" className="link-button" onClick={onReset}>
              {t('filters.reset')}
            </button>
            <button type="button" className="btn btn-primary btn-pill" onClick={onClose}>
              {t('filters.done')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** The collective agreements present in the current scope, most entries first; the chosen one stays listed at 0. */
function kvOptions(facets: FacetCounts, selected: string): Array<Option & { count: number }> {
  const options = [...facets.collectiveAgreement.entries()]
    .filter(([value]) => value !== NOT_STATED)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de'))
    .map(([value, count]) => ({ value, label: value, count }));
  if (selected && !options.some((option) => option.value === selected)) options.unshift({ value: selected, label: selected, count: 0 });
  return options;
}

function MoreFiltersForm({ filters, onChange, facets }: MoreFiltersFormProps) {
  const { t, lang } = useI18n();

  const withCounts = (key: FacetKey, options: Option[]): Array<Option & { count: number }> =>
    options.map((option) => ({ ...option, count: facets[key].get(option.value) ?? 0 }));
  const totalOf = (key: FacetKey): number => {
    let total = 0;
    for (const count of facets[key].values()) total += count;
    return total;
  };

  return (
    <div className="more-filters">
      <SelectField
        id="filter-employment"
        label={t('filters.employmentLabel')}
        value={filters.employmentType}
        allLabel={t('filters.allEmployment', { n: formatCount(totalOf('employmentType')) })}
        options={withCounts(
          'employmentType',
          EMPLOYMENT_TYPES.map((value) => ({ value, label: EMPLOYMENT_TYPE_LABELS[lang][value] })),
        )}
        onChange={(value) => onChange({ employmentType: value as EmploymentType | '' })}
      />
      <SelectField
        id="filter-kind"
        label={t('filters.kindLabel')}
        value={filters.salaryKind}
        allLabel={t('filters.allKinds', { n: formatCount(totalOf('salaryKind')) })}
        options={withCounts(
          'salaryKind',
          SALARY_KINDS.map((value) => ({ value, label: SALARY_KIND_LABELS[lang][value] })),
        )}
        onChange={(value) => onChange({ salaryKind: value as SalaryKind | '' })}
      />
      <SelectField
        id="filter-source"
        label={t('filters.sourceLabel')}
        value={filters.salarySource}
        allLabel={t('filters.allSources', { n: formatCount(totalOf('salarySource')) })}
        options={withCounts(
          'salarySource',
          SALARY_SOURCES.map((value) => ({ value, label: SALARY_SOURCE_LABELS[lang][value] })),
        )}
        onChange={(value) => onChange({ salarySource: value as SalarySource | '' })}
      />
      <SelectField
        id="filter-kv"
        label={t('filters.kvLabel')}
        value={filters.collectiveAgreement}
        allLabel={t('filters.allKv', { n: formatCount(totalOf('collectiveAgreement')) })}
        options={kvOptions(facets, filters.collectiveAgreement)}
        onChange={(value) => onChange({ collectiveAgreement: value })}
      />

      <div className="check-field">
        <input
          id="filter-verified"
          type="checkbox"
          checked={filters.verifiedOnly}
          onChange={(e) => onChange({ verifiedOnly: e.target.checked })}
          aria-describedby="filter-verified-hint"
        />
        <label htmlFor="filter-verified">{t('filters.verifiedLabel')}</label>
        <p id="filter-verified-hint" className="hint">
          {t('filters.verifiedHint')}
        </p>
      </div>

      <div className="field">
        <label htmlFor="filter-confidence">{t('filters.confidenceLabel')}</label>
        <select
          id="filter-confidence"
          className="select"
          value={String(filters.minConfidence)}
          onChange={(e) => onChange({ minConfidence: Number(e.target.value) as ConfidenceLevel })}
          aria-describedby="filter-confidence-hint"
        >
          {CONFIDENCE_LEVELS.map((level) => (
            <option key={level} value={String(level)}>
              {level === 0 ? t('filters.confidenceAny') : t('filters.confidenceAtLeast', { value: formatConfidence(level) })}
              {level === DEFAULT_FILTERS.minConfidence ? t('filters.confidenceDefault') : ''}
            </option>
          ))}
        </select>
        <p id="filter-confidence-hint" className="hint">
          {t('filters.confidenceHint')}
        </p>
      </div>
    </div>
  );
}
