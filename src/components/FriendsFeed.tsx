import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import {
  connectByFriendCode,
  ensureProfileDirectory,
  fetchFriendActivity,
  fetchFriendships,
  fetchOwnFriendCode,
  fetchReceivedGlows,
  fetchSentGlowEventIds,
  removeFriendship,
  retractAffirmationGlow,
  sendAffirmationGlow,
  type FriendActivityItem,
  type FriendEdge,
  type ReceivedAffirmationGlow,
} from '../lib/friends';
import { formatFriendCodeDisplay, isValidFriendCode, normalizeFriendCode } from '../utils/friendCode';
import { useKeyboardInset } from '../hooks/useKeyboardInset';
import { overlayFade, sheetMotion, tapPress } from '../lib/motionPresets';
import { FloatingToast } from './FloatingToast';
import { ProfileAvatar } from './ProfileAvatar';

export interface FriendsFeedProps {
  userId?: string | null;
  isGuest?: boolean;
  userEmail?: string;
  userName?: string;
  variant?: 'full' | 'drawer' | 'modal' | 'icon';
  isOpen?: boolean;
  onClose?: () => void;
}

function formatActivityTime(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '';
  const delta = Date.now() - timestamp;
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export const FriendsFeed: React.FC<FriendsFeedProps> = ({
  userId = null,
  isGuest = true,
  userEmail = '',
  userName = '',
  variant = 'full',
  isOpen,
  onClose,
}) => {
  const [edges, setEdges] = useState<FriendEdge[]>([]);
  const [activity, setActivity] = useState<FriendActivityItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(variant !== 'drawer' && variant !== 'icon');
  const [friendCode, setFriendCode] = useState('');
  const [connectCode, setConnectCode] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeTone, setNoticeTone] = useState<'ok' | 'error'>('ok');
  const [sentGlows, setSentGlows] = useState<Set<string>>(new Set());
  const [receivedGlows, setReceivedGlows] = useState<ReceivedAffirmationGlow[]>([]);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const modalVisible = variant === 'modal' ? Boolean(isOpen ?? true) : variant === 'icon' && drawerOpen;
  const keyboardInset = useKeyboardInset(modalVisible);
  const signedIn = Boolean(userId && !isGuest && !String(userId).startsWith('guest_'));
  const accepted = useMemo(
    () => (Array.isArray(edges) ? edges : []).filter((edge) => edge.status === 'accepted'),
    [edges]
  );

  const flash = (message: string, tone: 'ok' | 'error' = 'ok') => {
    setNoticeTone(tone);
    setNotice(message);
    window.setTimeout(() => {
      if (mountedRef.current) setNotice(null);
    }, 2400);
  };

  const refresh = useCallback(async () => {
    if (!signedIn || !userId) {
      if (!mountedRef.current) return;
      setEdges([]);
      setActivity([]);
      setSentGlows(new Set());
      setReceivedGlows([]);
      setFriendCode('');
      return;
    }
    if (mountedRef.current) setLoading(true);
    try {
      const code = await ensureProfileDirectory(userId, userEmail, userName);
      const nextCode = code || (await fetchOwnFriendCode(userId));
      const nextEdges = (await fetchFriendships(userId)) ?? [];
      const [nextActivity, nextSent, nextReceived] = await Promise.all([
        fetchFriendActivity(userId, nextEdges),
        fetchSentGlowEventIds(userId),
        fetchReceivedGlows(userId),
      ]);
      if (!mountedRef.current) return;
      setFriendCode(nextCode);
      setEdges(Array.isArray(nextEdges) ? nextEdges : []);
      setActivity(Array.isArray(nextActivity) ? nextActivity : []);
      setSentGlows(nextSent instanceof Set ? nextSent : new Set());
      setReceivedGlows(Array.isArray(nextReceived) ? nextReceived : []);
    } catch {
      if (!mountedRef.current) return;
      setEdges([]);
      setActivity([]);
      setSentGlows(new Set());
      setReceivedGlows([]);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [signedIn, userId, userEmail, userName]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!signedIn || !supabase || !isSupabaseConfigured) return;
    const channel = supabase
      .channel(`friends-feed-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friends' }, () => {
        void refresh();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'momentum_events' }, () => {
        void refresh();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'affirmation_glows' }, () => {
        void refresh();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [signedIn, userId, refresh]);

  const handleCopyCode = async () => {
    if (!friendCode) return;
    try {
      await navigator.clipboard.writeText(friendCode);
      setCopied(true);
      flash('Friend code copied.');
      window.setTimeout(() => {
        if (mountedRef.current) setCopied(false);
      }, 1600);
    } catch {
      flash('Could not copy code.', 'error');
    }
  };

  const handleConnect = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!userId || connecting) return;
    const code = normalizeFriendCode(connectCode);
    if (!isValidFriendCode(code)) {
      flash('Enter a 6-character friend code.', 'error');
      return;
    }
    if (code === friendCode) {
      flash('You cannot connect with your own code.', 'error');
      return;
    }
    setConnecting(true);
    const result = await connectByFriendCode(userId, code);
    if (mountedRef.current) {
      setConnecting(false);
      flash(result.message, result.ok ? 'ok' : 'error');
      if (result.ok) {
        setConnectCode('');
        await refresh();
      }
    }
  };

  const handleUnfriend = async (edge: FriendEdge) => {
    if (!userId) return;
    const ok = await removeFriendship(edge.id, { userId, peerId: edge.peerId });
    flash(ok ? 'Friend removed.' : 'Could not remove friend.', ok ? 'ok' : 'error');
    if (ok) await refresh();
  };

  const handleGlow = async (item: FriendActivityItem) => {
    if (!userId) return;
    if (sentGlows.has(item.id)) {
      const ok = await retractAffirmationGlow(userId, item.id);
      if (ok) {
        setSentGlows((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
        flash('Glow taken back.');
      }
      return;
    }
    const result = await sendAffirmationGlow(userId, item.friendId, item.id);
    flash(result.message, result.ok ? 'ok' : 'error');
    if (result.ok) {
      setSentGlows((prev) => new Set(prev).add(item.id));
    }
  };

  const body = (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[16px] font-extrabold text-ink tracking-tight">Friends</h2>
        {(onClose || variant === 'icon') && (
          <button
            type="button"
            onClick={() => {
              setDrawerOpen(false);
              onClose?.();
            }}
            className="w-8 h-8 rounded-xl bg-surface-muted text-ink-muted leading-none cursor-pointer"
            aria-label="Close"
          >
            ×
          </button>
        )}
      </div>

      {!signedIn ? (
        <p className="text-[12.5px] text-ink-muted leading-relaxed">Sign in to share your friend code and connect instantly.</p>
      ) : (
        <>
          <div className="rounded-2xl border border-[#22C55E]/30 dark:border-[#3B82F6]/40 bg-emerald-50/70 dark:bg-blue-950/40 p-3.5 space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Your Friend Code</p>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[26px] font-black tracking-[0.18em] text-ink tabular-nums">
                {friendCode ? formatFriendCodeDisplay(friendCode) : '------'}
              </p>
              <motion.button
                type="button"
                whileTap={friendCode ? tapPress : undefined}
                onClick={() => void handleCopyCode()}
                disabled={!friendCode}
                className="px-3 py-2 rounded-xl bg-[#22C55E] dark:bg-[#3B82F6] text-white text-[12px] font-bold cursor-pointer disabled:opacity-50 shrink-0"
              >
                {copied ? 'Copied' : 'Copy Code'}
              </motion.button>
            </div>
          </div>

          <form onSubmit={(event) => void handleConnect(event)} className="space-y-2">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-ink-muted">
              Connect via Code
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="text"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                maxLength={6}
                value={connectCode}
                onChange={(event) => setConnectCode(normalizeFriendCode(event.target.value))}
                placeholder="A3K9Q2"
                className="flex-1 px-3.5 py-2 rounded-xl border border-line bg-surface-muted text-ink text-[14px] font-bold tracking-[0.18em] uppercase outline-none focus:ring-2 focus:ring-[#22C55E]/25 dark:focus:ring-[#3B82F6]/25 focus:border-[#22C55E] dark:focus:border-[#3B82F6]"
              />
              <motion.button
                type="submit"
                whileTap={connecting ? undefined : tapPress}
                disabled={connecting || !isValidFriendCode(normalizeFriendCode(connectCode))}
                className="px-3.5 py-2 rounded-xl bg-[#22C55E] dark:bg-[#3B82F6] text-white text-[12px] font-bold cursor-pointer disabled:opacity-50 shrink-0"
              >
                {connecting ? '…' : 'Connect'}
              </motion.button>
            </div>
          </form>

          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Friends ({accepted.length})</p>
            {accepted.length === 0 ? (
              <p className="text-[12.5px] text-ink-muted leading-relaxed">
                No friends yet. Share your code or enter theirs to connect immediately.
              </p>
            ) : (
              accepted.map((edge) => (
                <div
                  key={edge.id}
                  className="p-2.5 rounded-xl border border-line bg-surface-muted flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <ProfileAvatar
                      value={edge.peerAvatar}
                      alt={`${edge.peerName} avatar`}
                      className="w-9 h-9 rounded-xl"
                    />
                    <p className="text-[13px] font-semibold text-ink truncate">{edge.peerName}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleUnfriend(edge)}
                    className="px-2 py-1 rounded-xl border border-line text-ink text-[11px] font-bold cursor-pointer shrink-0"
                  >
                    Unfriend
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Activity</p>
            {loading && activity.length === 0 && receivedGlows.length === 0 ? (
              <p className="text-[12.5px] text-ink-muted">Loading friend activity…</p>
            ) : (
              <div className="space-y-2">
                {receivedGlows.length > 0 ? (
                  <ul className="space-y-1.5">
                    {receivedGlows.map((glow) => (
                      <li key={glow.id} className="p-2.5 rounded-xl border border-amber-200/80 dark:border-amber-800/70 bg-amber-50/70 dark:bg-amber-950/30 flex items-center gap-2">
                        <ProfileAvatar
                          value={glow.fromAvatar}
                          alt={`${glow.fromName} avatar`}
                          className="w-8 h-8 rounded-xl"
                        />
                        <p className="text-[12.5px] text-ink leading-relaxed">{glow.fromName} sent you an Affirmation Glow</p>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {activity.length === 0 ? (
                  <p className="text-[12.5px] text-ink-muted leading-relaxed">
                    {accepted.length === 0 ? 'Connect to see friend activity here.' : 'Friends have not logged habits yet.'}
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {activity.map((item) => {
                      const glowed = sentGlows.has(item.id);
                      return (
                        <li key={item.id} className="p-2.5 rounded-xl border border-line bg-surface-muted flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2 min-w-0">
                            <ProfileAvatar
                              value={item.friendAvatar}
                              alt={`${item.friendName} avatar`}
                              className="w-8 h-8 rounded-xl"
                            />
                            <div className="min-w-0">
                              <p className="text-[12.5px] text-ink leading-relaxed">{item.text}</p>
                              <p className="text-[10.5px] text-ink-muted mt-0.5">{formatActivityTime(item.timestamp)}</p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleGlow(item)}
                            title={glowed ? 'Take back Affirmation Glow' : 'Send Affirmation Glow'}
                            aria-label={glowed ? 'Take back Affirmation Glow' : 'Send Affirmation Glow'}
                            aria-pressed={glowed}
                            className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 cursor-pointer transition ${
                              glowed
                                ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 ring-1 ring-amber-400/70'
                                : 'bg-surface border border-line text-ink-muted hover:text-amber-700 hover:border-amber-300'
                            }`}
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill={glowed ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M12 21s-6.5-4.35-9.2-8.2C.7 9.9 2.2 6 6.1 6c1.9 0 3.1 1 3.9 2.2C10.8 7 12 6 13.9 6c3.9 0 5.4 3.9 3.3 6.8C18.5 16.65 12 21 12 21z"
                              />
                            </svg>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );

  if (variant === 'drawer') {
    return (
      <section className="bg-surface rounded-2xl border border-line shadow-xs">
        <button
          type="button"
          onClick={() => setDrawerOpen((prev) => !prev)}
          className="w-full p-3.5 px-4 flex items-center justify-between cursor-pointer"
        >
          <span className="text-[14.5px] font-bold text-ink">Friends</span>
          <svg className={`w-4 h-4 text-ink-muted transition-transform ${drawerOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {drawerOpen && <div className="px-4 pb-4">{body}</div>}
        <FloatingToast message={notice} tone={noticeTone} id="friends-toast" />
      </section>
    );
  }

  const friendsModal = (
    <AnimatePresence>
      {modalVisible && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-slate-900/40 backdrop-blur-xs transform-gpu"
          initial={overlayFade.initial}
          animate={overlayFade.animate}
          exit={overlayFade.exit}
          transition={overlayFade.transition}
          style={{
            paddingTop: 'max(1rem, env(safe-area-inset-top))',
            paddingBottom: `max(1rem, calc(1rem + ${keyboardInset}px))`,
          }}
          onClick={() => {
            setDrawerOpen(false);
            onClose?.();
          }}
        >
          <motion.div
            className="w-full max-w-[390px] overflow-y-auto overscroll-y-contain bg-surface rounded-2xl p-4 border border-line shadow-2xl transform-gpu will-change-transform"
            initial={sheetMotion.initial}
            animate={sheetMotion.animate}
            exit={sheetMotion.exit}
            transition={sheetMotion.transition}
            style={{ maxHeight: `min(740px, calc(100dvh - ${keyboardInset + 32}px))` }}
            onClick={(event) => event.stopPropagation()}
          >
            {body}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (variant === 'icon') {
    return (
      <>
        <motion.button
          id="home-friends-btn"
          type="button"
          whileTap={tapPress}
          onClick={() => setDrawerOpen(true)}
          aria-label="Friends"
          title="Friends"
          className="relative w-8 h-8 rounded-xl bg-white dark:bg-slate-900 border border-emerald-300 dark:border-blue-500 text-emerald-800 dark:text-blue-400 shadow-xs hover:bg-emerald-50 dark:hover:bg-blue-950 cursor-pointer flex items-center justify-center"
        >
          <svg className="w-4 h-4 stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.5 20.118a7.5 7.5 0 0115 0A17.93 17.93 0 0112 21.75c-2.68 0-5.21-.584-7.5-1.632z"
            />
          </svg>
        </motion.button>
        {friendsModal}
        <FloatingToast message={notice} tone={noticeTone} id="friends-toast" />
      </>
    );
  }

  if (variant === 'modal') {
    return (
      <>
        {friendsModal}
        <FloatingToast message={notice} tone={noticeTone} id="friends-toast" />
      </>
    );
  }

  return (
    <section className="bg-surface rounded-2xl p-4.5 border border-line shadow-xs space-y-3">
      {body}
      <FloatingToast message={notice} tone={noticeTone} id="friends-toast" />
    </section>
  );
};
