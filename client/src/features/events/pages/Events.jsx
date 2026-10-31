import { useState, useRef, useEffect, Fragment } from 'react';
import { Search as SearchIcon, Plus, Calendar, Loader2 } from 'lucide-react';
import { Card } from '../../../shared/ui/Card.jsx';
import { Button } from '../../../shared/ui/Button.jsx';
import { EmptyState, ErrorState, CardSkeleton } from '../../../shared/ui/States.jsx';
import { useDebounce } from '../../../shared/hooks/useDebounce.js';
import { useEvents } from '../../../shared/hooks/useData.js';
import { errorMessage } from '../../../shared/api/client.js';
import { EventCard } from '../components/EventCard.jsx';
import { EventComposer } from '../components/EventComposer.jsx';

const TYPE_FILTERS = [
  { label: 'Upcoming', value: 'upcoming' },
  { label: 'Past', value: 'past' },
];

export default function Events() {
  const [term, setTerm] = useState('');
  const [type, setType] = useState('upcoming');
  const [composerOpen, setComposerOpen] = useState(false);

  const debounced = useDebounce(term.trim(), 350);
  
  const queryParams = { type };
  if (debounced.length >= 2) queryParams.search = debounced;

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error,
    refetch,
  } = useEvents(queryParams);

  const isEmpty = data?.pages?.[0]?.data?.length === 0;

  const sentinelRef = useRef(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasNextPage) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isFetchingNextPage) fetchNextPage();
      },
      { rootMargin: '400px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-[-0.02em] text-ink">Events</h1>
          <p className="mt-0.5 text-[14px] text-ink-2">
            Discover upcoming campus events, meetups, and workshops.
          </p>
        </div>
        <Button onClick={() => setComposerOpen(true)} className="shrink-0 gap-1.5">
          <Plus className="h-4 w-4" aria-hidden />
          Create Event
        </Button>
      </div>

      <Card className="p-3">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <input
            type="search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search events…"
            aria-label="Search events"
            className="h-10 w-full rounded-md border border-line bg-surface-2 pr-3 pl-9 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/25"
          />
        </div>
      </Card>

      <div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setType(f.value)}
              className={`shrink-0 rounded-md border px-2.5 py-1 text-[12.5px] font-medium transition-colors ${
                type === f.value
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-line text-ink-3 hover:border-line-strong hover:text-ink'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <ErrorState onRetry={refetch} message={errorMessage(error)} />
      ) : isLoading ? (
        <div className="space-y-4">
          <CardSkeleton lines={3} />
          <CardSkeleton lines={3} />
          <CardSkeleton lines={3} />
        </div>
      ) : isEmpty ? (
        <EmptyState
          icon={Calendar}
          title="No events found"
          message={debounced ? 'Try a different search term.' : 'There are no events yet.'}
          action={
            debounced && (
              <Button variant="outline" onClick={() => setTerm('')}>
                Clear search
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-3">
          {data.pages.map((page, i) => (
            <Fragment key={i}>
              {page.data.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </Fragment>
          ))}
          {hasNextPage && (
            <div ref={sentinelRef} className="flex justify-center p-4">
              <Loader2 className="h-6 w-6 animate-spin text-ink-3" aria-hidden />
            </div>
          )}
        </div>
      )}

      {composerOpen && (
        <EventComposer open={composerOpen} onClose={() => setComposerOpen(false)} />
      )}
    </div>
  );
}
