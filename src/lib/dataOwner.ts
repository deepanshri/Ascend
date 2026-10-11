/**
 * Which signed-in user the device's local data belongs to. Pure decision
 * logic; lib/userData.ts applies it to storage.
 */

export type ClaimDecision = 'keep' | 'adopt' | 'purge';

/**
 * Decide what to do with local data when `userId` becomes the signed-in user.
 *
 * - The recorded owner is this user: keep it.
 * - Nothing is recorded and there is no local data: adopt (nothing to leak).
 * - Nothing is recorded but data exists: adopt only when the caller knows it
 *   is this user's (a session restored at startup, from before owners were
 *   recorded); otherwise its owner is unknown, so purge.
 * - Another user owns it: purge, so it is never merged into this account.
 */
export function decideClaim(
  owner: string | null,
  userId: string,
  hasLocalData: boolean,
  adoptUnowned: boolean
): ClaimDecision {
  if (owner === userId) return 'keep';
  if (owner === null && (!hasLocalData || adoptUnowned)) return 'adopt';
  return 'purge';
}
