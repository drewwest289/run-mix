import { NextResponse } from "next/server";
import { listRecentRuns } from "@/lib/strava";

export async function GET() {
  try {
    const runs = await listRecentRuns(20);
    return NextResponse.json({ runs });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
