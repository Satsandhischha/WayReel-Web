import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Loader2,
  MapPin,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  ExtractedPlaceCandidate,
  MAX_FIELD_LIMITS,
  PLACE_CATEGORIES,
  PlaceRecord,
  TripRecord,
} from '../types/wayreel';

interface ReviewScreenProps {
  candidates: ExtractedPlaceCandidate[];
  existingPlaces: PlaceRecord[];
  trips: TripRecord[];
  geocodingMode: string;
  onUpdateCandidate: (id: string, patch: Partial<ExtractedPlaceCandidate>) => void;
  onDeleteCandidate: (id: string) => void;
  onSaveConfirmed: (
    placesToSave: ExtractedPlaceCandidate[],
    selectedTrip: { id: string; name: string } | null
  ) => Promise<void>;
  onGoToAdd: () => void;
}

export function ReviewScreen({
  candidates,
  existingPlaces,
  trips,
  geocodingMode,
  onUpdateCandidate,
  onDeleteCandidate,
  onSaveConfirmed,
  onGoToAdd,
}: ReviewScreenProps) {
  const [selectedTripId, setSelectedTripId] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [tagDrafts, setTagDrafts] = useState<Record<string, string>>({});

  const existingKeys = useMemo(() => {
    const set = new Set<string>();
    for (const p of existingPlaces) {
      set.add(`${p.name.toLowerCase().trim()}::${p.city.toLowerCase().trim()}`);
    }
    return set;
  }, [existingPlaces]);

  const confirmedCount = candidates.filter((c) => c.confirmed).length;

  function addTagToCandidate(c: ExtractedPlaceCandidate) {
    const raw = (tagDrafts[c.id] ?? '').trim().toLowerCase().slice(0, MAX_FIELD_LIMITS.TAG);
    if (!raw) return;
    if (c.tags.length >= MAX_FIELD_LIMITS.MAX_TAGS) return;
    const next = Array.from(new Set([...c.tags, raw]));
    onUpdateCandidate(c.id, { tags: next });
    setTagDrafts((prev) => ({ ...prev, [c.id]: '' }));
  }

  function removeTagFromCandidate(c: ExtractedPlaceCandidate, tag: string) {
    onUpdateCandidate(c.id, { tags: c.tags.filter((t) => t !== tag) });
  }

  async function handleSaveAll(onlyConfirmed: boolean) {
    setSaveError(null);
    const list = onlyConfirmed ? candidates.filter((c) => c.confirmed) : candidates;
    if (list.length === 0) {
      setSaveError('Confirm at least one place first, or tap Save all.');
      return;
    }

    for (const item of list) {
      if (!item.name.trim()) {
        setSaveError('Every place needs a name before saving.');
        return;
      }
    }

    const tripObj = trips.find((t) => t.id === selectedTripId);
    setIsSaving(true);
    try {
      await onSaveConfirmed(list, tripObj ? { id: tripObj.id, name: tripObj.name } : null);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save places.');
    } finally {
      setIsSaving(false);
    }
  }

  if (candidates.length === 0) {
    return (
      <div className="glass-card rounded-3xl p-8 text-center space-y-4 max-w-lg mx-auto my-8">
        <div className="w-12 h-12 rounded-2xl bg-[#FFC15A]/15 text-[#FFC15A] flex items-center justify-center mx-auto">
          <MapPin className="w-6 h-6" />
        </div>
        <div className="space-y-1.5">
          <h2 className="font-display-italic text-2xl text-white">Nothing to review yet</h2>
          <p className="text-sm text-slate-300">
            Paste a Reel caption or upload screenshots in Add to see places here.
          </p>
        </div>
        <button
          type="button"
          onClick={onGoToAdd}
          className="min-h-[48px] px-6 rounded-xl amber-gradient text-[#111322] font-semibold text-sm inline-flex items-center justify-center gap-2 cursor-pointer"
        >
          Go to Add
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1">
          <h2 className="font-display-italic text-3xl text-white text-balance">
            Review found places
          </h2>
          <p className="text-sm text-slate-300">
            Edit any details, delete extras, or confirm what you want to keep.
            {(geocodingMode === 'gemini_approximate' ||
              candidates.some((c) => c.coordinatesApproximate)) && (
              <span className="text-slate-400"> Some pins use approximate coordinates.</span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <label htmlFor="review-trip-select" className="text-xs text-slate-300 whitespace-nowrap">
            Add to trip:
          </label>
          <select
            id="review-trip-select"
            value={selectedTripId}
            onChange={(e) => setSelectedTripId(e.target.value)}
            className="min-h-[44px] rounded-xl bg-black/35 border border-white/15 px-3 text-sm text-white focus:outline-none focus:border-[#FFC15A]"
          >
            <option value="">No trip</option>
            {trips.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {candidates.map((c) => {
          const lowConfidence = c.confidence < 0.7;
          const dupKey = `${c.name.toLowerCase().trim()}::${c.city.toLowerCase().trim()}`;
          const matchesExisting = existingKeys.has(dupKey);
          const confidencePct = Math.round(c.confidence * 100);

          return (
            <article
              key={c.id}
              className={`glass-card rounded-2xl p-4 sm:p-5 space-y-4 transition-colors ${
                c.confirmed ? 'border-[#FFC15A]/60 bg-white/[0.08]' : ''
              }`}
            >
              {/* Header metadata & confidence flags (clean unboxed text with separators + explicit low-confidence label) */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-300">
                  <span className="capitalize">{c.source}</span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">{confidencePct}% confidence</span>
                  {c.coordinates && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>
                        {c.coordinatesApproximate ? 'Approximate pin' : 'Exact pin'}
                      </span>
                    </>
                  )}
                </div>

                {lowConfidence && (
                  <div className="inline-flex items-center gap-1.5 text-xs font-medium text-[#FFC15A]">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>Check this one</span>
                  </div>
                )}
              </div>

              {matchesExisting && (
                <p className="text-xs text-sky-200 bg-sky-500/15 border border-sky-400/25 rounded-xl px-3 py-2">
                  Already in your list — saving will merge details and keep this source link.
                </p>
              )}

              {/* Editable fields */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Place name</label>
                  <input
                    type="text"
                    maxLength={MAX_FIELD_LIMITS.NAME}
                    value={c.name}
                    onChange={(e) => onUpdateCandidate(c.id, { name: e.target.value })}
                    className="w-full min-h-[44px] rounded-xl bg-black/30 border border-white/15 px-3 text-sm font-medium text-white focus:outline-none focus:border-[#FFC15A]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">City</label>
                    <input
                      type="text"
                      maxLength={MAX_FIELD_LIMITS.CITY}
                      value={c.city}
                      onChange={(e) => onUpdateCandidate(c.id, { city: e.target.value })}
                      placeholder="City"
                      className="w-full min-h-[44px] rounded-xl bg-black/30 border border-white/15 px-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#FFC15A]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Country</label>
                    <input
                      type="text"
                      maxLength={MAX_FIELD_LIMITS.COUNTRY}
                      value={c.country}
                      onChange={(e) => onUpdateCandidate(c.id, { country: e.target.value })}
                      placeholder="Country"
                      className="w-full min-h-[44px] rounded-xl bg-black/30 border border-white/15 px-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#FFC15A]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Category</label>
                    <select
                      value={c.category}
                      onChange={(e) => onUpdateCandidate(c.id, { category: e.target.value })}
                      className="w-full min-h-[44px] rounded-xl bg-black/30 border border-white/15 px-3 text-sm text-white focus:outline-none focus:border-[#FFC15A]"
                    >
                      {PLACE_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-slate-400 mb-1">One-line note</label>
                    <input
                      type="text"
                      maxLength={MAX_FIELD_LIMITS.NOTE}
                      value={c.note}
                      onChange={(e) => onUpdateCandidate(c.id, { note: e.target.value })}
                      placeholder="Why save this spot?"
                      className="w-full min-h-[44px] rounded-xl bg-black/30 border border-white/15 px-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#FFC15A]"
                    />
                  </div>
                </div>

                {/* Tags editor */}
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
                    <span className="text-slate-400">Tags:</span>
                    {c.tags.length === 0 ? (
                      <span className="text-slate-500">None</span>
                    ) : (
                      c.tags.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => removeTagFromCandidate(c, tag)}
                          title="Tap to remove tag"
                          className="min-h-[32px] px-2.5 rounded-lg bg-white/10 hover:bg-white/15 text-slate-200 inline-flex items-center gap-1 cursor-pointer"
                        >
                          <span>#{tag}</span>
                          <span aria-hidden="true" className="text-slate-400">
                            ×
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={tagDrafts[c.id] ?? ''}
                      onChange={(e) =>
                        setTagDrafts((prev) => ({ ...prev, [c.id]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addTagToCandidate(c);
                        }
                      }}
                      placeholder="Add tag (e.g. brunch)"
                      className="flex-1 min-h-[40px] rounded-xl bg-black/25 border border-white/10 px-3 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-[#FFC15A]"
                    />
                    <button
                      type="button"
                      onClick={() => addTagToCandidate(c)}
                      className="min-h-[40px] px-3 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-medium text-white inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Card action buttons */}
              <div className="flex items-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => onUpdateCandidate(c.id, { confirmed: !c.confirmed })}
                  className={`flex-1 min-h-[46px] rounded-xl font-medium text-sm inline-flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    c.confirmed
                      ? 'amber-gradient text-[#111322] font-semibold'
                      : 'bg-white/10 hover:bg-white/15 text-white border border-white/15'
                  }`}
                >
                  {c.confirmed ? (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Confirmed</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Confirm</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteCandidate(c.id)}
                  aria-label={`Skip ${c.name}`}
                  className="min-h-[46px] min-w-[46px] px-3.5 rounded-xl bg-white/5 hover:bg-rose-500/20 text-slate-300 hover:text-rose-200 border border-white/10 inline-flex items-center justify-center gap-1.5 text-sm transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Skip</span>
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {saveError && (
        <div
          role="alert"
          className="rounded-2xl bg-rose-500/15 border border-rose-400/35 p-3.5 text-sm text-rose-100"
        >
          {saveError}
        </div>
      )}

      <div className="sticky bottom-[66px] md:bottom-4 z-20 pt-2">
        <div className="glass-surface-strong rounded-2xl p-3 shadow-2xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          <p className="hidden sm:block text-xs text-slate-300 px-2 tabular-nums">
            {candidates.length} {candidates.length === 1 ? 'place' : 'places'} ready
            {confirmedCount > 0 ? ` · ${confirmedCount} confirmed` : ''}
          </p>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:ml-auto">
            {confirmedCount > 0 && confirmedCount < candidates.length && (
              <button
                type="button"
                disabled={isSaving}
                onClick={() => handleSaveAll(true)}
                className="min-h-[48px] px-4 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white font-semibold text-sm inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Save confirmed ({confirmedCount})</span>
              </button>
            )}
            <button
              type="button"
              disabled={isSaving}
              onClick={() => handleSaveAll(false)}
              className="min-h-[50px] px-6 rounded-xl amber-gradient text-[#111322] font-semibold text-base inline-flex items-center justify-center gap-2 shadow-lg shadow-[#F07A1F]/25 hover:brightness-105 active:scale-[0.99] transition-all disabled:opacity-60 cursor-pointer"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Saving places...</span>
                </>
              ) : (
                <span>Save all places</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
