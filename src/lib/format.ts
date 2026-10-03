// Display formatting in the UI language: German shows "€ 4.286" and "21.892",
// English "€4,286" and "21,892" (an English reader takes "4.286" for a
// decimal). German plain numbers use de-DE grouping because de-AT groups them
// with a space while it groups euro amounts with a dot. The I18nProvider sets
// the language (setNumberLanguage); German is the default, also in tests.
import type { Lang } from '../i18n/translate.ts';

function numberFormats(moneyLocale: string, numberLocale: string) {
  return {
    money: new Intl.NumberFormat(moneyLocale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }),
    oneDecimal: new Intl.NumberFormat(numberLocale, { maximumFractionDigits: 1 }),
    twoDecimal: new Intl.NumberFormat(numberLocale, { maximumFractionDigits: 2 }),
    integer: new Intl.NumberFormat(numberLocale, { maximumFractionDigits: 0 }),
  };
}

const NUMBER_FORMATS: Record<Lang, ReturnType<typeof numberFormats>> = {
  de: numberFormats('de-AT', 'de-DE'),
  en: numberFormats('en-GB', 'en-GB'),
};

let numberLang: Lang = 'de';

/** Switches every number formatter below to the UI language. */
export function setNumberLanguage(lang: Lang): void {
  numberLang = lang;
}

const formats = () => NUMBER_FORMATS[numberLang];
const longDateFormatters: Record<Lang, Intl.DateTimeFormat> = {
  de: new Intl.DateTimeFormat('de-AT', { dateStyle: 'medium' }),
  en: new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }),
};

/** Placeholder for values that are not stated. */
export const DASH = '–';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

function isNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function formatMoney(value: number | null | undefined): string {
  return isNumber(value) ? formats().money.format(value) : DASH;
}

/**
 * Benchmark figures are rounded to what their sample supports: to €50 below 50
 * salaries, else to €10. "€ 4.736" from 20 posts would suggest a precision the
 * data does not have.
 */
export function roundToSample(value: number, n: number): number {
  const step = n < 50 ? 50 : 10;
  return Math.round(value / step) * step;
}

export function formatMoneyRange(low: number, high: number): string {
  return `${formatMoney(low)} – ${formatMoney(high)}`;
}

export function formatCount(value: number): string {
  return formats().integer.format(value);
}

export function formatDecimal(value: number | null | undefined): string {
  return isNumber(value) ? formats().oneDecimal.format(value) : DASH;
}

/** Without `lang` (e.g. in non-UI contexts) this keeps the original English abbreviation. */
export function formatYears(value: number | null | undefined, lang?: Lang): string {
  if (!isNumber(value)) return DASH;
  const n = formats().oneDecimal.format(value);
  if (lang === 'de') return `${n} ${value === 1 ? 'Jahr' : 'Jahre'}`;
  return `${n} ${value === 1 ? 'yr' : 'yrs'}`;
}

export function formatHours(value: number | null | undefined): string {
  return isNumber(value) ? `${formats().oneDecimal.format(value)} h` : DASH;
}

export function formatConfidence(value: number): string {
  return formats().twoDecimal.format(value);
}

/** YYYY-MM-DD part of an ISO date or timestamp, or `null` if it is not one. */
export function isoDate(value: string | null | undefined): string | null {
  return typeof value === 'string' && ISO_DATE.test(value) ? value.slice(0, 10) : null;
}

/**
 * Without `lang`, returns the raw ISO date (YYYY-MM-DD) — used in the dense
 * records table/cards, where a compact, sort-friendly format matters more
 * than localisation. With `lang`, returns a localised medium-style date, used
 * in prose (e.g. the header's coverage sentence).
 */
export function formatDate(value: string | null | undefined, lang?: Lang): string {
  const date = isoDate(value);
  if (date === null) return DASH;
  if (!lang) return date;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? date : longDateFormatters[lang].format(parsed);
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${formatCount(count)} ${count === 1 ? singular : plural}`;
}

/**
 * Parses a money amount typed by an Austrian or international visitor:
 * "3500", "3.500", "3 500", "€ 3.500,50", "3500.50", "3,500" and "3,5k".
 * Returns null for anything that is not a positive amount.
 */
export function parseAmount(input: string): number | null {
  let text = input.trim().toLowerCase().replace(/€|eur/g, '').replace(/[\s  ]/g, '');
  let multiplier = 1;
  if (text.endsWith('k')) {
    multiplier = 1000;
    text = text.slice(0, -1);
  }
  if (!/^\d[\d.,]*$/.test(text)) return null;
  let normalized: string;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(text)) {
    normalized = text.replace(/\./g, '').replace(',', '.'); // 3.500 or 3.500,50
  } else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(text)) {
    normalized = text.replace(/,/g, ''); // 3,500 or 3,500.50
  } else if (/^\d+,\d+$/.test(text)) {
    normalized = text.replace(',', '.'); // 3500,50 or 3,5
  } else if (/^\d+(\.\d+)?$/.test(text)) {
    normalized = text; // 3500 or 3500.50
  } else {
    return null;
  }
  const value = Number(normalized) * multiplier;
  return Number.isFinite(value) && value > 0 ? value : null;
}
