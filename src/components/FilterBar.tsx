// Filter bar directly under the calculator row: Branche / Bundesland /
// Zeitraum pills (each opens a radio-list popover with live counts), the
// full-time toggle and the "Mehr Filter" button. Sticky under the top bar on
// desktop. Below the desktop breakpoint the pill row scrolls horizontally
// inside itself (never the page) and the popovers turn into bottom sheets.
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { Dispatch, KeyboardEvent, RefObject, SetStateAction } from 'react';
import { INDUSTRIES, REGIONS } from '../types.ts';
import type { Industry } from '../types.ts';
import { useI18n } from '../i18n/context.tsx';
import { FULL_TIME_MIN_HOURS, NOT_STATED, PERIODS, periodCutoff } from '../lib/filters.ts';
import type { FacetCounts, Filters, Period, RegionFilter } from '../lib/filters.ts';
import { INDUSTRY_LABELS, PERIOD_LABELS, REGION_LABELS } from '../lib/labels.ts';
import { formatCount } from '../lib/format.ts';
import { ChevronDownIcon, CloseIcon, FilterIcon } from './Icons.tsx';

type DropdownOption = { value: string; label: string; count: number };
type OpenId = string | null;

type FilterBarProps = {
  filters: Filters;
  onChange: (patch: Partial<Filters>) => void;
  facets: FacetCounts;
  periodCounts: Record<Period, number>;
  referenceDate: string;
  /** Active filters inside the "Mehr Filter" drawer. */
  moreCount: number;
  moreOpen: boolean;
  onToggleMore: () => void;
  moreButtonRef: RefObject<HTMLButtonElement | null>;
  /** Id of the element "Mehr Filter" opens (aria-controls). */
  moreControlsId: string;
};

/** Sum of a facet's counts: what choosing "all" for that filter would yield. */
function totalOf(counts: ReadonlyMap<string, number>): number {
  let total = 0;
  for (const count of counts.values()) total += count;
  return total;
}

/** True once the sticky bar has reached the top bar: an observer on a 1px sentinel placed just above it. */
function useStuck(sentinelRef: RefObject<HTMLElement | null>): boolean {
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === 'undefined') return;
    const header = document.querySelector('.site-header');
    const offset = Math.round(header?.getBoundingClientRect().height ?? 65);
    const observer = new IntersectionObserver(
      ([entry]) => setStuck(!entry.isIntersecting && entry.boundingClientRect.top < offset),
      { rootMargin: `-${offset}px 0px 0px 0px` },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [sentinelRef]);
  return stuck;
}

