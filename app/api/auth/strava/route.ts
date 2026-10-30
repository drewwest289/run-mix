import { NextResponse } from "next/server";
import { getStravaAuthUrl } from "@/lib/strava";

export async function GET() {
  const state = crypto.randomUUID();
  const res = NextResponse.redirect(getStravaAuthUrl(state));
  res.cookies.set("strava_oauth_state", state, { httpOnly: true, maxAge: 300 });
  return res;
}
