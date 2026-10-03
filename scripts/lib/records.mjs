// Turns one agent-extracted candidate into a validated SalaryRecord (see src/types.ts).
// A stated figure is machine-verified when it appears in the post text, the comments or the local
// OCR text of an attached image. A figure the agent read from an image that OCR could not confirm
// is kept only if the post has images and an "[image] ..." evidence line shows it; such records get
// figuresVerified = false and capped confidence. Any other figure is dropped.
// Missing monthly/annual values are derived and flagged.
import {
  EMPLOYMENT_TYPES,
  INDUSTRIES,
  REGIONS,
  SALARY_KINDS,
  SALARY_SOURCES,
  SENIORITIES,
} from '../../src/types.ts';
import { extractAmounts, hasAmount } from './numbers.mjs';

// Plausible EUR ranges per stated figure; values outside are treated as extraction errors.
const FIGURE_LIMITS = {
  grossMonthly: [300, 40000],
  netMonthly: [250, 25000],
  grossAnnual: [4000, 600000],
  hourlyGross: [5, 300],
  bonusAnnual: [1, 1000000],
};
const WEEKS_PER_MONTH = 4.33;
const ISSUE_PENALTY = 0.15;
const UNVERIFIED_CONFIDENCE_CAP = 0.8;
export const MIN_CONFIDENCE = 0.3;
export const IMAGE_EVIDENCE_PREFIX = '[image]';

export function sourceText(post, ocrTexts = []) {
  return [post.title, post.selftext, ...ocrTexts, ...(post.comments ?? []).map((comment) => comment.body)]
    .filter(Boolean)
    .join('\n');
}

