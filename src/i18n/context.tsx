// React binding for the i18n core (translate.ts). Language resolution order:
// ?lang= URL param, then localStorage, then navigator.language, then 'de'.
import { setNumberLanguage } from '../lib/format.ts';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { de } from './de.ts';
import { en } from './en.ts';
import { DEFAULT_LANG, isLang, resolveLang, translate } from './translate.ts';
import type { Lang, TranslateParams } from './translate.ts';

export type { Lang, TranslateParams } from './translate.ts';
export { LANGS } from './translate.ts';

const DICTIONARIES = { en, de };
const STORAGE_KEY = 'gehaltat.lang';

export type Translate = (key: string, params?: TranslateParams) => string;

type I18nContextValue = { lang: Lang; setLang: (lang: Lang) => void; t: Translate };

const I18nContext = createContext<I18nContextValue | null>(null);

/** localStorage can throw (private browsing, disabled storage); never let that break the app. */
function readStoredLang(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredLang(lang: Lang): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Ignored: the language just will not persist across visits.
  }
}

function detectInitialLang(): Lang {
  if (typeof window === 'undefined') return DEFAULT_LANG;
  const urlLang = new URLSearchParams(window.location.search).get('lang');
  return resolveLang({
    urlLang,
    storedLang: readStoredLang(),
    navigatorLanguage: typeof navigator === 'undefined' ? null : navigator.language,
  });
}

function setMetaDescription(content: string): void {
  const meta = document.querySelector('meta[name="description"]');
  if (meta) meta.setAttribute('content', content);
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectInitialLang);
  // Before the children render, so every formatted number follows the language switch.
  setNumberLanguage(lang);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = translate(DICTIONARIES, lang, 'meta.title');
    setMetaDescription(translate(DICTIONARIES, lang, 'meta.description'));
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    writeStoredLang(next);
  }, []);

  const t = useMemo<Translate>(() => (key, params) => translate(DICTIONARIES, lang, key, params), [lang]);

  const value = useMemo<I18nContextValue>(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (context === null) throw new Error('useI18n must be used within an I18nProvider');
  return context;
}

export function isSupportedLang(value: string): value is Lang {
  return isLang(value);
}
