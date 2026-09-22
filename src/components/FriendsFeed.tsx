import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { UserPlus } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import {
  FRIENDSHIPS_TABLE,
  connectByFriendCode,
  ensureProfileDirectory,
  fetchFriendIdentityLedger,
  fetchFriendships,
  fetchOwnFriendCode,
  incomingPending,
  outgoingPending,
  removeFriendship,
  respondToFriendRequest,
  type FriendEdge,
  type FriendIdentityLedger,
} from '../services/friendService';
import { formatFriendCodeDisplay, isValidFriendCode, normalizeFriendCode } from '../utils/friendCode';
import { useKeyboardInset } from '../hooks/useKeyboardInset';
import { overlayFade, sheetMotion, tapPress } from '../lib/motionPresets';
import { HEADER_ICON_BTN_CLASS } from './ScreenHeader';
import { ProfileAvatar } from './ProfileAvatar';

export interface FriendsFeedProps {
  userId?: string | null;
  isGuest?: boolean;
  userEmail?: string;
  userName?: string;
  variant?: 'full' | 'drawer' | 'modal' | 'icon';
  /**
   * invite — Home/Personal: share code + send request + accept/decline (no roster details)
   * roster — Reports: accepted friends only; tap opens identity ledger
   */
  mode?: 'invite' | 'roster';
  isOpen?: boolean;
  onClose?: () => void;
  cycleDays?: number;
}

