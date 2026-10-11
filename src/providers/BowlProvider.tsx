import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useHabits } from '../hooks/useHabits';
import { fetchHabitLogsForDateRange } from '../lib/habitsApi';
import { pulseCompletionHaptic } from '../lib/completionFeedback';
import { measureCompletionFlight, type FlightHandoffVelocity, type PieceFlight } from '../lib/completionFlight';
import { getThemeIsDark } from '../lib/themeStore';
import {
  accumulationPiecesFromLogs,
  activeCycleWindow,
  archiveCompletedCycle,
  readBowlCycleEpoch,
  resetBowlCycleEpoch,
  summarizeBowlFill,
  summarizeDualBowlFill,
  type AccumulationPiece,
  type BowlFill,
} from '../services/reportService';
import { getMarbleColor } from '../utils/colors';
import { toISODate } from '../utils/dates';
import { useCalendar } from './CalendarProvider';
import { useLedger, useLedgerActions } from './HabitLedgerProvider';
import { useOnboarding } from './OnboardingProvider';
import { usePreferences } from './PreferencesProvider';
import { useSession, useUserDataReset } from './SessionProvider';

/** At most this many marbles in the air at once. */
const MAX_FLIGHTS = 5;
/** How long a landed marble keeps its hand-off velocity in the bowl's physics. */
const SETTLE_MS = 800;
const ARRIVAL_PULSE_MS = 600;

export interface BowlState {
  /** Pieces to draw: the celebration snapshot while pouring out, else the live cycle. */
  pieces: AccumulationPiece[];
  bowlFill: BowlFill;
  /** Start of the active cycle window. */
  cycleStartIso: string;
  celebrating: boolean;
  pieceFlights: PieceFlight[];
  /** Pieces still in the air: hidden in the bowl until they land. */
  deferredPieceIds: ReadonlySet<string>;
  settlePieceIds: ReadonlySet<string>;
  settleHandoffs: ReadonlyMap<string, FlightHandoffVelocity>;
  /** The bowl has scrolled out of view: flights aim at the floating mini bowl. */
  isBowlOffscreen: boolean;
  /** The floating mini bowl pulses as a marble lands. */
  arrivalPulse: boolean;
}

export interface CompletionFlightRequest {
  habitId: string;
  isMicro: boolean;
  loggedDate: string;
  originCoord?: { x: number; y: number; marbleColor?: string; touchRatio?: number };
}

export interface BowlActions {
  /** Throw a marble from the habit card into the bowl. */
  launchFlight: (request: CompletionFlightRequest) => void;
  onFlightComplete: (flightId: string, pieceId: string, handoff: FlightHandoffVelocity) => void;
  onCelebrationDone: () => void;
  setBowlOffscreen: (offscreen: boolean) => void;
}

const BowlStateContext = createContext<BowlState | null>(null);
const BowlActionsContext = createContext<BowlActions | null>(null);

/**
 * The accumulation bowl: the active cycle window, the pieces it holds (from
 * the completion log only — momentum is never read here), flights from cards
 * into it, and the cycle-complete celebration that archives the cycle and
 * starts the next one.
 */
