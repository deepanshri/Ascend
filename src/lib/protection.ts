import { Habit } from '../types';
import { addDaysIso, diffDaysIso, formatIsoShort, toISODate } from '../utils/dates';

export const MAX_ACTIVE_HABITS = 20;
export const EXAM_SHIELD_MAX_DAYS_PER_SEMESTER = 14;
export const EXAM_SHIELD_COOLDOWN_DAYS = 30;
export const VACATION_MAX_DAYS = 5;

export const PROTECTION_STORAGE_KEY = 'ascend_protection_state';
const LEGACY_EXAM_KEY = 'ascend_exam_shield';
const LEGACY_VACATION_KEY = 'ascend_vacation_mode';

export interface ExamShieldState {
  active: boolean;
  startedOn: string | null;
  endsOn: string | null;
  semesterKey: string;
  semesterDaysUsed: number;
  cooldownUntil: string | null;
}

export interface VacationState {
  active: boolean;
  startedOn: string | null;
  endsOn: string | null;
}

export interface ProtectionState {
  examShield: ExamShieldState;
  vacation: VacationState;
}

export interface ProtectionModeStatus {
  active: boolean;
  daysUsed: number;
  daysRemaining: number;
  daysCap: number;
  cooldownDaysRemaining: number;
  windowStart: string | null;
  windowEnd: string | null;
  windowLabel: string | null;
  canEnable: boolean;
  blockReason: string | null;
}

export interface ProtectionMutation {
  ok: boolean;
  state: ProtectionState;
  reason?: string;
}

export function countActiveHabits(habits: Habit[]): number {
  return habits.filter((habit) => !habit.archived).length;
}

export function isAtActiveHabitCap(habits: Habit[]): boolean {
  return countActiveHabits(habits) >= MAX_ACTIVE_HABITS;
}

export function semesterKeyForIso(iso: string = toISODate()): string {
  const [, month] = iso.split('-').map(Number);
  const year = iso.slice(0, 4);
  return (month || 1) <= 6 ? `${year}-S1` : `${year}-S2`;
}

function inclusiveDays(fromIso: string, toIso: string): number {
  return Math.max(0, diffDaysIso(fromIso, toIso) + 1);
}

export function defaultProtectionState(today: string = toISODate()): ProtectionState {
  return {
    examShield: {
      active: false,
      startedOn: null,
      endsOn: null,
      semesterKey: semesterKeyForIso(today),
      semesterDaysUsed: 0,
      cooldownUntil: null,
    },
    vacation: {
      active: false,
      startedOn: null,
      endsOn: null,
    },
  };
}

function cloneState(state: ProtectionState): ProtectionState {
  return {
    examShield: { ...state.examShield },
    vacation: { ...state.vacation },
  };
}

function resetSemesterIfNeeded(state: ProtectionState, today: string): ProtectionState {
  const next = cloneState(state);
  const key = semesterKeyForIso(today);
  if (next.examShield.semesterKey !== key) {
    next.examShield.semesterKey = key;
    next.examShield.semesterDaysUsed = 0;
  }
  return next;
}

function currentExamWindowDays(state: ProtectionState, today: string): number {
  const { active, startedOn, endsOn } = state.examShield;
  if (!active || !startedOn) return 0;
  const last = endsOn && diffDaysIso(today, endsOn) < 0 ? endsOn : today;
  return inclusiveDays(startedOn, last);
}

export function tickProtectionState(
  state: ProtectionState,
  today: string = toISODate()
): ProtectionState {
  let next = resetSemesterIfNeeded(state, today);

  if (next.examShield.active && next.examShield.endsOn && diffDaysIso(today, next.examShield.endsOn) < 0) {
    next = disableExamShield(next, today).state;
  }

  if (next.vacation.active && next.vacation.endsOn && diffDaysIso(today, next.vacation.endsOn) < 0) {
    next = disableVacation(next, today).state;
  }

  return next;
}

export function enableExamShield(
  state: ProtectionState,
  today: string = toISODate()
): ProtectionMutation {
  const ticked = tickProtectionState(state, today);
  const next = cloneState(ticked);
  const status = getExamShieldStatus(next, today);
  if (next.examShield.active) return { ok: true, state: next };
  if (!status.canEnable) return { ok: false, state: next, reason: status.blockReason || undefined };

  const remaining = Math.max(0, EXAM_SHIELD_MAX_DAYS_PER_SEMESTER - next.examShield.semesterDaysUsed);
  next.examShield.active = true;
  next.examShield.startedOn = today;
  next.examShield.endsOn = addDaysIso(today, remaining - 1);
  return { ok: true, state: next };
}

export function disableExamShield(
  state: ProtectionState,
  today: string = toISODate()
): ProtectionMutation {
  const next = cloneState(resetSemesterIfNeeded(state, today));
  if (!next.examShield.active) return { ok: true, state: next };

  const used = currentExamWindowDays(next, today);
  next.examShield.semesterDaysUsed = Math.min(
    EXAM_SHIELD_MAX_DAYS_PER_SEMESTER,
    next.examShield.semesterDaysUsed + used
  );
  next.examShield.active = false;
  next.examShield.cooldownUntil = addDaysIso(today, EXAM_SHIELD_COOLDOWN_DAYS);
  return { ok: true, state: next };
}

