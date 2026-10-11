# Storage migration plan: `localStorage` → native SQLite

Status: **planned, not started.** Begin only after Phase 3 (the `App.tsx`
teardown) is complete, when every read and write goes through a provider,
its loaders and `usePersistEffect`.

## 1. Why move

The app is Android-only (Capacitor 8, minSdk 26). Today all offline data is
JSON in WebView `localStorage`. The risks, most serious first:

| Risk | Detail |
|---|---|
| Losing the whole store | `localStorage` lives in the WebView's own storage, keyed by the page origin. It is lost if the origin changes (`server.hostname` / `androidScheme` in the Capacitor config), if the WebView storage is corrupted, or if the WebView provider resets its data. A device can also end up with "Clear storage" offered as a fix for WebView problems. |
| Quota | WebView `localStorage` is capped at roughly 5–10 MB per origin. `ascend_momentum_events` is append-only and grows forever; once it hits the cap every write fails silently (see `lib/storage.ts`). |
| Main-thread cost | Every change rewrites the entire array as one JSON string, synchronously, on the UI thread. |
| No atomicity | A completion touches 3–5 keys written separately; a kill between writes leaves them inconsistent. |
| Eviction | Android does **not** evict `localStorage` when the user clears cache, since it is not in the cache directory. Storage-pressure eviction of WebView data is possible in principle but is not the main Android risk. |

IndexedDB solves quota, atomicity and main-thread cost, but it lives in the
same per-origin WebView store, so it keeps the first and most serious risk.
**Target: a native SQLite database** in the app's own data directory, outside
the WebView, plus `@capacitor/preferences` (already a dependency) for small
settings.

## 2. Target architecture

| Tier | Store | Holds |
|---|---|---|
| A. Ledger | SQLite (`ascend.db`) | habits, completion events, momentum events, evidence, friction audits, reminders, chronicle entries, offline sync queues, dead letters, deleted-habit ids |
| B. Settings and flags | `@capacitor/preferences` (Android SharedPreferences) | theme, preferences, onboarding/tutorial flags, protection state, cycle settings, profile fields |
| C. Disposable | stays in `localStorage` | quote rotation, web-only widget shims, caches cleared by "Clear cache" |
| Auth | Supabase session moved to a Preferences-backed `auth.storage` adapter | `sb-<ref>-auth-token` (today supabase-js writes it to `localStorage` by default) |

### Storage interface

Every module talks to one async interface, so the engine can change without
touching providers:

```ts
interface LedgerStore {
  load(): Promise<LedgerSnapshot>;                  // everything needed to render
  apply(changes: LedgerChange[]): Promise<void>;    // one transaction
}
interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}
```

`LedgerChange` is row-level (`upsertHabit`, `appendMomentumEvent`,
`deleteCompletion`, …). The Phase 3 reducers already describe changes as
actions, so each action maps to a small set of row writes. That replaces
rewriting whole arrays.

### Plugin

Candidate: `@capacitor-community/sqlite`. **Check before adopting:** a
release that supports Capacitor 8, Android minSdk 26, maintenance status, and
whether a web build is needed (it uses `jeep-sqlite`/sql.js on the web). If it
does not support Capacitor 8, fall back to a small custom Capacitor plugin
over Android's built-in `SQLiteDatabase`.

## 3. Key inventory

Owner = the module that reads and writes the key today. Every key moves.
Nothing is left behind silently.

### Tier A → SQLite

| Key | Owner | Table |
|---|---|---|
| `habit_tracker_habits` | `lib/ledgerStorage*` | `habits` |
| `ascend_completion_events` | `lib/ledgerStorage*` | `completion_events` |
| `ascend_momentum_events` | `lib/ledgerStorage*`, `lib/momentumEvents` | `momentum_events` (append-only) |
| `habit_tracker_evidence` | `lib/ledgerStorage*` | `evidence` |
| `ascend_friction_audits` | `lib/ledgerStorage*` | `friction_audits` |
| `ascend_pending_friction_audits`, `ascend_friction_prompted_keys` | `lib/frictionAudit` | `friction_prompts` |
| `ascend_active_fallbacks`, `ascend_rolled_over_habits` | `lib/ledgerStorage*` | `day_state` |
| `habit_tracker_reminders`, `ascend_reminders_last_sync_timestamp` | `lib/ledgerStorage*`, `lib/supabase` | `reminders`, `sync_meta` |
| `ascend_chronicle_entries`, `ascend_chronicle` (legacy) | `lib/chronicle` | `chronicle_entries` |
| `ascend_offline_habit_log_queue`, `ascend_offline_profile_queue`, `ascend_offline_momentum_event_queue` | `lib/offlineSync`, `lib/momentumEvents` | `outbox` |
| `ascend_bowl_cycle_history` | `services/reportService` | `cycle_history` |
| `ascend_deleted_habit_ids` | `lib/habitsApi` | `deleted_habits` |
| `ascend_dead_letter` | `lib/deadLetter` | `dead_letters` |
| `ascend_user_feedback_history` | `components/PersonalView` | `feedback_history` |

### Tier B → Preferences

