/// <reference path="../deno.d.ts" />

/**
 * ask-ascend stub. JWT verification stays on at the platform (no verify_jwt = false).
 * TEMPORARY: replaced in Phase 3.
 * Keyword order mirrors src/services/todaysRep.ts, including the "arrays" chip exception.
 */

const NEBIUS_API_KEY = Deno.env.get('NEBIUS_API_KEY');
const NEBIUS_BASE_URL = Deno.env.get('NEBIUS_BASE_URL');
const NEBIUS_MODEL = Deno.env.get('NEBIUS_MODEL');
const TAVILY_API_KEY = Deno.env.get('TAVILY_API_KEY');

console.log(
  JSON.stringify({
    NEBIUS_API_KEY: Boolean(NEBIUS_API_KEY),
    NEBIUS_BASE_URL: Boolean(NEBIUS_BASE_URL),
    NEBIUS_MODEL: Boolean(NEBIUS_MODEL),
    TAVILY_API_KEY: Boolean(TAVILY_API_KEY),
  })
);

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
};

type AskSource = { title: string | null; url: string };
type PlanTask = {
  title: string;
  source_url: string | null;
  difficulty: 'easy' | 'medium' | 'hard' | null;
  est_minutes: number | null;
  status: 'not_started' | 'done' | 'skipped';
};
type AskResult = {
  kind: 'answer' | 'motivation' | 'plan';
  answer: string;
  searched_live: boolean;
  sources: AskSource[];
  tasks: PlanTask[] | null;
  history_note: string | null;
  caution: string | null;
  model_id: string;
  latency_ms: number;
};

const MOCK_SOURCES: AskSource[] = [
  { title: 'MOCK source: sample page A', url: 'https://example.com/mock-source-1' },
  { title: 'MOCK source: sample page B', url: 'https://example.com/mock-source-2' },
];

const MOCK_PLAN_TASKS: PlanTask[] = [
  {
    title: 'MOCK task one',
    source_url: 'https://example.com/mock-source-1',
    difficulty: 'easy',
    est_minutes: 5,
    status: 'not_started',
  },
  {
    title: 'MOCK task two',
    source_url: null,
    difficulty: null,
    est_minutes: null,
    status: 'not_started',
  },
];

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function buildStub(request: string, latencyMs: number): AskResult {
  const text = request.toLowerCase();
  if (text.includes('fail')) {
    return {
      kind: 'answer',
      answer: 'MOCK ANSWER: nothing was verified.',
      searched_live: false,
      sources: [],
      tasks: null,
      history_note: null,
      caution: null,
      model_id: 'stub',
      latency_ms: latencyMs,
    };
  }
  if (text.includes('motivat') || text.includes('tired') || text.includes('give up')) {
    return {
      kind: 'motivation',
      answer: 'MOCK MOTIVATION: placeholder note, not a real coach.',
      searched_live: false,
      sources: [],
      tasks: null,
      history_note: "Based on your last 5 days, you finished 4. That's real momentum.",
      caution: null,
      model_id: 'stub',
      latency_ms: latencyMs,
    };
  }
  if (
    text.includes('problems') ||
    text.includes('plan') ||
    text.includes('workout') ||
    text.includes('arrays')
  ) {
    return {
      kind: 'plan',
      answer: 'MOCK PLAN: two placeholder tasks, not a real assignment.',
      searched_live: true,
      sources: MOCK_SOURCES,
      tasks: MOCK_PLAN_TASKS,
      history_note: null,
      caution: null,
      model_id: 'stub',
      latency_ms: latencyMs,
    };
  }
  return {
    kind: 'answer',
    answer: 'MOCK ANSWER: placeholder reply for this habit question.',
    searched_live: true,
    sources: MOCK_SOURCES,
    tasks: null,
    history_note: null,
    caution: 'General guidance, not medical advice.',
    model_id: 'stub',
    latency_ms: latencyMs,
  };
}

function readRequired(body: Record<string, unknown>, key: string): string | null {
  const value = body[key];
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  return value;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const started = Date.now();
  try {
    if (req.method !== 'POST') {
      return json({ error: 'POST is required.' }, 405);
    }

    let parsed: unknown;
    try {
      parsed = await req.json();
    } catch {
      return json({ error: 'Request body must be JSON.' }, 400);
    }
    if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return json({ error: 'Request body must be a JSON object.' }, 400);
    }
    const body = parsed as Record<string, unknown>;
    const habitId = readRequired(body, 'habit_id');
    if (!habitId) return json({ error: 'habit_id is required.' }, 400);
    const habitName = readRequired(body, 'habit_name');
    if (!habitName) return json({ error: 'habit_name is required.' }, 400);
    const requestValue = body.request;
    if (typeof requestValue !== 'string' || requestValue.trim().length === 0) {
      return json({ error: 'request is required.' }, 400);
    }
    if (requestValue.length > 500) {
      return json({ error: 'request must be at most 500 characters.' }, 400);
    }
    if (requestValue.toLowerCase().includes('error')) {
      return json({ error: 'stub error' }, 500);
    }

    return json(buildStub(requestValue, Date.now() - started), 200);
  } catch {
    return json({ error: 'Something went wrong.' }, 500);
  }
});
