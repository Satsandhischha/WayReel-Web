export type ExtractionSource =
  | 'caption'
  | 'hashtags'
  | 'audio'
  | 'on-screen text'
  | 'manual';

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface ExtractedPlaceCandidate {
  id: string;
  name: string;
  city: string;
  country: string;
  category: string;
  note: string;
  tags: string[];
  confidence: number;
  source: ExtractionSource;
  coordinates: Coordinates | null;
  coordinatesApproximate: boolean;
  sourceLink: string;
  confirmed: boolean;
  mergedCount?: number;
}

export interface PlaceRecord {
  id: string;
  userId: string;
  name: string;
  city: string;
  country: string;
  coordinates: Coordinates | null;
  coordinatesApproximate: boolean;
  category: string;
  note: string;
  tags: string[];
  visited: boolean;
  tripId: string;
  tripName: string;
  sourceLink: string;
  sourceLinks: string[];
  extractionSource: ExtractionSource;
  confidence: number;
  dateAdded: Date | null;
  updatedAt: Date | null;
}

export interface TripRecord {
  id: string;
  userId: string;
  name: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export type AppTab = 'add' | 'review' | 'map' | 'saved';

export const PLACE_CATEGORIES = [
  'Restaurant',
  'Cafe',
  'Bar',
  'Landmark',
  'Museum',
  'Beach',
  'Park',
  'Hotel',
  'Shop',
  'Neighborhood',
  'Viewpoint',
  'Other',
] as const;

export const MAX_FIELD_LIMITS = {
  NAME: 120,
  CITY: 100,
  COUNTRY: 100,
  CATEGORY: 60,
  NOTE: 400,
  TAG: 40,
  MAX_TAGS: 15,
  TRIP_NAME: 100,
  SOURCE_LINK: 500,
  MAX_SOURCE_LINKS: 20,
} as const;
