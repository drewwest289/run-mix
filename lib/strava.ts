import { readJson, writeJson } from "./dataStore";

const TOKENS_FILE = "strava-tokens.json";

interface StravaTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number; // epoch seconds, per Strava's API
}

function clientId() {
  return process.env.STRAVA_CLIENT_ID!;
}
function clientSecret() {
  return process.env.STRAVA_CLIENT_SECRET!;
}
function redirectUri() {
  return process.env.STRAVA_REDIRECT_URI!;
}

export function getStravaAuthUrl(state: string) {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(),
    response_type: "code",
    approval_prompt: "auto",
    scope: "activity:read_all",
    state,
  });
  return `https://www.strava.com/oauth/authorize?${params.toString()}`;
}

function saveTokens(json: { access_token: string; refresh_token: string; expires_at: number }) {
  writeJson(TOKENS_FILE, {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_at: json.expires_at,
  });
}

export async function exchangeStravaCode(code: string) {
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId(),
      client_secret: clientSecret(),
      code,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Strava token exchange failed: ${await res.text()}`);
  const json = await res.json();
  saveTokens(json);
  return json;
}

async function refreshStravaToken(refreshToken: string) {
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId(),
      client_secret: clientSecret(),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Strava token refresh failed: ${await res.text()}`);
  const json = await res.json();
  saveTokens(json);
  return json;
}

export async function getStravaAccessToken(): Promise<string | null> {
  const tokens = readJson<StravaTokens | null>(TOKENS_FILE, null);
  if (!tokens) return null;
  if (Date.now() / 1000 < tokens.expires_at - 60) return tokens.access_token;
  const refreshed = await refreshStravaToken(tokens.refresh_token);
  return refreshed.access_token;
}

export async function isStravaConnected() {
  const tokens = readJson<StravaTokens | null>(TOKENS_FILE, null);
  return !!tokens?.refresh_token;
}

async function stravaFetch(urlPath: string) {
  const token = await getStravaAccessToken();
  if (!token) throw new Error("Strava not connected");
  const res = await fetch(`https://www.strava.com/api/v3${urlPath}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Strava API ${urlPath} failed (${res.status}): ${await res.text()}`);
  return res.json();
}

export interface RunSummary {
  id: number;
  name: string;
  startDate: string;
  distanceMeters: number;
  movingTimeSec: number;
  averageHeartrate: number | null;
  averageCadence: number | null; // steps per minute, single leg (Strava convention)
  averageSpeed: number; // m/s
}

interface RawActivity {
  id: number;
  name: string;
  type: string;
  sport_type: string;
  start_date_local: string;
  distance: number;
  moving_time: number;
  average_heartrate?: number;
  average_cadence?: number;
  average_speed: number;
}

export async function listRecentRuns(count = 20): Promise<RunSummary[]> {
  const activities: RawActivity[] = await stravaFetch(`/athlete/activities?per_page=${count}`);
  return activities
    .filter((a) => a.type === "Run" || a.sport_type === "Run")
    .map((a) => ({
      id: a.id,
      name: a.name,
      startDate: a.start_date_local,
      distanceMeters: a.distance,
      movingTimeSec: a.moving_time,
      averageHeartrate: a.average_heartrate ?? null,
      averageCadence: a.average_cadence ?? null,
      averageSpeed: a.average_speed,
    }));
}

export interface RunLap {
  lapIndex: number;
  durationSec: number;
  distanceMeters: number;
  averageHeartrate: number | null;
  averageCadence: number | null; // single-leg steps/min
}

export async function getRun(activityId: number): Promise<RunSummary> {
  const a: RawActivity = await stravaFetch(`/activities/${activityId}`);
  return {
    id: a.id,
    name: a.name,
    startDate: a.start_date_local,
    distanceMeters: a.distance,
    movingTimeSec: a.moving_time,
    averageHeartrate: a.average_heartrate ?? null,
    averageCadence: a.average_cadence ?? null,
    averageSpeed: a.average_speed,
  };
}

interface RawLap {
  moving_time: number;
  distance: number;
  average_heartrate?: number;
  average_cadence?: number;
}

export async function getRunLaps(activityId: number): Promise<RunLap[]> {
  const laps: RawLap[] = await stravaFetch(`/activities/${activityId}/laps`);
  return laps.map((l, i) => ({
    lapIndex: i,
    durationSec: l.moving_time,
    distanceMeters: l.distance,
    averageHeartrate: l.average_heartrate ?? null,
    averageCadence: l.average_cadence ?? null,
  }));
}
