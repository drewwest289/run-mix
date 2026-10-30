import { NextResponse } from "next/server";
import { isSpotifyConnected } from "@/lib/spotify";
import { isStravaConnected } from "@/lib/strava";

export async function GET() {
  const [spotify, strava] = await Promise.all([isSpotifyConnected(), isStravaConnected()]);
  return NextResponse.json({ spotify, strava });
}
