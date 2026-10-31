import { useState, useRef, useEffect, Fragment } from 'react';
import { Search as SearchIcon, MessageSquare, Plus, Loader2 } from 'lucide-react';
import { Card } from '../../../shared/ui/Card.jsx';
import { Button } from '../../../shared/ui/Button.jsx';
import { EmptyState, ErrorState, CardSkeleton } from '../../../shared/ui/States.jsx';
import { DiscussionCard } from '../components/DiscussionCard.jsx';
import { DiscussionComposer } from '../components/DiscussionComposer.jsx';
import { useDebounce } from '../../../shared/hooks/useDebounce.js';
import { useDiscussions } from '../../../shared/hooks/useData.js';
import { errorMessage } from '../../../shared/api/client.js';

const DISCUSSION_CATEGORIES = [
  'All',
  'programming',
  'placements',
  'academics',
  'college-life',
  'projects',
  'career',
  'general',
];

export default function Discussions() {
  const [term, setTerm] = useState('');
  const [category, setCategory] = useState('All');
  const [composerOpen, setComposerOpen] = useState(false);

  const debounced = useDebounce(term.trim(), 350);
  
  const queryParams = {};
  if (debounced.length >= 2) queryParams.search = debounced;
  if (category !== 'All') queryParams.category = category;

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error,
    refetch,
  } = useDiscussions(queryParams);

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
          <h1 className="text-xl font-bold tracking-[-0.02em] text-ink">Discussions</h1>
          <p className="mt-0.5 text-[14px] text-ink-2">
            Ask questions, share knowledge, and discuss campus topics.
          </p>
        </div>
        <Button onClick={() => setComposerOpen(true)} className="shrink-0 gap-1.5">
          <Plus className="h-4 w-4" aria-hidden />
          New Discussion
        </Button>
      </div>

      <Card className="p-3">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <input
            type="search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search discussions, questions, or tags…"
            aria-label="Search discussions"
            className="h-10 w-full rounded-md border border-line bg-surface-2 pr-3 pl-9 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/25"
          />
        </div>
      </Card>

      <div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {DISCUSSION_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={`shrink-0 rounded-md border px-2.5 py-1 text-[12.5px] font-medium transition-colors ${
                category === cat
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-line text-ink-3 hover:border-line-strong hover:text-ink'
              }`}
            >
              {cat.charAt(0).toUpperCase() + cat.slice(1).replace('-', ' ')}
            </button>
          ))}
        </div>
      </div>

      {error && <ErrorState message={errorMessage(error)} onRetry={refetch} />}

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <CardSkeleton key={i} lines={3} />
          ))}
        </div>
      )}

      {!isLoading && !error && isEmpty && (
        <EmptyState
          icon={MessageSquare}
          title={category === 'All' && !debounced ? "No discussions yet" : "No discussions found"}
          description={category === 'All' && !debounced ? "Start the first discussion in the community." : "Try adjusting your search or category filter."}
        />
      )}

      {!isLoading && !error && !isEmpty && (
        <div className="space-y-3">
          {data.pages.map((page, i) => (
            <Fragment key={i}>
              {page.data.map((discussion) => (
                <DiscussionCard key={discussion.id} discussion={discussion} />
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
        <DiscussionComposer
          open={composerOpen}
          onClose={() => setComposerOpen(false)}
        />
      )}
    </div>
  );
}
