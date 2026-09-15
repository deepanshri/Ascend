/** Compact single-line notification / toast copy. */

export function reminderPromptCopy(habitName: string): string {
  const name = habitName.trim() || 'your habit';
  return `Are you ready for "${name}"?`;
}

export function completionConfirmCopy(habitName: string): string {
  const name = habitName.trim() || 'your habit';
  return `Completed "${name}"?`;
}

export function compactNotificationPair(habitName: string): { title: string; body: string } {
  const title = reminderPromptCopy(habitName);
  return { title, body: title };
}
