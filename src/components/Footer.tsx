import { useI18n } from '../i18n/context.tsx';

export function Footer() {
  const { t } = useI18n();
  return (
    <footer className="site-footer">
      <div className="container site-footer-inner">
        <a href="#methodology">{t('nav.methodology')}</a>
        <span aria-hidden="true">·</span>
        <span>{t('footer.dataSource')}</span>
        <span aria-hidden="true">·</span>
        <span>{t('footer.disclaimer')}</span>
      </div>
    </footer>
  );
}
