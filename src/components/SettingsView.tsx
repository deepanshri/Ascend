import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { MotionModal } from './MotionModal';
import { tapPress } from '../lib/motionPresets';
import { Habit, IdentityEvidence, ThemeMode, HabitCompletionEvent, MomentumEvent } from '../types';
import { habitCategoryLabel } from '../utils/categories';
import { toISODate } from '../utils/dates';
import { NotificationWindowToggles } from './NotificationWindowToggles';
import { ScreenHeader, SCREEN_INSET_CLASS } from './ScreenHeader';
import type { NotificationWindowKey, PsychologyNotificationWindows } from '../lib/notifications';

interface SettingsViewProps {
  habits: Habit[];
  evidenceList?: IdentityEvidence[];
  completionEvents?: HabitCompletionEvent[];
  momentumEvents?: MomentumEvent[];
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
  notificationWindows: PsychologyNotificationWindows;
  onToggleNotificationWindow: (key: NotificationWindowKey) => void;
  completionSound: boolean;
  onCompletionSoundChange: (enabled: boolean) => void;
  hapticVibration?: boolean;
  onHapticVibrationChange?: (enabled: boolean) => void;
  onResetData: () => void;
  onRestoreHabit?: (habitId: string) => void;
  onDeleteHabit?: (habitId: string) => void;
  onImportJSON: (
    importedHabits: Habit[],
    importedEvidence?: IdentityEvidence[],
    importedEvents?: HabitCompletionEvent[],
    importedMomentum?: MomentumEvent[]
  ) => void;
  onDeleteAccount: () => void;
  onClearCache: () => void;
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
  onOpenSettings?: () => void;
}

