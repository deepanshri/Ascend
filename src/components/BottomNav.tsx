import { memo } from 'react';
import { motion } from 'motion/react';
import { ActiveTab } from '../types';
import { navTabPress, springSnappy } from '../lib/motionPresets';

const navActiveTransition = { type: 'tween', duration: 0.18, ease: 'easeInOut' } as const;

interface BottomNavProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  pendingRemindersCount?: number;
  isBlurred?: boolean;
}

function BottomNavInner({
  activeTab,
  onTabChange,
  pendingRemindersCount = 0,
  isBlurred = false,
}: BottomNavProps) {
  return (
    <nav
      id="floating-bottom-nav"
      data-tour="bottom-nav"
      aria-label="App Navigation"
      style={{
        transform: 'translateY(0)',
        opacity: 1,
        pointerEvents: isBlurred ? 'none' : 'auto',
      }}
      className={`absolute bottom-0 left-0 right-0 z-40 mx-4 mb-[max(1.25rem,env(safe-area-inset-bottom))] h-[68px] bg-white/95 dark:bg-slate-900/95 rounded-full nav-pill-shadow border border-slate-100/90 dark:border-slate-800 px-2 flex items-center justify-between gpu-accelerated ${
        isBlurred ? 'opacity-40' : ''
      }`}
    >
      {/* Home */}
      <motion.button
        id="nav-tab-home"
        type="button"
        whileTap={navTabPress}
        transition={springSnappy}
        onClick={() => onTabChange('home')}
        className={`relative flex-1 flex flex-col items-center justify-center py-1.5 h-full transition-colors duration-150 cursor-pointer ${
          activeTab === 'home' ? 'text-[#0B5938] dark:text-blue-400' : 'text-[#6C7A89] dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
        }`}
      >
        {activeTab === 'home' && (
          <motion.div
            layoutId="nav-active-pill"
            transition={navActiveTransition}
            className="absolute inset-y-1.5 inset-x-1 bg-[#E8F8EE] dark:bg-blue-950/70 rounded-full -z-0"
          />
        )}
        <svg className="w-5 h-5 z-10" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2.5L2 11.5h3.5v9h6.2v-6h3.6v6H19v-9H22.5L12 2.5z" />
        </svg>
        <span className={`text-[11px] mt-0.5 z-10 ${activeTab === 'home' ? 'font-semibold' : 'font-medium'}`}>
          Home
        </span>
        {activeTab === 'home' && (
          <motion.div
            layoutId="nav-active-indicator-dot"
            transition={navActiveTransition}
            className="w-6 h-0.5 bg-[#0B5938] dark:bg-blue-400 rounded-full mt-0.5 z-10"
          />
        )}
      </motion.button>

      {/* Tasks / Reminders */}
      <motion.button
        id="nav-tab-reminders"
        type="button"
        whileTap={navTabPress}
        transition={springSnappy}
        onClick={() => onTabChange('reminders')}
        className={`relative flex-1 flex flex-col items-center justify-center py-1.5 h-full transition-colors duration-150 cursor-pointer ${
          activeTab === 'reminders' ? 'text-[#0B5938] dark:text-blue-400' : 'text-[#6C7A89] dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
        }`}
      >
        {activeTab === 'reminders' && (
          <motion.div
            layoutId="nav-active-pill"
            transition={navActiveTransition}
            className="absolute inset-y-1.5 inset-x-1 bg-[#E8F8EE] dark:bg-blue-950/70 rounded-full -z-0"
          />
        )}
        <div className="relative z-10">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
            />
          </svg>
          {pendingRemindersCount > 0 && (
            <span className="absolute -top-1 -right-2 w-3.5 h-3.5 bg-emerald-600 dark:bg-blue-600 text-white rounded-full text-[9px] font-bold flex items-center justify-center border border-white dark:border-slate-900">
              {pendingRemindersCount}
            </span>
          )}
        </div>
        <span className={`text-[11px] mt-0.5 z-10 ${activeTab === 'reminders' ? 'font-semibold' : 'font-medium'}`}>
          Tasks
        </span>
        {activeTab === 'reminders' && (
          <motion.div
            layoutId="nav-active-indicator-dot"
            transition={navActiveTransition}
            className="w-6 h-0.5 bg-[#0B5938] dark:bg-blue-400 rounded-full mt-0.5 z-10"
          />
        )}
      </motion.button>

      {/* Report */}
      <motion.button
        id="nav-tab-report"
        type="button"
        whileTap={navTabPress}
        transition={springSnappy}
        onClick={() => onTabChange('report')}
        className={`relative flex-1 flex flex-col items-center justify-center py-1.5 h-full transition-colors duration-150 cursor-pointer ${
          activeTab === 'report' ? 'text-[#0B5938] dark:text-blue-400' : 'text-[#6C7A89] dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
        }`}
      >
        {activeTab === 'report' && (
          <motion.div
            layoutId="nav-active-pill"
            transition={navActiveTransition}
            className="absolute inset-y-1.5 inset-x-1 bg-[#E8F8EE] dark:bg-blue-950/70 rounded-full -z-0"
          />
        )}
        <svg className="w-5 h-5 z-10" fill="currentColor" viewBox="0 0 24 24">
          <rect height="10" rx="1.2" width="3.5" x="4" y="11" />
          <rect height="16" rx="1.2" width="3.5" x="10.2" y="5" />
          <rect height="12.5" rx="1.2" width="3.5" x="16.5" y="8.5" />
        </svg>
        <span className={`text-[11px] mt-0.5 z-10 ${activeTab === 'report' ? 'font-semibold' : 'font-medium'}`}>
          Report
        </span>
        {activeTab === 'report' && (
          <motion.div
            layoutId="nav-active-indicator-dot"
            transition={navActiveTransition}
            className="w-6 h-0.5 bg-[#0B5938] dark:bg-blue-400 rounded-full mt-0.5 z-10"
          />
        )}
      </motion.button>

      {/* Personal */}
      <motion.button
        id="nav-tab-personal"
        type="button"
        whileTap={navTabPress}
        transition={springSnappy}
        onClick={() => onTabChange('personal')}
        className={`relative flex-1 flex flex-col items-center justify-center py-1.5 h-full transition-colors duration-150 cursor-pointer ${
          activeTab === 'personal' ? 'text-[#0B5938] dark:text-blue-400' : 'text-[#6C7A89] dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
        }`}
      >
        {activeTab === 'personal' && (
          <motion.div
            layoutId="nav-active-pill"
            transition={navActiveTransition}
            className="absolute inset-y-1.5 inset-x-1 bg-[#E8F8EE] dark:bg-blue-950/70 rounded-full -z-0"
          />
        )}
        <svg className="w-5 h-5 z-10" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 12a4.5 4.5 0 100-9 4.5 4.5 0 000 9zm0 2.5c-4.2 0-9 2.2-9 5.5v1h18v-1c0-3.3-4.8-5.5-9-5.5z" />
        </svg>
        <span className={`text-[11px] mt-0.5 z-10 ${activeTab === 'personal' ? 'font-semibold' : 'font-medium'}`}>
          Personal
        </span>
        {activeTab === 'personal' && (
          <motion.div
            layoutId="nav-active-indicator-dot"
            transition={navActiveTransition}
            className="w-6 h-0.5 bg-[#0B5938] dark:bg-blue-400 rounded-full mt-0.5 z-10"
          />
        )}
      </motion.button>
    </nav>
  );
}

export const BottomNav = memo(BottomNavInner);