export function FilterBar({
  filters,
  onChange,
  facets,
  periodCounts,
  referenceDate,
  moreCount,
  moreOpen,
  onToggleMore,
  moreButtonRef,
  moreControlsId,
}: FilterBarProps) {
  const { t, lang } = useI18n();
  const [openId, setOpenId] = useState<OpenId>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const stuck = useStuck(sentinelRef);
  const fullTimeHintId = useId();

  const industryOptions: DropdownOption[] = [
    { value: '', label: t('filters.allIndustries'), count: totalOf(facets.industry) },
    ...INDUSTRIES.map((value) => ({
      value,
      label: INDUSTRY_LABELS[lang][value],
      count: facets.industry.get(value) ?? 0,
    })),
  ];
  const regionOptions: DropdownOption[] = [
    { value: '', label: t('filters.allRegions'), count: totalOf(facets.region) },
    ...REGIONS.map((value) => ({ value, label: REGION_LABELS[lang][value], count: facets.region.get(value) ?? 0 })),
    { value: NOT_STATED, label: t('filters.regionNotStated'), count: facets.region.get(NOT_STATED) ?? 0 },
  ];
  // PERIODS starts with 'all', which is the option that clears the filter.
  const periodOptions: DropdownOption[] = PERIODS.map((period) => ({
    value: period,
    label: PERIOD_LABELS[lang][period],
    count: periodCounts[period],
  }));
  const cutoff = periodCutoff(filters.period, referenceDate);
  const fullTimeLabel = t('filters.fullTimeLabel', { min: formatCount(FULL_TIME_MIN_HOURS) });

  return (
    <>
      <div ref={sentinelRef} className="filter-bar-sentinel" aria-hidden="true" />
      <div className={stuck ? 'filter-bar is-stuck' : 'filter-bar'} role="group" aria-label={t('filters.barLabel')}>
        <div className="filter-bar-row">
          <FilterDropdown
            id="industry"
            label={t('filters.industryLabel')}
            options={industryOptions}
            value={filters.industry}
            onSelect={(value) => onChange({ industry: value as Industry | '' })}
            openId={openId}
            onOpenIdChange={setOpenId}
          />
          <FilterDropdown
            id="region"
            label={t('filters.regionLabel')}
            options={regionOptions}
            value={filters.region}
            onSelect={(value) => onChange({ region: value as RegionFilter })}
            openId={openId}
            onOpenIdChange={setOpenId}
          />
          {/* Pointless while the data is younger than the shortest period: every option gives the same count. */}
          {(filters.period !== 'all' || PERIODS.some((period) => periodCounts[period] !== periodCounts.all)) && (
          <FilterDropdown
            id="period"
            label={t('filters.periodLabel')}
            options={periodOptions}
            value={filters.period}
            onSelect={(value) => onChange({ period: value as Period })}
            openId={openId}
            onOpenIdChange={setOpenId}
            footnote={cutoff ? t('filters.periodHintCutoff', { cutoff }) : t('filters.periodHintAll')}
          />
          )}

          <button
            type="button"
            role="switch"
            aria-checked={filters.fullTimeOnly}
            aria-describedby={fullTimeHintId}
            className="filter-pill filter-pill-solo filter-toggle"
            title={fullTimeLabel}
            onClick={() => onChange({ fullTimeOnly: !filters.fullTimeOnly })}
          >
            <span className="filter-toggle-track" aria-hidden="true">
              <span className="filter-toggle-knob" />
            </span>
            {t('filters.fullTimeShort')}
          </button>
          <span id={fullTimeHintId} className="sr-only">
            {fullTimeLabel}. {t('filters.fullTimeHint')}
          </span>

          <button
            ref={moreButtonRef}
            type="button"
            className={moreCount > 0 ? 'filter-pill filter-pill-solo filter-more is-set' : 'filter-pill filter-pill-solo filter-more'}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            aria-controls={moreOpen ? moreControlsId : undefined}
            onClick={() => {
              setOpenId(null);
              onToggleMore();
            }}
          >
            <FilterIcon />
            {moreCount > 0 ? t('filters.moreWithCount', { n: formatCount(moreCount) }) : t('filters.more')}
          </button>
        </div>
      </div>
    </>
  );
}

type FilterDropdownProps = {
  id: string;
  label: string;
  /** The first option is the "all" option: choosing it clears the filter. */
  options: DropdownOption[];
  value: string;
  onSelect: (value: string) => void;
  openId: OpenId;
  onOpenIdChange: Dispatch<SetStateAction<OpenId>>;
  /** Small print under the options (the period pill explains its cut-off date). */
  footnote?: string;
};

