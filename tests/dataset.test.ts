import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { DatasetError, normalizeRecord, parseDataset, parseEvidence, referenceDateOf } from '../src/lib/dataset.ts';
import { formatDate, formatHours, formatMoney, formatYears, parseAmount } from '../src/lib/format.ts';

describe('parseDataset', () => {
  test('rejects files without a dataset object or records list', () => {
    assert.throws(() => parseDataset(null), DatasetError);
    assert.throws(() => parseDataset([]), DatasetError);
    assert.throws(() => parseDataset({ generatedAt: '2026-01-01' }), DatasetError);
  });

  test('accepts an empty dataset', () => {
    const dataset = parseDataset({ generatedAt: '2026-09-25T10:00:00Z', records: [] });
    assert.equal(dataset.records.length, 0);
    assert.equal(dataset.coverage.records, 0);
    assert.equal(dataset.coverage.firstPostDate, null);
    assert.deepEqual(dataset.roleFamilies, [], 'missing roleFamilies must become []');
  });

  test('role families: malformed entries are dropped, duplicates ignored, and a record can only reference a listed family', () => {
    const dataset = parseDataset({
      generatedAt: '2026-09-25T10:00:00Z',
      roleFamilies: [
        { id: 'pm', label: 'Project Management', labelDe: 'Projektmanagement', aliases: ['project lead', 'pm'] },
        { id: 'pm', label: 'Duplicate ignored' },
        { id: '', label: 'No id' },
        { label: 'No id at all' },
        'garbage',
        { id: 'nurse', label: 'Nurse' }, // labelDe and aliases omitted
      ],
      records: [
        { id: 'a', postDate: '2026-03-01', roleFamily: 'pm' },
        { id: 'b', postDate: '2026-03-01', roleFamily: 'unknown-family' },
        { id: 'c', postDate: '2026-03-01' },
      ],
    });
    assert.deepEqual(dataset.roleFamilies, [
      { id: 'pm', label: 'Project Management', labelDe: 'Projektmanagement', aliases: ['project lead', 'pm'] },
      { id: 'nurse', label: 'Nurse', labelDe: 'Nurse', aliases: [] },
    ]);
    assert.equal(dataset.records[0].roleFamily, 'pm');
    assert.equal(dataset.records[1].roleFamily, null, 'a reference to an unlisted family id must be dropped');
    assert.equal(dataset.records[2].roleFamily, null);
  });

  test('drops unusable entries and duplicate ids, and computes coverage from the records', () => {
    const dataset = parseDataset({
      generatedAt: '2026-09-25T10:00:00Z',
      coverage: { postsCollected: 10, commentsCollected: 50, records: 99 },
      records: [
        { id: 'a', postDate: '2026-03-01' },
        { id: 'a', postDate: '2026-04-01' },
        'garbage',
        { postDate: '2026-05-01' },
        { id: 'b', postDate: '2026-02-01' },
      ],
    });
    assert.deepEqual(
      dataset.records.map((r) => r.id),
      ['a', 'b'],
    );
    assert.equal(dataset.records[0].postDate, '2026-03-01');
    assert.equal(dataset.coverage.records, 2);
    assert.equal(dataset.coverage.postsCollected, 10);
    assert.equal(dataset.coverage.commentsCollected, 50);
    assert.equal(dataset.coverage.firstPostDate, '2026-02-01');
    assert.equal(dataset.coverage.lastPostDate, '2026-03-01');
  });

  test('normalises malformed fields instead of crashing', () => {
    const record = normalizeRecord({
      id: 'x1',
      sourceUrl: 'javascript:alert(1)',
      postDate: 'yesterday',
      industry: 'Space Travel',
      region: 'Bavaria',
      grossMonthly: -5,
      grossAnnual: 'lots',
      netMonthly: 2500,
      derived: ['grossAnnual', 'netMonthly', 7],
      evidence: ['Brutto 3.000', 42, '  '],
      confidence: 3,
      paymentsPerYear: 13,
      roleFamily: 'pm',
    });
    assert.ok(record);
    assert.equal(record.sourceUrl, '', 'non-http URLs must not be rendered as links');
    assert.equal(record.postDate, '');
    assert.equal(record.industry, 'Other');
    assert.equal(record.region, null);
    assert.equal(record.grossMonthly, null);
    assert.equal(record.grossAnnual, null);
    assert.equal(record.netMonthly, 2500);
    assert.deepEqual(record.derived, ['grossAnnual']);
    assert.deepEqual(record.evidence, ['Brutto 3.000']);
    assert.equal(record.confidence, 1);
    assert.equal(record.paymentsPerYear, 14);
    assert.equal(record.figuresVerified, false, 'a missing flag must read as not machine-checked');
    assert.equal(record.roleFamily, 'pm', 'without a validFamilyIds set, any non-empty roleFamily is accepted');
    assert.equal(record.notesDe, null, 'a missing notesDe must be null, not an empty string');
  });

  test('a roleFamily is dropped when it is not in the supplied set of valid ids', () => {
    const withSet = normalizeRecord({ id: 'x2', roleFamily: 'pm' }, new Set(['nurse']));
    assert.equal(withSet?.roleFamily, null);
    const matching = normalizeRecord({ id: 'x3', roleFamily: 'pm' }, new Set(['pm']));
    assert.equal(matching?.roleFamily, 'pm');
  });

  test('keeps figuresVerified when it is true', () => {
    assert.equal(normalizeRecord({ id: 'v', figuresVerified: true })?.figuresVerified, true);
  });

  test('reference date comes from generatedAt, else today', () => {
    const dataset = parseDataset({ generatedAt: '2026-09-25T10:53:39.561Z', records: [] });
    assert.equal(referenceDateOf(dataset), '2026-09-25');
    const undated = parseDataset({ records: [] });
    assert.equal(referenceDateOf(undated, new Date('2026-01-02T12:00:00Z')), '2026-01-02');
  });

  test('the shipped data file passes validation without dropping records', (t) => {
    const url = new URL('../public/data/salaries.json', import.meta.url);
    if (!existsSync(url)) {
      t.skip('public/data/salaries.json not present');
      return;
    }
    const raw = JSON.parse(readFileSync(url, 'utf8')) as { records: Array<Record<string, unknown>> };
    const dataset = parseDataset(raw);
    assert.equal(dataset.records.length, raw.records.length);
    raw.records.forEach((original, index) => {
      const parsed = dataset.records[index];
      assert.equal(parsed.id, original.id);
      assert.equal(parsed.grossMonthly, original.grossMonthly ?? null, `grossMonthly changed for ${parsed.id}`);
      assert.equal(parsed.netMonthly, original.netMonthly ?? null, `netMonthly changed for ${parsed.id}`);
      assert.equal(parsed.grossAnnual, original.grossAnnual ?? null, `grossAnnual changed for ${parsed.id}`);
      // notesDe goes through the same trim-and-empty-to-null normalisation as every other text field.
      const expectedNotesDe = typeof original.notesDe === 'string' && original.notesDe.trim() !== '' ? original.notesDe.trim() : null;
      assert.equal(parsed.notesDe, expectedNotesDe, `notesDe changed for ${parsed.id}`);
    });
  });
});