export const FriendsFeed: React.FC<FriendsFeedProps> = ({
  userId = null,
  isGuest = false,
  userEmail = '',
  userName = '',
  variant = 'full',
  mode = variant === 'full' ? 'roster' : 'invite',
  isOpen,
  onClose,
  cycleDays = 7,
}) => {
  const [edges, setEdges] = useState<FriendEdge[]>([]);
  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(variant !== 'drawer' && variant !== 'icon');
  const [friendCode, setFriendCode] = useState('');
  const [connectCode, setConnectCode] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [ledger, setLedger] = useState<FriendIdentityLedger | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const copiedTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const instanceIdRef = useRef(Math.random().toString(36).slice(2, 9));
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (copiedTimerRef.current != null) window.clearTimeout(copiedTimerRef.current);
    };
  }, []);

  const modalVisible = variant === 'modal' ? Boolean(isOpen ?? true) : variant === 'icon' && drawerOpen;
  const keyboardInset = useKeyboardInset(modalVisible || Boolean(ledger));
  const signedIn = Boolean(userId && !isGuest && !String(userId).startsWith('guest_'));
  const accepted = useMemo(
    () => (Array.isArray(edges) ? edges : []).filter((edge) => edge.status === 'accepted'),
    [edges]
  );
  const incoming = useMemo(
    () => (signedIn && userId ? incomingPending(edges, userId) : []),
    [edges, signedIn, userId]
  );
  const outgoing = useMemo(
    () => (signedIn && userId ? outgoingPending(edges, userId) : []),
    [edges, signedIn, userId]
  );
  const refresh = useCallback(async () => {
    if (!signedIn || !userId) {
      if (!mountedRef.current) return;
      setEdges([]);
      setFriendCode('');
      return;
    }
    if (mountedRef.current) setLoading(true);
    try {
      const code = await ensureProfileDirectory(userId, userEmail, userName);
      const nextCode = code || (await fetchOwnFriendCode(userId));
      const nextEdges = (await fetchFriendships(userId)) ?? [];
      if (!mountedRef.current) return;
      setFriendCode(nextCode);
      setEdges(Array.isArray(nextEdges) ? nextEdges : []);
    } catch {
      if (!mountedRef.current) return;
      setEdges([]);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [signedIn, userId, userEmail, userName]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!signedIn || !userId || !supabase || !isSupabaseConfigured) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      const channelName = `friends-feed-${userId}-${mode}-${instanceIdRef.current}`;
      channel = supabase
        .channel(channelName)
        .on('postgres_changes', { event: '*', schema: 'public', table: FRIENDSHIPS_TABLE }, () => {
          void refresh();
        })
        .subscribe();
    } catch (err) {
      console.warn('[FriendsFeed] Realtime channel setup failed:', err);
    }
    return () => {
      if (channel && supabase) {
        try {
          void supabase.removeChannel(channel);
        } catch {
          /* ignore */
        }
      }
    };
  }, [signedIn, userId, mode, refresh]);

  const handleCopyCode = async () => {
    if (!friendCode) return;
    try {
      await navigator.clipboard.writeText(friendCode);
      setCopied(true);
      if (copiedTimerRef.current != null) window.clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = window.setTimeout(() => {
        if (mountedRef.current) setCopied(false);
      }, 1600);
    } catch {
      /* clipboard unavailable */
    }
  };

  const handleConnect = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!userId || connecting) return;
    const code = normalizeFriendCode(connectCode);
    if (!isValidFriendCode(code) || code === friendCode) return;
    setConnecting(true);
    const result = await connectByFriendCode(userId, code);
    if (mountedRef.current) {
      setConnecting(false);
      if (result.ok) {
        setConnectCode('');
        await refresh();
      }
    }
  };

  const handleRespond = async (edgeId: string, status: 'accepted' | 'declined') => {
    setRespondingId(edgeId);
    const ok = await respondToFriendRequest(edgeId, status);
    setRespondingId(null);
    if (ok) await refresh();
  };

  const handleUnfriend = async (edge: FriendEdge) => {
    if (!userId) return;
    const ok = await removeFriendship(edge.id, { userId, peerId: edge.peerId });
    if (ok) {
      if (ledger?.friendId === edge.peerId) setLedger(null);
      await refresh();
    }
  };

  const openFriendLedger = async (edge: FriendEdge) => {
    if (!userId || edge.status !== 'accepted') return;
    setLedgerLoading(true);
    setLedger({
      friendId: edge.peerId,
      displayName: edge.peerName,
      avatarUrl: edge.peerAvatar,
      identityStatement: 'Loading…',
      completionRatio: 0,
      cycleDays,
    });
    const snapshot = await fetchFriendIdentityLedger(userId, edge.peerId, cycleDays);
    if (!mountedRef.current) return;
    setLedgerLoading(false);
    if (snapshot) setLedger(snapshot);
    else setLedger(null);
  };

  const inviteBody = (
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
          Add Friend
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
            {connecting ? '…' : 'Invite'}
          </motion.button>
        </div>
        <p className="text-[11px] text-ink-muted leading-relaxed">
          They must Accept before you appear in each other&apos;s Reports.
        </p>
      </form>

      {incoming.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
            Incoming Requests ({incoming.length})
          </p>
          {incoming.map((edge) => (
            <div
              key={edge.id}
              className="p-2.5 rounded-xl border border-amber-200/80 dark:border-amber-800/60 bg-amber-50/70 dark:bg-amber-950/30 flex items-center justify-between gap-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <ProfileAvatar
                  value={edge.peerAvatar}
                  alt={`${edge.peerName} avatar`}
                  className="w-10 h-10 rounded-xl"
                />
                <p className="text-[13px] font-semibold text-ink truncate">{edge.peerName}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  disabled={respondingId === edge.id}
                  onClick={() => void handleRespond(edge.id, 'accepted')}
                  className="px-2.5 py-1 rounded-lg bg-[#22C55E] dark:bg-[#3B82F6] text-white text-[11px] font-bold cursor-pointer disabled:opacity-50"
                >
                  Accept
                </button>
                <button
                  type="button"
                  disabled={respondingId === edge.id}
                  onClick={() => void handleRespond(edge.id, 'declined')}
                  className="px-2.5 py-1 rounded-lg border border-line text-ink text-[11px] font-bold cursor-pointer disabled:opacity-50"
                >
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {outgoing.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
            Pending Invites ({outgoing.length})
          </p>
          {outgoing.map((edge) => (
            <p key={edge.id} className="text-[12.5px] text-ink-muted px-1">
              Waiting on <span className="font-semibold text-ink">{edge.peerName}</span> to accept
            </p>
          ))}
        </div>
      ) : null}
    </>
  );

  const rosterBody = (
    <div className="space-y-2">
      <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
        Connected Friends ({accepted.length})
      </p>
      {loading && accepted.length === 0 ? (
        <p className="text-[12.5px] text-ink-muted">Loading friends…</p>
      ) : accepted.length === 0 ? (
        <p className="text-[12.5px] text-ink-muted leading-relaxed">
          No accepted friends yet. Send an invite from Home or Personal — they must Accept first.
        </p>
      ) : (
        accepted.map((edge) => (
          <button
            key={edge.id}
            type="button"
            onClick={() => void openFriendLedger(edge)}
            className="w-full p-2.5 rounded-xl border border-line bg-surface-muted flex items-center justify-between gap-2 cursor-pointer text-left hover:border-emerald-300/70 dark:hover:border-blue-700/70 transition"
          >
            <div className="flex items-center gap-2 min-w-0">
              <ProfileAvatar
                value={edge.peerAvatar}
                alt={`${edge.peerName} avatar`}
                className="w-12 h-12 rounded-xl"
              />
              <p className="text-[13px] font-semibold text-ink truncate">{edge.peerName}</p>
            </div>
            <span className="text-[11px] font-bold text-emerald-700 dark:text-blue-400 shrink-0">
              Ledger →
            </span>
          </button>
        ))
      )}
    </div>
  );

  const body = (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[16px] font-extrabold text-ink tracking-tight">
          {mode === 'roster' ? 'Friend Reports' : 'Add Friends'}
        </h2>
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
        <p className="text-[12.5px] text-ink-muted leading-relaxed">
          Sign in to {mode === 'roster' ? 'view friend reports.' : 'share your friend code and send invites.'}
        </p>
      ) : mode === 'invite' ? (
        inviteBody
      ) : (
        rosterBody
      )}
    </div>
  );

  const ledgerModal = (
    <AnimatePresence>
      {ledger && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center px-4 bg-slate-900/45 backdrop-blur-xs transform-gpu"
          initial={overlayFade.initial}
          animate={overlayFade.animate}
          exit={overlayFade.exit}
          transition={overlayFade.transition}
          style={{
            paddingTop: 'max(1rem, env(safe-area-inset-top))',
            paddingBottom: `max(1rem, calc(1rem + ${keyboardInset}px))`,
          }}
          onClick={() => setLedger(null)}
        >
          <motion.div
            className="w-full max-w-[390px] bg-surface rounded-2xl p-4 border border-line shadow-2xl space-y-3 transform-gpu"
            initial={sheetMotion.initial}
            animate={sheetMotion.animate}
            exit={sheetMotion.exit}
            transition={sheetMotion.transition}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <ProfileAvatar
                  value={ledger.avatarUrl}
                  alt={`${ledger.displayName} avatar`}
                  className="w-12 h-12 rounded-xl"
                />
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                    Identity Ledger
                  </p>
                  <h3 className="text-[16px] font-extrabold text-ink truncate">{ledger.displayName}</h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLedger(null)}
                className="w-8 h-8 rounded-xl bg-surface-muted text-ink-muted leading-none cursor-pointer shrink-0"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <blockquote className="rounded-xl border border-line bg-surface-muted px-3.5 py-3 text-[13px] text-ink leading-relaxed">
              {ledgerLoading ? 'Loading…' : `"${ledger.identityStatement}"`}
            </blockquote>
            <p className="inline-flex items-center rounded-full border border-accent dark:border-blue-500 bg-accent dark:bg-blue-600 px-3 py-1.5 text-[12px] font-bold text-accent-fg dark:text-white tabular-nums">
              {ledgerLoading
                ? '…'
                : `${ledger.completionRatio}% completion · ${ledger.cycleDays}d`}
            </p>
            <button
              type="button"
              onClick={() => {
                const edge = accepted.find((item) => item.peerId === ledger.friendId);
                if (edge) void handleUnfriend(edge);
              }}
              className="w-full py-2 rounded-xl border border-line text-[12px] font-bold text-ink-muted cursor-pointer"
            >
              Unfriend
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (variant === 'drawer') {
    return (
      <section className="bg-surface rounded-2xl border border-line shadow-xs">
        <button
          type="button"
          onClick={() => setDrawerOpen((prev) => !prev)}
          className="w-full p-3.5 px-4 flex items-center justify-between cursor-pointer"
        >
          <span className="text-[14.5px] font-bold text-ink">
            {mode === 'roster' ? 'Friend Reports' : 'Friends'}
          </span>
          <svg
            className={`w-4 h-4 text-ink-muted transition-transform ${drawerOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {drawerOpen && <div className="px-4 pb-4">{body}</div>}
        {ledgerModal}
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
      <span className="relative inline-flex shrink-0">
        <motion.button
          id="home-friends-btn"
          type="button"
          whileTap={tapPress}
          onClick={() => setDrawerOpen(true)}
          aria-label="Add Friends"
          title="Add Friends"
          className={HEADER_ICON_BTN_CLASS}
        >
          <UserPlus className="w-5 h-5" strokeWidth={2.2} />
        </motion.button>
        {friendsModal}
        {ledgerModal}
      </span>
    );
  }

  if (variant === 'modal') {
    return (
      <>
        {friendsModal}
        {ledgerModal}
      </>
    );
  }

  return (
    <section className="bg-surface rounded-2xl p-4.5 border border-line shadow-xs space-y-3">
      {body}
      {ledgerModal}
    </section>
  );
};
