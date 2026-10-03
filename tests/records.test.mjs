import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRecord } from '../scripts/lib/records.mjs';

const post = {
  id: 'abc123',
  permalink: 'https://www.reddit.com/r/GehaltAT/comments/abc123/m29_dev/',
  title: 'M29 / 38,5h / Software Dev / 5 YoE',
  selftext: 'Brutto 4.200 x14, netto 2.750. Früher 60k brutto im Jahr.',
  createdUtc: 1781277000,
  score: 12,
  numComments: 3,
  flair: null,
  comments: [{ id: 'c1', parentId: 'abc123', depth: 0, isOp: true, score: 3, body: 'Kein All-In, 18,50 €/h beim Nebenjob' }],
};

const candidate = {
  postId: 'abc123',
  inAustria: true,
  salaryKind: 'current',
  jobTitle: 'Software Dev',
  standardizedTitle: 'software developer',
  industry: 'IT & Software',
  seniority: 'mid',
  experienceYears: 5,
  region: 'Vienna',
  hoursPerWeek: 38.5,
  employmentType: 'employee',
  paymentsPerYear: 14,
  grossMonthly: 4200,
  grossAnnual: null,
  netMonthly: 2750,
  hourlyGross: null,
  bonusAnnual: null,
  allIn: false,
  collectiveAgreement: null,
  salarySource: 'post',
  evidence: ['Brutto 4.200 x14', 'netto 2.750'],
  confidence: 0.9,
  notes: 'No all-in.',
};

test('keeps verified figures and derives annual gross from monthly × payments', () => {
  const { record, issues } = buildRecord(candidate, post);
  assert.deepEqual(issues, []);
  assert.equal(record.grossMonthly, 4200);
  assert.equal(record.netMonthly, 2750);
  assert.equal(record.grossAnnual, 58800);
  assert.deepEqual(record.derived, ['grossAnnual']);
  assert.equal(record.figuresVerified, true);
  assert.equal(record.confidence, 0.9);
  assert.equal(record.postDate, '2026-06-12');
  assert.equal(record.standardizedTitle, 'Software Developer');
});

test('drops a figure that does not appear in the source and lowers confidence', () => {
  const { record, issues } = buildRecord({ ...candidate, netMonthly: 2900 }, post);
  assert.equal(record.netMonthly, null);
  assert.equal(issues.length, 1);
  assert.equal(record.confidence, 0.75);
});

test('rejects a candidate without any verifiable figure', () => {
  const result = buildRecord({ ...candidate, grossMonthly: 5000, netMonthly: 3100 }, post);
  assert.match(result.reason, /no verified salary figure/);
});

test('assumes 14 payments when not stated and flags it', () => {
  const { record } = buildRecord({ ...candidate, paymentsPerYear: null }, post);
  assert.equal(record.paymentsPerYear, 14);
  assert.deepEqual(record.derived, ['paymentsPerYear', 'grossAnnual']);
});

test('derives monthly gross from a stated annual salary', () => {
  const { record } = buildRecord({ ...candidate, grossMonthly: null, netMonthly: null, grossAnnual: 60000 }, post);
  assert.equal(record.grossMonthly, 4286);
  assert.equal(record.grossAnnual, 60000);
  assert.deepEqual(record.derived, ['grossMonthly']);
});

test('derives monthly gross from an hourly wage only when hours are known', () => {
  const hourly = { ...candidate, grossMonthly: null, netMonthly: null, hourlyGross: 18.5 };
  assert.equal(buildRecord(hourly, post).record.grossMonthly, 3084);
  assert.match(buildRecord({ ...hourly, hoursPerWeek: null }, post).reason, /no salary figure/);
});

test('drops a net figure that is higher than gross', () => {
  const { record, issues } = buildRecord({ ...candidate, grossMonthly: 2750, netMonthly: 4200 }, post);
  assert.equal(record.grossMonthly, 2750);
  assert.equal(record.netMonthly, null);
  assert.match(issues[0], /net\/gross ratio/);
});

