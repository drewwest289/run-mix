import { NextRequest, NextResponse } from "next/server";
import { createPlaylist } from "@/lib/spotify";

export async function POST(req: NextRequest) {
  try {
    const { name, description, trackUris } = await req.json();
    if (!name || !Array.isArray(trackUris) || trackUris.length === 0) {
      return NextResponse.json({ error: "name and trackUris required" }, { status: 400 });
    }
    const playlist = await createPlaylist(name, description ?? "", trackUris);
    return NextResponse.json({ url: playlist.external_urls.spotify });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
