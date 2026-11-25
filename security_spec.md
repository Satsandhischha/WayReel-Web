# WayReel Firestore Security Specification

## 1. Data Invariants
1. **Strict Ownership**: Every document under `/users/{userId}`, `/users/{userId}/trips/{tripId}`, and `/users/{userId}/places/{placeId}` belongs strictly to `userId`. Only an authenticated user with `request.auth.uid == userId` and `request.auth.token.email_verified == true` may read or write them.
2. **Identity Integrity**: `userId` inside any document must equal `request.auth.uid` on create and remain immutable on update.
3. **Path Variable Hardening**: All path parameters (`userId`, `tripId`, `placeId`) must match `^[a-zA-Z0-9_\-]+$` and be at most 128 characters.
4. **No Shadow Fields**: Both `create` and `update` must enforce exact allowed key sets via `keys().hasAll(...)` / `keys().hasOnly(...)` and `affectedKeys().hasOnly(...)`.
5. **Bounded Types & Strings**: All strings enforce `.size()` upper bounds, `tags` is bounded to `<= 15`, `sourceLinks` is bounded to `<= 20`, `confidence` is `0.0..1.0`, and `coordinates` (if non-null) validates `lat` (`-90..90`) and `lng` (`-180..180`).
6. **Temporal Integrity**: `createdAt`, `dateAdded`, and `updatedAt` must strictly equal `request.time` on create/update and creation timestamps must remain immutable.
7. **Referential Integrity**: When a `Place` references a non-empty `tripId`, that `Trip` document must exist under `/users/{userId}/trips/{tripId}`.

## 2. The "Dirty Dozen" Attack Payloads (All Must Fail with PERMISSION_DENIED)
1. **Unauthenticated read/write**: `auth = null` attempting `get` or `create` on `/users/u1/places/p1`.
2. **Cross-user read**: `auth.uid = "u2"` attempting `get` or `list` on `/users/u1/places`.
3. **Unverified email write**: `auth = { uid: "u1", token: { email_verified: false } }` attempting `create` on `/users/u1/places/p1`.
4. **Identity spoofing**: `auth.uid = "u1"` creating `/users/u1/places/p1` with `userId: "u2"`.
5. **Shadow / ghost field injection**: `auth.uid = "u1"` creating `/users/u1/places/p1` with an extra `isAdmin: true` field.
6. **ID poisoning**: `auth.uid = "u1"` creating `/users/u1/places/bad$id..!` with invalid characters or length > 128.
7. **String resource exhaustion**: `auth.uid = "u1"` creating a place with `note` of 2,000 characters (> 400).
8. **Unbounded array injection**: `auth.uid = "u1"` creating a place with 25 `tags` (> 15).
9. **Out-of-range coordinates**: `auth.uid = "u1"` creating a place with `coordinates: { lat: 120, lng: 0 }`.
10. **Timestamp forgery**: `auth.uid = "u1"` creating a place with a past `dateAdded` timestamp instead of `request.time`.
11. **Immortal field mutation**: `auth.uid = "u1"` updating `/users/u1/places/p1` to alter `dateAdded` or `userId`.
12. **Orphaned trip reference**: `auth.uid = "u1"` creating a place with `tripId: "nonexistent-trip"` when that trip document does not exist.
