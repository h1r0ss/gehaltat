import { Component } from 'react';
import type { ReactNode } from 'react';
import { useI18n } from '../i18n/context.tsx';

type Props = { children: ReactNode };
type State = { failed: boolean };

/** Class components cannot use hooks, so the translated fallback UI lives here. */
function ErrorFallback() {
  const { t } = useI18n();
  return (
    <div className="container main">
      <div className="card status-card" role="alert">
        <h2>{t('error.title')}</h2>
        <p>{t('error.body')}</p>
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
          {t('error.reload')}
        </button>
      </div>
    </div>
  );
}

/** Shows a recoverable message instead of a blank page if rendering throws. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return <ErrorFallback />;
  }
}
