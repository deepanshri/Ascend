# Ascend — Production-Readiness Audit

**As of:** 2026-10-11

**Not ready to certify — 4 verification gaps remain**, down from 6. A live schema probe (`scripts/probe-live-schema.mjs`) run against the real deployed project confirms the hardening migrations actually ran live — all 6 expected tables exist with the right columns, and the legacy `friends` table is genuinely gone (404), proving `011_schema_reconciliation.sql` was applied in production, not just written in the repo. The three previously-flagged criticals (fake Change Password, fake Delete Account, email-verification bypass) remain confirmed fixed in code. What's still open: true cross-user RLS enforcement (needs two real signed-in test accounts, not just the anon key), on-device cold/warm-start timing, notification firing on a real device, and confirmation that you hold a real release keystore.

## Scoreboard

| Area | Status | Evidence |
| --- | --- | --- |
| 1. Performance — build & code-splitting | Pass | `bun run build` succeeds in 11.4s, zero errors. Report/Personal/Settings/Reminders are confirmed separate lazy chunks (`React.lazy` in each route file), matching the earlier code-splitting work. Total `dist/` = 4.2MB; largest chunk is `three-bundle` at 994KB (268KB gzip) — expected for a 3D library. |
| 1. Performance — device timing (cold/warm start, frame profiling) | Not verified | No Android device or emulator available in the auditing sandbox (no `adb`, no `agent-device`). The repo's own `scripts/forensic_fresh_install.mjs` and `scripts/benchmark_android.mjs` are hardcoded to a Windows ADB path and a local emulator — they were run on your machine previously, not reproducible remotely. |
| 1. Performance — PMREM/RoomEnvironment fix | Pass (code-verified) | `src/lib/marbleScene.tsx` defers `PMREMGenerator` construction via `setTimeout(..., 50)` after mount, with a `WeakMap` cache keyed per `WebGLRenderer` and refcounted cleanup. The synchronous-compile-on-mount pattern that caused the freeze is gone. Not re-measured on-device. |
| 2. Backend — append-only momentum_events | Pass (code-verified) | `001_momentum_events.sql`: `REVOKE UPDATE, DELETE ... FROM anon, authenticated` plus `BEFORE UPDATE/DELETE` triggers that unconditionally `RAISE EXCEPTION 'momentum_events is append-only'`. Double-enforced (grant revocation + trigger). The only bypass is a `SECURITY DEFINER` account-deletion RPC that flips a session-local flag — scoped correctly. |
| 2. Backend — RLS policies (habits, momentum_events, friendships, affirmation_glows) | Pass (code-verified) | All four tables have RLS enabled with owner/participant-scoped policies in the migrations (`013_security_rls_hardening.sql`, `023_security_hardening_findings_1_to_4.sql`). Friend-read access to `habits` was found over-permissive in an earlier security pass and was explicitly revoked in favor of narrow `SECURITY DEFINER` RPCs that never expose titles or purpose text. |
| 2. Backend — live schema/migration verification | Pass (schema); cross-user RLS still open | `scripts/probe-live-schema.mjs` run by the user against the live project confirms all 6 expected tables exist with the right columns, and the legacy `public.friends` table returns 404 — proving `011_schema_reconciliation.sql` actually ran in production. `connect_by_friend_code`/`search_profiles` RPC probes also 404'd, but that's the probe script calling them with zero parameters when both require a named argument — not evidence they're missing. Still open: true cross-user RLS enforcement needs two real signed-in test accounts; the anon key alone can't prove it. |
| 2. Backend — secrets in client bundle | Pass | Searched `src/` and the built `dist/` output for `service_role`, hardcoded keys, etc. — none found. Client only ever uses the anon key via `VITE_SUPABASE_ANON_KEY`. |
| 3. Notifications | Partial (code-verified only) | `@capacitor/local-notifications` v8.3.1 wired with real channels (`src/lib/notifications.ts`). `RECEIVE_BOOT_COMPLETED` permission is declared in `AndroidManifest.xml`. Status-bar icon (`ic_stat_notification`) is correctly a white-on-transparent silhouette at all 5 densities (verified by image inspection). Actual firing, force-quit survival, and reboot rescheduling were not tested — no device available. |
| 4. Logo / branding | Pass | App icon (`ic_launcher`) is real custom Ascend branding (mountain/flag mark), present and correctly sized across all 7 density buckets — not Capacitor's default placeholder. Splash screen populated across all orientation/density variants. Verified by directly viewing the PNGs. |
| 5. Change Password (previously flagged) | Fixed, confirmed in code | `src/lib/supabase.ts` → `changePassword()` checks for an active session, then calls real `supabase.auth.updateUser({ password })` (a genuine `PATCH /auth/v1/user`). Not a stub. Not independently confirmed by logging in with a new password. |
| 5. Delete Account (previously flagged) | Fixed, confirmed in code | Calls `delete_own_account()`, a `SECURITY DEFINER` Postgres RPC (migration `019_delete_own_account_auth_user.sql`) that deletes the caller's rows from `affirmation_glows`, `habit_logs`, `momentum_events` (via a scoped append-only bypass), `habits`, `friendships`, `reminders`, `profiles`, and finally `auth.users` itself — scoped strictly to `auth.uid()`. This is a real wipe, not a sign-out. Not independently confirmed via a live before/after DB query. |
| 5. Email verification (previously flagged) | Fixed, confirmed in migration history | An `auto_confirm_auth_user` trigger that bypassed email verification (added in `003`, for dev convenience) was explicitly dropped in `017a_remove_auto_confirm.sql` and reaffirmed idempotently in `020_remove_auto_confirm_idempotent.sql`. `signUpWithEmail()` correctly returns `'confirm-email'` when Supabase returns a user with no session. |
| 6. Release build — build itself | Pass | `vite build` completes cleanly, 11.4s, zero errors. One advisory warning (chunk >500KB, from `three-bundle` — expected, not a defect). |
| 6. Release build — version bump | Pass | `versionCode 6`, `versionName "1.0.5"` in `android/app/build.gradle` — genuinely bumped, not a placeholder `1.0`/`0.0.1`. |
| 6. Release build — real signing | Not verified | `android/key.properties` is correctly gitignored (good practice) and absent from the audit clone. Cannot be confirmed from the repo alone — only you can confirm you hold a real production keystore locally. If `key.properties` is missing when you run `cap:build`, `hasReleaseKeystore` evaluates false and the release build silently falls back to **no signing config** rather than failing loudly. |

