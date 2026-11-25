import { User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  deleteDoc,
  where,
  writeBatch,
  Unsubscribe,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import {
  Coordinates,
  ExtractedPlaceCandidate,
  ExtractionSource,
  MAX_FIELD_LIMITS,
  PlaceRecord,
  TripRecord,
} from '../types/wayreel';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

function sanitizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }
    return parsed.toString().slice(0, MAX_FIELD_LIMITS.SOURCE_LINK);
  } catch {
    return '';
  }
}

function sanitizeTags(tags: string[]): string[] {
  const clean = tags
    .map((t) => t.trim().toLowerCase().slice(0, MAX_FIELD_LIMITS.TAG))
    .filter(Boolean);
  return Array.from(new Set(clean)).slice(0, MAX_FIELD_LIMITS.MAX_TAGS);
}

function sanitizeSource(src: string): ExtractionSource {
  if (
    src === 'caption' ||
    src === 'hashtags' ||
    src === 'audio' ||
    src === 'on-screen text' ||
    src === 'manual'
  ) {
    return src;
  }
  return 'caption';
}

function sanitizeCoordinates(coords: Coordinates | null): Coordinates | null {
  if (!coords) return null;
  if (
    typeof coords.lat !== 'number' ||
    typeof coords.lng !== 'number' ||
    !Number.isFinite(coords.lat) ||
    !Number.isFinite(coords.lng) ||
    coords.lat < -90 ||
    coords.lat > 90 ||
    coords.lng < -180 ||
    coords.lng > 180
  ) {
    return null;
  }
  return {
    lat: Number(coords.lat.toFixed(6)),
    lng: Number(coords.lng.toFixed(6)),
  };
}

function toDateOrNull(value: unknown): Date | null {
  if (value instanceof Timestamp) {
    return value.toDate();
  }
  if (value instanceof Date) {
    return value;
  }
  return null;
}