export function BowlProvider({ children }: { children: React.ReactNode }) {
  const { session } = useSession();
  const { isOnboarded, onboardingStep } = useOnboarding();
  const { cycleDays } = usePreferences();
  const { calendarOrigin } = useCalendar();
  const { completionEvents, activeHabits } = useLedger();
  const { mergeCycleLogs } = useLedgerActions();

  const [epoch, setEpoch] = useState(() => readBowlCycleEpoch(toISODate()));
  const [celebrating, setCelebrating] = useState(false);
  const [celebrationPieces, setCelebrationPieces] = useState<AccumulationPiece[] | null>(null);
  const [pieceFlights, setPieceFlights] = useState<PieceFlight[]>([]);
  const [settlePieceIds, setSettlePieceIds] = useState<string[]>([]);
  const [settleHandoffs, setSettleHandoffs] = useState<Map<string, FlightHandoffVelocity>>(() => new Map());
  const [isBowlOffscreen, setIsBowlOffscreen] = useState(false);
  const [arrivalPulse, setArrivalPulse] = useState(false);

  const celebrateLockRef = useRef(false);
  const pendingCycleResetRef = useRef<{ endIso: string; resetAt: number } | null>(null);
  const settleTimersRef = useRef(new Map<string, number>());
  const arrivalTimerRef = useRef<number | null>(null);
  const offscreenRef = useRef(isBowlOffscreen);
  offscreenRef.current = isBowlOffscreen;
  const originRef = useRef(calendarOrigin);
  originRef.current = calendarOrigin;

  const { morningHabits, nightHabits } = useHabits(activeHabits);
  const originIso = toISODate(calendarOrigin);
  const bowlWindow = useMemo(
    () => activeCycleWindow(cycleDays, epoch.startIso, originIso),
    [cycleDays, epoch.startIso, originIso]
  );

  // Pieces come ONLY from habit_logs / the local completion log inside the active cycle window.
  // Unchecking deletes the log row, so the piece leaves the bowl.
  const livePieces = useMemo(
    () =>
      accumulationPiecesFromLogs(
        completionEvents,
        activeHabits.map((habit) => habit.id),
        bowlWindow.startIso,
        bowlWindow.endIso,
        calendarOrigin,
        epoch.resetAt,
        activeHabits
      ),
    [completionEvents, activeHabits, bowlWindow.startIso, bowlWindow.endIso, calendarOrigin, epoch.resetAt]
  );
  const bowlFill = useMemo(
    () => summarizeBowlFill(activeHabits.length, livePieces.length, cycleDays),
    [activeHabits.length, livePieces.length, cycleDays]
  );
  const dualFill = useMemo(() => {
    const morningIds = new Set(morningHabits.map((habit) => habit.id));
    const nightIds = new Set(nightHabits.map((habit) => habit.id));
    return summarizeDualBowlFill(
      morningHabits.length,
      livePieces.filter((piece) => morningIds.has(piece.habitId)).length,
      nightHabits.length,
      livePieces.filter((piece) => nightIds.has(piece.habitId)).length,
      cycleDays
    );
  }, [morningHabits, nightHabits, livePieces, cycleDays]);

  // Bowl full: celebrate, archive the cycle, then start the next one after the pour-out.
  // Never touches the identity ledger, momentum_events or habit_logs.
  useEffect(() => {
    if (celebrating || celebrateLockRef.current) return;
    if (bowlFill.capacity <= 0 || bowlFill.votes < bowlFill.capacity) return;
    celebrateLockRef.current = true;
    setCelebrationPieces(livePieces);
    setCelebrating(true);
    const entry = archiveCompletedCycle({
      cycleDays: bowlFill.cycleDays,
      startIso: bowlWindow.startIso,
      endIso: bowlWindow.endIso,
      votes: bowlFill.votes,
      capacity: bowlFill.capacity,
      fillPercent: bowlFill.fillPercent,
      isOverflowing: bowlFill.isOverflowing,
      morningVotes: dualFill.morning.votes,
      nightVotes: dualFill.night.votes,
    });
    pendingCycleResetRef.current = { endIso: bowlWindow.endIso, resetAt: entry.completedAt };
  }, [bowlFill, celebrating, livePieces, bowlWindow.startIso, bowlWindow.endIso, dualFill]);

  // The cycle window's habit_logs (read-only range query; never moves the epoch).
  useEffect(() => {
    if (!session || session.isGuest) return;
    if (!isOnboarded && onboardingStep < 3) return;
    const { startIso, endIso } = bowlWindow;
    if (!startIso || !endIso || startIso > endIso) return;
    let cancelled = false;
    fetchHabitLogsForDateRange(session.id, startIso, endIso)
      .then((logs) => {
        if (!cancelled) mergeCycleLogs(logs);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, session?.isGuest, bowlWindow.startIso, bowlWindow.endIso, calendarOrigin, isOnboarded, onboardingStep]);

  const clearSettleTimers = useCallback(() => {
    for (const timer of settleTimersRef.current.values()) window.clearTimeout(timer);
    settleTimersRef.current.clear();
  }, []);
  useEffect(() => clearSettleTimers, [clearSettleTimers]);

  useUserDataReset(() => {
    clearSettleTimers();
    celebrateLockRef.current = false;
    pendingCycleResetRef.current = null;
    setEpoch(readBowlCycleEpoch(toISODate()));
    setCelebrationPieces(null);
    setCelebrating(false);
    setPieceFlights([]);
    setSettlePieceIds([]);
    setSettleHandoffs(new Map());
  });

  const launchFlight = useCallback(({ habitId, isMicro, loggedDate, originCoord }: CompletionFlightRequest) => {
    const pieceId = `${habitId}::${loggedDate}`;
    try {
      const points = measureCompletionFlight(habitId, originCoord, offscreenRef.current);
      const isDark = getThemeIsDark();
      const flight: PieceFlight = {
        id: `fly-${pieceId}-${Date.now()}`,
        pieceId,
        isFallback: isMicro,
        kind: isMicro ? 'fallback' : 'full',
        from: points.from,
        to: points.to,
        isDark,
        direction: isMicro ? 'left' : 'right',
        // Same isMicro as habit_logs.type: light vs solid marble.
        color: originCoord?.marbleColor || getMarbleColor(isDark, isMicro),
        touchRatio: points.touchRatio,
      };
      setPieceFlights((prev) => [...prev.slice(-(MAX_FLIGHTS - 1)), flight]);
    } catch {
      /* a failed measurement only skips the animation */
    }
  }, []);

  const onFlightComplete = useCallback((flightId: string, pieceId: string, handoff: FlightHandoffVelocity) => {
    void pulseCompletionHaptic('fallback');
    setArrivalPulse(true);
    if (arrivalTimerRef.current) window.clearTimeout(arrivalTimerRef.current);
    arrivalTimerRef.current = window.setTimeout(() => setArrivalPulse(false), ARRIVAL_PULSE_MS);
    // One React batch: the bowl mounts the marble at the rim with its terminal velocity, the overlay drops it.
    setSettleHandoffs((prev) => new Map(prev).set(pieceId, handoff));
    setSettlePieceIds((prev) => (prev.includes(pieceId) ? prev : [...prev, pieceId]));
    setPieceFlights((prev) => prev.filter((flight) => flight.id !== flightId));
    const timers = settleTimersRef.current;
    const existing = timers.get(pieceId);
    if (existing) window.clearTimeout(existing);
    timers.set(
      pieceId,
      window.setTimeout(() => {
        timers.delete(pieceId);
        setSettlePieceIds((prev) => prev.filter((id) => id !== pieceId));
        setSettleHandoffs((prev) => {
          if (!prev.has(pieceId)) return prev;
          const next = new Map(prev);
          next.delete(pieceId);
          return next;
        });
      }, SETTLE_MS)
    );
  }, []);

  const onCelebrationDone = useCallback(() => {
    const pending = pendingCycleResetRef.current;
    if (pending) {
      setEpoch(resetBowlCycleEpoch(pending.endIso, pending.resetAt));
      pendingCycleResetRef.current = null;
    } else {
      setEpoch(readBowlCycleEpoch(toISODate(originRef.current)));
    }
    setCelebrationPieces(null);
    setCelebrating(false);
    window.setTimeout(() => {
      celebrateLockRef.current = false;
    }, 400);
  }, []);

  const setBowlOffscreen = useCallback((offscreen: boolean) => setIsBowlOffscreen(offscreen), []);

  const deferredPieceIds = useMemo(() => new Set(pieceFlights.map((flight) => flight.pieceId)), [pieceFlights]);
  const settlePieceIdSet = useMemo(() => new Set(settlePieceIds), [settlePieceIds]);

  const state = useMemo<BowlState>(
    () => ({
      pieces: celebrationPieces ?? livePieces,
      bowlFill,
      cycleStartIso: epoch.startIso,
      celebrating,
      pieceFlights,
      deferredPieceIds,
      settlePieceIds: settlePieceIdSet,
      settleHandoffs,
      isBowlOffscreen,
      arrivalPulse,
    }),
    [
      celebrationPieces,
      livePieces,
      bowlFill,
      epoch.startIso,
      celebrating,
      pieceFlights,
      deferredPieceIds,
      settlePieceIdSet,
      settleHandoffs,
      isBowlOffscreen,
      arrivalPulse,
    ]
  );
  const actions = useMemo<BowlActions>(
    () => ({ launchFlight, onFlightComplete, onCelebrationDone, setBowlOffscreen }),
    [launchFlight, onFlightComplete, onCelebrationDone, setBowlOffscreen]
  );

  return (
    <BowlActionsContext.Provider value={actions}>
      <BowlStateContext.Provider value={state}>{children}</BowlStateContext.Provider>
    </BowlActionsContext.Provider>
  );
}

export function useBowl(): BowlState {
  const value = useContext(BowlStateContext);
  if (!value) throw new Error('useBowl must be used inside BowlProvider');
  return value;
}

export function useBowlActions(): BowlActions {
  const value = useContext(BowlActionsContext);
  if (!value) throw new Error('useBowlActions must be used inside BowlProvider');
  return value;
}
