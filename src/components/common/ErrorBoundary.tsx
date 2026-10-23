import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackMessage?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an unhandled error:', error, errorInfo);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    } else {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 my-4 mx-auto max-w-xl rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-md text-stone-900 dark:text-stone-100">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500 shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="space-y-2 flex-1">
              <h3 className="text-sm font-semibold">
                {this.props.fallbackMessage || 'Something went wrong rendering this component.'}
              </h3>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                {this.state.error?.message || 'An unexpected error occurred during audio or view rendering.'}
              </p>
              <div className="pt-2 flex items-center gap-2">
                <button
                  onClick={this.handleReload}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-900 text-stone-50 dark:bg-stone-100 dark:text-stone-900 text-xs font-medium hover:opacity-90 transition-opacity"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Try Again</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
