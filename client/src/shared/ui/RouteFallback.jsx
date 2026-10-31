import { Loader2 } from 'lucide-react';

/**
 * Suspense fallback for route-level code splitting.
 *
 * Every route is a `lazy()` chunk, so navigating always suspends once. This
 * keeps the height stable instead of collapsing to zero and bouncing the
 * scroll position, while staying neutral enough to sit under either the app
 * shell or a full-page marketing screen.
 */
export function RouteFallback({ label = 'Loading' }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center py-16" role="status" aria-live="polite">
      <span className="inline-flex items-center gap-2 text-[13.5px] text-ink-3">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        {label}…
      </span>
    </div>
  );
}
