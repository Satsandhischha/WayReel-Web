import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import {
  CheckCircle2,
  Circle,
  ExternalLink,
  MapPin,
  X,
} from 'lucide-react';
import { PlaceRecord, TripRecord } from '../types/wayreel';

interface MapScreenProps {
  places: PlaceRecord[];
  trips: TripRecord[];
  pendingReviewCount: number;
  initialSelectedPlaceId?: string | null;
  onToggleVisited: (placeId: string, visited: boolean) => Promise<void>;
  onAssignTrip: (placeId: string, tripId: string, tripName: string) => Promise<void>;
  onGoToAdd: () => void;
  onGoToReview: () => void;
}

function isSafeHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function MapScreen({
  places,
  trips,
  pendingReviewCount,
  initialSelectedPlaceId,
  onToggleVisited,
  onAssignTrip,
  onGoToAdd,
  onGoToReview,
}: MapScreenProps) {
  const [tripFilter, setTripFilter] = useState<string>('all');
  const [hideVisited, setHideVisited] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedPlaceId ?? null);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);

  const mappablePlaces = useMemo(() => {
    return places.filter((p) => {
      if (!p.coordinates) return false;
      if (tripFilter !== 'all' && p.tripId !== tripFilter) return false;
      if (hideVisited && p.visited) return false;
      return true;
    });
  }, [places, tripFilter, hideVisited]);

  useEffect(() => {
    setSelectedId(initialSelectedPlaceId ?? null);
  }, [initialSelectedPlaceId]);

  const selectedIndex = useMemo(() => {
    if (!selectedId) return -1;
    return mappablePlaces.findIndex((p) => p.id === selectedId);
  }, [mappablePlaces, selectedId]);

  const selectedPlace = selectedIndex >= 0 ? mappablePlaces[selectedIndex] : null;

  // Initialize Leaflet map once
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container || mapInstanceRef.current) return;

    const map = L.map(container, {
      center: [38.7223, -9.1393],
      zoom: 3,
      zoomControl: false,
    });

    L.control.zoom({ position: 'topright' }).addTo(map);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      className: 'wayreel-osm-tiles',
      maxZoom: 19,
    }).addTo(map);

    const layer = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;
    markersLayerRef.current = layer;

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapInstanceRef.current = null;
      markersLayerRef.current = null;
    };
  }, []);

  // Update numbered markers whenever filtered places or selection change
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layer = markersLayerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();

    if (mappablePlaces.length === 0) {
      return;
    }

    const bounds = L.latLngBounds([]);

    mappablePlaces.forEach((place, idx) => {
      if (!place.coordinates) return;
      const { lat, lng } = place.coordinates;
      const isSelected = place.id === selectedId;

      const icon = L.divIcon({
        className: 'wayreel-pin-wrapper',
        html: `<div class="wayreel-pin ${place.visited ? 'is-visited' : ''} ${
          isSelected ? 'is-selected' : ''
        }">${idx + 1}</div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });

      const marker = L.marker([lat, lng], { icon, title: place.name });
      marker.on('click', () => {
        setSelectedId(place.id);
      });
      marker.addTo(layer);
      bounds.extend([lat, lng]);
    });

    if (selectedPlace?.coordinates) {
      map.panTo([selectedPlace.coordinates.lat, selectedPlace.coordinates.lng], {
        animate: true,
      });
    } else if (bounds.isValid()) {
      map.invalidateSize();
      map.fitBounds(bounds, { padding: [48, 48], maxZoom: 14 });
    }
  }, [mappablePlaces, selectedId, selectedPlace]);

  if (places.length === 0) {
    return (
      <div className="glass-card rounded-3xl p-8 text-center space-y-5 max-w-lg mx-auto my-8">
        <div className="w-12 h-12 rounded-2xl bg-[#FFC15A]/15 text-[#FFC15A] flex items-center justify-center mx-auto">
          <MapPin className="w-6 h-6" />
        </div>
        <div className="space-y-1.5">
          <h2 className="font-display-italic text-2xl text-white">Your map is empty</h2>
          <p className="text-sm text-slate-300">
            Save places from a Reel caption or screenshots to see numbered pins here.
          </p>
        </div>

        {pendingReviewCount > 0 && (
          <div className="rounded-2xl bg-[#FFC15A]/10 border border-[#FFC15A]/30 p-4 space-y-3">
            <p className="text-sm font-medium text-[#FFC15A]">
              You have {pendingReviewCount} {pendingReviewCount === 1 ? 'place' : 'places'} waiting in Review
            </p>
            <button
              type="button"
              onClick={onGoToReview}
              className="w-full min-h-[46px] px-5 rounded-xl amber-gradient text-[#111322] font-semibold text-sm inline-flex items-center justify-center cursor-pointer"
            >
              Go to Review
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={onGoToAdd}
          className={`min-h-[48px] px-6 rounded-xl font-semibold text-sm inline-flex items-center justify-center cursor-pointer ${
            pendingReviewCount > 0
              ? 'bg-white/10 hover:bg-white/15 text-white border border-white/15'
              : 'amber-gradient text-[#111322]'
          }`}
        >
          Add a Reel
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Compact filter bar above map */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <select
            aria-label="Filter map by trip"
            value={tripFilter}
            onChange={(e) => {
              setTripFilter(e.target.value);
              setSelectedId(null);
            }}
            className="min-h-[44px] rounded-xl bg-white/[0.07] border border-white/15 px-3 text-sm text-white focus:outline-none focus:border-[#FFC15A]"
          >
            <option value="all" className="bg-[#101533]">
              All places ({places.filter((p) => p.coordinates).length})
            </option>
            {trips.map((t) => (
              <option key={t.id} value={t.id} className="bg-[#101533]">
                {t.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setHideVisited((v) => !v)}
            className={`min-h-[44px] px-3.5 rounded-xl text-sm font-medium whitespace-nowrap shrink-0 border transition-colors cursor-pointer ${
              hideVisited
                ? 'bg-[#FFC15A]/20 border-[#FFC15A]/60 text-[#FFC15A]'
                : 'bg-white/[0.06] border-white/15 text-slate-200 hover:bg-white/10'
            }`}
          >
            {hideVisited ? 'Showing unvisited' : 'Hide visited'}
          </button>
        </div>

        <p className="text-xs text-slate-400 tabular-nums">
          {mappablePlaces.length} pinned · tap a number
        </p>
      </div>

      {/* Map viewport */}
      <div className="relative rounded-3xl overflow-hidden border border-white/15 h-[calc(100dvh-235px)] min-h-[380px] lg:h-[620px]">
        <div ref={mapContainerRef} className="w-full h-full z-0" />

        {mappablePlaces.length === 0 && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#090D1F]/70 backdrop-blur-sm p-6 text-center">
            <div className="space-y-2 max-w-xs">
              <p className="text-sm font-medium text-white">No pins match this filter</p>
              <p className="text-xs text-slate-300">
                Try switching back to All places or showing visited spots.
              </p>
            </div>
          </div>
        )}

        {/* Selected marker card overlay */}
        {selectedPlace && (
          <div className="absolute bottom-3 left-3 right-3 sm:left-auto sm:right-4 sm:bottom-4 sm:w-[360px] z-20 glass-surface-strong rounded-2xl p-4 shadow-2xl space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2.5 min-w-0">
                <span className="w-7 h-7 rounded-full amber-gradient text-[#111322] font-bold text-xs tabular-nums flex items-center justify-center shrink-0 mt-0.5">
                  {selectedIndex + 1}
                </span>
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-white truncate">
                    {selectedPlace.name}
                  </h3>
                  <p className="text-xs text-slate-300">
                    {[selectedPlace.city, selectedPlace.country].filter(Boolean).join(', ') ||
                      'Location'}
                    {selectedPlace.category ? ` · ${selectedPlace.category}` : ''}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedId(null)}
                aria-label="Close place card"
                className="min-h-[40px] min-w-[40px] -mt-1 -mr-1 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {selectedPlace.note && (
              <p className="text-sm text-slate-200 leading-snug">{selectedPlace.note}</p>
            )}

            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
              {selectedPlace.coordinates && (
                <span className="tabular-nums">
                  {selectedPlace.coordinates.lat.toFixed(4)},{' '}
                  {selectedPlace.coordinates.lng.toFixed(4)}
                  {selectedPlace.coordinatesApproximate ? ' (approximate)' : ''}
                </span>
              )}
              {selectedPlace.tags.length > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{selectedPlace.tags.map((t) => `#${t}`).join(' ')}</span>
                </>
              )}
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => onToggleVisited(selectedPlace.id, !selectedPlace.visited)}
                className={`flex-1 min-h-[44px] px-3 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                  selectedPlace.visited
                    ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/35'
                    : 'bg-white/10 hover:bg-white/15 text-white border border-white/15'
                }`}
              >
                {selectedPlace.visited ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Visited</span>
                  </>
                ) : (
                  <>
                    <Circle className="w-4 h-4" />
                    <span>Mark visited</span>
                  </>
                )}
              </button>

              <select
                aria-label="Assign place to trip"
                value={selectedPlace.tripId}
                onChange={(e) => {
                  const t = trips.find((x) => x.id === e.target.value);
                  void onAssignTrip(selectedPlace.id, t?.id ?? '', t?.name ?? '');
                }}
                className="min-h-[44px] max-w-[135px] rounded-xl bg-black/40 border border-white/15 px-2.5 text-xs text-white focus:outline-none focus:border-[#FFC15A]"
              >
                <option value="">No trip</option>
                {trips.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>

              {selectedPlace.sourceLink && isSafeHttpUrl(selectedPlace.sourceLink) && (
                <a
                  href={selectedPlace.sourceLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Open original post"
                  className="min-h-[44px] min-w-[44px] rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 flex items-center justify-center text-[#FFC15A]"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
