/**
 * Friend request / roster workflows.
 * Thin service layer over lib/friends + social graph RPCs.
 */
export {
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
} from '../lib/friends';

export type {
  FriendEdge,
  FriendIdentityLedger,
} from '../lib/friends';
