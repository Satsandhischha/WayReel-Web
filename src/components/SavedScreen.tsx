import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Circle,
  ExternalLink,
  FolderPlus,
  MapPin,
  Search,
  Trash2,
} from 'lucide-react';
import { MAX_FIELD_LIMITS, PlaceRecord, TripRecord } from '../types/wayreel';

interface SavedScreenProps {
  places: PlaceRecord[];
  trips: TripRecord[];
  onToggleVisited: (placeId: string, visited: boolean) => Promise<void>;
  onAssignTrip: (placeId: string, tripId: string, tripName: string) => Promise<void>;
  onDeletePlace: (placeId: string) => Promise<void>;
  onCreateTrip: (name: string) => Promise<TripRecord>;
  onDeleteTrip: (tripId: string) => Promise<void>;
  onViewOnMap: (placeId: string) => void;
  onGoToAdd: () => void;
}

function isSafeHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function SavedScreen({
  places,
  trips,
  onToggleVisited,
  onAssignTrip,
  onDeletePlace,
  onCreateTrip,
  onDeleteTrip,
  onViewOnMap,
  onGoToAdd,
}: SavedScreenProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [selectedTripId, setSelectedTripId] = useState<string>('all');
  const [visitedFilter, setVisitedFilter] = useState<'all' | 'unvisited' | 'visited'>('all');

  const [showNewTripForm, setShowNewTripForm] = useState(false);
  const [newTripName, setNewTripName] = useState('');
  const [tripError, setTripError] = useState<string | null>(null);
  const [creatingTrip, setCreatingTrip] = useState(false);

  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of places) {
      for (const t of p.tags) {
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag);
  }, [places]);

  const filteredPlaces = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return places.filter((p) => {
      if (q) {
        const hay = `${p.name} ${p.city} ${p.country} ${p.note}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (selectedTag !== 'all' && !p.tags.includes(selectedTag)) return false;
      if (selectedTripId !== 'all' && p.tripId !== selectedTripId) return false;
      if (visitedFilter === 'visited' && !p.visited) return false;
      if (visitedFilter === 'unvisited' && p.visited) return false;
      return true;
    });
  }, [places, searchQuery, selectedTag, selectedTripId, visitedFilter]);

  const groupedByCity = useMemo(() => {
    const groups = new Map<string, PlaceRecord[]>();
    for (const p of filteredPlaces) {
      const cityLabel = [p.city.trim(), p.country.trim()].filter(Boolean).join(', ') || 'Other locations';
      const list = groups.get(cityLabel) ?? [];
      list.push(p);
      groups.set(cityLabel, list);
    }
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredPlaces]);

  async function handleCreateTripSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTripError(null);
    const trimmed = newTripName.trim();
    if (!trimmed) {
      setTripError('Enter a trip name, like "Lisbon, March".');
      return;
    }
    setCreatingTrip(true);
    try {
      const created = await onCreateTrip(trimmed);
      setNewTripName('');
      setShowNewTripForm(false);
      setSelectedTripId(created.id);
    } catch (err) {
      setTripError(err instanceof Error ? err.message : 'Could not create trip.');
    } finally {
      setCreatingTrip(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1">
          <h2 className="font-display-italic text-3xl text-white">Saved places</h2>
          <p className="text-sm text-slate-300 tabular-nums">
            {places.length} {places.length === 1 ? 'place' : 'places'} saved across{' '}
            {trips.length} {trips.length === 1 ? 'trip' : 'trips'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowNewTripForm((v) => !v)}
          className="min-h-[44px] px-4 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-sm font-medium text-white inline-flex items-center justify-center gap-2 self-start sm:self-auto cursor-pointer whitespace-nowrap"
        >
          <FolderPlus className="w-4 h-4 text-[#FFC15A]" />
          <span>New trip</span>
        </button>
      </div>

      {/* Create Trip Drawer */}
      {showNewTripForm && (
        <form
          onSubmit={handleCreateTripSubmit}
          className="glass-card rounded-2xl p-4 space-y-3"
        >
          <div className="flex flex-col sm:flex-row gap-2.5">
            <input
              type="text"
              maxLength={MAX_FIELD_LIMITS.TRIP_NAME}
              value={newTripName}
              onChange={(e) => setNewTripName(e.target.value)}
              placeholder='Trip name (e.g. "Lisbon, March")'
              className="flex-1 min-h-[46px] rounded-xl bg-black/30 border border-white/15 px-3.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#FFC15A]"
            />
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={creatingTrip}
                className="flex-1 sm:flex-none min-h-[46px] px-5 rounded-xl amber-gradient text-[#111322] font-semibold text-sm cursor-pointer disabled:opacity-60"
              >
                {creatingTrip ? 'Creating...' : 'Create trip'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowNewTripForm(false);
                  setTripError(null);
                }}
                className="min-h-[46px] px-4 rounded-xl bg-white/5 hover:bg-white/10 text-sm text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
          {tripError && <p className="text-xs text-rose-300">{tripError}</p>}
        </form>
      )}

      {/* Trips selector strip */}
      {trips.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setSelectedTripId('all')}
            className={`min-h-[42px] px-3.5 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
              selectedTripId === 'all'
                ? 'amber-gradient text-[#111322] font-semibold'
                : 'bg-white/[0.06] text-slate-300 hover:bg-white/10 border border-white/10'
            }`}
          >
            All trips
          </button>
          {trips.map((trip) => {
            const active = selectedTripId === trip.id;
            return (
              <div key={trip.id} className="inline-flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setSelectedTripId(trip.id)}
                  className={`min-h-[42px] px-3.5 rounded-xl text-xs font-medium whitespace-nowrap cursor-pointer transition-colors ${
                    active
                      ? 'amber-gradient text-[#111322] font-semibold'
                      : 'bg-white/[0.06] text-slate-300 hover:bg-white/10 border border-white/10'
                  }`}
                >
                  {trip.name}
                </button>
                {active && (
                  <button
                    type="button"
                    onClick={() => {
                      void onDeleteTrip(trip.id);
                      setSelectedTripId('all');
                    }}
                    aria-label={`Delete trip ${trip.name}`}
                    title="Delete trip (keeps places)"
                    className="min-h-[42px] min-w-[42px] rounded-xl bg-white/5 hover:bg-rose-500/20 text-slate-400 hover:text-rose-200 flex items-center justify-center cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
          {/* Future Extension Point: Day-by-day itinerary planning tab/view for selected trip goes here */}
        </div>
      )}

      {/* Search, Visited filter, and Tag filter */}
      {places.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <Search
                className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search saved places by name or city..."
                className="w-full min-h-[46px] rounded-xl bg-black/30 border border-white/15 pl-10 pr-3.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#FFC15A]"
              />
            </div>

            <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.06] border border-white/10 self-start">
              {(['all', 'unvisited', 'visited'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setVisitedFilter(mode)}
                  className={`min-h-[38px] px-3 rounded-lg text-xs font-medium capitalize whitespace-nowrap cursor-pointer transition-colors ${
                    visitedFilter === mode
                      ? 'bg-white/15 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {mode === 'unvisited' ? 'To visit' : mode}
                </button>
              ))}
            </div>
          </div>

          {allTags.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => setSelectedTag('all')}
                className={`min-h-[38px] px-3 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  selectedTag === 'all'
                    ? 'bg-white/15 text-white'
                    : 'bg-white/[0.04] text-slate-400 hover:text-white'
                }`}
              >
                All tags
              </button>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setSelectedTag(selectedTag === tag ? 'all' : tag)}
                  className={`min-h-[38px] px-3 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                    selectedTag === tag
                      ? 'bg-[#FFC15A]/20 text-[#FFC15A] border border-[#FFC15A]/40'
                      : 'bg-white/[0.04] text-slate-300 hover:text-white'
                  }`}
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty states */}
      {places.length === 0 ? (
        <div className="glass-card rounded-3xl p-8 text-center space-y-4 max-w-lg mx-auto my-8">
          <div className="w-12 h-12 rounded-2xl bg-[#FFC15A]/15 text-[#FFC15A] flex items-center justify-center mx-auto">
            <MapPin className="w-6 h-6" />
          </div>
          <div className="space-y-1.5">
            <h3 className="font-display-italic text-2xl text-white">No saved places yet</h3>
            <p className="text-sm text-slate-300">
              Start in Add by pasting a Reel caption or uploading screenshots.
            </p>
          </div>
          <button
            type="button"
            onClick={onGoToAdd}
            className="min-h-[48px] px-6 rounded-xl amber-gradient text-[#111322] font-semibold text-sm inline-flex items-center justify-center cursor-pointer"
          >
            Add your first Reel
          </button>
        </div>
      ) : groupedByCity.length === 0 ? (
        <div className="glass-card rounded-2xl p-6 text-center space-y-2">
          <p className="text-sm font-medium text-white">No matching places</p>
          <p className="text-xs text-slate-400">
            Clear your search or tag filter to see everything saved.
          </p>
        </div>
      ) : (
        <div className="space-y-7">
          {groupedByCity.map(([cityName, cityPlaces]) => (
            <section key={cityName} className="space-y-3">
              <div className="flex items-baseline justify-between border-b border-white/10 pb-2">
                <h3 className="font-display-italic text-xl sm:text-2xl text-white">
                  {cityName}
                </h3>
                <span className="text-xs text-slate-400 tabular-nums">
                  {cityPlaces.length} {cityPlaces.length === 1 ? 'spot' : 'spots'}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {cityPlaces.map((place) => {
                  const dateLabel = place.dateAdded
                    ? place.dateAdded.toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })
                    : 'Just now';

                  return (
                    <article
                      key={place.id}
                      className="glass-card rounded-2xl p-4 space-y-3 flex flex-col justify-between"
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h4
                              className={`text-base font-semibold truncate ${
                                place.visited ? 'text-slate-300' : 'text-white'
                              }`}
                            >
                              {place.name}
                            </h4>
                            <p className="text-xs text-slate-400 mt-0.5">
                              {place.category} · Added {dateLabel}
                              {place.coordinatesApproximate && place.coordinates
                                ? ' · Approximate pin'
                                : ''}
                            </p>
                          </div>

                          {place.coordinates && (
                            <button
                              type="button"
                              onClick={() => onViewOnMap(place.id)}
                              aria-label={`View ${place.name} on map`}
                              className="min-h-[40px] min-w-[40px] rounded-xl bg-white/5 hover:bg-white/10 text-[#FFC15A] flex items-center justify-center shrink-0 cursor-pointer"
                            >
                              <MapPin className="w-4 h-4" />
                            </button>
                          )}
                        </div>

                        {place.note && (
                          <p className="text-sm text-slate-200 leading-snug">{place.note}</p>
                        )}

                        {(place.tags.length > 0 || place.sourceLinks.length > 0) && (
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
                            {place.tags.length > 0 && (
                              <span>{place.tags.map((t) => `#${t}`).join(' ')}</span>
                            )}
                            {place.tags.length > 0 && place.sourceLinks.length > 0 && (
                              <span aria-hidden="true">·</span>
                            )}
                            {place.sourceLinks
                              .filter(isSafeHttpUrl)
                              .slice(0, 2)
                              .map((link, idx) => (
                                <a
                                  key={link}
                                  href={link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[#FFC15A] hover:underline"
                                >
                                  <span>Post{idx > 0 ? ` ${idx + 1}` : ''}</span>
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              ))}
                          </div>
                        )}
                      </div>

                      {/* Controls */}
                      <div className="flex items-center gap-2 pt-1 border-t border-white/10">
                        <button
                          type="button"
                          onClick={() => void onToggleVisited(place.id, !place.visited)}
                          className={`min-h-[44px] px-3.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                            place.visited
                              ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/35'
                              : 'bg-white/10 hover:bg-white/15 text-white border border-white/10'
                          }`}
                        >
                          {place.visited ? (
                            <>
                              <CheckCircle2 className="w-4 h-4" />
                              <span>Visited</span>
                            </>
                          ) : (
                            <>
                              <Circle className="w-4 h-4" />
                              <span>Visited</span>
                            </>
                          )}
                        </button>

                        <select
                          aria-label={`Assign ${place.name} to trip`}
                          value={place.tripId}
                          onChange={(e) => {
                            const t = trips.find((x) => x.id === e.target.value);
                            void onAssignTrip(place.id, t?.id ?? '', t?.name ?? '');
                          }}
                          className="flex-1 min-w-0 min-h-[44px] rounded-xl bg-black/30 border border-white/10 px-2.5 text-xs text-slate-200 focus:outline-none focus:border-[#FFC15A]"
                        >
                          <option value="" className="bg-[#101533]">
                            No trip
                          </option>
                          {trips.map((t) => (
                            <option key={t.id} value={t.id} className="bg-[#101533]">
                              {t.name}
                            </option>
                          ))}
                        </select>

                        <button
                          type="button"
                          onClick={() => void onDeletePlace(place.id)}
                          aria-label={`Delete ${place.name}`}
                          className="min-h-[44px] min-w-[44px] rounded-xl bg-white/5 hover:bg-rose-500/20 text-slate-400 hover:text-rose-200 flex items-center justify-center shrink-0 cursor-pointer transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
