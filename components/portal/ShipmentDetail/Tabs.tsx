'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

type TabKey = 'overview' | 'tracking' | 'documents' | 'packages';

interface TabsProps {
  overview: ReactNode;
  tracking: ReactNode;
  documents: ReactNode;
  packages: ReactNode;
}

export function ShipmentDetailTabs(panels: TabsProps) {
  const t = useTranslations('PortalShipmentDetail');
  const [active, setActive] = useState<TabKey>('overview');

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'overview', label: t('tab_overview') },
    { key: 'tracking', label: t('tab_tracking') },
    { key: 'documents', label: t('tab_documents') },
    { key: 'packages', label: t('tab_packages') },
  ];

  return (
    <div>
      <div role="tablist" aria-label={t('page_title')} className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {tabs.map((tab) => {
          const isActive = active === tab.key;
          return (
            <button
              key={tab.key}
              role="tab"
              type="button"
              aria-selected={isActive}
              aria-controls={`tab-panel-${tab.key}`}
              id={`tab-trigger-${tab.key}`}
              onClick={() => setActive(tab.key)}
              className={cn(
                'relative whitespace-nowrap px-4 py-3 text-sm font-medium transition',
                isActive ? 'text-brand' : 'text-slate-600 hover:text-brand',
              )}
            >
              {tab.label}
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute bottom-0 left-2 right-2 h-0.5 rounded-t bg-gold"
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-6">
        <Panel show={active === 'overview'} id="overview">
          {panels.overview}
        </Panel>
        <Panel show={active === 'tracking'} id="tracking">
          {panels.tracking}
        </Panel>
        <Panel show={active === 'documents'} id="documents">
          {panels.documents}
        </Panel>
        <Panel show={active === 'packages'} id="packages">
          {panels.packages}
        </Panel>
      </div>
    </div>
  );
}

function Panel({
  show,
  id,
  children,
}: {
  show: boolean;
  id: TabKey;
  children: ReactNode;
}) {
  return (
    <div
      role="tabpanel"
      id={`tab-panel-${id}`}
      aria-labelledby={`tab-trigger-${id}`}
      hidden={!show}
    >
      {show && children}
    </div>
  );
}
