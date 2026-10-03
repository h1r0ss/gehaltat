// Per-language display labels for contract enum values. Each map is keyed by
// language first so a component can pick `LABELS[lang]` once and pass the
// resulting `Record<K, string>` to `labelFor`.
import type { DerivedField, EmploymentType, Industry, Region, SalaryKind, SalarySource, Seniority } from '../types.ts';
import type { Period } from './filters.ts';
import type { Basis } from './stats.ts';
import type { Lang } from '../i18n/translate.ts';

type LangMap<K extends string> = Record<Lang, Record<K, string>>;

export const SENIORITY_LABELS: LangMap<Seniority> = {
  en: { junior: 'Junior', mid: 'Mid-level', senior: 'Senior', lead: 'Lead' },
  de: { junior: 'Junior', mid: 'Mid-Level', senior: 'Senior', lead: 'Lead' },
};

export const EMPLOYMENT_TYPE_LABELS: LangMap<EmploymentType> = {
  en: { employee: 'Employee', civil_servant: 'Civil servant', apprentice: 'Apprentice', intern: 'Intern', freelancer: 'Freelancer' },
  de: {
    employee: 'Angestellt',
    civil_servant: 'Beamt:in / Vertragsbedienstete:r',
    apprentice: 'Lehrling',
    intern: 'Praktikum',
    freelancer: 'Selbstständig',
  },
};

export const SALARY_KIND_LABELS: LangMap<SalaryKind> = {
  en: { current: 'Current salary', offer: 'Job offer' },
  de: { current: 'Aktuelles Gehalt', offer: 'Jobangebot' },
};

export const SALARY_SOURCE_LABELS: LangMap<SalarySource> = {
  en: { post: 'Post text', comment: 'Comment', image: 'Image (payslip)' },
  de: { post: 'Beitragstext', comment: 'Kommentar', image: 'Bild (Lohnzettel)' },
};

export const DERIVED_FIELD_LABELS: LangMap<DerivedField> = {
  en: { grossMonthly: 'Gross monthly', grossAnnual: 'Gross annual', paymentsPerYear: 'Payments per year' },
  de: { grossMonthly: 'Brutto/Monat', grossAnnual: 'Brutto/Jahr', paymentsPerYear: 'Zahlungen pro Jahr' },
};

export const BASIS_LABELS: LangMap<Basis> = {
  en: { grossMonthly: 'Gross monthly', grossAnnual: 'Gross annual', netMonthly: 'Net monthly' },
  de: { grossMonthly: 'Brutto/Monat', grossAnnual: 'Brutto/Jahr', netMonthly: 'Netto/Monat' },
};

export const PERIOD_LABELS: LangMap<Period> = {
  en: { all: 'All time', '12m': '12 months', '24m': '24 months' },
  de: { all: 'Gesamter Zeitraum', '12m': '12 Monate', '24m': '24 Monate' },
};

export const REGION_LABELS: LangMap<Region> = {
  en: {
    Vienna: 'Vienna',
    'Lower Austria': 'Lower Austria',
    'Upper Austria': 'Upper Austria',
    Styria: 'Styria',
    Carinthia: 'Carinthia',
    Salzburg: 'Salzburg',
    Tyrol: 'Tyrol',
    Vorarlberg: 'Vorarlberg',
    Burgenland: 'Burgenland',
  },
  de: {
    Vienna: 'Wien',
    'Lower Austria': 'Niederösterreich',
    'Upper Austria': 'Oberösterreich',
    Styria: 'Steiermark',
    Carinthia: 'Kärnten',
    Salzburg: 'Salzburg',
    Tyrol: 'Tirol',
    Vorarlberg: 'Vorarlberg',
    Burgenland: 'Burgenland',
  },
};

export const INDUSTRY_LABELS: LangMap<Industry> = {
  en: {
    'IT & Software': 'IT & Software',
    'Finance & Insurance': 'Finance & Insurance',
    'Healthcare & Social': 'Healthcare & Social',
    'Engineering & Manufacturing': 'Engineering & Manufacturing',
    'Construction & Trades': 'Construction & Trades',
    'Public Sector': 'Public Sector',
    'Education & Research': 'Education & Research',
    'Retail & Sales': 'Retail & Sales',
    'Hospitality & Tourism': 'Hospitality & Tourism',
    'Logistics & Transport': 'Logistics & Transport',
    'Energy & Utilities': 'Energy & Utilities',
    'Consulting & Professional Services': 'Consulting & Professional Services',
    Legal: 'Legal',
    'Media & Marketing': 'Media & Marketing',
    'Pharma & Chemicals': 'Pharma & Chemicals',
    Telecommunications: 'Telecommunications',
    Other: 'Other',
  },
  de: {
    'IT & Software': 'IT & Software',
    'Finance & Insurance': 'Finanzen & Versicherung',
    'Healthcare & Social': 'Gesundheit & Soziales',
    'Engineering & Manufacturing': 'Technik & Fertigung',
    'Construction & Trades': 'Bau & Handwerk',
    'Public Sector': 'Öffentlicher Dienst',
    'Education & Research': 'Bildung & Forschung',
    'Retail & Sales': 'Handel & Verkauf',
    'Hospitality & Tourism': 'Gastgewerbe & Tourismus',
    'Logistics & Transport': 'Logistik & Transport',
    'Energy & Utilities': 'Energie & Versorgung',
    'Consulting & Professional Services': 'Beratung & Dienstleistungen',
    Legal: 'Recht',
    'Media & Marketing': 'Medien & Marketing',
    'Pharma & Chemicals': 'Pharma & Chemie',
    Telecommunications: 'Telekommunikation',
    Other: 'Sonstige',
  },
};

/** Label for a value in an already-language-selected map (e.g. `SENIORITY_LABELS[lang]`); `null`/`undefined` uses `missing`. */
export function labelFor<K extends string>(labels: Record<K, string>, value: K | null | undefined, missing: string): string {
  if (value === null || value === undefined) return missing;
  return labels[value] ?? String(value);
}

/**
 * A basis label (e.g. "Gross monthly" / "Brutto/Monat") for embedding as a
 * noun phrase mid-sentence ("435 salaries with a … figure"). English reads
 * naturally lowercased; German nouns are always capitalised, so they are left as-is.
 */
export function basisNoun(label: string, lang: Lang): string {
  return lang === 'de' ? label : label.toLowerCase();
}
