export interface FriendFeedItem {
  id: string;
  name: string;
  momentum: number;
}

const FRIENDS_KEY = 'ascend_friends_list';
const SEED_FRIEND_ID = 'f-1';

export function loadFriendsFeed(): FriendFeedItem[] {
  try {
    const raw = localStorage.getItem(FRIENDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item: { id?: string; name?: string; momentum?: number }) => ({
        id: String(item?.id || ''),
        name: String(item?.name || '').trim(),
        momentum: Number(item?.momentum),
      }))
      .filter((item) => item.id && item.name && item.id !== SEED_FRIEND_ID)
      .map((item) => ({
        ...item,
        momentum: Number.isFinite(item.momentum) ? item.momentum : 0,
      }));
  } catch {
    return [];
  }
}
