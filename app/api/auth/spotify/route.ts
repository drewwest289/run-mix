import { NextResponse } from "next/server";
import { getSpotifyAuthUrl } from "@/lib/spotify";

export async function GET() {
  const state = crypto.randomUUID();
  const res = NextResponse.redirect(getSpotifyAuthUrl(state));
  res.cookies.set("spotify_oauth_state", state, { httpOnly: true, maxAge: 300 });
  return res;
}