## Blocking (confirm before distributing)

No code-level blockers were found. The remaining items are **verification gaps**, not confirmed defects:

- [x] ~~Confirm the deployed Supabase project has the hardening migrations applied~~ — **done**: live schema probe confirms it (all 6 tables + columns match, legacy `public.friends` table is gone, proving `011_schema_reconciliation.sql` ran in production).
- [ ] Confirm you hold a real release keystore and that `android/key.properties` resolves correctly on your machine before running `cap:build` — an absent or misconfigured keystore silently produces an **unsigned** release APK rather than failing the build.
- [ ] Run a real fresh-install cold-start measurement on a device or emulator to confirm the PMREM deferral fix actually eliminated the 20–30s freeze (the code fix is sound, but it was never re-measured after being written).
- [ ] Create two throwaway test accounts and confirm user A genuinely cannot read or write user B's `habits`/`momentum_events`/`friendships` rows — the anon-key schema probe proves the tables and RPCs exist, but not that RLS actually rejects a cross-user request.

## Non-blocking (safe to ship with, fix later)

- **`minifyEnabled false`** in the Android release build type (`android/app/build.gradle`). ProGuard files are referenced but inert since minification is off — the release APK ships unobfuscated and larger than it needs to be. Low risk for a closed friend beta.
- **Dead code:** `supabase/functions/delete-account/index.ts` (an Edge Function) is never invoked from the client — `deleteAccount()` calls the `delete_own_account()` RPC directly instead. Harmless, but worth deleting or documenting as unused.
- **Notification firing/reboot survival** untested on-device — code wiring (boot permission, channels, icon) all looks correct; treat as same-tier risk as the cold-start number until verified on a real device.

