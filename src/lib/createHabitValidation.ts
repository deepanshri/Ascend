const PURPOSE_MAX_CHARS = 160;
const FALLBACK_MAX_CHARS = 80;

export function collectCreateHabitHiddenErrors(input: {
  purposeAnchor: string;
  fallbackMicro: string;
  isKeystone?: boolean;
  keystoneCapReached?: boolean;
}): { purpose: string | null; fallback: string | null; keystone: boolean; hasError: boolean } {
  const purpose =
    input.purposeAnchor.trim().length > PURPOSE_MAX_CHARS
      ? `Keep purpose under ${PURPOSE_MAX_CHARS} characters.`
      : null;
  const fallback =
    input.fallbackMicro.trim().length > FALLBACK_MAX_CHARS
      ? `Keep the fallback micro-habit under ${FALLBACK_MAX_CHARS} characters.`
      : null;
  // Single Keystone rule auto-demotes existing keystone; it does not block creation
  const keystone = false;
  return {
    purpose,
    fallback,
    keystone,
    hasError: Boolean(purpose || fallback),
  };
}

const DEFAULT_PURPOSE_PREFIX = 'To reinforce my continuous momentum in ';

/** The purpose saved when the user leaves the Purpose field blank. */
export function defaultPurposeAnchor(habitName: string): string {
  return `${DEFAULT_PURPOSE_PREFIX}${habitName}.`;
}

/** True for the auto-generated purpose, even if the habit was renamed since. */
export function isDefaultPurposeAnchor(purpose: string): boolean {
  const trimmed = purpose.trim();
  return trimmed.startsWith(DEFAULT_PURPOSE_PREFIX) && trimmed.endsWith('.');
}
