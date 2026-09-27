# Ascend — Final Fixes Report

## Regression safeguards

- `momentum_events` code was not changed. The new journal writes only journal preferences/entries to local storage and reuses the existing habit-log friction-reason path.
- No new palette color family was introduced. Journal readiness uses the existing `--ascend-accent` green/blue token; the next-morning intention uses the already-locked orange system.
- Turning Evening Journal off leaves the quote/tip card on its original rotation path and hides all journal-derived UI.

## Issue 1 — Blue/green completion flash

### Found

- The earlier first-paint safeguards are present: `useLayoutEffect` applies the document theme, and a dark root/body fallback is present.
- `habitCompleteGlow` and `habitCompleteGlowDark` existed as two theme-specific keyframes, but the completion card no longer applies that class, so those animations were not the active interaction path.
- The live completion swipe path used paired light/dark background utility classes on its reveal layers while optimistic completion state and the swipe spring settle. That is the only theme-specific blue/green layer directly underneath the moving card.

### Changed

- Replaced the swipe reveal’s paired green/blue utilities with the single `bg-accent` theme token.
- Consolidated the dormant completion glow into one CSS-variable-driven keyframe and removed the dark-only duplicate, preventing both theme animations from ever competing if the class is reused later.

### Verified

- Confirmed there is no `habitCompleteGlowDark` keyframe or `.dark .habit-complete-glow` override remaining.
- Confirmed both completion reveal layers use one accent token.
- Source graph bundles successfully. Runtime visual repetition on a device/emulator still needs to be done in the full project because the supplied archive contains only `src/` and no runnable package configuration.

## Issue 2 — Create Habit progressive disclosure

### Found

- The current form showed Habit Name, Priority, Category, Scheduled Days, Target Time, Purpose, Fallback Micro-Habit, and Keystone status at once.
- Empty scheduled days already normalize to all seven days, so the fast path can safely default to daily.

### Changed

- Habit Name, Priority, and Category remain visible.
- Scheduled Days, Target Time, Purpose, Fallback Micro-Habit, and Keystone status now sit behind one collapsed “Add more detail” section.
- The section resets to collapsed whenever the modal opens.
- Existing creation, caps, Supabase insertion, target-time behavior, and field defaults are preserved.

### Verified

- The submit path still accepts only a name plus the default priority/category.
- An unexpanded schedule produces all seven weekdays and `daily` schedule type.
- All prior secondary controls remain mounted and functional after expansion.

## Issue 3 — Evening Journal

### Found

- Quote/tip rotation lives in `QuoteCard.tsx` and rotates every six hours.
- The closest existing timing controls are in Settings → App Preferences beside the daily reminder windows.
- Existing friction reasons are stored in App state/local storage and persisted through `persistHabitLogFrictionReason`.

### Changed

- Added an Evening Journal toggle and conditional local-time picker in Settings.
- After the chosen time, the quote card becomes an accent-colored, icon-paired Journal state if today is incomplete.
- Added a three-step flow:
  1. Actual completed habits from today’s log-derived habit state.
  2. Missed scheduled habits, reusing any same-day friction reason and asking only when one is missing.
  3. “When I wake up, I will…” plus an optional linked habit.
- Completing the flow restores normal quote/tip rotation for the rest of the day.
- Yesterday’s intention appears in the same card before noon the next morning.
- Settings and entries are retained locally; up to 90 journal entries are kept.

### Verified

- Ready state requires: enabled + trigger time passed + no completed entry today.
- Feature-off state suppresses both Journal readiness and the next-morning intention.
- Same-day friction reasons are not duplicated.
- Journal code does not read or mutate `momentum_events`.
- All 100 TypeScript/TSX files parse, and an esbuild bundle of App plus its local dependency graph succeeds.