| Key(s) | Owner |
|---|---|
| `ascend_theme` | `lib/themeStore`, `providers/ThemeProvider` |
| `ascend_personal_interests`, `ascend_chronicle_settings`, `ascend_setting_sound`, `ascend_completion_sound`, `ascend_setting_vibration`, `ascend_accumulation_cycle_days`, `ascend_psychology_notifications` (already mirrored natively) | `providers/PreferencesProvider` |
| `ascend_user_session`, `ascend_onboarding_completed` | `lib/supabase` |
| `ascend_has_completed_tutorial`, `ascend_tutorial_screen_*` | `lib/profile`, `lib/tutorial` |
| `ascend_protection_state`, `ascend_exam_shield`, `ascend_vacation_mode` (legacy) | `lib/protection` |
| `ascend_bowl_cycle_start_iso`, `ascend_bowl_cycle_reset_at` | `services/reportService` |
| `ascend_last_active_date`, `ascend_vision_reminder_last_date`, `ascend_chronicle_last_auto_launch_date` | `App.tsx` (→ Calendar/UI providers) |
| `ascend_avatar_id`, `ascend_profile_cache`, `ascend_user_name`, `ascend_dob`, `ascend_location`, `ascend_university`, `ascend_start_monday` | `data/avatars`, `lib/offlineSync`, `components/PersonalView`, `components/SettingsView` |
| `ascend_becoming_goal`, `ascend_user_vision`, `ascend_vision_statement` | `lib/vision`, `components/PersonalView` |
| `ascend_health_sleep_denied`, `ascend_identity_vote_floor` | `lib/health`, `App.tsx` |

### Tier C → stays in `localStorage`

`last_quote_rotation_timestamp`, `current_quote_index`, `ascend_widget_pending_actions`,
`ascend_widget_launch_route` (web-only shims), `ascend_reminders_cache`,
`ascend_habit_logs_cache`, `ascend_reminders`, `ascend_cache_timestamp`.

## 4. Prerequisites (end of Phase 3)

1. No component or provider touches `localStorage` directly; all access goes
   through `lib/storage.ts`, the loaders and `usePersistEffect`.
2. Reducers describe every mutation as an action (needed to derive row changes).
3. Every parser in `lib/ledgerStorage.ts` covers its key, with dead-lettering, so
   the migration can reuse them.

## 5. Implementation steps

1. **Async boot gate.** Today providers hydrate synchronously in `useState`
   initialisers. Add `bootstrap(): Promise<InitialState>` that loads tiers A
   and B before the first render. Keep the native splash up until it resolves
   (replace the fixed 1500 ms `hideNativeSplash` timer). Providers take their
   initial state as a prop. Nothing renders against an empty store.
2. **Introduce the interfaces with a `localStorage` implementation** behind
   them. Ship that release first: same storage, new code path, so any
   regression is isolated from the engine change.
3. **Write-behind on the new store.** `pendingWrites` batches changes per
   action and `flushPendingWrites` commits one SQLite transaction. Because the
   flush becomes async, `backgroundFlush` must start it on Capacitor `pause`.
   Row-level writes keep it to milliseconds, well inside Android's
   background window. Keep the synchronous `localStorage` flush as a fallback
   until step 7.
4. **SQLite schema v1.** Tables listed in section 3, an `id` primary key on
   each, `habit_id` indexes on event tables, a `meta(key, value)` table holding
   `schema_version`. Momentum events stay append-only, enforced by having no
   update/delete path except the account-wipe and habit-cascade operations.
5. **One-time migration** (idempotent, resumable):
   1. If `meta.schema_version >= 1`, skip.
   2. For each Tier A key: read the raw string, run the existing parser,
      dead-letter the rejects, insert the rows. **Everything in one
      transaction**: on any error, roll back and stay on `localStorage` for
      this launch.
   3. Copy Tier B keys to Preferences.
   4. Verify: per-table row counts equal the parsed counts, and a checksum of
      ids matches.
   5. Set `schema_version = 1` in the same transaction as the data.
   6. **Do not delete the `localStorage` keys.** Rename the namespace by
      writing `ascend_migrated_at`; the old keys stay as a rollback copy.
6. **Supabase auth storage.** Pass `auth: { storage: preferencesAuthStorage }`
   to `createClient`; on first run copy any existing `sb-*-auth-token` value
   across so users are not signed out.
7. **Cleanup release** (two releases after migration, once no rollback is
   needed): delete the migrated `localStorage` keys and the fallback flush.

## 6. Testing

- **Unit (Vitest, pure only):** key → row mapping, `LedgerChange` derivation
  from reducer actions, migration verification and checksum logic, with the
  same fixtures as `ledgerStorage.test.ts`.
- **On device (manual or instrumented):**
  - fresh install
  - upgrade with realistic data, including a 5 MB momentum log
  - kill the app mid-migration, then relaunch
  - airplane mode
  - low storage
  - force-stop right after completing a habit
  - "Clear cache" (data must survive)
  - "Clear storage" (expected: data gone, the app recovers by syncing from Supabase)
- **Rollback drill:** set `schema_version` back to 0 on a test device and confirm the app runs from the
  retained `localStorage` copy.

## 7. Rollout

Ship behind a remote flag. Release to a small Play Console percentage first,
logging migration outcome (success, rollback, row counts; no user content).
Widen only when rollback rate is ~0. Keep `localStorage` fallback reads for
two releases.

## 8. Rollback

Turning the flag off makes the app read `localStorage` again (still intact,
see 5.6). Writes made in SQLite while the flag was on are lost locally, but
anything already synced comes back from Supabase. **Write and test the reverse sync
before the flag goes past 1%.**

## 9. Open questions

- Plugin choice and its Capacitor 8 compatibility (section 2).
- Encrypt at rest (SQLCipher) or not: the data is personal but not credentials.
- Should the web build (`vite preview`, used for QA) keep `localStorage`
  behind the same interface? Recommended: yes.
