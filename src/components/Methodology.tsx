import { useI18n } from '../i18n/context.tsx';
import { FULL_TIME_MIN_HOURS } from '../lib/filters.ts';
import { formatCount } from '../lib/format.ts';
import { MIN_BENCHMARK_N, MIN_SOLID_N } from '../lib/stats.ts';

export function Methodology() {
  const { t } = useI18n();
  return (
    <section id="methodology" className="card methodology" aria-labelledby="methodology-heading">
      <h2 id="methodology-heading">{t('methodology.heading')}</h2>
      <div className="method-grid">
        <div>
          <h3>{t('methodology.collectionTitle')}</h3>
          <p>{t('methodology.collectionBody')}</p>
        </div>
        <div>
          <h3>{t('methodology.imagesTitle')}</h3>
          <p>{t('methodology.imagesBody')}</p>
        </div>
        <div>
          <h3>{t('methodology.extractionTitle')}</h3>
          <p>{t('methodology.extractionBody')}</p>
        </div>
        <div>
          <h3>{t('methodology.checksTitle')}</h3>
          <p>{t('methodology.checksBody')}</p>
        </div>
        <div>
          <h3>{t('methodology.paymentsTitle')}</h3>
          <p>{t('methodology.paymentsBody')}</p>
        </div>
        <div>
          <h3>{t('methodology.statsTitle')}</h3>
          <p>
            {t('methodology.statsBody', {
              min: formatCount(MIN_BENCHMARK_N),
              solid: formatCount(MIN_SOLID_N),
              fullTime: formatCount(FULL_TIME_MIN_HOURS),
            })}
          </p>
        </div>
        <div>
          <h3>{t('methodology.roleFamilyTitle')}</h3>
          <p>{t('methodology.roleFamilyBody')}</p>
        </div>
        <div>
          <h3>{t('methodology.analyticsTitle')}</h3>
          <p>{t('methodology.analyticsBody')}</p>
        </div>
      </div>
      <div className="caveats">
        <h3>{t('methodology.caveatsTitle')}</h3>
        <ul>
          <li>{t('methodology.caveat1')}</li>
          <li>{t('methodology.caveat2')}</li>
          <li>{t('methodology.caveat3')}</li>
          <li>{t('methodology.caveat4')}</li>
          <li>{t('methodology.caveat5')}</li>
          <li>{t('methodology.caveat6')}</li>
        </ul>
        <p>{t('methodology.caveatsFooter')}</p>
      </div>
    </section>
  );
}
