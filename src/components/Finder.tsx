// Hero calculator row: role search (with its suggestion list, RoleSearch.tsx),
// years of experience and an optional own salary, plus a button that jumps to
// the live result (ResultCard.tsx). Only the inputs live here — the calculated
// benchmark itself is ResultCard, rendered as its own card in the center
// column so it reads as the page's hero result rather than being nested
// inside this form.
import { useState } from 'react';
import type { FormEvent } from 'react';
import type { RoleFamily } from '../types.ts';
import { useI18n } from '../i18n/context.tsx';
import type { SalaryBasisInput, SalaryFrequency, SalaryInput } from '../lib/calculator.ts';
import type { Filters } from '../lib/filters.ts';
import { formatCount, parseAmount } from '../lib/format.ts';
import type { RoleFamilySuggestion } from '../lib/roleFamilies.ts';
import { MIN_BENCHMARK_N } from '../lib/stats.ts';
import { RoleSearch } from './RoleSearch.tsx';

/** The salary field's unit menu: one choice for gross/net and month/year together. */
const SALARY_UNITS: ReadonlyArray<{ basis: SalaryBasisInput; frequency: SalaryFrequency; key: string }> = [
  { basis: 'gross', frequency: 'month', key: 'calc.unitGrossMonth' },
  { basis: 'net', frequency: 'month', key: 'calc.unitNetMonth' },
  { basis: 'gross', frequency: 'year', key: 'calc.unitGrossYear' },
  { basis: 'net', frequency: 'year', key: 'calc.unitNetYear' },
];

type FinderProps = {
  filters: Filters;
  onChange: (patch: Partial<Filters>) => void;
  salaryInput: SalaryInput;
  onSalaryInputChange: (patch: Partial<SalaryInput>) => void;
  roleFamilies: readonly RoleFamily[];
  familySuggestions: readonly RoleFamilySuggestion[];
};

/** Results update live; submitting (button or Enter) brings the result into view and moves focus there. */
function showResult(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  const result = document.getElementById('result');
  if (!result) return;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  result.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  result.focus({ preventScroll: true });
}

function parseYears(value: string): number | null {
  if (value.trim() === '') return null;
  const years = Number(value);
  return Number.isFinite(years) && years >= 0 && years <= 70 ? years : null;
}

export function Finder({ filters, onChange, salaryInput, onSalaryInputChange, roleFamilies, familySuggestions }: FinderProps) {
  const { t } = useI18n();
  // Keep the visitor's own formatting ("3.500") while typing; only the parsed value goes up.
  const [salaryText, setSalaryText] = useState(salaryInput.amount === null ? '' : String(salaryInput.amount));
  const salaryInvalid = salaryText.trim() !== '' && parseAmount(salaryText) === null;

  return (
    <form className="finder-form" role="search" aria-label={t('finder.formAriaLabel')} onSubmit={showResult}>
      <div className="finder-row">
        <div className="field finder-field-query">
          <label className="finder-caption" htmlFor="finder-query">
            {t('finder.roleLabel')}
          </label>
          <RoleSearch
            id="finder-query"
            value={filters.query}
            onChange={(query) => onChange({ query })}
            roleFamilies={roleFamilies}
            familySuggestions={familySuggestions}
            placeholder={t('finder.rolePlaceholder')}
            describedBy="finder-query-hint"
          />
          <p id="finder-query-hint" className="sr-only">
            {t('finder.roleHint')}
          </p>
        </div>

        <div className="field finder-field-experience">
          <label className="finder-caption" htmlFor="finder-experience">
            {t('finder.experienceLabel')}
          </label>
          <input
            id="finder-experience"
            className="input input-compact"
            type="number"
            inputMode="numeric"
            min={0}
            max={70}
            step={1}
            value={filters.experience ?? ''}
            onChange={(e) => onChange({ experience: parseYears(e.target.value) })}
            placeholder={t('finder.experiencePlaceholder')}
            aria-describedby="finder-experience-hint"
          />
          <span id="finder-experience-hint" className="sr-only">
            {t('finder.experienceHint', { min: formatCount(MIN_BENCHMARK_N) })}
          </span>
        </div>

        <div className="field finder-field-salary">
          <label className="finder-caption" htmlFor="finder-salary">
            {t('calc.salaryLabel')}
          </label>
          <div className="salary-input">
            <input
              id="finder-salary"
              className="input input-compact salary-input-amount"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={salaryText}
              onChange={(e) => {
                setSalaryText(e.target.value);
                onSalaryInputChange({ amount: parseAmount(e.target.value) });
              }}
              placeholder={t('calc.salaryPlaceholder')}
              aria-invalid={salaryInvalid || undefined}
              aria-describedby="finder-salary-hint"
            />
            <select
              className="select salary-input-unit"
              aria-label={t('calc.unitLabel')}
              value={`${salaryInput.basis}-${salaryInput.frequency}`}
              onChange={(e) => {
                const unit = SALARY_UNITS.find((option) => `${option.basis}-${option.frequency}` === e.target.value);
                if (unit) onSalaryInputChange({ basis: unit.basis, frequency: unit.frequency });
              }}
            >
              {SALARY_UNITS.map((unit) => (
                <option key={unit.key} value={`${unit.basis}-${unit.frequency}`}>
                  {t(unit.key)}
                </option>
              ))}
            </select>
          </div>
          <p id="finder-salary-hint" className={salaryInvalid ? 'hint field-error finder-salary-error' : 'sr-only'}>
            {salaryInvalid ? t('calc.salaryHintInvalid') : t('calc.salaryHintDefault')}
          </p>
        </div>

        <div className="finder-field-submit">
          <span className="finder-caption finder-field-submit-spacer" aria-hidden="true">
            {'\u00a0'}
          </span>
          <button type="submit" className="btn btn-primary btn-pill finder-submit">
            {t('finder.compareButton')}
          </button>
        </div>
      </div>
    </form>
  );
}
