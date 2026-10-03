// Slim top bar: wordmark, section nav (with a scroll-spy active state) and
// the DE/EN toggle. The hero headline and data coverage now live further
// down the page (Hero in App.tsx, "About the data" in RightRail.tsx).
import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/context.tsx';
import type { Lang } from '../i18n/context.tsx';

/** Section ids the nav links to; must match the `id`s rendered in App.tsx. */
const NAV_SECTIONS = [
  { id: 'calculator', key: 'nav.calculator' },
  { id: 'entries', key: 'nav.allSalaries' },
  { id: 'methodology', key: 'nav.methodology' },
] as const;

export function Header({ ready }: { ready: boolean }) {
  const { t } = useI18n();
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || typeof IntersectionObserver === 'undefined') return;
    const elements = NAV_SECTIONS.map((section) => document.getElementById(section.id)).filter(
      (el): el is HTMLElement => el !== null,
    );
    if (elements.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-72px 0px -60% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [ready]);

  return (
    <header className="site-header">
      <div className="container site-header-bar">
        <a className="brand" href="#top" aria-label={t('header.title')}>
          Gehalt<span className="brand-accent">AT</span>
        </a>
        {ready && (
          <nav className="site-nav" aria-label={t('header.title')}>
            {NAV_SECTIONS.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className={active === section.id ? 'nav-link is-active' : 'nav-link'}
                aria-current={active === section.id ? 'true' : undefined}
              >
                {t(section.key)}
              </a>
            ))}
          </nav>
        )}
        <LangToggle />
      </div>
    </header>
  );
}

// "DE" / "EN" are the language codes themselves, so they are not translated.
const LANG_VALUES: readonly Lang[] = ['de', 'en'];

function LangToggle() {
  const { lang, setLang, t } = useI18n();
  return (
    <div className="lang-toggle" role="group" aria-label={t('header.langLabel')}>
      {LANG_VALUES.map((value) => (
        <button
          key={value}
          type="button"
          className={value === lang ? 'lang-toggle-btn is-active' : 'lang-toggle-btn'}
          aria-pressed={value === lang}
          onClick={() => setLang(value)}
        >
          {value.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
