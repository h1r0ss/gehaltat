// Minimal, dependency-free i18n core. Pure functions, imported by Node tests
// and by the React context (context.tsx). No ICU/plural library: German and
// English both have exactly two CLDR plural categories (`one` for n=1,
// `other` otherwise), so a `{key}.one` / `{key}.other` convention is enough.
export type Lang = 'de' | 'en';
export const LANGS: readonly Lang[] = ['de', 'en'];
export const DEFAULT_LANG: Lang = 'de';

export type Dictionary = Record<string, string>;
export type TranslateParams = Record<string, string | number>;

export function isLang(value: string | null | undefined): value is Lang {
  return value !== null && value !== undefined && (LANGS as readonly string[]).includes(value);
}

/** Replaces `{name}` placeholders; a name missing from `params` is left as-is. */
export function interpolate(template: string, params?: TranslateParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

function pickTemplate(dictionaries: Readonly<Record<Lang, Dictionary>>, lang: Lang, key: string): string | null {
  const primary = dictionaries[lang][key];
  if (primary !== undefined) return primary;
  // Defensive fallback only: the i18n test suite asserts both dictionaries
  // carry the same keys, so this should not trigger in normal operation.
  for (const fallback of LANGS) {
    const value = dictionaries[fallback][key];
    if (value !== undefined) return value;
  }
  return null;
}

/**
 * Looks up `key` in `lang`'s dictionary and interpolates `params`. When
 * `params.count` is a number, `{key}.one` (count === 1) or `{key}.other`
 * (otherwise) is tried first and used if present. Falls back to the other
 * language, then to the raw key, so a missing translation never throws.
 */
export function translate(
  dictionaries: Readonly<Record<Lang, Dictionary>>,
  lang: Lang,
  key: string,
  params?: TranslateParams,
): string {
  let resolvedKey = key;
  const count = params?.count;
  if (typeof count === 'number') {
    const pluralKey = `${key}.${count === 1 ? 'one' : 'other'}`;
    if (pickTemplate(dictionaries, lang, pluralKey) !== null) resolvedKey = pluralKey;
  }
  const template = pickTemplate(dictionaries, lang, resolvedKey);
  return interpolate(template ?? key, params);
}

export type LangSources = {
  urlLang: string | null;
  storedLang: string | null;
  navigatorLanguage: string | null;
};

/** Resolution order: `?lang=` URL param, then localStorage, then the browser language, then `DEFAULT_LANG`. */
export function resolveLang({ urlLang, storedLang, navigatorLanguage }: LangSources): Lang {
  if (isLang(urlLang)) return urlLang;
  if (isLang(storedLang)) return storedLang;
  if (navigatorLanguage && navigatorLanguage.trim().toLowerCase().startsWith('de')) return 'de';
  return DEFAULT_LANG;
}
