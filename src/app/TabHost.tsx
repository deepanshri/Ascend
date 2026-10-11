import React, { Suspense } from 'react';
import type { ActiveTab } from '../types';
import { TabLoadingFallback } from '../components/TabLoadingFallback';
import { useUI } from '../providers/UIProvider';
import { HomeRoute } from '../routes/HomeRoute';
import { PersonalRoute } from '../routes/PersonalRoute';
import { RemindersRoute } from '../routes/RemindersRoute';
import { ReportRoute } from '../routes/ReportRoute';
import { SettingsRoute } from '../routes/SettingsRoute';

type ScrollHandler = (event: React.UIEvent<HTMLElement>) => void;

/** A tab mounts on first visit and then stays mounted, so switching back is instant. */
function TabPane({ tab, children }: { tab: ActiveTab; children: React.ReactNode }) {
  const { activeTab, visitedTabs } = useUI();
  if (!visitedTabs.includes(tab)) return null;
  const active = activeTab === tab;
  return (
    <div aria-hidden={!active} className={active ? 'block h-full' : 'hidden'}>
      <Suspense fallback={<TabLoadingFallback />}>{children}</Suspense>
    </div>
  );
}

/** Memoised: the shell's bowl and nav updates don't re-render the tabs; each route reads its own contexts. */
export const TabHost = React.memo(function TabHost({ onScroll }: { onScroll: ScrollHandler }) {
  const { activeTab } = useUI();
  return (
    <div className="absolute inset-0 z-10 tab-pane-host gpu-smooth bg-canvas">
      <HomeRoute isActive={activeTab === 'home'} onScroll={onScroll} />
      <TabPane tab="reminders">
        <RemindersRoute onScroll={onScroll} />
      </TabPane>
      <TabPane tab="report">
        <ReportRoute isActive={activeTab === 'report'} onScroll={onScroll} />
      </TabPane>
      <TabPane tab="personal">
        <PersonalRoute onScroll={onScroll} />
      </TabPane>
      <TabPane tab="settings">
        <SettingsRoute onScroll={onScroll} />
      </TabPane>
    </div>
  );
});
