import avatar1 from '../avatars/avatar-1.webp';
import avatar2 from '../avatars/avatar-2.webp';
import avatar3 from '../avatars/avatar-3.webp';
import avatar4 from '../avatars/avatar-4.webp';
import avatar5 from '../avatars/avatar-5.webp';
import avatar6 from '../avatars/avatar-6.webp';
import avatar7 from '../avatars/avatar-7.webp';

export interface AvatarOption {
  id: string;
  src: string;
  label: string;
}

export const AVATAR_OPTIONS: AvatarOption[] = [
  { id: 'avatar_1', src: avatar1, label: 'Avatar 1' },
  { id: 'avatar_2', src: avatar2, label: 'Avatar 2' },
  { id: 'avatar_3', src: avatar3, label: 'Avatar 3' },
  { id: 'avatar_4', src: avatar4, label: 'Avatar 4' },
  { id: 'avatar_5', src: avatar5, label: 'Avatar 5' },
  { id: 'avatar_6', src: avatar6, label: 'Avatar 6' },
  { id: 'avatar_7', src: avatar7, label: 'Avatar 7' },
];

export const DEFAULT_AVATAR_ID = AVATAR_OPTIONS[0].id;
export const AVATAR_STORAGE_KEY = 'ascend_avatar_id';

/** Persist option ids (`avatar_1`) so rebuilds never break hashed asset URLs. */
export function resolveAvatarId(raw?: string | null): string {
  const value = String(raw || '').trim();
  if (AVATAR_OPTIONS.some((option) => option.id === value)) return value;
  const bySrc = AVATAR_OPTIONS.find((option) => option.src === value);
  if (bySrc) return bySrc.id;
  const match = value.match(/avatar[-_]?([1-7])/i);
  if (match) {
    const id = `avatar_${match[1]}`;
    if (AVATAR_OPTIONS.some((option) => option.id === id)) return id;
  }
  return DEFAULT_AVATAR_ID;
}

export function avatarSrc(raw?: string | null): string {
  const id = resolveAvatarId(raw);
  return AVATAR_OPTIONS.find((option) => option.id === id)?.src || AVATAR_OPTIONS[0].src;
}

export function readStoredAvatarId(fallback?: string | null): string {
  try {
    const stored = localStorage.getItem(AVATAR_STORAGE_KEY);
    if (stored) return resolveAvatarId(stored);
  } catch {
    // private mode
  }
  return resolveAvatarId(fallback);
}

export function persistStoredAvatarId(id: string): void {
  try {
    localStorage.setItem(AVATAR_STORAGE_KEY, resolveAvatarId(id));
  } catch {
    // private mode
  }
}