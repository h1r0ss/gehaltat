// Small presentational helpers for money values, missing values and provenance markers.
import { useI18n } from '../i18n/context.tsx';
import { DASH, formatMoney } from '../lib/format.ts';
import { CheckIcon } from './Icons.tsx';

export function NotStated({ label }: { label?: string }) {
  const { t } = useI18n();
  return (
    <span className="not-stated">
      <span aria-hidden="true">{DASH}</span>
      <span className="sr-only">{label ?? t('common.notStated')}</span>
    </span>
  );
}

/** Visible "≈ approximate" badge for net figures computed via net.ts's simplified tax model. */
export function ApproxMark() {
  const { t } = useI18n();
  return (
    <span className="approx-mark" title={t('common.approxHint')}>
      {t('common.approxLabel')}
    </span>
  );
}

export function DerivedMark() {
  const { t } = useI18n();
  return (
    <>
      <span className="derived-mark" title={t('common.derivedHint')} aria-hidden="true">
        ≈
      </span>
      <span className="sr-only">{t('common.derivedSrPrefix')}</span>
    </>
  );
}

export function Money({ value, derived = false }: { value: number | null; derived?: boolean }) {
  if (value === null) return <NotStated />;
  return (
    <span className="money">
      {derived && <DerivedMark />}
      {formatMoney(value)}
    </span>
  );
}

/** Quiet check icon for machine-checked entries; a visible badge only for the exception. */
export function VerificationBadge({ verified }: { verified: boolean }) {
  const { t } = useI18n();
  if (verified) {
    return (
      <span className="check-mark" title={t('common.checkedHint')}>
        <CheckIcon />
        <span className="sr-only">{t('common.checkedSr')}</span>
      </span>
    );
  }
  return (
    <span className="badge badge-unchecked" title={t('common.uncheckedHint')}>
      <span aria-hidden="true">{t('common.uncheckedLabel')}</span>
      <span className="sr-only">{t('common.uncheckedSr')}</span>
    </span>
  );
}
