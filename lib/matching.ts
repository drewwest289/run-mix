import type { RunLap } from "./strava";
import type { SpotifyTrack } from "./spotify";

export interface CandidateTrack extends SpotifyTrack {
  bpm: number | null;
  source: "liked" | "top";
}

export interface PlaylistPick {
  track: CandidateTrack;
  lapIndex: number;
  targetSpm: number;
  matchedBpm: number;
  effort: "easy" | "moderate" | "hard";
}

const AVG_SONG_MS = 3.5 * 60 * 1000;
const BPM_TOLERANCE = 0.05; // 5%

// Strava reports running cadence as single-leg steps/min; double it to get
// full steps per minute, which is what lines up with a song's tempo.
function fullCadence(singleLegSpm: number) {
  return singleLegSpm * 2;
}

// A song matches a target cadence if its tempo is close to the cadence itself,
// half of it (common for slower/heavier tracks), or double it (common for fast
// double-time tracks). Returns the best-matching multiple and how close it is.
function bestBpmMatch(trackBpm: number, targetSpm: number): { matched: number; error: number } | null {
  const candidates = [targetSpm, targetSpm / 2, targetSpm * 2];
  let best: { matched: number; error: number } | null = null;
  for (const c of candidates) {
    const error = Math.abs(trackBpm - c) / c;
    if (!best || error < best.error) best = { matched: c, error };
  }
  return best && best.error <= BPM_TOLERANCE * 3 ? best : null; // keep, score penalizes distance
}

function classifyEffort(lapHr: number | null, runHrRange: [number, number]): "easy" | "moderate" | "hard" {
  if (lapHr == null) return "moderate";
  const [min, max] = runHrRange;
  if (max === min) return "moderate";
  const pct = (lapHr - min) / (max - min);
  if (pct < 0.33) return "easy";
  if (pct < 0.7) return "moderate";
  return "hard";
}

export function buildPlaylist(
  laps: RunLap[],
  candidates: CandidateTrack[],
  runAverageCadence: number | null
): PlaylistPick[] {
  const withBpm = candidates.filter((c) => c.bpm != null) as (CandidateTrack & { bpm: number })[];
  const hrValues = laps.map((l) => l.averageHeartrate).filter((h): h is number => h != null);
  const runHrRange: [number, number] = hrValues.length
    ? [Math.min(...hrValues), Math.max(...hrValues)]
    : [0, 0];

  const used = new Set<string>();
  const picks: PlaylistPick[] = [];
  let lastArtist: string | null = null;

  for (let lapIndex = 0; lapIndex < laps.length; lapIndex++) {
    const lap = laps[lapIndex];
    const singleLegCadence = lap.averageCadence ?? runAverageCadence;
    if (!singleLegCadence) continue;
    const targetSpm = fullCadence(singleLegCadence);
    const effort = classifyEffort(lap.averageHeartrate, runHrRange);
    const songsNeeded = Math.max(1, Math.round(lap.durationSec * 1000 / AVG_SONG_MS));

    for (let i = 0; i < songsNeeded; i++) {
      let best: { track: CandidateTrack & { bpm: number }; matched: number; error: number } | null = null;
      for (const track of withBpm) {
        if (used.has(track.id)) continue;
        const match = bestBpmMatch(track.bpm, targetSpm);
        if (!match) continue;
        // Small penalties: back-to-back same artist, and prefer liked songs slightly.
        const artistPenalty: number = track.artists[0] === lastArtist ? 0.02 : 0;
        const sourceBonus: number = track.source === "liked" ? -0.01 : 0;
        const score: number = match.error + artistPenalty + sourceBonus;
        if (!best || score < best.error) best = { track, matched: match.matched, error: score };
      }
      if (!best) break; // ran out of matchable, unused tracks for this lap
      used.add(best.track.id);
      lastArtist = best.track.artists[0] ?? null;
      picks.push({
        track: best.track,
        lapIndex,
        targetSpm,
        matchedBpm: best.matched,
        effort,
      });
    }
  }

  return picks;
}
