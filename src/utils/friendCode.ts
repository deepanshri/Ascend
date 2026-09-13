/** Crockford-style alphabet: no 0/O/1/I so codes stay readable. */
export const FRIEND_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const FRIEND_CODE_LENGTH = 6;

export function normalizeFriendCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/I/g, '1')
    .replace(/[01]/g, '')
    .slice(0, FRIEND_CODE_LENGTH);
}

export function isValidFriendCode(code: string): boolean {
  return new RegExp(`^[${FRIEND_CODE_ALPHABET}]{${FRIEND_CODE_LENGTH}}$`).test(code);
}

export function formatFriendCodeDisplay(code: string): string {
  const normalized = normalizeFriendCode(code);
  if (normalized.length <= 3) return normalized;
  return `${normalized.slice(0, 3)}-${normalized.slice(3)}`;
}

/** Deterministic 6-character code from a seed (user id). Collision retries use a salt. */
export function generateFriendCode(seed = ''): string {
  if (seed) {
    let hash = 2166136261;
    for (let i = 0; i < seed.length; i += 1) {
      hash ^= seed.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    let n = hash >>> 0;
    let code = '';
    for (let i = 0; i < FRIEND_CODE_LENGTH; i += 1) {
      code += FRIEND_CODE_ALPHABET[n % FRIEND_CODE_ALPHABET.length];
      n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
    }
    return code;
  }

  const bytes = new Uint8Array(FRIEND_CODE_LENGTH);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (byte) => FRIEND_CODE_ALPHABET[byte % FRIEND_CODE_ALPHABET.length]).join('');
}
