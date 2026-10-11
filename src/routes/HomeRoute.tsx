import React, { useCallback, useMemo, useRef } from 'react';
import { Plus } from 'lucide-react';
import { motion } from 'motion/react';
import type { Habit } from '../types';
import { FriendsFeed } from '../components/FriendsFeed';
import { HabitCard } from '../components/HabitCard';
import { HomeView } from '../components/HomeView';
import { QuoteCard } from '../components/QuoteCard';
import { HEADER_ICON_BTN_CLASS, SCREEN_INSET_CLASS, ScreenHeader } from '../components/ScreenHeader';
import { useCompleteHabit } from '../hooks/useCompleteHabit';
import { getChronicleEntry, getYesterdayPlanForToday } from '../lib/chronicle';
import { countActiveKeystones, MAX_KEYSTONE_HABITS } from '../lib/keystone';
import { tapPress } from '../lib/motionPresets';
import { isAtActiveHabitCap, MAX_ACTIVE_HABITS } from '../lib/protection';
import { destroyAscendSpotlightTutorial } from '../lib/tutorial';
import { useBowl, useBowlActions } from '../providers/BowlProvider';
import { useCalendar } from '../providers/CalendarProvider';
import { useLedger, useLedgerActions } from '../providers/HabitLedgerProvider';
import { usePreferences, usePreferencesActions } from '../providers/PreferencesProvider';
import { useProtection } from '../providers/ProtectionProvider';
import { useSession } from '../providers/SessionProvider';
import { useTheme } from '../providers/ThemeProvider';
import { useUI, useUIActions } from '../providers/UIProvider';
import { findModal } from '../providers/uiReducer';
import { pulseCompletionHaptic } from '../lib/completionFeedback';

interface HomeRouteProps {
  isActive: boolean;
  onScroll: (event: React.UIEvent<HTMLElement>) => void;
}

/** Keeps the previous array when the ids are unchanged, so habit cards don't re-render. */
function useStableIds(ids: string[]): string[] {
  const ref = useRef(ids);
  const prev = ref.current;
  if (prev.length !== ids.length || prev.some((id, i) => id !== ids[i])) ref.current = ids;
  return ref.current;
}

