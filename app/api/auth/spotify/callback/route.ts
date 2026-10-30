import { NextRequest, NextResponse } from "next/server";
import { exchangeSpotifyCode } from "@/lib/spotify";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = req.cookies.get("spotify_oauth_state")?.value;

  if (!code || !state || state !== expectedState) {
    return NextResponse.redirect(new URL("/?error=spotify_state_mismatch", req.url));
  }

  try {
    await exchangeSpotifyCode(code);
  } catch (err) {
    return NextResponse.redirect(
      new URL(`/?error=${encodeURIComponent(String(err))}`, req.url)
    );
  }

  return NextResponse.redirect(new URL("/?connected=spotify", req.url));
}
