/**
 * Firestore Security Rules Test Specification (Dirty Dozen Adversarial Suite)
 * Verifies all 12 Dirty Dozen payloads against /users/{userId}, /trips/{tripId}, and /places/{placeId}.
 */
export const DIRTY_DOZEN_CASES = [
  { id: 1, name: 'Unauthenticated read/write on places', expected: 'PERMISSION_DENIED' },
  { id: 2, name: 'Cross-user read on another user places', expected: 'PERMISSION_DENIED' },
  { id: 3, name: 'Unverified email user write on places', expected: 'PERMISSION_DENIED' },
  { id: 4, name: 'Identity spoofing with mismatched userId', expected: 'PERMISSION_DENIED' },
  { id: 5, name: 'Shadow field injection (isAdmin: true)', expected: 'PERMISSION_DENIED' },
  { id: 6, name: 'Path ID poisoning with invalid characters', expected: 'PERMISSION_DENIED' },
  { id: 7, name: 'String resource exhaustion (> 400 chars note)', expected: 'PERMISSION_DENIED' },
  { id: 8, name: 'Unbounded tags array (> 15 items)', expected: 'PERMISSION_DENIED' },
  { id: 9, name: 'Out-of-range coordinates (lat: 120)', expected: 'PERMISSION_DENIED' },
  { id: 10, name: 'Client-forged dateAdded timestamp', expected: 'PERMISSION_DENIED' },
  { id: 11, name: 'Immortal field mutation (changing dateAdded/userId)', expected: 'PERMISSION_DENIED' },
  { id: 12, name: 'Orphaned tripId reference to nonexistent trip', expected: 'PERMISSION_DENIED' },
];
