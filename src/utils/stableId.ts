/**
 * Deterministic UUID-shaped ids (version 4, variant a) from a seed, so the
 * same logical record always gets the same id and Postgres uuid columns
 * accept it. FNV-1a over four labelled passes of the seed.
 */
export function stableUuid(seed: string): string {
  const chunk = (label: string) => {
    let hash = 2166136261;
    const input = `${label}:${seed}`;
    for (let i = 0; i < input.length; i += 1) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  };
  const h1 = chunk('a');
  const h2 = chunk('b');
  const h3 = chunk('c');
  const h4 = chunk('d');
  return `${h1.slice(0, 8)}-${h2.slice(0, 4)}-4${h2.slice(4, 7)}-a${h3.slice(0, 3)}-${h3.slice(3, 7)}${h4.slice(0, 8)}`;
}

/** One momentum event per habit, day and event type. */
export function stableMomentumEventId(habitId: string, loggedDate: string, eventType: string): string {
  return stableUuid(`momentum:${habitId}:${loggedDate}:${eventType}`);
}
