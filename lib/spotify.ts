import { readJson, writeJson } from "./dataStore";

const TOKENS_FILE = "spotify-tokens.json";

interface SpotifyTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number; // epoch ms
}

function clientId() {
  return process.env.SPOTIFY_CLIENT_ID!;
}
function clientSecret() {
  return process.env.SPOTIFY_CLIENT_SECRET!;
}
function redirectUri() {
  return process.env.SPOTIFY_REDIRECT_URI!;
}

export const SPOTIFY_SCOPES = [
  "user-library-read",
  "user-top-read",
  "user-read-recently-played",
  "playlist-modify-public",
  "playlist-modify-private",
].join(" ");

export function getSpotifyAuthUrl(state: string) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId(),
    scope: SPOTIFY_SCOPES,
    redirect_uri: redirectUri(),
    state,
  });
  return `https://accounts.spotify.com/authorize?${params.toString()}`;
}

async function basicAuthHeader() {
  const creds = Buffer.from(`${clientId()}:${clientSecret()}`).toString("base64");
  return `Basic ${creds}`;
}

export async function exchangeSpotifyCode(code: string) {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: await basicAuthHeader(),
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
    }),
  });
  if (!res.ok) throw new Error(`Spotify token exchange failed: ${await res.text()}`);
  const json = await res.json();
  saveTokens(json);
  return json;
}

function saveTokens(json: { access_token: string; refresh_token?: string; expires_in: number }) {
  const existing = readJson<SpotifyTokens | null>(TOKENS_FILE, null);
  const tokens: SpotifyTokens = {
    access_token: json.access_token,
    refresh_token: json.refresh_token ?? existing?.refresh_token ?? "",
    expires_at: Date.now() + json.expires_in * 1000,
  };
  writeJson(TOKENS_FILE, tokens);
}

async function refreshSpotifyToken(refreshToken: string) {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: await basicAuthHeader(),
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) throw new Error(`Spotify token refresh failed: ${await res.text()}`);
  const json = await res.json();
  saveTokens(json);
  return json;
}

export async function getSpotifyAccessToken(): Promise<string | null> {
  const tokens = readJson<SpotifyTokens | null>(TOKENS_FILE, null);
  if (!tokens) return null;
  if (Date.now() < tokens.expires_at - 60_000) return tokens.access_token;
  const refreshed = await refreshSpotifyToken(tokens.refresh_token);
  return refreshed.access_token;
}

export async function isSpotifyConnected() {
  const tokens = readJson<SpotifyTokens | null>(TOKENS_FILE, null);
  return !!tokens?.refresh_token;
}

async function spotifyFetch(urlPath: string, init: RequestInit = {}) {
  const token = await getSpotifyAccessToken();
  if (!token) throw new Error("Spotify not connected");
  const res = await fetch(`https://api.spotify.com/v1${urlPath}`, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) throw new Error(`Spotify API ${urlPath} failed (${res.status}): ${await res.text()}`);
  if (res.status === 204) return null;
  return res.json();
}

export interface SpotifyTrack {
  id: string;
  uri: string;
  name: string;
  artists: string[];
  durationMs: number;
}

interface RawSpotifyTrack {
  id: string;
  uri: string;
  name: string;
  artists?: { name: string }[];
  duration_ms: number;
}

function mapTrack(t: RawSpotifyTrack): SpotifyTrack {
  return {
    id: t.id,
    uri: t.uri,
    name: t.name,
    artists: (t.artists ?? []).map((a) => a.name),
    durationMs: t.duration_ms,
  };
}

// Your Liked Songs — the primary pool of "songs you already love"
export async function getSavedTracks(limit = 300): Promise<SpotifyTrack[]> {
  const tracks: SpotifyTrack[] = [];
  let urlPath = `/me/tracks?limit=50`;
  while (urlPath && tracks.length < limit) {
    const data = await spotifyFetch(urlPath);
    for (const item of data.items) tracks.push(mapTrack(item.track));
    urlPath = data.next ? data.next.replace("https://api.spotify.com/v1", "") : "";
  }
  return tracks;
}

// Your most-played tracks — secondary pool, biased toward music you actually listen to
export async function getTopTracks(limit = 100): Promise<SpotifyTrack[]> {
  const tracks: SpotifyTrack[] = [];
  for (const time_range of ["short_term", "medium_term"]) {
    const data = await spotifyFetch(`/me/top/tracks?limit=50&time_range=${time_range}`);
    for (const t of data.items) tracks.push(mapTrack(t));
    if (tracks.length >= limit) break;
  }
  return tracks;
}

export async function createPlaylist(name: string, description: string, trackUris: string[]) {
  const me = await spotifyFetch("/me");
  const playlist = await spotifyFetch(`/users/${me.id}/playlists`, {
    method: "POST",
    body: JSON.stringify({ name, description, public: false }),
  });
  for (let i = 0; i < trackUris.length; i += 100) {
    await spotifyFetch(`/playlists/${playlist.id}/tracks`, {
      method: "POST",
      body: JSON.stringify({ uris: trackUris.slice(i, i + 100) }),
    });
  }
  return playlist as { id: string; external_urls: { spotify: string } };
}