export function toggleExamShield(
  state: ProtectionState,
  today: string = toISODate()
): ProtectionMutation {
  return state.examShield.active ? disableExamShield(state, today) : enableExamShield(state, today);
}

export function enableVacation(
  state: ProtectionState,
  today: string = toISODate()
): ProtectionMutation {
  const ticked = tickProtectionState(state, today);
  const next = cloneState(ticked);
  if (next.vacation.active) return { ok: true, state: next };
  next.vacation.active = true;
  next.vacation.startedOn = today;
  next.vacation.endsOn = addDaysIso(today, VACATION_MAX_DAYS - 1);
  return { ok: true, state: next };
}

export function disableVacation(
  state: ProtectionState,
  today: string = toISODate()
): ProtectionMutation {
  const next = cloneState(resetSemesterIfNeeded(state, today));
  if (!next.vacation.active) return { ok: true, state: next };
  next.vacation.active = false;
  return { ok: true, state: next };
}

export function toggleVacation(
  state: ProtectionState,
  today: string = toISODate()
): ProtectionMutation {
  return state.vacation.active ? disableVacation(state, today) : enableVacation(state, today);
}

function windowLabel(start: string | null, end: string | null): string | null {
  if (!start || !end) return null;
  return `${formatIsoShort(start)} – ${formatIsoShort(end)}`;
}

export function getExamShieldStatus(
  state: ProtectionState,
  today: string = toISODate()
): ProtectionModeStatus {
  const aligned = resetSemesterIfNeeded(state, today);
  const shield = aligned.examShield;
  const currentWindow = currentExamWindowDays(aligned, today);
  const daysUsed = Math.min(
    EXAM_SHIELD_MAX_DAYS_PER_SEMESTER,
    shield.semesterDaysUsed + currentWindow
  );
  const daysRemaining = Math.max(0, EXAM_SHIELD_MAX_DAYS_PER_SEMESTER - daysUsed);
  const cooldownDaysRemaining =
    !shield.active && shield.cooldownUntil
      ? Math.max(0, diffDaysIso(today, shield.cooldownUntil))
      : 0;
  let blockReason: string | null = null;
  if (shield.active) {
    blockReason = null;
  } else if (cooldownDaysRemaining > 0) {
    blockReason = `Cooldown: ${cooldownDaysRemaining} day${cooldownDaysRemaining === 1 ? '' : 's'} remaining.`;
  } else if (daysRemaining <= 0) {
    blockReason = `Semester cap of ${EXAM_SHIELD_MAX_DAYS_PER_SEMESTER} days used.`;
  }

  return {
    active: shield.active,
    daysUsed,
    daysRemaining,
    daysCap: EXAM_SHIELD_MAX_DAYS_PER_SEMESTER,
    cooldownDaysRemaining,
    windowStart: shield.startedOn,
    windowEnd: shield.endsOn,
    windowLabel: windowLabel(shield.startedOn, shield.endsOn),
    canEnable: shield.active || (!blockReason && daysRemaining > 0),
    blockReason,
  };
}

export function getVacationStatus(
  state: ProtectionState,
  today: string = toISODate()
): ProtectionModeStatus {
  const vacation = state.vacation;
  const daysUsed =
    vacation.active && vacation.startedOn
      ? inclusiveDays(
          vacation.startedOn,
          vacation.endsOn && diffDaysIso(today, vacation.endsOn) < 0 ? vacation.endsOn : today
        )
      : 0;
  const daysRemaining = vacation.active
    ? Math.max(0, VACATION_MAX_DAYS - daysUsed)
    : VACATION_MAX_DAYS;

  return {
    active: vacation.active,
    daysUsed,
    daysRemaining,
    daysCap: VACATION_MAX_DAYS,
    cooldownDaysRemaining: 0,
    windowStart: vacation.startedOn,
    windowEnd: vacation.endsOn,
    windowLabel: windowLabel(vacation.startedOn, vacation.endsOn),
    canEnable: true,
    blockReason: null,
  };
}

export function loadProtectionState(today: string = toISODate()): ProtectionState {
  try {
    const raw = localStorage.getItem(PROTECTION_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ProtectionState;
      if (parsed?.examShield && parsed?.vacation) {
        return tickProtectionState(parsed, today);
      }
    }
  } catch {}

  let state = defaultProtectionState(today);
  try {
    if (localStorage.getItem(LEGACY_EXAM_KEY) === 'true') {
      state = enableExamShield(state, today).state;
    }
    if (localStorage.getItem(LEGACY_VACATION_KEY) === 'true') {
      state = enableVacation(state, today).state;
    }
  } catch {}
  return tickProtectionState(state, today);
}

export function saveProtectionState(state: ProtectionState): void {
  try {
    localStorage.setItem(PROTECTION_STORAGE_KEY, JSON.stringify(state));
    localStorage.setItem(LEGACY_EXAM_KEY, state.examShield.active ? 'true' : 'false');
    localStorage.setItem(LEGACY_VACATION_KEY, state.vacation.active ? 'true' : 'false');
  } catch {}
}