function FilterDropdown({ id, label, options, value, onSelect, openId, onOpenIdChange, footnote }: FilterDropdownProps) {
  const { t } = useI18n();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  // Arrow keys move the radio selection (native behaviour) and keep the popover open; a
  // pointer choice also closes it. Tracks which of the two produced the latest change.
  const viaPointer = useRef(false);
  const popoverId = useId();
  const open = openId === id;
  const allValue = options[0].value;
  const isSet = value !== allValue;
  const selected = options.find((option) => option.value === value);
  const title = isSet ? `${label}: ${selected?.label ?? value}` : label;

  const setOpen = useCallback(
    (next: boolean) => onOpenIdChange((current) => (next ? id : current === id ? null : current)),
    [id, onOpenIdChange],
  );
  const closeAndRestoreFocus = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  // On open, focus moves to the chosen option (or the first usable one).
  useEffect(() => {
    if (!open) return;
    viaPointer.current = false;
    const popover = popoverRef.current;
    const target =
      popover?.querySelector<HTMLInputElement>('input:checked:not(:disabled)') ??
      popover?.querySelector<HTMLInputElement>('input:not(:disabled)');
    target?.focus();
  }, [open]);

  // A click or focus anywhere outside the pill and its popover closes it, without stealing focus.
  useEffect(() => {
    if (!open) return;
    const isOutside = (target: EventTarget | null) =>
      target instanceof Node && wrapperRef.current !== null && !wrapperRef.current.contains(target);
    const onPointerDown = (event: PointerEvent) => {
      if (isOutside(event.target)) setOpen(false);
    };
    const onFocusIn = (event: FocusEvent) => {
      if (isOutside(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('focusin', onFocusIn);
    };
  }, [open, setOpen]);

  const onWrapperKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!open) return;
    viaPointer.current = false;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeAndRestoreFocus();
    } else if (event.key === 'Enter' && popoverRef.current?.contains(event.target as Node)) {
      event.preventDefault();
      closeAndRestoreFocus();
    }
  };

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' && !open) {
      event.preventDefault();
      setOpen(true);
    }
  };

  return (
    <div ref={wrapperRef} className="filter-dropdown" onKeyDown={onWrapperKeyDown}>
      <div className={isSet ? 'filter-pill is-set' : 'filter-pill'}>
        <button
          ref={triggerRef}
          type="button"
          className="filter-pill-main"
          aria-expanded={open}
          aria-controls={open ? popoverId : undefined}
          onClick={() => setOpen(!open)}
          onKeyDown={onTriggerKeyDown}
        >
          <span className="filter-pill-text">{title}</span>
          <ChevronDownIcon className="chevron" />
        </button>
        {isSet && (
          <button
            type="button"
            className="filter-pill-clear"
            aria-label={t('filters.clearOne', { label: title })}
            onClick={() => {
              onSelect(allValue);
              closeAndRestoreFocus();
            }}
          >
            <CloseIcon />
          </button>
        )}
      </div>

      {open && (
        <>
          <div className="filter-popover-scrim" aria-hidden="true" onPointerDown={() => setOpen(false)} />
          <div
            ref={popoverRef}
            id={popoverId}
            className="filter-popover"
            role="radiogroup"
            aria-label={label}
            onPointerDown={() => {
              viaPointer.current = true;
            }}
          >
            <p className="filter-popover-title" aria-hidden="true">
              {label}
            </p>
            {options.map((option) => {
              const checked = option.value === value;
              const disabled = option.count === 0 && !checked && option.value !== allValue;
              return (
                <label key={option.value} className={disabled ? 'filter-option is-disabled' : 'filter-option'}>
                  <input
                    type="radio"
                    name={popoverId}
                    value={option.value}
                    checked={checked}
                    disabled={disabled}
                    onChange={() => onSelect(option.value)}
                    onClick={() => {
                      if (viaPointer.current) closeAndRestoreFocus();
                    }}
                  />
                  <span className="filter-option-mark" aria-hidden="true" />
                  <span className="filter-option-label">{option.label}</span>
                  <span className="filter-option-count" aria-hidden="true">
                    {formatCount(option.count)}
                  </span>
                  <span className="sr-only">
                    , {t('common.nEntries', { count: option.count, n: formatCount(option.count) })}
                  </span>
                </label>
              );
            })}
            {footnote && <p className="hint filter-popover-note">{footnote}</p>}
          </div>
        </>
      )}
    </div>
  );
}
