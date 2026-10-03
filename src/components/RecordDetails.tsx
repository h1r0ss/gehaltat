import type { ReactNode } from 'react';
import type { SalaryRecord } from '../types.ts';
import { useI18n } from '../i18n/context.tsx';
import { parseEvidence } from '../lib/dataset.ts';
import { formatConfidence, formatHours } from '../lib/format.ts';
import {
  DERIVED_FIELD_LABELS,
  EMPLOYMENT_TYPE_LABELS,
  SALARY_KIND_LABELS,
  SALARY_SOURCE_LABELS,
  SENIORITY_LABELS,
  labelFor,
} from '../lib/labels.ts';
import { DerivedMark, Money } from './ValueDisplay.tsx';

function Item({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'details-item details-item-wide' : 'details-item'}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function RecordDetails({ record, familyLabel }: { record: SalaryRecord; familyLabel?: string | null }) {
  const { t, lang } = useI18n();
  const evidence = record.evidence.map(parseEvidence);
  const paymentsDerived = record.derived.includes('paymentsPerYear');
  const notStated = t('common.notStated');
  const showNotesDe = lang === 'de' && record.notesDe;
  const notes = showNotesDe ? record.notesDe : record.notes;
  const notesAreEnglishFallback = lang === 'de' && !record.notesDe && record.notes.trim() !== '';

  return (
    <div className="record-details">
      <div className="record-details-text">
        <p className="details-label">{t('details.evidenceLabel')}</p>
        {evidence.length > 0 ? (
          <ul className="evidence-list">
            {evidence.map((snippet, index) => (
              <li key={index} className={snippet.fromImage ? 'evidence evidence-image' : 'evidence'}>
                {snippet.fromImage && <span className="evidence-tag">{t('details.fromImage')}</span>}
                <span className="evidence-text">{snippet.text}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{t('details.evidenceEmpty')}</p>
        )}
        <p className="details-label">{t('details.notesLabel')}</p>
        <p>
          {notes || t('details.notesEmpty')}
          {notesAreEnglishFallback && <span className="muted">{t('details.notesEnglishHint')}</span>}
        </p>
      </div>

      <dl className="details-grid">
        <Item label={t('details.figuresLabel')} wide>
          {record.figuresVerified ? t('details.figuresChecked') : t('details.figuresUnchecked')}
        </Item>
        <Item label={t('details.jobTitle')}>{record.jobTitle || t('details.noneValue')}</Item>
        <Item label={t('details.hoursPerWeek')}>{formatHours(record.hoursPerWeek)}</Item>
        {familyLabel && <Item label={t('details.roleFamily')}>{familyLabel}</Item>}
        <Item label={t('details.seniority')}>{labelFor(SENIORITY_LABELS[lang], record.seniority, notStated)}</Item>
        <Item label={t('details.employmentType')}>{labelFor(EMPLOYMENT_TYPE_LABELS[lang], record.employmentType, notStated)}</Item>
        <Item label={t('details.salaryKind')}>{labelFor(SALARY_KIND_LABELS[lang], record.salaryKind, notStated)}</Item>
        <Item label={t('details.collectiveAgreement')}>
          {record.collectiveAgreement === null
            ? notStated
            : `${record.collectiveAgreement}${record.collectiveAgreementGroup ? ` · ${record.collectiveAgreementGroup}` : ''}`}
        </Item>
        <Item label={t('details.allIn')}>{record.allIn === null ? notStated : record.allIn ? t('details.yes') : t('details.no')}</Item>
        <Item label={t('details.paymentsPerYear')}>
          {paymentsDerived && <DerivedMark />}
          {record.paymentsPerYear}
          {paymentsDerived ? t('details.notStatedSuffix') : ''}
        </Item>
        <Item label={t('records.figureGrossYear')}>
          <Money value={record.grossAnnual} derived={record.derived.includes('grossAnnual')} />
        </Item>
        <Item label={t('details.hourlyGross')}>
          <Money value={record.hourlyGross} />
        </Item>
        <Item label={t('details.bonusAnnual')}>
          <Money value={record.bonusAnnual} />
        </Item>
        <Item label={t('details.derivedFields')}>
          {record.derived.length > 0 ? record.derived.map((field) => DERIVED_FIELD_LABELS[lang][field]).join(', ') : t('details.none')}
        </Item>
        <Item label={t('details.salaryFoundIn')}>{labelFor(SALARY_SOURCE_LABELS[lang], record.salarySource, notStated)}</Item>
        <Item label={t('details.confidence')}>{formatConfidence(record.confidence)}</Item>
        <Item label={t('details.postTitle')} wide>
          {record.postTitle || t('details.noneValue')}
        </Item>
      </dl>
    </div>
  );
}
