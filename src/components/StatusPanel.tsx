// Full-width states shown instead of the tool: loading, load error, empty dataset.
import { useI18n } from '../i18n/context.tsx';

export function LoadingPanel() {
  const { t } = useI18n();
  return (
    <div className="card status-card" role="status">
      <span className="spinner" aria-hidden="true" />
      <p>{t('status.loading')}</p>
    </div>
  );
}

export function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div className="card status-card" role="alert">
      <h2>{t('status.errorTitle')}</h2>
      <p>{message}</p>
      <button type="button" className="btn btn-primary" onClick={onRetry}>
        {t('status.retry')}
      </button>
    </div>
  );
}

export function EmptyDatasetPanel() {
  const { t } = useI18n();
  return (
    <div className="card status-card">
      <h2>{t('status.emptyTitle')}</h2>
      <p>{t('status.emptyBody')}</p>
    </div>
  );
}
