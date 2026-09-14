import React from 'react';

export const SCREEN_INSET_CLASS = 'pt-[max(0.75rem,calc(env(safe-area-inset-top)+0.5rem))]';

export const HEADER_ICON_BTN_CLASS =
  'w-8 h-8 rounded-xl bg-white dark:bg-slate-900 border border-emerald-300 dark:border-blue-500 text-emerald-800 dark:text-blue-400 shadow-xs hover:bg-emerald-50 dark:hover:bg-blue-950 cursor-pointer flex items-center justify-center shrink-0';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  titleClassName?: string;
  onOpenSettings?: () => void;
  settingsActive?: boolean;
  actions?: React.ReactNode;
}

export const ScreenHeader: React.FC<ScreenHeaderProps> = ({
  title,
  subtitle,
  titleClassName = 'text-[28px] font-extrabold text-slate-900 dark:text-white tracking-tight leading-none',
  onOpenSettings,
  settingsActive = false,
  actions,
}) => {
  return (
    <header className="w-full flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className={titleClassName}>{title}</h1>
        {subtitle ? (
          <p className="text-[13px] text-slate-500 dark:text-slate-400 font-normal mt-1 leading-snug">{subtitle}</p>
        ) : null}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {actions}
        {onOpenSettings ? (
          <button
            id="top-settings-btn"
            type="button"
            onClick={onOpenSettings}
            title="Settings & Preferences"
            aria-label="Settings"
            className={`w-8 h-8 rounded-xl flex items-center justify-center transition cursor-pointer ${
              settingsActive
                ? 'bg-slate-900 dark:bg-blue-600 text-white'
                : 'bg-white/90 dark:bg-slate-900/90 border border-slate-200/90 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800 shadow-xs'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        ) : null}
      </div>
    </header>
  );
};
