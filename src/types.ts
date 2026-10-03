// Data contract between the data pipeline and the UI.
// public/data/salaries.json is a `Dataset`. scripts/build-dataset.mjs imports the
// value lists below via Node type stripping, so keep this file erasable-only
// (no enums, namespaces or parameter properties).

export const INDUSTRIES = [
  'IT & Software',
  'Finance & Insurance',
  'Healthcare & Social',
  'Engineering & Manufacturing',
  'Construction & Trades',
  'Public Sector',
  'Education & Research',
  'Retail & Sales',
  'Hospitality & Tourism',
  'Logistics & Transport',
  'Energy & Utilities',
  'Consulting & Professional Services',
  'Legal',
  'Media & Marketing',
  'Pharma & Chemicals',
  'Telecommunications',
  'Other',
] as const;
export type Industry = (typeof INDUSTRIES)[number];

// Austrian federal states (English names). `null` in a record means "not stated".
export const REGIONS = [
  'Vienna',
  'Lower Austria',
  'Upper Austria',
  'Styria',
  'Carinthia',
  'Salzburg',
  'Tyrol',
  'Vorarlberg',
  'Burgenland',
] as const;
export type Region = (typeof REGIONS)[number];

export const SENIORITIES = ['junior', 'mid', 'senior', 'lead'] as const;
export type Seniority = (typeof SENIORITIES)[number];

export const EMPLOYMENT_TYPES = ['employee', 'civil_servant', 'apprentice', 'intern', 'freelancer'] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const SALARY_KINDS = ['current', 'offer'] as const;
export type SalaryKind = (typeof SALARY_KINDS)[number];

// Where the salary figures were found: post text, a comment, or OCR of an attached image (payslip).
export const SALARY_SOURCES = ['post', 'comment', 'image'] as const;
export type SalarySource = (typeof SALARY_SOURCES)[number];

// Fields computed by the build script instead of stated by the poster.
export type DerivedField = 'grossMonthly' | 'grossAnnual' | 'paymentsPerYear';

export type SalaryRecord = {
  id: string; // postId, or `${postId}-2` when one post yields several records
  postId: string;
  sourceUrl: string; // Reddit permalink
  postDate: string; // YYYY-MM-DD (UTC)
  postTitle: string; // original title, usually German
  flair: string | null;
  upvotes: number;
  numComments: number;
  jobTitle: string; // as written by the poster
  standardizedTitle: string; // normalized English job title
  roleFamily: string | null; // RoleFamily id grouping similar titles (e.g. Project Manager + Project Lead)
  industry: Industry;
  seniority: Seniority | null;
  experienceYears: number | null;
  region: Region | null;
  hoursPerWeek: number | null;
  employmentType: EmploymentType;
  salaryKind: SalaryKind;
  paymentsPerYear: 12 | 14; // salary payments per year (Austria: usually 14)
  grossMonthly: number | null; // EUR per regular payment
  grossAnnual: number | null; // EUR per year incl. 13th/14th payment, excl. bonus
  netMonthly: number | null; // EUR regular monthly net (not the 13th/14th)
  hourlyGross: number | null;
  bonusAnnual: number | null;
  allIn: boolean | null; // all-in contract (overtime included)
  collectiveAgreement: string | null; // Kollektivvertrag, normalized (data/collective-agreements.json), e.g. "IT-KV"
  collectiveAgreementGroup: string | null; // grade within it when stated, e.g. "ST2", "D2", "VWG 8"
  salarySource: SalarySource;
  derived: DerivedField[];
  // true: every figure was found in the post text, comments or OCR text of the image.
  // false: at least one figure was read from an image by the extraction agent and could not be machine-checked.
  figuresVerified: boolean;
  // Short snippets containing the figures: verbatim from the post, or "[image] ..." transcribed from an image.
  evidence: string[];
  confidence: number; // 0..1 after automated validation
  notes: string; // short English context
  notesDe: string | null; // German translation of notes (data/translations/notes-de.json), null until translated
};

// Group of similar job titles at any seniority, with English and German search aliases
// (curated in data/role-families.json).
export type RoleFamily = {
  id: string;
  label: string; // English
  labelDe: string; // German
  aliases: string[]; // English and German search terms
};

export type Dataset = {
  generatedAt: string; // ISO timestamp
  subreddit: string;
  roleFamilies: RoleFamily[];
  coverage: {
    postsCollected: number; // posts analysed (excludes removed/deleted and pinned posts)
    commentsCollected: number; // comments on those posts
    postsWithSalary: number;
    records: number;
    firstPostDate: string | null;
    lastPostDate: string | null;
  };
  records: SalaryRecord[];
};
