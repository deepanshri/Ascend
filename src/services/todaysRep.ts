import { supabase } from '../lib/supabaseClient';

export type AskKind = 'answer' | 'motivation' | 'plan';

export interface AskRequest {
  habit_id: string;
  habit_name: string;
  request: string;
}

export interface PlanTask {
  title: string;
  source_url: string | null;
  difficulty: 'easy' | 'medium' | 'hard' | null;
  est_minutes: number | null;
  status: 'not_started' | 'done' | 'skipped';
}

export interface AskSource {
  title: string | null;
  url: string;
}

export interface AskResult {
  kind: AskKind;
  answer: string;
  searched_live: boolean;
  sources: AskSource[];
  tasks: PlanTask[] | null;
  history_note: string | null;
  caution: string | null;
  model_id: string;
  latency_ms: number;
}

const MOCK_DELAY_MS = 4000;

/** True unless VITE_ASK_USE_MOCK is exactly "false". */
export const USE_MOCK = import.meta.env?.VITE_ASK_USE_MOCK !== 'false';

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

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function assertAskRequest(input: AskRequest): void {
  if (typeof input?.habit_id !== 'string' || input.habit_id.trim().length === 0) {
    throw new Error('habit_id is required.');
  }
  if (typeof input?.habit_name !== 'string' || input.habit_name.trim().length === 0) {
    throw new Error('habit_name is required.');
  }
  if (typeof input?.request !== 'string' || input.request.trim().length === 0) {
    throw new Error('request is required.');
  }
  if (input.request.length > 500) {
    throw new Error('request must be at most 500 characters.');
  }
}

/** Keyword order matches the Phase 1 spec. "arrays" is the confirmed chip exception. */
export function buildAskStub(request: string, modelId: string, latencyMs: number): AskResult {
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
      model_id: modelId,
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
      model_id: modelId,
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
      model_id: modelId,
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
    model_id: modelId,
    latency_ms: latencyMs,
  };
}

export async function askAscend(input: AskRequest): Promise<AskResult> {
  assertAskRequest(input);
  const text = input.request.toLowerCase();
  if (USE_MOCK) {
    await wait(MOCK_DELAY_MS);
    if (text.includes('error')) {
      throw new Error("Couldn't get an answer. Try again.");
    }
    return buildAskStub(input.request, 'mock', MOCK_DELAY_MS);
  }

  const { data, error } = await supabase.functions.invoke('ask-ascend', { body: input });
  if (error || data == null || typeof data !== 'object' || !('kind' in data)) {
    throw new Error("Couldn't get an answer. Try again.");
  }
  return data as AskResult;
}
