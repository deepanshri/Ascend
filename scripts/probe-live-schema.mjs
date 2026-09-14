import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnv() {
  const env = { ...process.env };
  try {
    const raw = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!(key in env) || !env[key]) env[key] = value;
    }
  } catch {
    // optional
  }
  return env;
}

const env = loadEnv();
const url = (env.VITE_SUPABASE_URL || 'https://dpgupbcbhkmjtyqkljpr.supabase.co').replace(/\/$/, '');
const anon = env.VITE_SUPABASE_ANON_KEY || '';
const headers = {
  apikey: anon,
  Authorization: `Bearer ${anon}`,
  Accept: 'application/json',
  Prefer: 'count=exact',
};

async function probeSelect(table, column) {
  const res = await fetch(`${url}/rest/v1/${table}?select=${column}&limit=0`, { headers });
  const body = await res.text();
  if (res.ok) return { table, column, ok: true };
  let message = body.slice(0, 220);
  try {
    const parsed = JSON.parse(body);
    message = parsed.message || parsed.hint || message;
  } catch {
    // keep raw
  }
  return { table, column, ok: false, message };
}

async function probeTable(table) {
  const res = await fetch(`${url}/rest/v1/${table}?select=*&limit=0`, { headers });
  const body = await res.text();
  if (res.ok) return { table, exists: true, status: res.status };
  let message = body.slice(0, 240);
  try {
    const parsed = JSON.parse(body);
    message = parsed.message || parsed.hint || message;
  } catch {
    // keep raw
  }
  return { table, exists: false, status: res.status, message };
}

async function probeRpc(name) {
  const res = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: '{}',
  });
  const body = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    parsed = { raw: body.slice(0, 240) };
  }
  return { name, status: res.status, message: parsed.message || parsed.hint || parsed.code || JSON.stringify(parsed).slice(0, 240) };
}

const COLUMNS = {
  habits: [
    'id',
    'user_id',
    'title',
    'name',
    'category',
    'purpose_anchor',
    'identity_statement',
    'archived',
    'is_archived',
    'schedule',
    'is_keystone',
    'days',
    'micro_days',
    'timestamp',
    'tags',
    'color',
    'fallback_micro_habit',
    'target_days_per_week',
    'schedule_type',
    'scheduled_days',
    'interval_days',
    'weekly_target_count',
    'updated_at',
    'created_at',
  ],
  habit_logs: [
    'id',
    'user_id',
    'habit_id',
    'logged_date',
    'date',
    'completion_type',
    'type',
    'completion',
    'value',
    'day_index',
    'note',
    'timestamp',
    'friction_reason',
    'created_at',
  ],
  profiles: [
    'id',
    'username',
    'friend_code',
    'email',
    'display_name',
    'avatar_url',
    'vacation',
    'exam_shield',
    'interests',
    'has_completed_tutorial',
  ],
  friendships: ['id', 'user_id', 'friend_id', 'status', 'created_at'],
  momentum_events: ['id', 'user_id', 'habit_id', 'event_type', 'weight', 'timestamp'],
  affirmation_glows: ['id', 'from_user_id', 'to_user_id', 'event_id', 'note', 'created_at'],
};

console.log('=== TABLE EXISTENCE ===');
for (const table of [...Object.keys(COLUMNS), 'friends']) {
  console.log(JSON.stringify(await probeTable(table)));
}

console.log('\n=== COLUMN EXISTENCE ===');
for (const [table, columns] of Object.entries(COLUMNS)) {
  const present = [];
  const missing = [];
  for (const column of columns) {
    const result = await probeSelect(table, column);
    if (result.ok) present.push(column);
    else missing.push(column);
  }
  console.log(`${table} PRESENT: ${present.join(', ') || '(none)'}`);
  console.log(`${table} MISSING: ${missing.join(', ') || '(none)'}`);
}

console.log('\n=== RPC ===');
console.log(JSON.stringify(await probeRpc('connect_by_friend_code')));
console.log(JSON.stringify(await probeRpc('search_profiles')));
