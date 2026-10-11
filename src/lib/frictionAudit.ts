import { readJson, writeJson } from './storage';
import { frictionPromptKey, type PendingFrictionPrompt } from './frictionAuditCore';

export { createMissedFrictionAudit, type PendingFrictionPrompt } from './frictionAuditCore';

export const FRICTION_REASON_CHIPS = [
  'Time Constraint',
  'Low Energy',
  'Unexpected Blocker',
  'System Friction',
] as const;

const PENDING_KEY = 'ascend_pending_friction_audits';
const PROMPTED_KEY = 'ascend_friction_prompted_keys';

export function loadPendingFrictionPrompts(): PendingFrictionPrompt[] {
  const parsed = readJson<PendingFrictionPrompt[]>(PENDING_KEY, []);
  return Array.isArray(parsed) ? parsed : [];
}

export function savePendingFrictionPrompts(prompts: PendingFrictionPrompt[]): void {
  writeJson(PENDING_KEY, prompts);
}

function loadPromptedKeys(): Set<string> {
  const parsed = readJson<string[]>(PROMPTED_KEY, []);
  return new Set(Array.isArray(parsed) ? parsed : []);
}

function savePromptedKeys(keys: Set<string>): void {
  writeJson(PROMPTED_KEY, Array.from(keys));
}

export function markFrictionPrompted(habitId: string, loggedDate: string): void {
  const keys = loadPromptedKeys();
  keys.add(frictionPromptKey(habitId, loggedDate));
  savePromptedKeys(keys);
}

/** Drop prompts already answered (or skipped) on this device. */
export function unansweredFrictionPrompts(prompts: PendingFrictionPrompt[]): PendingFrictionPrompt[] {
  if (prompts.length === 0) return prompts;
  const answered = loadPromptedKeys();
  return prompts.filter((item) => !answered.has(frictionPromptKey(item.habitId, item.loggedDate)));
}
