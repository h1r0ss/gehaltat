// Unifies the three chart views (by experience, distribution, industries)
// behind one segmented tab bar inside a single card, instead of three
// stacked cards. Only the active tab is mounted; each chart already carries
// its own short caption and "show as a table" toggle, so nothing else is lost.
import { useState } from 'react';
import type { Industry, SalaryRecord } from '../types.ts';
import { useI18n } from '../i18n/context.tsx';
import type { ExperienceMatch } from '../lib/finder.ts';
import type { Basis } from '../lib/stats.ts';
import { BenchmarkPanel } from './BenchmarkPanel.tsx';
import { ExperienceChart } from './ExperienceChart.tsx';
import { IndustryChart } from './IndustryChart.tsx';

type ChartTab = 'experience' | 'distribution' | 'industry';
const TABS: readonly { id: ChartTab; key: string }[] = [
  { id: 'experience', key: 'charts.tabExperience' },
  { id: 'distribution', key: 'charts.tabDistribution' },
  { id: 'industry', key: 'charts.tabIndustry' },
];

type ChartsCardProps = {
  sectionId: string;
  experienceRecords: readonly SalaryRecord[];
  userExperience: number | null;
  userGrossMonthly: number | null;
  benchmarkRecords: SalaryRecord[];
  match: ExperienceMatch;
  basis: Basis;
  onBasisChange: (basis: Basis) => void;
  industryRecords: readonly SalaryRecord[];
  selectedIndustry: Industry | '';
  onSelectIndustry: (industry: Industry) => void;
  industryScope: string;
};

export function ChartsCard({
  sectionId,
  experienceRecords,
  userExperience,
  userGrossMonthly,
  benchmarkRecords,
  match,
  basis,
  onBasisChange,
  industryRecords,
  selectedIndustry,
  onSelectIndustry,
  industryScope,
}: ChartsCardProps) {
  const { t } = useI18n();
  const [tab, setTab] = useState<ChartTab>('experience');

  return (
    <section id={sectionId} className="card chart-tabs-card" aria-label={t('charts.heading')} tabIndex={-1}>
      <div className="chart-tabs" role="tablist" aria-label={t('charts.heading')}>
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls={`panel-${item.id}`}
            className={tab === item.id ? 'chart-tab is-active' : 'chart-tab'}
            onClick={() => setTab(item.id)}
          >
            {t(item.key)}
          </button>
        ))}
      </div>

      <div id={`panel-${tab}`} className="chart-tab-panel">
        {tab === 'experience' && (
          <ExperienceChart
            sectionId="experience-chart"
            records={experienceRecords}
            userExperience={userExperience}
            userGrossMonthly={userGrossMonthly}
            match={match}
          />
        )}
        {tab === 'distribution' && (
          <BenchmarkPanel
            sectionId="benchmark-panel"
            records={benchmarkRecords}
            match={match}
            basis={basis}
            onBasisChange={onBasisChange}
            salary={userGrossMonthly}
          />
        )}
        {tab === 'industry' && (
          <IndustryChart
            sectionId="industry-chart"
            records={industryRecords}
            selectedIndustry={selectedIndustry}
            onSelectIndustry={onSelectIndustry}
            scope={industryScope}
          />
        )}
      </div>
    </section>
  );
}