const SettingsViewInner: React.FC<SettingsViewProps> = ({
  habits,
  evidenceList = [],
  completionEvents = [],
  momentumEvents = [],
  theme,
  onThemeChange,
  notificationWindows,
  onToggleNotificationWindow,
  completionSound,
  onCompletionSoundChange,
  hapticVibration = true,
  onHapticVibrationChange,
  onResetData,
  onRestoreHabit,
  onDeleteHabit,
  onImportJSON,
  onDeleteAccount,
  onClearCache,
  onScroll,
  onOpenSettings,
}) => {
  const [startMonday, setStartMonday] = useState(true);
  const [resetFeedback, setResetFeedback] = useState(false);
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [cacheFeedback, setCacheFeedback] = useState(false);

  // Account deletion modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const feedbackTimerRef = useRef<number | null>(null);
  const safeHabits = Array.isArray(habits) ? habits : [];
  const archivedHabits = safeHabits.filter((h) => h.archived);

  useEffect(() => () => {
    if (feedbackTimerRef.current != null) window.clearTimeout(feedbackTimerRef.current);
  }, []);

  const flashFeedback = (message: string, ms = 2000) => {
    setExportFeedback(message);
    if (feedbackTimerRef.current != null) window.clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = window.setTimeout(() => setExportFeedback(null), ms);
  };

  const handleExportJSON = () => {
    const exportPayload = {
      exportedAt: new Date().toISOString(),
      app: 'Ascend Habit Tracker',
      habits: safeHabits,
      completionEvents,
      momentumEvents,
      evidenceLedger: evidenceList,
      totalHabits: safeHabits.length,
      activeHabits: safeHabits.filter((h) => !h.archived).length,
      archivedHabits: archivedHabits.length,
    };

    const dataStr = JSON.stringify(exportPayload, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ascend-habits-backup-${toISODate()}.json`;
    a.click();
    URL.revokeObjectURL(url);

    flashFeedback('JSON Exported ✓');
  };

  const handleExportCSV = () => {
    const headers = [
      'Habit ID',
      'Name',
      'Category',
      'Status',
      'Schedule Type',
      'Purpose Anchor',
      'Identity Statement',
      'Day 1',
      'Day 2',
      'Day 3',
      'Day 4',
      'Day 5',
      'Day 6',
      'Day 7',
    ];

    const rows = safeHabits.map((h) => {
      const dayStatuses = (h.days || []).map((d, i) => {
        if (!d) return 'Incomplete';
        return h.microDays?.[i] ? 'Micro-Habit (50%)' : 'Completed (100%)';
      });

      return [
        `"${h.id}"`,
        `"${h.name.replace(/"/g, '""')}"`,
        `"${habitCategoryLabel(h.category)}"`,
        `"${h.archived ? 'Archived' : 'Active'}"`,
        `"${h.scheduleType || 'daily'}"`,
        `"${(h.purposeAnchor || '').replace(/"/g, '""')}"`,
        `"${(h.identityStatement || '').replace(/"/g, '""')}"`,
        ...dayStatuses.map((s) => `"${s}"`),
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ascend-habits-log-${toISODate()}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    flashFeedback('CSV Exported ✓');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = evt.target?.result as string;
        const parsed = JSON.parse(text);
        if (parsed && Array.isArray(parsed.habits)) {
          onImportJSON(parsed.habits, parsed.evidenceLedger, parsed.completionEvents, parsed.momentumEvents);
          flashFeedback('Imported Successfully ✓', 2500);
        } else {
          alert('Invalid Ascend backup format.');
        }
      } catch {
        alert('Could not parse JSON file.');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClearCacheClick = () => {
    onClearCache();
    setCacheFeedback(true);
    if (feedbackTimerRef.current != null) window.clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = window.setTimeout(() => setCacheFeedback(false), 2000);
  };

  const handleDeleteAccountSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (deleteConfirmationText.trim().toUpperCase() === 'DELETE') {
      setShowDeleteModal(false);
      onDeleteAccount();
    }
  };

  return (
    <div id="settings-screen" onScroll={onScroll} className={`absolute inset-0 px-4 ${SCREEN_INSET_CLASS} pb-24 space-y-3.5 overflow-y-auto overscroll-y-contain no-scrollbar select-none`}>
      <ScreenHeader
        title="Settings"
        subtitle="Theme, data controls & account"
        titleClassName="text-[22px] font-bold text-slate-900 dark:text-white tracking-tight leading-tight"
        onOpenSettings={onOpenSettings}
        settingsActive
      />

      {/* Theme Controls */}
      <section data-tour="settings-theme" className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/90 dark:border-slate-800 shadow-sm space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider text-[11px]">
            Theme & Appearance
          </h2>
          <span className="text-[10.5px] text-slate-400 dark:text-slate-400 capitalize">{theme} Mode</span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {/* Light Mode (Green primary) */}
          <button
            type="button"
            onClick={() => onThemeChange('light')}
            className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
              theme === 'light'
                ? 'border-emerald-500 bg-emerald-50/50 ring-1 ring-emerald-500'
                : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center space-x-1.5 mb-1">
              <span className="w-2.5 h-2.5 rounded-full bg-[#23C15D]" />
              <span className="text-[11.5px] font-bold text-slate-900 dark:text-white">Light</span>
            </div>
            <p className="text-[9.5px] text-slate-500 dark:text-slate-400">Green primary</p>
          </button>

          {/* Dark Mode (Blue primary) */}
          <button
            type="button"
            onClick={() => onThemeChange('dark')}
            className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
              theme === 'dark'
                ? 'border-blue-500 bg-blue-950/50 ring-1 ring-blue-500'
                : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center space-x-1.5 mb-1">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
              <span className="text-[11.5px] font-bold text-slate-900 dark:text-white">Dark</span>
            </div>
            <p className="text-[9.5px] text-slate-500 dark:text-slate-400">Blue primary</p>
          </button>

          {/* System Default */}
          <button
            type="button"
            onClick={() => onThemeChange('system')}
            className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
              theme === 'system'
                ? 'border-slate-700 bg-slate-100 dark:bg-slate-800 ring-1 ring-slate-700'
                : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center space-x-1.5 mb-1">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-500" />
              <span className="text-[11.5px] font-bold text-slate-900 dark:text-white">System</span>
            </div>
            <p className="text-[9.5px] text-slate-500 dark:text-slate-400">Auto adapt</p>
          </button>
        </div>
      </section>

      {/* App Preferences Group */}
      <section className="bg-white dark:bg-slate-900 rounded-2xl p-4 space-y-3 border border-slate-200/90 dark:border-slate-800 shadow-sm">
        <h2 className="font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider text-[11px]">
          App Preferences
        </h2>

        {/* Daily reminder windows */}
        <div data-tour="settings-notifications" className="space-y-1">
          <div className="flex flex-col mb-1">
            <span className="text-[12.5px] font-medium text-slate-900 dark:text-white">Daily reminder windows</span>
            <span className="text-[10.5px] text-slate-400">Time-psychology nudges aligned to momentum</span>
          </div>
          <NotificationWindowToggles
            windows={notificationWindows}
            onToggle={onToggleNotificationWindow}
          />
        </div>

        {/* Sound Effects */}
        <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-2.5">
          <div className="flex flex-col">
            <span className="text-[12.5px] font-medium text-slate-900 dark:text-white">Sound Effects</span>
            <span className="text-[10.5px] text-slate-400">Procedural chime when habits and tasks complete</span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={completionSound}
            onClick={() => onCompletionSoundChange(!completionSound)}
            className={`w-10 h-5.5 flex items-center rounded-full p-0.5 transition duration-200 cursor-pointer ${
              completionSound ? 'bg-emerald-600 dark:bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
            }`}
          >
            <div
              className={`bg-white w-4.5 h-4.5 rounded-full shadow-md transform transition duration-200 ${
                completionSound ? 'translate-x-4.5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Haptic Vibration */}
        <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-2.5">
          <div className="flex flex-col">
            <span className="text-[12.5px] font-medium text-slate-900 dark:text-white">Haptic Vibration</span>
            <span className="text-[10.5px] text-slate-400">Tactile pulse on swipe gesture and completion</span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={hapticVibration}
            onClick={() => onHapticVibrationChange?.(!hapticVibration)}
            className={`w-10 h-5.5 flex items-center rounded-full p-0.5 transition duration-200 cursor-pointer ${
              hapticVibration ? 'bg-emerald-600 dark:bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
            }`}
          >
            <div
              className={`bg-white w-4.5 h-4.5 rounded-full shadow-md transform transition duration-200 ${
                hapticVibration ? 'translate-x-4.5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Start day of week */}
        <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-2.5">
          <div className="flex flex-col">
            <span className="text-[12.5px] font-medium text-slate-900 dark:text-white">Start Week on Monday</span>
            <span className="text-[10.5px] text-slate-400">Calendar layout orientation</span>
          </div>
          <button
            type="button"
            onClick={() => setStartMonday(!startMonday)}
            className={`w-10 h-5.5 flex items-center rounded-full p-0.5 transition duration-200 cursor-pointer ${
              startMonday ? 'bg-emerald-600 dark:bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
            }`}
          >
            <div
              className={`bg-white w-4.5 h-4.5 rounded-full shadow-md transform transition duration-200 ${
                startMonday ? 'translate-x-4.5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </section>

      {/* Data Management: Export & Import & Cache */}
      <section className="bg-white dark:bg-slate-900 rounded-2xl p-4 space-y-3 border border-slate-200/90 dark:border-slate-800 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider text-[11px]">
            Data Management
          </h2>
          {exportFeedback && (
            <span className="text-[10.5px] font-bold text-emerald-700 dark:text-blue-300 bg-emerald-50 dark:bg-blue-950 px-2 py-0.5 rounded-md">
              {exportFeedback}
            </span>
          )}
        </div>

        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
          Export full backups, import existing logs, or purge temporary local cache.
        </p>

        {/* Export JSON / CSV Buttons */}
        <div className="grid grid-cols-2 gap-2 pt-0.5">
          <button
            type="button"
            onClick={handleExportJSON}
            className="w-full py-2 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white font-semibold text-[11px] rounded-xl transition cursor-pointer flex items-center justify-center space-x-1.5 shadow-xs"
          >
            <span>Backup JSON</span>
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 dark:bg-blue-600 dark:hover:bg-blue-500 text-white font-semibold text-[11px] rounded-xl transition cursor-pointer flex items-center justify-center space-x-1.5 shadow-xs"
          >
            <span>Export CSV</span>
          </button>
        </div>

        {/* Import JSON file upload */}
        <div className="pt-1">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".json,application/json"
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold text-[11px] rounded-xl transition cursor-pointer flex items-center justify-center space-x-1.5 border border-slate-200 dark:border-slate-700"
          >
            <span>📥 Import Data (JSON Upload)</span>
          </button>
        </div>

        {/* Clear Local Cache */}
        <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-2.5">
          <div>
            <span className="text-[12px] font-medium text-slate-800 dark:text-slate-200 block">Clear Local Cache</span>
            <span className="text-[10px] text-slate-400">Purges session cache while keeping habits safe</span>
          </div>
          <button
            type="button"
            onClick={handleClearCacheClick}
            className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-[10.5px] cursor-pointer"
          >
            {cacheFeedback ? 'Cleared ✓' : 'Clear Cache'}
          </button>
        </div>
      </section>

      {/* Archived Habits Manager */}
      <section className="bg-white dark:bg-slate-900 rounded-2xl p-4 space-y-2 border border-slate-200/90 dark:border-slate-800 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <h2 className="font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider text-[11px]">
              Archived Habits
            </h2>
            <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              {archivedHabits.length}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShowArchived(!showArchived)}
            className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 dark:text-blue-400 dark:hover:text-blue-300 cursor-pointer"
          >
            {showArchived ? 'Hide' : 'Manage'}
          </button>
        </div>

        {showArchived && (
          <div className="pt-2 space-y-2 animate-in fade-in duration-150">
            {archivedHabits.length === 0 ? (
              <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl text-center text-[11px] text-slate-400">
                No archived habits right now.
              </div>
            ) : (
              archivedHabits.map((h) => (
                <div
                  key={h.id}
                  className="p-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200/80 dark:border-slate-700 flex items-center justify-between text-[11.5px]"
                >
                  <div>
                    <span className="font-bold text-slate-800 dark:text-white block">{h.name}</span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">{habitCategoryLabel(h.category)}</span>
                  </div>
                  <div className="flex space-x-1.5">
                    {onRestoreHabit && (
                      <button
                        type="button"
                        onClick={() => onRestoreHabit(h.id)}
                        className="px-2 py-1 bg-emerald-100 dark:bg-blue-950 text-emerald-900 dark:text-blue-300 font-semibold text-[10.5px] rounded-lg cursor-pointer"
                      >
                        Restore
                      </button>
                    )}
                    {onDeleteHabit && (
                      <button
                        type="button"
                        onClick={() => onDeleteHabit(h.id)}
                        className="px-2 py-1 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-[10.5px] rounded-lg cursor-pointer"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </section>

      {/* Account Deletion (Double-confirmation dialog) */}
      <section className="bg-rose-50/50 dark:bg-rose-950/20 rounded-2xl p-4 space-y-2 border border-rose-200/80 dark:border-rose-900/60">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-rose-900 dark:text-rose-300 uppercase tracking-wider text-[11px]">
              Danger Zone
            </h2>
            <p className="text-[10.5px] text-rose-800/80 dark:text-rose-400/80">
              Irreversibly delete your account and wipe all local and cloud data.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowDeleteModal(true)}
            className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] cursor-pointer shadow-xs"
          >
            Delete Account
          </button>
        </div>
      </section>

      {/* Double Confirmation Modal for Account Deletion */}
      <MotionModal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setDeleteConfirmationText('');
        }}
        overlayClassName="bg-slate-900/60 backdrop-blur-xs"
        cardClassName="p-5 max-w-sm space-y-3 text-left border-rose-200 dark:border-rose-900"
      >
            <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-400 flex items-center justify-center text-xl">
              ⚠️
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Delete Account & Wipe Data?</h3>
            <p className="text-[12px] text-slate-600 dark:text-slate-300 leading-relaxed">
              This action <strong>cannot be undone</strong>. All your habits, momentum records, and identity evidence ledger entries will be permanently erased.
            </p>

            <form onSubmit={handleDeleteAccountSubmit} className="space-y-3 pt-1">
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Type &quot;DELETE&quot; to confirm:
              </label>
              <input
                type="text"
                required
                value={deleteConfirmationText}
                onChange={(e) => setDeleteConfirmationText(e.target.value)}
                placeholder="DELETE"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-[12.5px] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500 font-mono"
              />

              <div className="flex space-x-2 pt-1">
                <motion.button
                  type="button"
                  whileTap={tapPress}
                  onClick={() => {
                    setShowDeleteModal(false);
                    setDeleteConfirmationText('');
                  }}
                  className="flex-1 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-[11.5px] hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                >
                  Cancel
                </motion.button>
                <motion.button
                  type="submit"
                  whileTap={deleteConfirmationText.trim().toUpperCase() !== 'DELETE' ? undefined : tapPress}
                  disabled={deleteConfirmationText.trim().toUpperCase() !== 'DELETE'}
                  className="flex-1 py-2 rounded-xl bg-rose-600 text-white font-bold text-[11.5px] hover:bg-rose-700 cursor-pointer disabled:opacity-40"
                >
                  Wipe & Delete
                </motion.button>
              </div>
            </form>
      </MotionModal>
    </div>
  );
};

export const SettingsView = React.memo(SettingsViewInner);