test('drops a net figure too close to gross for a taxed salary, and distrusts identical figures', () => {
  const nearPost = { ...post, selftext: 'Brutto 3.138,73 Auszahlung 2.954,89 / 2.673,02 laut Konto' };
  const near = buildRecord({ ...candidate, grossMonthly: 3138.73, netMonthly: 2954.89, evidence: ['Brutto 3.138,73'] }, nearPost);
  assert.equal(near.record.grossMonthly, 3138.73);
  assert.equal(near.record.netMonthly, null);
  const same = buildRecord({ ...candidate, grossMonthly: 2673.02, netMonthly: 2673.02, evidence: ['2.673,02'] }, nearPost);
  assert.match(same.reason, /no verified salary figure \(net equals gross\)/);
  const marginal = buildRecord(
    { ...candidate, grossMonthly: null, netMonthly: null, hourlyGross: null, evidence: ['Brutto 4.200 x14'] },
    post,
  );
  assert.match(marginal.reason, /no salary figure/);
});

test('rejects jobs outside Austria', () => {
  assert.equal(buildRecord({ ...candidate, inAustria: false }, post).reason, 'job outside Austria');
});

test('derives seniority from stated experience, except for leads and unknown experience', () => {
  assert.equal(buildRecord({ ...candidate, seniority: 'junior', experienceYears: 8 }, post).record.seniority, 'senior');
  assert.equal(buildRecord({ ...candidate, seniority: 'senior', experienceYears: 1 }, post).record.seniority, 'junior');
  assert.equal(buildRecord({ ...candidate, seniority: 'junior', experienceYears: 3 }, post).record.seniority, 'mid');
  assert.equal(buildRecord({ ...candidate, seniority: 'lead', experienceYears: 1 }, post).record.seniority, 'lead');
  assert.equal(buildRecord({ ...candidate, seniority: 'senior', experienceYears: null }, post).record.seniority, 'senior');
});

test('coerces unknown categories and keeps only evidence found in the source', () => {
  const { record } = buildRecord(
    { ...candidate, industry: 'Space', region: 'Bavaria', seniority: 'wizard', experienceYears: null, evidence: ['Brutto 4.200 x14', 'invented quote'] },
    post,
  );
  assert.equal(record.industry, 'Other');
  assert.equal(record.region, null);
  assert.equal(record.seniority, null);
  assert.deepEqual(record.evidence, ['Brutto 4.200 x14']);
});

const imagePost = { ...post, selftext: '', comments: [], imageUrls: ['https://i.redd.it/x.jpeg'] };
const payslip = {
  ...candidate,
  grossMonthly: 3450,
  netMonthly: 2312.45,
  evidence: ['[image] Gehalt 3.450,00', '[image] Auszahlung 2.312,45'],
  salarySource: 'image',
};

test('image figures confirmed by OCR count as machine-verified', () => {
  const { record } = buildRecord(payslip, imagePost, { ocrTexts: ['Gehalt 3.45O,00\nAuszahlung 2.312,45'], imageCount: 1 });
  assert.equal(record.grossMonthly, 3450);
  assert.equal(record.netMonthly, 2312.45);
  assert.equal(record.figuresVerified, true);
  assert.equal(record.confidence, 0.9);
  assert.deepEqual(record.evidence, payslip.evidence);
});

test('image figures without OCR confirmation are kept, flagged and capped', () => {
  const { record } = buildRecord(payslip, imagePost, { ocrTexts: ['unreadable'], imageCount: 1 });
  assert.equal(record.grossMonthly, 3450);
  assert.equal(record.figuresVerified, false);
  assert.equal(record.confidence, 0.8);
});

test('image evidence does not count for posts without images', () => {
  const result = buildRecord(payslip, { ...imagePost, imageUrls: [] }, { imageCount: 0 });
  assert.match(result.reason, /no verified salary figure/);
});

test('an image figure needs an [image] evidence line showing it', () => {
  const { record } = buildRecord({ ...payslip, evidence: ['[image] Gehalt 3.450,00'] }, imagePost, { imageCount: 1 });
  assert.equal(record.grossMonthly, 3450);
  assert.equal(record.netMonthly, null);
});
