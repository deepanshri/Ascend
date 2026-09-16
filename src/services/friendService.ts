/**
 * Friend request / roster workflows.
 * Thin service layer over lib/friends + social graph RPCs.
 */
export {
  FRIENDSHIPS_TABLE,
  acceptedFriendIds,
  connectByFriendCode,
  displayNameFromProfile,
  ensureFriendCode,
  ensureProfileDirectory,
  fetchFriendActivity,
  fetchFriendIdentityLedger,
  fetchFriendTodayCompletionCounts,
  fetchFriendships,
  fetchOwnFriendCode,
  fetchReceivedGlows,
  fetchSentGlowEventIds,
  identityStageFromVotes,
  incomingPending,
  loadFriendsFeed,
  outgoingPending,
  removeFriendship,
  respondToFriendRequest,
  searchProfiles,
  sendAffirmationGlow,
  sendFriendRequest,
  retractAffirmationGlow,
} from '../lib/friends';

export type {
  FriendActivityItem,
  FriendEdge,
  FriendFeedItem,
  FriendIdentityLedger,
  FriendStatus,
  ProfileDirectoryHit,
  ReceivedAffirmationGlow,
} from '../lib/friends';
