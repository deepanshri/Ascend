/**
 * Retrieves the user's vision text ("What do you want to become") from localStorage.
 */
export function getUserVisionStatement(): string {
  try {
    const stored =
      localStorage.getItem('ascend_becoming_goal') ||
      localStorage.getItem('ascend_user_vision') ||
      localStorage.getItem('ascend_vision_statement');
    if (stored && typeof stored === 'string') {
      return stored.trim();
    }
  } catch {}
  return '';
}