// Returns { record, issues } for a usable candidate, or { reason } when it must be rejected.
export function buildRecord(candidate, post, { ocrTexts = [], imageCount = 0 } = {}) {
  if (candidate.inAustria === false) return { reason: 'job outside Austria' };

  const text = sourceText(post, ocrTexts);
  const verifiedAmounts = extractAmounts(text);
  const snippets = (Array.isArray(candidate.evidence) ? candidate.evidence : []).map((snippet) => String(snippet).trim());
  const imageSnippets = imageCount > 0 ? snippets.filter((snippet) => snippet.startsWith(IMAGE_EVIDENCE_PREFIX)) : [];
  const imageAmounts = extractAmounts(imageSnippets.join('\n'));

  const issues = [];
  const figures = {};
  const visionOnly = new Set();
  for (const [field, [min, max]] of Object.entries(FIGURE_LIMITS)) {
    const value = toNumber(candidate[field]);
    figures[field] = null;
    if (value === null) continue;
    if (value < min || value > max) {
      issues.push(`${field} ${value} implausible`);
    } else if (hasAmount(verifiedAmounts, value)) {
      figures[field] = value;
    } else if (hasAmount(imageAmounts, value)) {
      figures[field] = value;
      visionOnly.add(field);
    } else {
      issues.push(`${field} ${value} not found in source`);
    }
  }

  if (figures.grossMonthly !== null && figures.netMonthly !== null) {
    const ratio = figures.netMonthly / figures.grossMonthly;
    // From about 1,500 gross, Austrian social insurance and wage tax keep net below ~90% of gross.
    // Identical figures above that point mean one of them is mislabelled, so neither is trusted.
    const taxed = figures.grossMonthly >= 1500;
    if (taxed && ratio === 1) {
      issues.push('net equals gross');
      figures.netMonthly = null;
      figures.grossMonthly = null;
    } else if (ratio > 1 || ratio < 0.4 || (taxed && ratio > 0.9)) {
      issues.push(`net/gross ratio ${ratio.toFixed(2)} implausible`);
      figures.netMonthly = null;
    }
  }
  if (figures.grossMonthly !== null && figures.grossAnnual !== null) {
    const ratio = figures.grossAnnual / figures.grossMonthly;
    if (ratio < 11.5 || ratio > 16) {
      issues.push(`annual/monthly ratio ${ratio.toFixed(1)} implausible`);
      figures.grossAnnual = null;
    }
  }

  const employmentType = oneOf(EMPLOYMENT_TYPES, candidate.employmentType, 'employee');
  const hoursPerWeek = inRange(toNumber(candidate.hoursPerWeek), 1, 80);
  const derived = [];

  let paymentsPerYear = [12, 14].includes(toNumber(candidate.paymentsPerYear)) ? toNumber(candidate.paymentsPerYear) : null;
  if (paymentsPerYear === null) {
    paymentsPerYear = employmentType === 'freelancer' ? 12 : 14;
    derived.push('paymentsPerYear');
  }

  let { grossMonthly, grossAnnual } = figures;
  if (grossMonthly === null && grossAnnual !== null) {
    grossMonthly = Math.round(grossAnnual / paymentsPerYear);
    derived.push('grossMonthly');
  } else if (grossMonthly === null && figures.hourlyGross !== null && hoursPerWeek !== null) {
    grossMonthly = Math.round(figures.hourlyGross * hoursPerWeek * WEEKS_PER_MONTH);
    derived.push('grossMonthly');
  }
  if (grossAnnual === null && grossMonthly !== null) {
    grossAnnual = Math.round(grossMonthly * paymentsPerYear);
    derived.push('grossAnnual');
  }

  if (grossMonthly === null && figures.netMonthly === null) {
    return { reason: issues.length ? `no verified salary figure (${issues.join('; ')})` : 'no salary figure' };
  }

  const haystack = normalizeForMatch(text);
  const evidence = snippets
    .filter((snippet) => snippet.length >= 3 && snippet.length <= 160)
    .filter((snippet) =>
      snippet.startsWith(IMAGE_EVIDENCE_PREFIX)
        ? imageCount > 0 && /\d/.test(snippet)
        : haystack.includes(normalizeForMatch(snippet)),
    )
    .slice(0, 4);
  if (evidence.length === 0) issues.push('no evidence snippet found in source');

  const figuresVerified = !Object.keys(FIGURE_LIMITS).some((field) => figures[field] !== null && visionOnly.has(field));
  let confidence = clamp((toNumber(candidate.confidence) ?? 0.5) - ISSUE_PENALTY * issues.length, 0, 1);
  if (!figuresVerified) confidence = Math.min(confidence, UNVERIFIED_CONFIDENCE_CAP);
  confidence = round2(confidence);
  if (confidence < MIN_CONFIDENCE) return { reason: `confidence ${confidence} below ${MIN_CONFIDENCE} (${issues.join('; ')})` };

  const jobTitle = text1(candidate.jobTitle) || post.title;
  const experienceYears = inRange(toNumber(candidate.experienceYears), 0, 50);
  const record = {
    id: post.id,
    postId: post.id,
    sourceUrl: post.permalink,
    postDate: new Date(post.createdUtc * 1000).toISOString().slice(0, 10),
    postTitle: post.title,
    flair: text1(post.flair) || null,
    upvotes: post.score ?? 0,
    numComments: post.numComments ?? 0,
    jobTitle,
    standardizedTitle: titleCase(text1(candidate.standardizedTitle) || jobTitle),
    roleFamily: null, // assigned by build-dataset from data/role-families.json
    industry: oneOf(INDUSTRIES, candidate.industry, 'Other'),
    seniority: seniorityFor(oneOf(SENIORITIES, candidate.seniority, null), experienceYears),
    experienceYears,
    region: oneOf(REGIONS, candidate.region, null),
    hoursPerWeek,
    employmentType,
    salaryKind: oneOf(SALARY_KINDS, candidate.salaryKind, 'current'),
    paymentsPerYear,
    grossMonthly,
    grossAnnual,
    netMonthly: figures.netMonthly,
    hourlyGross: figures.hourlyGross,
    bonusAnnual: figures.bonusAnnual,
    allIn: typeof candidate.allIn === 'boolean' ? candidate.allIn : null,
    collectiveAgreement: text1(candidate.collectiveAgreement) || null,
    salarySource: oneOf(SALARY_SOURCES, candidate.salarySource, 'post'),
    derived,
    figuresVerified,
    evidence,
    confidence,
    notes: text1(candidate.notes).slice(0, 300),
    notesDe: null, // assigned by build-dataset from data/translations/notes-de.json
    collectiveAgreementGroup: null, // split off collectiveAgreement by build-dataset (data/collective-agreements.json)
  };
  return { record, issues };
}

export function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  return Number.isFinite(number) ? number : null;
}

export function normalizeForMatch(value) {
  return value.normalize('NFC').toLowerCase().replace(/[​-‍﻿]/g, '').replace(/\s+/g, ' ');
}

// Seniority follows stated experience (junior < 2, mid 2–5, senior 6+ years) so the filter means the
// same thing for every record; "lead" (staff responsibility) and records without experience keep the
// extracted value.
function seniorityFor(extracted, experienceYears) {
  if (extracted === 'lead' || experienceYears === null) return extracted;
  if (experienceYears < 2) return 'junior';
  return experienceYears < 6 ? 'mid' : 'senior';
}

function oneOf(allowed, value, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function inRange(value, min, max) {
  return value !== null && value >= min && value <= max ? value : null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function text1(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function titleCase(value) {
  return value.replace(/(^|[\s/(-])(\p{Ll})/gu, (_, boundary, letter) => boundary + letter.toUpperCase());
}
