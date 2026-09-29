import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const origin = 'https://1nfected92.github.io';
const headers = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const fail = () => new Response(JSON.stringify({ error: 'Invalid username or password' }), { status: 401, headers });

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return new Response(null, { status: 405, headers });
  if (request.headers.get('origin') !== origin) return new Response(null, { status: 403, headers });
  try {
    const { username, password } = await request.json();
    if (typeof username !== 'string' || !/^[a-z][a-z0-9_]{2,29}$/.test(username) || typeof password !== 'string' || password.length < 8 || password.length > 1024) return fail();
    const url = Deno.env.get('SUPABASE_URL')!;
    const publicKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const { data: account, error: lookupError } = await admin.from('profiles').select('id').eq('username', username).maybeSingle();
    if (lookupError || !account) return fail();
    const { data: userResult, error: userError } = await admin.auth.admin.getUserById(account.id);
    if (userError || !userResult.user?.email) return fail();
    const auth = createClient(url, publicKey, { auth: { persistSession: false } });
    const { data, error } = await auth.auth.signInWithPassword({ email: userResult.user.email, password });
    if (error || !data.session) return fail();
    return new Response(JSON.stringify({ access_token: data.session.access_token, refresh_token: data.session.refresh_token }), { headers });
  } catch { return fail(); }
});
