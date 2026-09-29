import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const url = Deno.env.get('SUPABASE_URL')!;
const publicKey = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')!)['default'];
const secretKey = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')!)['default'];
const admin = createClient(url, secretKey);

Deno.serve(async (request: Request) => {
  const origin = request.headers.get('Origin');
  const allowedOrigin = origin === 'https://1nfected92.github.io' ? origin : 'https://1nfected92.github.io';
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': allowedOrigin, 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin' };
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return reply(405, { error: 'POST required' });
  const bearer = request.headers.get('Authorization')?.replace(/^Bearer /i, '');
  if (!bearer) return reply(401, { error: 'Sign in required' });
  const scoped = createClient(url, publicKey, { global: { headers: { Authorization: `Bearer ${bearer}` } } });
  const { data: auth, error: authError } = await scoped.auth.getUser(bearer);
  if (authError || !auth.user) return reply(401, { error: 'Invalid session' });
  let params: { season?: number; type?: number; week?: number };
  try { params = await request.json(); } catch { return reply(400, { error: 'Invalid request' }); }
  const season = params.season ?? 2026, type = params.type ?? 2, week = params.week ?? 1;
  if (!Number.isInteger(season) || season < 2020 || season > 2100 || ![2, 3].includes(type) || !Number.isInteger(week) || week < 1 || week > (type === 2 ? 18 : 4)) return reply(400, { error: 'Invalid season or week' });
  const { data: existing } = await admin.from('games').select('synced_at').eq('season', season).eq('season_type', type).eq('week', week).order('synced_at', { ascending: false }).limit(1);
  if (existing?.[0]?.synced_at && Date.now() - Date.parse(existing[0].synced_at) < 30000) return reply(200, { cached: true, week });
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${season}&seasontype=${type}&week=${week}&limit=100`, { signal: controller.signal });
    if (!response.ok) return reply(502, { error: 'Score provider unavailable' });
    const data = await response.json();
    if (!Array.isArray(data.events)) return reply(502, { error: 'Malformed score feed' });
    const records = data.events.flatMap((event: any) => {
      const competitors = event.competitions?.[0]?.competitors;
      if (!Array.isArray(competitors)) return [];
      const home = competitors.find((x: any) => x.homeAway === 'home');
      const away = competitors.find((x: any) => x.homeAway === 'away');
      if (!home || !away || !event.id) return [];
      const state = event.status?.type?.state;
      const status = state === 'post' ? 'final' : state === 'in' ? 'live' : 'scheduled';
      return [{ id: String(event.id), season, season_type: type, week,
        home_team: home.team?.displayName || 'TBD', away_team: away.team?.displayName || 'TBD', kickoff_at: event.date || null,
        status, period: event.status?.period || 0, home_score: Number(home.score || 0), away_score: Number(away.score || 0),
        clock: event.status?.displayClock || null, linescores: { home: home.linescores || [], away: away.linescores || [] }, synced_at: new Date().toISOString() }];
    });
    if (!records.length && data.events.length) return reply(502, { error: 'Score feed lacked team identities' });
    if (records.length) { const { error } = await admin.from('games').upsert(records, { onConflict: 'id' }); if (error) return reply(500, { error: 'Score synchronization failed' }); }
    return reply(200, { season, type, week, matched: records.length, source: 'ESPN public scoreboard' });
  } catch { return reply(502, { error: 'Score provider timed out or failed' }); }
  finally { clearTimeout(timeout); }
});
