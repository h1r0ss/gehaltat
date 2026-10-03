// The finder's role field with its suggestion list (WAI-ARIA combobox with
// list autocomplete). It offers role families, not raw job titles: the most
// posted ones while the field is empty, every family the text matches while
// typing (ranked like the finder resolves them, see roleOptions), and "did you
// mean" families after a typo. Picking one writes the family's label into the
// query, which then resolves to exactly that family. Free text keeps working:
// Enter without a highlighted option leaves the typed query as it is.
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { RoleFamily } from '../types.ts';
import { useI18n } from '../i18n/context.tsx';
import { formatCount } from '../lib/format.ts';
import { roleOptions } from '../lib/roleFamilies.ts';
import type { RoleFamilySuggestion } from '../lib/roleFamilies.ts';
import { CloseIcon, SearchIcon } from './Icons.tsx';

type RoleSearchProps = {
  id: string;
  value: string;
  onChange: (query: string) => void;
  roleFamilies: readonly RoleFamily[];
  familySuggestions: readonly RoleFamilySuggestion[];
  placeholder: string;
  describedBy?: string;
};

export function RoleSearch({ id, value, onChange, roleFamilies, familySuggestions, placeholder, describedBy }: RoleSearchProps) {
  const { t } = useI18n();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const { kind, options } = useMemo(() => roleOptions(roleFamilies, familySuggestions, value), [roleFamilies, familySuggestions, value]);
  // An empty "did you mean" still opens: it tells the visitor the text is searched as typed.
  const expanded = open && (options.length > 0 || kind === 'similar');
  const optionId = (index: number) => `${listId}-option-${index}`;

  useEffect(() => {
    if (expanded && active >= 0) document.getElementById(`${listId}-option-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [expanded, active, listId]);

  const close = () => {
    setOpen(false);
    setActive(-1);
  };
  const pick = (suggestion: RoleFamilySuggestion) => {
    onChange(suggestion.label);
    close();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const count = options.length;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!open) setOpen(true);
        setActive((index) => (count === 0 ? -1 : (index + 1) % count));
        break;
      case 'ArrowUp':
        if (!expanded) return;
        event.preventDefault();
        setActive((index) => (count === 0 ? -1 : index <= 0 ? count - 1 : index - 1));
        break;
      case 'Enter':
        if (expanded && active >= 0 && active < count) {
          event.preventDefault();
          pick(options[active]);
        } else if (expanded) {
          close();
        }
        break;
      case 'Escape':
        // Only close the list; a second Escape then clears the search field as usual.
        if (expanded) {
          event.preventDefault();
          close();
        }
        break;
      case 'Tab':
        close();
        break;
    }
  };

  const heading =
    kind === 'popular' ? t('roleSearch.popular') : kind === 'matches' ? t('roleSearch.matches') : t('roleSearch.similar');

  return (
    <div className="role-search">
      <div className="pill-input">
        <SearchIcon className="pill-input-icon" />
        <input
          ref={inputRef}
          id={id}
          className="pill-input-field"
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-activedescendant={expanded && active >= 0 ? optionId(active) : undefined}
          aria-describedby={describedBy}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => {
            if (value.trim() === '') setOpen(true);
          }}
          onClick={() => setOpen(true)}
          onBlur={close}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
        />
        {value !== '' && (
          <button
            type="button"
            className="role-clear"
            aria-label={t('finder.clearInput')}
            onClick={() => {
              onChange('');
              inputRef.current?.focus();
            }}
          >
            <CloseIcon />
          </button>
        )}
      </div>
      {/* preventDefault keeps focus in the input, so clicking an option or the scrollbar does not blur (and close) the list first. */}
      <div className={expanded ? 'role-popover' : 'role-popover is-hidden'} onMouseDown={(event) => event.preventDefault()}>
        <p className={options.length === 0 ? 'role-popover-heading is-note' : 'role-popover-heading'} id={`${listId}-heading`}>
          {options.length === 0 ? t('roleSearch.none') : heading}
        </p>
        <ul id={listId} role="listbox" aria-labelledby={`${listId}-heading`} className="role-options">
          {options.map((option, index) => (
            <li
              key={option.family.id}
              id={optionId(index)}
              role="option"
              aria-selected={index === active}
              className={index === active ? 'role-option is-active' : 'role-option'}
              onMouseMove={() => setActive(index)}
              onClick={() => pick(option)}
            >
              <span className="role-option-label">{option.label}</span>
              <span className="role-option-count">{t('common.nEntries', { count: option.count, n: formatCount(option.count) })}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {expanded ? t('roleSearch.status', { count: options.length, n: formatCount(options.length) }) : ''}
      </p>
    </div>
  );
}
