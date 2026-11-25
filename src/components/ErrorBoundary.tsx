import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || 'Something went wrong.',
    };
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-dvh flex items-center justify-center p-6">
          <div className="glass-card rounded-3xl p-6 max-w-md w-full space-y-4 text-center">
            <h1 className="font-display-italic text-3xl text-white">WayReel</h1>
            <p className="text-sm text-slate-300 leading-relaxed">
              We ran into an unexpected error while syncing your travel places.
            </p>
            <p className="text-xs text-slate-400 break-words bg-black/25 rounded-xl p-3 border border-white/10">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full min-h-[48px] rounded-xl amber-gradient text-[#111322] font-semibold text-sm active:scale-[0.99] transition-transform cursor-pointer"
            >
              Reload WayReel
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
