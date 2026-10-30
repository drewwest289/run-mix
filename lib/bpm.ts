import { readJson, writeJson } from "./dataStore";

const CACHE_FILE = "bpm-cache.json";

type BpmCache = Record<string, number | null>; // key: "artist|title" -> tempo or null (not found)

function cacheKey(artist: string, title: string) {
  return `${artist.toLowerCase().trim()}|${title.toLowerCase().trim()}`;
}

function apiKey() {
  return process.env.GETSONGBPM_API_KEY;
}

// Looks up a track's tempo (BPM) via getsongbpm.com's free API.
// Results are cached locally in .data/bpm-cache.json since lookups are rate-limited
// and your library doesn't change tempo between runs.
export async function lookupBpm(artist: string, title: string): Promise<number | null> {
  const cache = readJson<BpmCache>(CACHE_FILE, {});
  const key = cacheKey(artist, title);
  if (key in cache) return cache[key];

  const bpm = await fetchBpmFromApi(artist, title);
  cache[key] = bpm;
  writeJson(CACHE_FILE, cache);
  return bpm;
}

export async function lookupBpmBatch(
  tracks: { artist: string; title: string }[],
  concurrency = 3
): Promise<Map<string, number | null>> {
  const results = new Map<string, number | null>();
  let i = 0;
  async function worker() {
    while (i < tracks.length) {
      const idx = i++;
      const t = tracks[idx];
      const bpm = await lookupBpm(t.artist, t.title);
      results.set(cacheKey(t.artist, t.title), bpm);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

async function fetchBpmFromApi(artist: string, title: string): Promise<number | null> {
  const key = apiKey();
  if (!key) return null;
  try {
    const lookup = encodeURIComponent(`song:${title} artist:${artist}`);
    const res = await fetch(
      `https://api.getsongbpm.com/search/?api_key=${key}&type=both&lookup=${lookup}`
    );
    if (!res.ok) return null;
    const json = await res.json();
    const match = json?.search?.[0];
    const tempo = match?.tempo ? Number(match.tempo) : null;
    return tempo && !Number.isNaN(tempo) ? tempo : null;
  } catch {
    return null;
  }
}
