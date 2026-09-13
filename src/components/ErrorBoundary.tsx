import React, { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  onReset?: () => void;
  resetKey?: string | number;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Ascend render error:', error, info.componentStack);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  private handleReload = () => {
    this.setState({ hasError: false });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="relative z-20 flex items-center justify-center w-full h-full min-h-full px-6 bg-canvas text-ink">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-3 text-center">
          <h2 className="text-[18px] font-extrabold tracking-tight text-slate-900 dark:text-white">
            This screen hit a snag
          </h2>
          <p className="text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
            Your habits are still saved. Reload this screen to keep going.
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            className="w-full py-2.5 rounded-xl bg-[#23C15D] dark:bg-blue-500 text-white text-[13px] font-bold shadow-xs active:scale-95 transition cursor-pointer"
          >
            Reload Screen
          </button>
        </div>
      </div>
    );
  }
}
