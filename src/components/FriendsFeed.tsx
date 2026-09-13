import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import {
  ensureProfileDirectory,
  fetchFriendActivity,
  fetchFriendships,
  fetchReceivedGlows,
  fetchSentGlowEventIds,
  incomingPending,
  outgoingPending,
  removeFriendship,
  respondToFriendRequest,
  retractAffirmationGlow,
  searchProfiles,
  sendAffirmationGlow,
  sendFriendRequest,
  type FriendActivityItem,
  type FriendEdge,
  type ProfileDirectoryHit,
  type ReceivedAffirmationGlow,
} from '../lib/friends';

export interface FriendsFeedProps {
  userId?: string | null;
  isGuest?: boolean;
  userEmail?: string;
  userName?: string;
  variant?: 'full' | 'drawer' | 'modal' | 'icon';
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
  onClose,
}) => {
  const [edges, setEdges] = useState<FriendEdge[]>([]);
  const [activity, setActivity] = useState<FriendActivityItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'feed' | 'pending'>('feed');
  const [drawerOpen, setDrawerOpen] = useState(variant !== 'drawer' && variant !== 'icon');
  const [addOpen, setAddOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<ProfileDirectoryHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [sentGlows, setSentGlows] = useState<Set<string>>(new Set());
  const [receivedGlows, setReceivedGlows] = useState<ReceivedAffirmationGlow[]>([]);

  const signedIn = Boolean(userId && !isGuest && !String(userId).startsWith('guest_'));
  const incoming = useMemo(() => (userId ? incomingPending(edges, userId) : []), [edges, userId]);
  const outgoing = useMemo(() => (userId ? outgoingPending(edges, userId) : []), [edges, userId]);
  const accepted = useMemo(() => edges.filter((edge) => edge.status === 'accepted'), [edges]);

  const refresh = useCallback(async () => {
    if (!signedIn || !userId) {
      setEdges([]);
      setActivity([]);
      setSentGlows(new Set());
      setReceivedGlows([]);
      return;
    }
    setLoading(true);
    await ensureProfileDirectory(userId, userEmail, userName);
    const nextEdges = await fetchFriendships(userId);
    const [nextActivity, nextSent, nextReceived] = await Promise.all([
      fetchFriendActivity(userId, nextEdges),
      fetchSentGlowEventIds(userId),
      fetchReceivedGlows(userId),
    ]);
    setEdges(nextEdges);
    setActivity(nextActivity);
    setSentGlows(nextSent);
    setReceivedGlows(nextReceived);
    setLoading(false);
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

  useEffect(() => {
    if (!addOpen) return;
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      void searchProfiles(q).then((rows) => {
        if (!cancelled) {
          setHits(rows.filter((row) => row.id !== userId));
          setSearching(false);
        }
      });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, addOpen, userId]);

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 2400);
  };

  const handleRequest = async (friendId: string) => {
    if (!userId) return;
    const result = await sendFriendRequest(userId, friendId);
    flash(result.message);
    if (result.ok) {
      setQuery('');
      setHits([]);
      await refresh();
    }
  };

  const handleRespond = async (edgeId: string, status: 'accepted' | 'declined') => {
    const ok = await respondToFriendRequest(edgeId, status);
    flash(ok ? (status === 'accepted' ? 'Request accepted.' : 'Request declined.') : 'Could not update request.');
    if (ok) await refresh();
  };

  const handleRemove = async (edgeId: string, kind: 'cancel' | 'unfriend') => {
    const ok = await removeFriendship(edgeId);
    flash(
      ok
        ? kind === 'cancel'
          ? 'Request cancelled.'
          : 'Friend removed.'
        : kind === 'cancel'
          ? 'Could not cancel request.'
          : 'Could not remove friend.'
    );
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
    flash(result.message);
    if (result.ok) {
      setSentGlows((prev) => new Set(prev).add(item.id));
    }
  };

  const body = (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-[16px] font-extrabold text-ink tracking-tight">Friends Feed</h2>
          {incoming.length > 0 && (
            <span className="min-w-5 h-5 px-1.5 rounded-full bg-accent text-accent-fg text-[10px] font-black flex items-center justify-center">
              {incoming.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {signedIn && (
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="px-2.5 py-1 rounded-lg bg-accent text-accent-fg text-[11px] font-bold cursor-pointer"
            >
              Add Friend
            </button>
          )}
          {(onClose || variant === 'icon') && (
            <button
              type="button"
              onClick={() => {
                setDrawerOpen(false);
                onClose?.();
              }}
              className="text-ink-muted text-lg leading-none cursor-pointer"
              aria-label="Close"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {!signedIn ? (
        <p className="text-[12.5px] text-ink-muted leading-relaxed">Sign in to follow accepted friends and send requests.</p>
      ) : (
        <>
          <div className="flex rounded-xl bg-surface-muted p-1">
            <button
              type="button"
              onClick={() => setTab('feed')}
              className={`flex-1 py-1.5 text-[12px] font-bold rounded-lg cursor-pointer ${
                tab === 'feed' ? 'bg-surface text-ink shadow-xs' : 'text-ink-muted'
              }`}
            >
              Activity
            </button>
            <button
              type="button"
              onClick={() => setTab('pending')}
              className={`flex-1 py-1.5 text-[12px] font-bold rounded-lg cursor-pointer ${
                tab === 'pending' ? 'bg-surface text-ink shadow-xs' : 'text-ink-muted'
              }`}
            >
              People{incoming.length > 0 ? ` (${incoming.length})` : ''}
            </button>
          </div>

          {notice && <p className="text-[12px] font-semibold text-accent">{notice}</p>}

          {tab === 'pending' ? (
            <div className="space-y-3">
              {incoming.length === 0 && outgoing.length === 0 && accepted.length === 0 ? (
                <p className="text-[12.5px] text-ink-muted">No friends or pending requests.</p>
              ) : null}
              {incoming.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Incoming</p>
                  {incoming.map((edge) => (
                    <div key={edge.id} className="p-2.5 rounded-xl border border-line bg-surface-muted flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-ink truncate">{edge.peerName}</p>
                        <p className="text-[11px] text-ink-muted">Incoming request</p>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => void handleRespond(edge.id, 'accepted')}
                          className="px-2 py-1 rounded-lg bg-accent text-accent-fg text-[11px] font-bold cursor-pointer"
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleRespond(edge.id, 'declined')}
                          className="px-2 py-1 rounded-lg border border-line text-ink text-[11px] font-bold cursor-pointer"
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              {outgoing.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Outgoing</p>
                  {outgoing.map((edge) => (
                    <div key={edge.id} className="p-2.5 rounded-xl border border-line bg-surface flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-ink truncate">{edge.peerName}</p>
                        <p className="text-[11px] text-ink-muted">Awaiting their accept</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleRemove(edge.id, 'cancel')}
                        className="px-2 py-1 rounded-lg border border-line text-ink text-[11px] font-bold cursor-pointer shrink-0"
                      >
                        Cancel
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              {accepted.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Friends</p>
                  {accepted.map((edge) => (
                    <div key={edge.id} className="p-2.5 rounded-xl border border-line bg-surface-muted flex items-center justify-between gap-2">
                      <p className="text-[13px] font-semibold text-ink truncate">{edge.peerName}</p>
                      <button
                        type="button"
                        onClick={() => void handleRemove(edge.id, 'unfriend')}
                        className="px-2 py-1 rounded-lg border border-line text-ink text-[11px] font-bold cursor-pointer shrink-0"
                      >
                        Unfriend
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : loading && activity.length === 0 && receivedGlows.length === 0 ? (
            <p className="text-[12.5px] text-ink-muted">Loading friend activity…</p>
          ) : accepted.length === 0 ? (
            <p className="text-[12.5px] text-ink-muted leading-relaxed">
              No accepted friends yet. Search by username or email to send a request.
            </p>
          ) : (
            <div className="space-y-2">
              {receivedGlows.length > 0 ? (
                <ul className="space-y-1.5">
                  {receivedGlows.map((glow) => (
                    <li key={glow.id} className="p-2.5 rounded-xl border border-amber-200/80 dark:border-amber-800/70 bg-amber-50/70 dark:bg-amber-950/30">
                      <p className="text-[12.5px] text-ink leading-relaxed">
                        {glow.fromName} sent you an Affirmation Glow
                      </p>
                    </li>
                  ))}
                </ul>
              ) : null}
              {activity.length === 0 ? (
                <p className="text-[12.5px] text-ink-muted leading-relaxed">Friends have not logged habits yet.</p>
              ) : (
                <ul className="space-y-1.5">
                  {activity.map((item) => {
                    const glowed = sentGlows.has(item.id);
                    return (
                      <li key={item.id} className="p-2.5 rounded-xl border border-line bg-surface-muted flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[12.5px] text-ink leading-relaxed">{item.text}</p>
                          <p className="text-[10.5px] text-ink-muted mt-0.5">{formatActivityTime(item.timestamp)}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleGlow(item)}
                          title={glowed ? 'Take back Affirmation Glow' : 'Send Affirmation Glow'}
                          aria-label={glowed ? 'Take back Affirmation Glow' : 'Send Affirmation Glow'}
                          aria-pressed={glowed}
                          className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 cursor-pointer transition ${
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
        </>
      )}
    </div>
  );

  const addModal = addOpen ? (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs"
      onClick={(event) => {
        event.stopPropagation();
        setAddOpen(false);
      }}
    >
      <div
        className="w-full max-w-[390px] bg-surface text-ink rounded-3xl p-4 border border-line shadow-2xl space-y-3"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] font-bold">Add Friend</h3>
          <button type="button" onClick={() => setAddOpen(false)} className="text-ink-muted text-lg cursor-pointer" aria-label="Close add friend">
            ×
          </button>
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search username or email"
          className="w-full px-3 py-2 rounded-xl border border-line bg-surface-muted text-ink text-[13px] outline-none"
        />
        {searching ? <p className="text-[12px] text-ink-muted">Searching…</p> : null}
        <div className="max-h-56 overflow-y-auto space-y-1.5">
          {query.trim().length >= 2 && !searching && hits.length === 0 ? (
            <p className="text-[12.5px] text-ink-muted">No matching profiles.</p>
          ) : (
            hits.map((hit) => {
              const relation = edges.find((edge) => edge.peerId === hit.id);
              const label =
                relation?.status === 'accepted' ? 'Friends' : relation?.status === 'pending' ? 'Pending' : 'Request';
              return (
                <div key={hit.id} className="p-2.5 rounded-xl border border-line flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold truncate">{hit.displayName}</p>
                    <p className="text-[11px] text-ink-muted truncate">{hit.username || hit.email}</p>
                  </div>
                  <button
                    type="button"
                    disabled={Boolean(relation)}
                    onClick={() => void handleRequest(hit.id)}
                    className="px-2.5 py-1 rounded-lg bg-accent text-accent-fg text-[11px] font-bold cursor-pointer shrink-0 disabled:opacity-50 disabled:cursor-default"
                  >
                    {label}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  ) : null;

  if (variant === 'drawer') {
    return (
      <section className="bg-surface rounded-2xl border border-line shadow-xs">
        <button
          type="button"
          onClick={() => setDrawerOpen((prev) => !prev)}
          className="w-full p-3.5 px-4 flex items-center justify-between cursor-pointer"
        >
          <span className="text-[14.5px] font-bold text-ink">Friends</span>
          <span className="flex items-center gap-2">
            {incoming.length > 0 && (
              <span className="min-w-5 h-5 px-1.5 rounded-full bg-accent text-accent-fg text-[10px] font-black">
                {incoming.length}
              </span>
            )}
            <svg className={`w-4 h-4 text-ink-muted transition-transform ${drawerOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        </button>
        {drawerOpen && <div className="px-4 pb-4">{body}</div>}
        {addModal}
      </section>
    );
  }

  const friendsModal = (
    <AnimatePresence>
      {(variant === 'modal' || (variant === 'icon' && drawerOpen)) && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          onClick={() => {
            setDrawerOpen(false);
            onClose?.();
          }}
        >
          <motion.div
            className="w-full max-w-[390px] max-h-[85vh] overflow-y-auto bg-surface rounded-2xl p-4 border border-line shadow-2xl"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
            onClick={(event) => event.stopPropagation()}
          >
            {body}
          </motion.div>
          {addModal}
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (variant === 'icon') {
    return (
      <>
        <button
          id="home-friends-btn"
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Friends"
          title="Friends"
          className="relative w-8 h-8 rounded-xl bg-white dark:bg-slate-900 border border-emerald-300 dark:border-blue-500 text-emerald-800 dark:text-blue-400 shadow-xs hover:bg-emerald-50 dark:hover:bg-blue-950 active:scale-95 transition cursor-pointer flex items-center justify-center"
        >
          <svg className="w-4 h-4 stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.5 20.118a7.5 7.5 0 0115 0A17.93 17.93 0 0112 21.75c-2.68 0-5.21-.584-7.5-1.632z"
            />
          </svg>
          {incoming.length > 0 && (
            <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-md bg-accent text-accent-fg text-[9px] font-black flex items-center justify-center">
              {incoming.length}
            </span>
          )}
        </button>
        {friendsModal}
      </>
    );
  }

  if (variant === 'modal') {
    return (
      <>
        {friendsModal}
      </>
    );
  }

  return (
    <section className="bg-surface rounded-2xl p-4.5 border border-line shadow-xs space-y-3">
      {body}
      {addModal}
    </section>
  );
};
