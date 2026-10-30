# Run Mix

Builds a running playlist out of songs you already love (your Spotify Liked
Songs + top tracks), ordered and tempo-matched to a specific run's actual
cadence and heart rate, pulled from Strava.

## How it works

1. You pick a recent run from Strava.
2. The app reads that run's laps (or the whole run if it has no lap splits)
   to get average cadence and heart rate per segment.
3. Cadence (steps/min) is matched to song tempo (BPM) — at the same tempo,
   half-time, or double-time, whichever fits — picking from your Liked Songs
   first, then your top tracks.
4. Heart rate per segment classifies that part of the run as easy/moderate/hard
   relative to the rest of the run, shown as a tag next to each track.
5. You review the generated list, then create it as a real playlist in your
   Spotify account with one click.

### Why GetSongBPM instead of Spotify's own tempo data

Spotify shut off public access to its Audio Features / Recommendations
endpoints for new API apps in late 2024, so a new app (like this one) can't
ask Spotify for a track's tempo anymore. This app uses the free
[GetSongBPM](https://getsongbpm.com/api) API instead, with results cached
locally in `.data/bpm-cache.json` so you're not re-querying it every time.
Coverage is decent for well-known tracks but not complete — any track it
can't find a tempo for is simply left out of the candidate pool, so your
match pool size may be smaller than your full library.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create a Spotify app

- Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) → Create app.
- App name/description: anything.
- Redirect URI: `http://127.0.0.1:3000/api/auth/spotify/callback`
- Save, then copy the Client ID and Client Secret.

### 3. Create a Strava app

- Go to [Strava API Settings](https://www.strava.com/settings/api) → Create & Manage App.
- Authorization Callback Domain: `127.0.0.1`
- Copy the Client ID and Client Secret.

### 4. Get a GetSongBPM API key

- Sign up at [getsongbpm.com/api](https://getsongbpm.com/api) (free) and copy your API key.

### 5. Configure environment variables

```bash
cp .env.local.example .env.local
```

Fill in all five values in `.env.local` from steps 2–4.

### 6. Run it

```bash
npm run dev
```

Open **http://127.0.0.1:3000** (use `127.0.0.1`, not `localhost` — it must
match the redirect URIs registered with Spotify/Strava exactly). Connect both
accounts, pick a run, and generate a mix.

## Notes

- All tokens and the BPM cache are stored locally in `.data/` (gitignored) —
  nothing leaves your machine except calls to Spotify, Strava, and
  GetSongBPM's APIs.
- This is a single-user local tool: there's no login system, it just assumes
  whoever opens `127.0.0.1:3000` is you.
- Cadence from Strava is reported per-leg (one foot), so it's doubled in the
  matching logic to get full steps-per-minute before comparing to song tempo.
- Runs without recorded cadence (e.g. GPS-only activities, or ones logged
  without a footpod/watch that tracks it) will fall back to heart-rate-only
  effort classification and won't be tempo-matched as precisely.
