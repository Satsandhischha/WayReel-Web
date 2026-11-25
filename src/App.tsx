import React, { useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import {
  Bookmark,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  LogOut,
  Map as MapIcon,
  PlusCircle,
  Trash2,
  User as UserIcon,
} from 'lucide-react';
import { AddScreen } from './components/AddScreen';
import { ErrorBoundary } from './components/ErrorBoundary';
import { MapScreen } from './components/MapScreen';
import { ReviewScreen } from './components/ReviewScreen';
import { SavedScreen } from './components/SavedScreen';
import { auth, googleProvider } from './firebase';
import {
  assignPlaceTrip,
  createTrip,
  deleteAllUserData,
  deletePlace,
  deleteTrip,
  ensureUserProfile,
  saveConfirmedPlaces,
  subscribePlaces,
  subscribeTrips,
  togglePlaceVisited,
} from './services/firestoreService';
import { AppTab, ExtractedPlaceCandidate, PlaceRecord, TripRecord } from './types/wayreel';

// Future Extension Point (Account Sharing):
// Add collaborator invite/accept handlers and shared-trip subscriptions here when multi-user sharing is enabled.

function WayReelApp() {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<AppTab>('add');
  const [places, setPlaces] = useState<PlaceRecord[]>([]);
  const [trips, setTrips] = useState<TripRecord[]>([]);

  const [candidates, setCandidates] = useState<ExtractedPlaceCandidate[]>([]);
  const [geocodingMode, setGeocodingMode] = useState<string>('gemini_approximate');
  const [mapFocusPlaceId, setMapFocusPlaceId] = useState<string | null>(null);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);

  function showToast(msg: string) {
    setToastMessage(msg);
    window.setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3600);
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      if (nextUser) {
        try {
          await ensureUserProfile(nextUser);
        } catch (err) {
          console.error('Failed to sync user profile:', err);
        }
      } else {
        setPlaces([]);
        setTrips([]);
        setCandidates([]);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!authReady || !user) return;
    const unsubPlaces = subscribePlaces(user.uid, setPlaces);
    const unsubTrips = subscribeTrips(user.uid, setTrips);
    return () => {
      unsubPlaces();
      unsubTrips();
    };
  }, [authReady, user]);

  async function handleSignIn() {
    setAuthError(null);
    setAuthBusy(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Sign-in failed. Try again.');
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleSignOut() {
    setShowAccountModal(false);
    await signOut(auth);
  }

  async function handleDeleteAllData() {
    if (!user) return;
    setDeletingAll(true);
    try {
      await deleteAllUserData(user.uid);
      setCandidates([]);
      setConfirmDeleteAll(false);
      setShowAccountModal(false);
      showToast('All saved places and trips deleted.');
    } catch (err) {
      console.error(err);
      showToast('Could not delete data. Please try again.');
    } finally {
      setDeletingAll(false);
    }
  }

  function handleExtracted(
    extracted: ExtractedPlaceCandidate[],
    meta: { geocodingMode: string; mediaDeleted: boolean }
  ) {
    setCandidates(extracted);
    setGeocodingMode(meta.geocodingMode);
    setActiveTab('review');
  }

  function handleUpdateCandidate(id: string, patch: Partial<ExtractedPlaceCandidate>) {
    setCandidates((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function handleDeleteCandidate(id: string) {
    setCandidates((prev) => prev.filter((c) => c.id !== id));
  }

  async function handleSaveConfirmed(
    placesToSave: ExtractedPlaceCandidate[],
    selectedTrip: { id: string; name: string } | null
  ) {
    if (!user) return;
    const { createdCount, mergedCount } = await saveConfirmedPlaces(
      user.uid,
      placesToSave,
      places,
      selectedTrip
    );

    const savedIds = new Set(placesToSave.map((p) => p.id));
    setCandidates((prev) => prev.filter((p) => !savedIds.has(p.id)));

    const totalSaved = createdCount + mergedCount;
    showToast(`${totalSaved} ${totalSaved === 1 ? 'place' : 'places'} saved`);
    setMapFocusPlaceId(null);
    setActiveTab('map');
  }

  if (!authReady) {
    return (
      <div className="min-h-dvh flex items-center justify-center p-6">
        <div className="flex items-center gap-3 text-slate-300 text-sm">
          <Loader2 className="w-5 h-5 animate-spin text-[#FFC15A]" />
          <span>Loading WayReel...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-dvh flex items-center justify-center p-5">
        <div className="glass-card rounded-3xl p-7 sm:p-9 max-w-md w-full space-y-6 text-center">
          <div className="space-y-2">
            <h1 className="font-display-italic text-5xl text-white tracking-tight">WayReel</h1>
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
              Turn saved Instagram Reels and posts into a map of places and a trip list.
            </p>
          </div>

          <div className="text-left space-y-2.5 text-sm text-slate-300 bg-black/25 rounded-2xl p-4 border border-white/10">
            <p>1. Paste a Reel caption or upload screenshots or a screen recording.</p>
            <p>2. Review each place and confirm its pin.</p>
            <p>3. Organize by city and trip — synced to your account.</p>
          </div>

          {authError && (
            <p role="alert" className="text-xs text-rose-300 bg-rose-500/15 rounded-xl p-3">
              {authError}
            </p>
          )}

          <button
            type="button"
            disabled={authBusy}
            onClick={handleSignIn}
            className="w-full min-h-[52px] rounded-2xl amber-gradient text-[#111322] font-semibold text-base flex items-center justify-center gap-2 shadow-lg shadow-[#F07A1F]/25 hover:brightness-105 active:scale-[0.99] transition-all cursor-pointer disabled:opacity-60"
          >
            {authBusy ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Signing in...</span>
              </>
            ) : (
              <span>Continue with Google</span>
            )}
          </button>

          <p className="text-xs text-slate-400">
            Uploaded videos and screenshots are deleted immediately after processing.
          </p>
        </div>
      </div>
    );
  }

  const navItems: Array<{
    id: AppTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }> = [
    { id: 'add', label: 'Add', icon: PlusCircle },
    {
      id: 'review',
      label: 'Review',
      icon: ClipboardCheck,
      badge: candidates.length > 0 ? candidates.length : undefined,
    },
    { id: 'map', label: 'Map', icon: MapIcon },
    { id: 'saved', label: 'Saved', icon: Bookmark },
  ];

  return (
    <div className="min-h-dvh flex flex-col">
      {/* Compact Sticky Top Header (3-zone Top Bar Contract) */}
      <header className="sticky top-0 z-30 h-14 bg-[#090D1F]/80 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-6xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-8">
          <button
            type="button"
            onClick={() => setActiveTab('add')}
            className="font-display-italic text-2xl text-white whitespace-nowrap shrink-0 cursor-pointer"
          >
            WayReel
          </button>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-6">
            {navItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`min-h-[40px] text-sm font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors inline-flex items-center gap-1.5 ${
                    active ? 'text-[#FFC15A]' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <span>{item.label}</span>
                  {item.badge !== undefined && (
                    <span className="text-xs tabular-nums text-[#FFC15A]">({item.badge})</span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Single Primary Account Action */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => {
                setConfirmDeleteAll(false);
                setShowAccountModal(true);
              }}
              aria-label="Account and data settings"
              className="min-h-[44px] min-w-[44px] px-2.5 rounded-xl bg-white/[0.06] hover:bg-white/10 border border-white/10 flex items-center justify-center gap-2 text-xs font-medium text-slate-200 cursor-pointer whitespace-nowrap"
            >
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName ?? 'Account'}
                  referrerPolicy="no-referrer"
                  className="w-6 h-6 rounded-full object-cover"
                />
              ) : (
                <UserIcon className="w-4 h-4 text-[#FFC15A]" />
              )}
              <span className="hidden sm:inline max-w-[120px] truncate">
                {user.displayName?.split(' ')[0] || 'Account'}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 pt-5 pb-28 md:pb-10">
        {activeTab === 'add' && <AddScreen onExtracted={handleExtracted} />}

        {activeTab === 'review' && (
          <ReviewScreen
            candidates={candidates}
            existingPlaces={places}
            trips={trips}
            geocodingMode={geocodingMode}
            onUpdateCandidate={handleUpdateCandidate}
            onDeleteCandidate={handleDeleteCandidate}
            onSaveConfirmed={handleSaveConfirmed}
            onGoToAdd={() => setActiveTab('add')}
          />
        )}

        {activeTab === 'map' && (
          <MapScreen
            places={places}
            trips={trips}
            pendingReviewCount={candidates.length}
            initialSelectedPlaceId={mapFocusPlaceId}
            onToggleVisited={(id, visited) => togglePlaceVisited(user.uid, id, visited)}
            onAssignTrip={(id, tripId, tripName) => assignPlaceTrip(user.uid, id, tripId, tripName)}
            onGoToAdd={() => setActiveTab('add')}
            onGoToReview={() => setActiveTab('review')}
          />
        )}

        {activeTab === 'saved' && (
          <SavedScreen
            places={places}
            trips={trips}
            onToggleVisited={(id, visited) => togglePlaceVisited(user.uid, id, visited)}
            onAssignTrip={(id, tripId, tripName) => assignPlaceTrip(user.uid, id, tripId, tripName)}
            onDeletePlace={(id) => deletePlace(user.uid, id)}
            onCreateTrip={(name) => createTrip(user.uid, name)}
            onDeleteTrip={(tripId) => deleteTrip(user.uid, tripId, places)}
            onViewOnMap={(placeId) => {
              setMapFocusPlaceId(placeId);
              setActiveTab('map');
            }}
            onGoToAdd={() => setActiveTab('add')}
          />
        )}
      </main>

      {/* Mobile Fixed Bottom Navigation Bar (Compact 58px + safe area, <= 15% viewport cap) */}
      <nav
        aria-label="Primary navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#090D1F]/92 backdrop-blur-xl border-t border-white/10 pb-safe"
      >
        <div className="grid grid-cols-4 h-[58px]">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`relative flex flex-col items-center justify-center gap-0.5 min-h-[44px] cursor-pointer transition-colors ${
                  active ? 'text-[#FFC15A]' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="relative">
                  <Icon className="w-5 h-5" />
                  {item.badge !== undefined && (
                    <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full amber-gradient text-[#111322] text-[10px] font-bold tabular-nums flex items-center justify-center">
                      {item.badge}
                    </span>
                  )}
                </div>
                <span className="text-[11px] font-medium tracking-tight">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Toast Feedback */}
      {toastMessage && (
        <div
          role="status"
          className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 glass-surface-strong rounded-2xl px-4 py-3 flex items-center gap-2 text-sm text-white shadow-xl max-w-[90vw]"
        >
          <CheckCircle2 className="w-4 h-4 text-[#FFC15A] shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Account & Delete My Data Modal */}
      {showAccountModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="account-modal-title"
          className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div className="glass-surface-strong rounded-t-3xl sm:rounded-3xl p-6 w-full sm:max-w-md space-y-5">
            <div className="space-y-1">
              <h2 id="account-modal-title" className="font-display-italic text-2xl text-white">
                Your account
              </h2>
              <p className="text-sm text-slate-300 truncate">{user.email}</p>
            </div>

            <div className="text-xs text-slate-400 space-y-1 bg-black/25 rounded-2xl p-3.5 border border-white/10">
              <p className="tabular-nums">
                Saved places: <span className="text-slate-200 font-medium">{places.length}</span>
              </p>
              <p className="tabular-nums">
                Trips: <span className="text-slate-200 font-medium">{trips.length}</span>
              </p>
              <p className="pt-1">
                Uploaded videos and screenshots are deleted automatically right after processing.
              </p>
            </div>

            {!confirmDeleteAll ? (
              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteAll(true)}
                  className="w-full min-h-[48px] rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/35 text-rose-200 text-sm font-medium inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete my data</span>
                </button>

                <button
                  type="button"
                  onClick={handleSignOut}
                  className="w-full min-h-[48px] rounded-xl bg-white/10 hover:bg-white/15 text-white text-sm font-medium inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign out</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowAccountModal(false)}
                  className="w-full min-h-[44px] rounded-xl text-slate-400 hover:text-white text-sm cursor-pointer"
                >
                  Close
                </button>
              </div>
            ) : (
              <div className="space-y-3 bg-rose-500/10 border border-rose-400/30 rounded-2xl p-4">
                <p className="text-sm text-rose-100">
                  Delete all {places.length} saved places and {trips.length} trips from your account? This cannot be undone.
                </p>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    disabled={deletingAll}
                    onClick={handleDeleteAllData}
                    className="flex-1 min-h-[46px] rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold cursor-pointer disabled:opacity-60"
                  >
                    {deletingAll ? 'Deleting...' : 'Yes, delete all'}
                  </button>
                  <button
                    type="button"
                    disabled={deletingAll}
                    onClick={() => setConfirmDeleteAll(false)}
                    className="min-h-[46px] px-4 rounded-xl bg-white/10 hover:bg-white/15 text-sm text-white cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <WayReelApp />
    </ErrorBoundary>
  );
}
