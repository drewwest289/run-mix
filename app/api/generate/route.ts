import { NextRequest, NextResponse } from "next/server";
import { getRun, getRunLaps, type RunLap } from "@/lib/strava";
import { getSavedTracks, getTopTracks, type SpotifyTrack } from "@/lib/spotify";
import { lookupBpmBatch } from "@/lib/bpm";
import { buildPlaylist, type CandidateTrack } from "@/lib/matching";

export async function POST(req: NextRequest) {
  try {
    const { activityId } = await req.json();
    if (!activityId) return NextResponse.json({ error: "activityId required" }, { status: 400 });

    const run = await getRun(activityId);
    let laps: RunLap[] = await getRunLaps(activityId);
    if (laps.length === 0) {
      // No lap splits (e.g. manually logged run) — treat the whole run as one segment.
      laps = [
        {
          lapIndex: 0,
          durationSec: run.movingTimeSec,
          distanceMeters: run.distanceMeters,
          averageHeartrate: run.averageHeartrate,
          averageCadence: run.averageCadence,
        },
      ];
    }

    const [saved, top] = await Promise.all([getSavedTracks(300), getTopTracks(100)]);
    const seen = new Set<string>();
    const pool: { track: SpotifyTrack; source: "liked" | "top" }[] = [];
    for (const t of saved) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      pool.push({ track: t, source: "liked" });
    }
    for (const t of top) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      pool.push({ track: t, source: "top" });
    }

    const bpmMap = await lookupBpmBatch(
      pool.map((p) => ({ artist: p.track.artists[0] ?? "", title: p.track.name }))
    );

    const candidates: CandidateTrack[] = pool.map((p) => ({
      ...p.track,
      source: p.source,
      bpm: bpmMap.get(`${(p.track.artists[0] ?? "").toLowerCase().trim()}|${p.track.name.toLowerCase().trim()}`) ?? null,
    }));

    const matchedCount = candidates.filter((c) => c.bpm != null).length;

    const picks = buildPlaylist(laps, candidates, run.averageCadence);

    const totalMs = picks.reduce((sum, p) => sum + p.track.durationMs, 0);

    return NextResponse.json({
      run,
      candidatePoolSize: candidates.length,
      candidatesWithBpm: matchedCount,
      picks,
      totalMs,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
