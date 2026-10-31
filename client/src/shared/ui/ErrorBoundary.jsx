/**
 * Top-level error boundary.
 *
 * React unmounts the entire tree when a render throws, which would leave the
 * user staring at an empty page. This catches that, shows what happened, and
 * offers the two things that actually help: retry the render (useful when a
 * lazy chunk failed to download) or reload the app from scratch.
 */
import { Component } from 'react';
import { AlertOctagon, RefreshCw, RotateCcw } from 'lucide-react';
import { Button } from './Button.jsx';

/** Chunk-load failures are the most common cause and are always retryable. */
function isChunkError(error) {
  const message = error?.message ?? '';
  return /Loading chunk|dynamically imported module|Importing a module script failed|Failed to fetch/i.test(message);
}

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
    this.reset = this.reset.bind(this);
    this.hardReset = this.hardReset.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    // eslint-disable-next-line no-console
    console.error('[CampusConnect] render error:', error, info?.componentStack);
  }

  reset() {
    this.setState({ error: null, info: null });
  }

  /** Clears the query cache's hold on stale data, then re-renders. */
  hardReset() {
    this.setState({ error: null, info: null });
    window.location.reload();
  }

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    const retryable = isChunkError(error);
    const detail = String(error.message ?? error).slice(0, 200);

    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-6 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger">
          <AlertOctagon className="h-6 w-6" aria-hidden />
        </span>

        <h1 className="mt-4 text-2xl font-bold tracking-[-0.02em] text-ink">
          {retryable ? 'A part of CampusConnect failed to load' : 'Something went wrong'}
        </h1>

        <p className="mt-2 max-w-md text-[15px] leading-relaxed text-ink-2">
          {retryable
            ? 'The page you were loading could not be downloaded. This is usually a flaky connection — try again.'
            : 'This screen hit an unexpected error. Your data is safe; reloading will start from a clean slate.'}
        </p>

        {detail && (
          <p className="mt-4 max-w-lg rounded-md border border-line bg-surface px-3 py-2 font-mono text-[12px] break-words text-ink-3">
            {detail}
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <Button leftIcon={retryable ? RefreshCw : RotateCcw} onClick={retryable ? this.reset : this.hardReset}>
            {retryable ? 'Try again' : 'Reload the app'}
          </Button>
          <Button variant="secondary" onClick={this.hardReset}>
            Hard refresh
          </Button>
          <Button variant="ghost" onClick={() => window.location.assign('/')}>
            Go to home
          </Button>
        </div>

        {import.meta.env.DEV && info?.componentStack && (
          <details className="mt-6 max-w-lg text-left">
            <summary className="cursor-pointer text-[13px] font-medium text-ink-3">Component stack</summary>
            <pre className="mt-2 max-h-64 overflow-auto rounded-md border border-line bg-surface p-3 text-[11px] leading-relaxed whitespace-pre-wrap text-ink-3">
              {info.componentStack}
            </pre>
          </details>
        )}
      </div>
    );
  }
}