/** Home: momentum, the accumulation bowl, the quote card and today's habits. Always mounted. */
export function HomeRoute({ isActive, onScroll }: HomeRouteProps) {
  const { session } = useSession();
  const { theme } = useTheme();
  const { modalStack, chronicleVersion } = useUI();
  const { setTab, openModal, closeModal } = useUIActions();
  const { calendarOrigin, originIso, todayDayIndex, currentDayIndex, isViewingToday } = useCalendar();
  const { selectedInterests, eveningChronicle } = usePreferences();
  const { setCycleDays } = usePreferencesActions();
  const { examShieldActive } = useProtection();
  const { habits, activeHabits, activeFallbackIds, rolledOverHabits, momentumPulse, todayMomentumScore } = useLedger();
  const ledger = useLedgerActions();
  const bowl = useBowl();
  const { onCelebrationDone } = useBowlActions();
  const completeHabit = useCompleteHabit();

  const longPressedHabitId = findModal(modalStack, 'habitLongPress')?.habitId ?? null;
  const activeKeystoneCount = useMemo(() => countActiveKeystones(habits), [habits]);
  const activeFallbackIdSet = useMemo(() => new Set(activeFallbackIds), [activeFallbackIds]);
  const keystonesDoneOnViewedDay = useStableIds(
    activeHabits.filter((habit) => habit.isKeystone && habit.days?.[currentDayIndex]).map((habit) => habit.id)
  );

  const openSettings = useCallback(() => setTab('settings'), [setTab]);
  const longPress = useCallback(
    (habit: Habit, rect?: DOMRect) => openModal({ kind: 'habitLongPress', habitId: habit.id, rect: rect || null }),
    [openModal]
  );
  const dismissLongPress = useCallback(() => closeModal('habitLongPress'), [closeModal]);
  const openEdit = useCallback(
    (habit: Habit) => {
      closeModal('habitLongPress');
      openModal({ kind: 'habitDetail', habit });
    },
    [openModal, closeModal]
  );
  const openDeleteConfirm = useCallback(
    (habit: Habit) => {
      closeModal('habitLongPress');
      openModal({ kind: 'deleteHabit', habit });
    },
    [openModal, closeModal]
  );
  const rolloverAll = useCallback(() => {
    if (ledger.rolloverAll() > 0) void pulseCompletionHaptic('fallback');
  }, [ledger]);
  const addHabit = useCallback(() => {
    if (isAtActiveHabitCap(habits)) {
      alert(`Maximum limit of ${MAX_ACTIVE_HABITS} active habits reached.`);
      return;
    }
    destroyAscendSpotlightTutorial();
    openModal({ kind: 'addHabit' });
  }, [habits, openModal]);
  const openChronicle = useCallback(() => openModal({ kind: 'chronicle' }), [openModal]);

  const renderHabit = useCallback(
    (habit: Habit, habitIndex: number) => (
      <HabitCard
        key={habit.id}
        habit={habit}
        todayIndex={todayDayIndex}
        viewIndex={currentDayIndex}
        isCompletedToday={Boolean(habit.days?.[currentDayIndex])}
        theme={theme}
        gesturesLocked={!isViewingToday}
        isLongPressed={longPressedHabitId === habit.id}
        isOtherLongPressed={Boolean(longPressedHabitId && longPressedHabitId !== habit.id)}
        isFallbackActive={isViewingToday && activeFallbackIdSet.has(habit.id)}
        isTourTarget={habitIndex === 0}
        onCompleteToday={completeHabit}
        onToggleFallbackMode={ledger.toggleFallbackMode}
        onResetToday={ledger.resetToday}
        onLongPress={longPress}
        onDismissLongPress={dismissLongPress}
        onOpenEdit={openEdit}
        onOpenDeleteConfirm={openDeleteConfirm}
        onToggleKeystone={ledger.setKeystone}
        keystoneAtCap={!habit.isKeystone && activeKeystoneCount >= MAX_KEYSTONE_HABITS}
        keystoneBoosted={keystonesDoneOnViewedDay.length > 0 && !keystonesDoneOnViewedDay.includes(habit.id)}
        weekOrigin={calendarOrigin}
      />
    ),
    [
      todayDayIndex,
      currentDayIndex,
      theme,
      isViewingToday,
      longPressedHabitId,
      activeFallbackIdSet,
      completeHabit,
      ledger,
      longPress,
      dismissLongPress,
      openEdit,
      openDeleteConfirm,
      activeKeystoneCount,
      keystonesDoneOnViewedDay,
      calendarOrigin,
    ]
  );

  const chronicleCompletedToday = useMemo(
    () => Boolean(getChronicleEntry(originIso)),
    // chronicleVersion: re-read after the chronicle is saved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [originIso, chronicleVersion]
  );
  const yesterdayPlan = useMemo(
    () => getYesterdayPlanForToday(calendarOrigin),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [calendarOrigin, chronicleVersion]
  );
  const quoteCard = useMemo(
    () => (
      <QuoteCard
        selectedInterests={selectedInterests}
        isGuest={Boolean(session?.isGuest)}
        chronicleSettings={eveningChronicle}
        chronicleCompletedToday={chronicleCompletedToday}
        yesterdayPlan={yesterdayPlan}
        onOpenChronicle={openChronicle}
      />
    ),
    [selectedInterests, session?.isGuest, eveningChronicle, chronicleCompletedToday, yesterdayPlan, openChronicle]
  );

  const atCap = isAtActiveHabitCap(habits);
  const dimmed = Boolean(longPressedHabitId) && isActive;

  return (
    <main
      id="app-main-content"
      onScroll={onScroll}
      aria-hidden={!isActive}
      className={`absolute inset-0 tab-pane gpu-smooth ${isActive ? 'tab-pane-active' : 'tab-pane-cached'} px-4 ${SCREEN_INSET_CLASS} pb-28 flex flex-col overflow-y-auto overscroll-y-contain no-scrollbar gpu-accelerated gpu-smooth${dimmed ? ' opacity-40 pointer-events-none' : ''}`}
    >
      <ScreenHeader
        title="Home"
        onOpenSettings={openSettings}
        actions={
          <>
            <FriendsFeed
              userId={session?.id}
              isGuest={session?.isGuest}
              userEmail={session?.email}
              userName={session?.name}
              variant="icon"
              mode="invite"
            />
            <motion.button
              id="add-habit-btn-above-list"
              type="button"
              whileTap={tapPress}
              onClick={addHabit}
              aria-label="Add Habit"
              title={atCap ? `Maximum limit of ${MAX_ACTIVE_HABITS} active habits reached` : 'Add Habit'}
              className={HEADER_ICON_BTN_CLASS}
            >
              <Plus className="w-5 h-5" strokeWidth={2.5} />
            </motion.button>
          </>
        }
      />

      <HomeView
        isActive={isActive}
        pieces={bowl.pieces}
        bowlFill={bowl.bowlFill}
        momentumScore={todayMomentumScore}
        momentumPulse={momentumPulse}
        onCycleDaysChange={setCycleDays}
        celebrating={bowl.celebrating}
        onCelebrationDone={onCelebrationDone}
        deferredPieceIds={bowl.deferredPieceIds}
        settlePieceIds={bowl.settlePieceIds}
        settleHandoffs={bowl.settleHandoffs}
        habits={activeHabits}
        todayIndex={todayDayIndex}
        renderHabit={renderHabit}
        examShieldActive={examShieldActive}
        rolledOverHabits={rolledOverHabits}
        onRolloverAll={rolloverAll}
      >
        {quoteCard}
      </HomeView>
    </main>
  );
}
