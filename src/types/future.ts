/**
 * Future Extension Points for WayReel (Not implemented yet per scope):
 *
 * 1. Day-by-day itinerary planning:
 *    - Extend TripRecord with `startDate`, `endDate`, and a `days` subcollection
 *      at `/users/{userId}/trips/{tripId}/days/{dayIndex}`.
 *    - Plug a DayScheduleView into the Saved / Map tabs using TripDaySlot[].
 *
 * 2. Offline mode:
 *    - Enable Firestore persistent local cache in `src/firebase.ts` using
 *      `initializeFirestore(app, { localCache: persistentLocalCache() })`.
 *    - Register a service worker for tile/shell caching and queue offline mutations.
 *
 * 3. Account sharing:
 *    - Add `collaborators` subcollection under `/users/{ownerId}/trips/{tripId}/members/{memberUid}`
 *      and update `firestore.rules` Master Gate to check membership.
 */

export interface TripDaySlotFuture {
  dayIndex: number;
  dateIso?: string;
  placeIds: string[];
}

export interface OfflineSyncStateFuture {
  isOffline: boolean;
  pendingWritesCount: number;
  lastSyncedAt: Date | null;
}

export interface TripShareMemberFuture {
  uid: string;
  role: 'viewer' | 'editor';
  addedAt: Date;
}
