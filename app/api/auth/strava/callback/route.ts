import { NextRequest, NextResponse } from "next/server";
import { exchangeStravaCode } from "@/lib/strava";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = req.cookies.get("strava_oauth_state")?.value;

  if (!code || !state || state !== expectedState) {
    return NextResponse.redirect(new URL("/?error=strava_state_mismatch", req.url));
  }

  try {
    await exchangeStravaCode(code);
  } catch (err) {
    return NextResponse.redirect(
      new URL(`/?error=${encodeURIComponent(String(err))}`, req.url)
    );
  }

  return NextResponse.redirect(new URL("/?connected=strava", req.url));
}