describe('evidence snippets', () => {
  test('"[image] " marks snippets transcribed from a payslip image', () => {
    assert.deepEqual(parseEvidence('[image] Gehalt 3.450,00'), { text: 'Gehalt 3.450,00', fromImage: true });
    assert.deepEqual(parseEvidence('[IMAGE]Netto 2.100'), { text: 'Netto 2.100', fromImage: true });
    assert.deepEqual(parseEvidence('Brutto 4.000 x14'), { text: 'Brutto 4.000 x14', fromImage: false });
  });
});

describe('formatting', () => {
  test('money uses de-AT euro format without decimals', () => {
    assert.match(formatMoney(4222.71), /^€\s4\.223$/u);
    assert.match(formatMoney(59117.94), /^€\s59\.118$/u);
    assert.equal(formatMoney(null), '–');
  });

  test('years, hours and dates', () => {
    assert.equal(formatYears(1), '1 yr');
    assert.equal(formatYears(3.5), '3,5 yrs');
    assert.equal(formatYears(null), '–');
    assert.equal(formatHours(38.5), '38,5 h');
    assert.equal(formatDate('2026-09-25T10:53:39.561Z'), '2026-09-25');
    assert.equal(formatDate('soon'), '–');
  });
});

describe('parseAmount', () => {
  test('understands Austrian and international number formats', () => {
    assert.equal(parseAmount('3500'), 3500);
    assert.equal(parseAmount('3.500'), 3500);
    assert.equal(parseAmount('3 500'), 3500);
    assert.equal(parseAmount('€ 3.500,50'), 3500.5);
    assert.equal(parseAmount('3500,50'), 3500.5);
    assert.equal(parseAmount('3500.50'), 3500.5);
    assert.equal(parseAmount('3,500'), 3500);
    assert.equal(parseAmount('55.000'), 55000);
    assert.equal(parseAmount('3,5k'), 3500);
    assert.equal(parseAmount('4k'), 4000);
  });

  test('rejects empty, negative and non-numeric input', () => {
    assert.equal(parseAmount(''), null);
    assert.equal(parseAmount('   '), null);
    assert.equal(parseAmount('-500'), null);
    assert.equal(parseAmount('0'), null);
    assert.equal(parseAmount('abc'), null);
    assert.equal(parseAmount('3.50.0'), null);
  });
});
