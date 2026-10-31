import { useState, useRef, useEffect, Fragment } from 'react';
import { Search as SearchIcon, BookOpen, Plus, Loader2 } from 'lucide-react';
import { Card } from '../../../shared/ui/Card.jsx';
import { Button } from '../../../shared/ui/Button.jsx';
import { EmptyState, ErrorState, CardSkeleton } from '../../../shared/ui/States.jsx';
import { NoteCard } from '../components/NoteCard.jsx';
import { NoteComposer } from '../components/NoteComposer.jsx';
import { useDebounce } from '../../../shared/hooks/useDebounce.js';
import { useNotes } from '../../../shared/hooks/useData.js';
import { errorMessage } from '../../../shared/api/client.js';
import { SUBJECTS } from '../../../app/layout/navItems.js';

const SUBJECT_FILTERS = ['All', ...SUBJECTS];

export default function Notes() {
  const [term, setTerm] = useState('');
  const [subject, setSubject] = useState('All');
  const [composerOpen, setComposerOpen] = useState(false);

  const debounced = useDebounce(term.trim(), 350);
  
  const queryParams = {};
  if (debounced.length >= 2) queryParams.search = debounced;
  if (subject !== 'All') queryParams.subject = subject;

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error,
    refetch,
  } = useNotes(queryParams);

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
          <h1 className="text-xl font-bold tracking-[-0.02em] text-ink">Notes & Resources</h1>
          <p className="mt-0.5 text-[14px] text-ink-2">
            Find study materials, past papers, and lecture notes.
          </p>
        </div>
        <Button onClick={() => setComposerOpen(true)} className="shrink-0 gap-1.5">
          <Plus className="h-4 w-4" aria-hidden />
          Upload
        </Button>
      </div>

      <Card className="p-3">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <input
            type="search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search notes, topics, or course codes…"
            aria-label="Search notes"
            className="h-10 w-full rounded-md border border-line bg-surface-2 pr-3 pl-9 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/25"
          />
        </div>
      </Card>

      <div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {SUBJECT_FILTERS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSubject(s)}
              className={`shrink-0 rounded-md border px-2.5 py-1 text-[12.5px] font-medium transition-colors ${
                subject === s
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-line text-ink-3 hover:border-line-strong hover:text-ink'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {error && <ErrorState message={errorMessage(error)} onRetry={refetch} />}

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <CardSkeleton key={i} lines={2} />
          ))}
        </div>
      )}

      {!isLoading && !error && isEmpty && (
        <EmptyState
          icon={BookOpen}
          title={subject === 'All' && !debounced ? "No notes yet" : "No notes found"}
          description={subject === 'All' && !debounced ? "Be the first to upload a resource." : "Try adjusting your search or subject filter."}
        />
      )}

      {!isLoading && !error && !isEmpty && (
        <div className="space-y-3">
          {data.pages.map((page, i) => (
            <Fragment key={i}>
              {page.data.map((note) => (
                <NoteCard key={note.id} note={note} />
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
        <NoteComposer
          open={composerOpen}
          onClose={() => setComposerOpen(false)}
        />
      )}
    </div>
  );
}