export async function ensureUserProfile(user: User): Promise<void> {
  const userPath = `users/${user.uid}`;
  const userRef = doc(db, 'users', user.uid);
  try {
    const snap = await getDoc(userRef);
    const email = (user.email ?? '').slice(0, 254);
    const displayName = (user.displayName ?? 'Traveler').slice(0, 120);

    if (!snap.exists()) {
      await setDoc(userRef, {
        userId: user.uid,
        email,
        displayName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(userRef, {
        email,
        displayName,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }
}

export function subscribePlaces(
  uid: string,
  onData: (places: PlaceRecord[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const placesPath = `users/${uid}/places`;
  const q = query(collection(db, 'users', uid, 'places'), where('userId', '==', uid), limit(500));

  return onSnapshot(
    q,
    (snapshot) => {
      const items: PlaceRecord[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        const coords =
          d.coordinates &&
          typeof d.coordinates.lat === 'number' &&
          typeof d.coordinates.lng === 'number'
            ? { lat: d.coordinates.lat, lng: d.coordinates.lng }
            : null;

        return {
          id: docSnap.id,
          userId: String(d.userId ?? uid),
          name: String(d.name ?? ''),
          city: String(d.city ?? ''),
          country: String(d.country ?? ''),
          coordinates: coords,
          coordinatesApproximate: Boolean(d.coordinatesApproximate),
          category: String(d.category ?? 'Other'),
          note: String(d.note ?? ''),
          tags: Array.isArray(d.tags) ? d.tags.map(String) : [],
          visited: Boolean(d.visited),
          tripId: String(d.tripId ?? ''),
          tripName: String(d.tripName ?? ''),
          sourceLink: String(d.sourceLink ?? ''),
          sourceLinks: Array.isArray(d.sourceLinks) ? d.sourceLinks.map(String) : [],
          extractionSource: sanitizeSource(String(d.extractionSource ?? 'caption')),
          confidence: typeof d.confidence === 'number' ? d.confidence : 0.7,
          dateAdded: toDateOrNull(d.dateAdded),
          updatedAt: toDateOrNull(d.updatedAt),
        };
      });

      items.sort((a, b) => {
        const ta = a.dateAdded?.getTime() ?? 0;
        const tb = b.dateAdded?.getTime() ?? 0;
        return tb - ta;
      });

      onData(items);
    },
    (error) => {
      if (onError) {
        onError(error);
      }
      handleFirestoreError(error, OperationType.LIST, placesPath);
    }
  );
}

export function subscribeTrips(
  uid: string,
  onData: (trips: TripRecord[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const tripsPath = `users/${uid}/trips`;
  const q = query(collection(db, 'users', uid, 'trips'), where('userId', '==', uid), limit(100));

  return onSnapshot(
    q,
    (snapshot) => {
      const items: TripRecord[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          userId: String(d.userId ?? uid),
          name: String(d.name ?? ''),
          createdAt: toDateOrNull(d.createdAt),
          updatedAt: toDateOrNull(d.updatedAt),
        };
      });

      items.sort((a, b) => {
        const ta = a.createdAt?.getTime() ?? 0;
        const tb = b.createdAt?.getTime() ?? 0;
        return tb - ta;
      });

      onData(items);
    },
    (error) => {
      if (onError) {
        onError(error);
      }
      handleFirestoreError(error, OperationType.LIST, tripsPath);
    }
  );
}

export async function createTrip(uid: string, rawName: string): Promise<TripRecord> {
  const name = rawName.trim().slice(0, MAX_FIELD_LIMITS.TRIP_NAME);
  if (!name) {
    throw new Error('Enter a trip name.');
  }
  const tripRef = doc(collection(db, 'users', uid, 'trips'));
  const tripPath = `users/${uid}/trips/${tripRef.id}`;
  try {
    await setDoc(tripRef, {
      userId: uid,
      name,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return {
      id: tripRef.id,
      userId: uid,
      name,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, tripPath);
  }
}

export async function deleteTrip(
  uid: string,
  tripId: string,
  placesInTrip: PlaceRecord[]
): Promise<void> {
  const tripPath = `users/${uid}/trips/${tripId}`;
  try {
    const batch = writeBatch(db);
    for (const place of placesInTrip) {
      if (place.tripId === tripId) {
        const placeRef = doc(db, 'users', uid, 'places', place.id);
        batch.update(placeRef, {
          tripId: '',
          tripName: '',
          updatedAt: serverTimestamp(),
        });
      }
    }
    batch.delete(doc(db, 'users', uid, 'trips', tripId));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, tripPath);
  }
}

export async function saveConfirmedPlaces(
  uid: string,
  candidates: ExtractedPlaceCandidate[],
  existingPlaces: PlaceRecord[],
  trip: { id: string; name: string } | null
): Promise<{ createdCount: number; mergedCount: number }> {
  const placesPath = `users/${uid}/places`;
  let createdCount = 0;
  let mergedCount = 0;

  // Index existing places by normalized name + city for duplicate merging
  const existingByKey = new Map<string, PlaceRecord>();
  for (const p of existingPlaces) {
    const key = `${p.name.toLowerCase().trim()}::${p.city.toLowerCase().trim()}`;
    existingByKey.set(key, p);
  }

  try {
    const batch = writeBatch(db);

    for (const c of candidates) {
      const cleanName = c.name.trim().slice(0, MAX_FIELD_LIMITS.NAME);
      if (!cleanName) continue;
      const cleanCity = c.city.trim().slice(0, MAX_FIELD_LIMITS.CITY);
      const cleanCountry = c.country.trim().slice(0, MAX_FIELD_LIMITS.COUNTRY);
      const cleanCategory = (c.category.trim() || 'Other').slice(0, MAX_FIELD_LIMITS.CATEGORY);
      const cleanNote = c.note.trim().slice(0, MAX_FIELD_LIMITS.NOTE);
      const cleanTags = sanitizeTags(c.tags);
      const cleanLink = sanitizeUrl(c.sourceLink);
      const cleanCoords = sanitizeCoordinates(c.coordinates);
      const key = `${cleanName.toLowerCase()}::${cleanCity.toLowerCase()}`;

      const match = existingByKey.get(key);

      if (match) {
        const mergedLinks = Array.from(
          new Set([...match.sourceLinks, ...(cleanLink ? [cleanLink] : [])].filter(Boolean))
        ).slice(0, MAX_FIELD_LIMITS.MAX_SOURCE_LINKS);

        const mergedTags = Array.from(new Set([...match.tags, ...cleanTags])).slice(
          0,
          MAX_FIELD_LIMITS.MAX_TAGS
        );

        const nextCoords = match.coordinates ?? cleanCoords;
        const nextApprox = match.coordinates ? match.coordinatesApproximate : c.coordinatesApproximate;
        const nextNote = match.note || cleanNote;
        const nextTripId = trip?.id ? trip.id : match.tripId;
        const nextTripName = trip?.id ? trip.name.slice(0, MAX_FIELD_LIMITS.TRIP_NAME) : match.tripName;

        const docRef = doc(db, 'users', uid, 'places', match.id);
        batch.update(docRef, {
          name: cleanName,
          city: cleanCity || match.city,
          country: cleanCountry || match.country,
          coordinates: nextCoords,
          coordinatesApproximate: nextApprox,
          category: match.category || cleanCategory,
          note: nextNote,
          tags: mergedTags,
          sourceLink: match.sourceLink || cleanLink,
          sourceLinks: mergedLinks,
          tripId: nextTripId,
          tripName: nextTripName,
          visited: match.visited,
          updatedAt: serverTimestamp(),
        });
        mergedCount += 1;
      } else {
        const newRef = doc(collection(db, 'users', uid, 'places'));
        const sourceLinks = cleanLink ? [cleanLink] : [];
        batch.set(newRef, {
          userId: uid,
          name: cleanName,
          city: cleanCity,
          country: cleanCountry,
          coordinates: cleanCoords,
          coordinatesApproximate: cleanCoords ? Boolean(c.coordinatesApproximate) : true,
          category: cleanCategory,
          note: cleanNote,
          tags: cleanTags,
          visited: false,
          tripId: trip?.id ?? '',
          tripName: trip?.name ? trip.name.slice(0, MAX_FIELD_LIMITS.TRIP_NAME) : '',
          sourceLink: cleanLink,
          sourceLinks,
          extractionSource: sanitizeSource(c.source),
          confidence: Math.max(0, Math.min(1, Number(c.confidence) || 0.7)),
          dateAdded: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        createdCount += 1;
      }
    }

    await batch.commit();
    return { createdCount, mergedCount };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, placesPath);
  }
}

export async function togglePlaceVisited(
  uid: string,
  placeId: string,
  visited: boolean
): Promise<void> {
  const path = `users/${uid}/places/${placeId}`;
  try {
    await updateDoc(doc(db, 'users', uid, 'places', placeId), {
      visited,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function assignPlaceTrip(
  uid: string,
  placeId: string,
  tripId: string,
  tripName: string
): Promise<void> {
  const path = `users/${uid}/places/${placeId}`;
  try {
    await updateDoc(doc(db, 'users', uid, 'places', placeId), {
      tripId,
      tripName: tripId ? tripName.slice(0, MAX_FIELD_LIMITS.TRIP_NAME) : '',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deletePlace(uid: string, placeId: string): Promise<void> {
  const path = `users/${uid}/places/${placeId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'places', placeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function deleteAllUserData(uid: string): Promise<void> {
  const basePath = `users/${uid}`;
  try {
    const placesSnap = await getDocs(
      query(collection(db, 'users', uid, 'places'), where('userId', '==', uid))
    );
    const tripsSnap = await getDocs(
      query(collection(db, 'users', uid, 'trips'), where('userId', '==', uid))
    );

    const allRefs = [...placesSnap.docs.map((d) => d.ref), ...tripsSnap.docs.map((d) => d.ref)];

    const CHUNK = 400;
    for (let i = 0; i < allRefs.length; i += CHUNK) {
      const batch = writeBatch(db);
      for (const ref of allRefs.slice(i, i + CHUNK)) {
        batch.delete(ref);
      }
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, basePath);
  }
}
