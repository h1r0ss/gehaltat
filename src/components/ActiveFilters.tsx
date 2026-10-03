// Active-filter chips above the result: the role, the experience band and the
// "Mehr Filter" drawer's settings, most with a one-click ×, plus "Alle zurücksetzen". The experience chip names the band
// the result is really based on (it can be wider than the entered years), so
// it has no ×: the input itself sits in the calculator row above.
import { useRef } from 'react';
import { useI18n } from '../i18n/context.tsx';
import type { Translate } from '../i18n/context.tsx';
import type { Lang } from '../i18n/translate.ts';
import { DEFAULT_FILTERS, isDefaultFilters } from '../lib/filters.ts';
import type { Filters } from '../lib/filters.ts';
import type { ExperienceMatch } from '../lib/finder.ts';
import { formatConfidence, formatCount, formatDecimal } from '../lib/format.ts';
import { EMPLOYMENT_TYPE_LABELS, SALARY_KIND_LABELS, SALARY_SOURCE_LABELS } from '../lib/labels.ts';
import { familyLabel } from '../lib/roleFamilies.ts';
import type { RoleFamilyMatch } from '../lib/roleFamilies.ts';
import { CloseIcon } from './Icons.tsx';

type Chip = {
  id: string;
  label: string;
  /** What removing the chip changes; a chip without one is informational. */
  patch?: Partial<Filters>;
};

type ActiveFiltersProps = {
  filters: Filters;
  familyMatch: RoleFamilyMatch | null;
  match: ExperienceMatch;
  onChange: (patch: Partial<Filters>) => void;
  onResetAll: () => void;
};

function buildChips(filters: Filters, familyMatch: RoleFamilyMatch | null, match: ExperienceMatch, lang: Lang, t: Translate): Chip[] {
  const chips: Chip[] = [];
  const query = filters.query.trim();
  if (query) {
    chips.push({
      id: 'query',
      label: !familyMatch
        ? t('finder.scopeQuery', { query })
        : familyMatch.families.length === 1
          ? familyLabel(familyMatch.families[0], lang)
          : t('chips.roleGroups', { query, n: formatCount(familyMatch.families.length) }),
      patch: { query: DEFAULT_FILTERS.query },
    });
  }
  if (filters.experience !== null) {
    chips.push({
      id: 'experience',
      label: match.range
        ? t('chips.experienceBand', { min: formatDecimal(match.range.min), max: formatDecimal(match.range.max) })
        : t('finder.scopeAllLevels'),
    });
  }
  // Branche, Bundesland, Zeitraum and "Nur Vollzeit" show their state on their own pills in the
  // filter bar; repeating them here only doubled every choice. Chips cover what the bar does not show.
  if (filters.employmentType) {
    chips.push({
      id: 'employment',
      label: EMPLOYMENT_TYPE_LABELS[lang][filters.employmentType],
      patch: { employmentType: DEFAULT_FILTERS.employmentType },
    });
  }
  if (filters.salaryKind) {
    chips.push({ id: 'kind', label: SALARY_KIND_LABELS[lang][filters.salaryKind], patch: { salaryKind: DEFAULT_FILTERS.salaryKind } });
  }
  if (filters.salarySource) {
    chips.push({
      id: 'source',
      label: t('chips.source', { source: SALARY_SOURCE_LABELS[lang][filters.salarySource] }),
      patch: { salarySource: DEFAULT_FILTERS.salarySource },
    });
  }
  if (filters.collectiveAgreement) {
    chips.push({
      id: 'kv',
      label: t('chips.kv', { kv: filters.collectiveAgreement }),
      patch: { collectiveAgreement: DEFAULT_FILTERS.collectiveAgreement },
    });
  }
  if (filters.verifiedOnly) {
    chips.push({ id: 'verified', label: t('chips.verified'), patch: { verifiedOnly: DEFAULT_FILTERS.verifiedOnly } });
  }
  if (filters.minConfidence !== DEFAULT_FILTERS.minConfidence) {
    chips.push({
      id: 'confidence',
      label:
        filters.minConfidence === 0
          ? t('chips.confidenceAny')
          : t('chips.confidence', { value: formatConfidence(filters.minConfidence) }),
      patch: { minConfidence: DEFAULT_FILTERS.minConfidence },
    });
  }
  return chips;
}

export function ActiveFilters({ filters, familyMatch, match, onChange, onResetAll }: ActiveFiltersProps) {
  const { t, lang } = useI18n();
  const groupRef = useRef<HTMLDivElement>(null);
  const chips = buildChips(filters, familyMatch, match, lang, t);
  const canReset = !isDefaultFilters(filters);
  if (chips.length === 0 && !canReset) return null;

  // The button that was clicked disappears with its chip: keep keyboard and screen reader users in place.
  const keepFocus = () => groupRef.current?.focus({ preventScroll: true });

  return (
    <div ref={groupRef} className="active-filters" role="group" aria-label={t('chips.label')} tabIndex={-1}>
      {chips.length > 0 && (
        <ul className="active-chips">
          {chips.map((chip) => {
            const { patch } = chip;
            return (
              <li key={chip.id} className={patch ? 'active-chip' : 'active-chip is-static'}>
                <span className="active-chip-label">{chip.label}</span>
                {patch && (
                  <button
                    type="button"
                    className="active-chip-remove"
                    aria-label={t('chips.remove', { label: chip.label })}
                    onClick={() => {
                      keepFocus();
                      onChange(patch);
                    }}
                  >
                    <CloseIcon />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {canReset && (
        <button
          type="button"
          className="link-button"
          onClick={() => {
            keepFocus();
            onResetAll();
          }}
        >
          {t('chips.resetAll')}
        </button>
      )}
    </div>
  );
}
