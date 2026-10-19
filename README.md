# Ascend

**Momentum, not streaks.**

Most habit apps reset your progress to zero the moment you miss a day — which is exactly why people quit them. Ascend replaces the binary streak with a continuous **Momentum score** that decays gently on a miss instead of collapsing, so one bad day never erases your progress.

## Why Ascend is different

- **Momentum, not streaks** — a 0–100 score that dips on a miss and climbs back on a win, instead of resetting to zero
- **Fallback habits** — swipe left on a hard day for a smaller version of the habit you defined yourself; it still counts
- **Keystone habits** — flag the one or two habits that make everything else easier
- **Identity Ledger** — a permanent, never-decreasing vote count for who you're becoming, separate from day-to-day momentum
- **Accumulation Bowl** — a 3D visualization where every completion drops a piece into a bowl that fills across a customizable cycle
- **Exam Shield & Vacation** — pause momentum decay during real disruptions, no penalty, no guilt
- **Anxiety-free accountability** — connect with a friend via a private code, share updates, send encouragement — no leaderboards, no rankings, ever
- **Unified Tasks** — reminders and to-dos in one tab, with real native notifications

## Tech stack

- **Frontend:** React + TypeScript + Capacitor (Android)
- **Backend:** Supabase (Postgres, Auth, Row Level Security)
- **3D:** React Three Fiber
- **Data model:** Momentum is derived from an append-only event log — completions are never mutated or deleted, only replayed

## Status

Actively developed, in closed beta. See [`docs/PRODUCTION_READINESS_AUDIT.md`](docs/PRODUCTION_READINESS_AUDIT.md) for the current release-readiness status.

## Run locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (the anon/publishable key only, never `service_role`)
3. Run the app:
   `npm run dev`

## Android build

```
npm run cap:build   # vite build + cap sync android
npm run cap:open    # open the Android project in Android Studio
```

Release builds require a local `android/key.properties` pointing at a real signing keystore (gitignored — never committed).

## License

All rights reserved.