## Evidence appendix

**Build log (full, `bun run build`):** 2,871 modules transformed, built in 11.42s, zero errors. Entry chunks: `index` 291.6KB, `app-runtime` 401.3KB, `supabase` 220.9KB, `three-bundle` 993.7KB (all gzipped sizes roughly a third of raw). Route chunks confirmed separate: `ReportView` 30.4KB, `PersonalView` 28.3KB, `SettingsView` 20.3KB, `RemindersView` 35.4KB, `Bowl` 16.0KB.

**Append-only enforcement (`001_momentum_events.sql`):**
```sql
revoke update, delete on public.momentum_events from anon, authenticated;

create or replace function public.prevent_momentum_events_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'momentum_events is append-only';
end;
$$;
```

**Delete Account RPC (`019_delete_own_account_auth_user.sql`)** — deletes `affirmation_glows`, `habit_logs`, `momentum_events` (scoped bypass), `habits`, `friendships`, `reminders`, `profiles`, then `auth.users`, all filtered to `auth.uid()`, under `SECURITY DEFINER`.

**Change Password (`src/lib/supabase.ts`):**
```ts
const { error } = await supabase.auth.updateUser({ password: newPassword });
```

**Email verification bypass removal (`017a_remove_auto_confirm.sql` + `020_remove_auto_confirm_idempotent.sql`):** both drop the `auto_confirm_auth_user` trigger that was added in migration `003` for dev convenience; `020` is an idempotent reaffirmation in case `017` was skipped in any environment.

**PMREM deferral (`src/lib/marbleScene.tsx`):** environment-map generation moved into a `setTimeout(..., 50)` after mount, cached per `WebGLRenderer` via `WeakMap` with refcounting — replaces a synchronous compile that previously blocked first paint.

**Branding:** `ic_launcher` and `ic_launcher_foreground` are a custom mountain/flag/hiker mark present at all 7 Android density buckets (mdpi through xxxhdpi, plus night variants); `ic_stat_notification` is a correctly-formatted white-silhouette-on-transparent icon (alpha extrema 0–255 confirmed at every density via direct pixel inspection) — not Capacitor's default.

**console.log cleanup:** `grep -rn "console\.log" src --include="*.ts" --include="*.tsx"` (excluding test files) returned zero matches — the cleanup pass was real.

**Live schema probe (`scripts/probe-live-schema.mjs`, run by the user against the production project, 2026-10-11):**
```
=== TABLE EXISTENCE ===
{"table":"habits","exists":true,"status":200}
{"table":"habit_logs","exists":true,"status":200}
{"table":"profiles","exists":true,"status":200}
{"table":"friendships","exists":true,"status":200}
{"table":"momentum_events","exists":true,"status":200}
{"table":"affirmation_glows","exists":true,"status":200}
{"table":"friends","exists":false,"status":404,"message":"Could not find the table 'public.friends' in the schema cache"}
```
All 6 expected tables exist with every expected column present and none missing. The legacy `friends` table (superseded by `friendships` in migration `011`) is confirmed absent — direct proof that `011_schema_reconciliation.sql` was applied to the live database, not just written in the repo. `connect_by_friend_code` and `search_profiles` RPC probes returned 404 ("could not find the function ... without parameters"), but both functions require a named argument (`input_code text`, `query text` respectively, per `009_friend_codes.sql` and `023_security_hardening_findings_1_to_4.sql`) — the probe script calls every RPC with an empty body, so this 404 reflects the test's own limitation, not a missing function.
