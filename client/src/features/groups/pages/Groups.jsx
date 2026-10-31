import { useState, useRef, useEffect, Fragment } from 'react';
import { Search as SearchIcon, Users, Loader2, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../../../shared/ui/Card.jsx';
import { Button } from '../../../shared/ui/Button.jsx';
import { Modal } from '../../../shared/ui/Modal.jsx';
import { EmptyState, ErrorState, CardSkeleton } from '../../../shared/ui/States.jsx';
import { GroupCard } from '../components/GroupCard.jsx';
import { GroupForm } from '../components/GroupForm.jsx';
import { useDebounce } from '../../../shared/hooks/useDebounce.js';
import { useGroups, useCreateGroup } from '../../../shared/hooks/useData.js';
import { errorMessage } from '../../../shared/api/client.js';

const GROUP_CATEGORIES = [
  'All',
  'general',
  'course',
  'subject',
  'placement',
  'development',
  'photography',
  'events',
];

export default function Groups() {
  const navigate = useNavigate();
  const [term, setTerm] = useState('');
  const [category, setCategory] = useState('All');
  const [createOpen, setCreateOpen] = useState(false);
  const createGroup = useCreateGroup();

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
  } = useGroups(queryParams);

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
          <h1 className="text-xl font-bold tracking-[-0.02em] text-ink">Groups & Communities</h1>
          <p className="mt-0.5 text-[14px] text-ink-2">
            Join groups to collaborate, discuss, and learn together.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="shrink-0 gap-1.5">
          <Plus className="h-4 w-4" aria-hidden />
          Create Group
        </Button>
      </div>

      <Card className="p-3">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <input
            type="search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search groups by name, description, or tags…"
            aria-label="Search groups"
            className="h-10 w-full rounded-md border border-line bg-surface-2 pr-3 pl-9 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/25"
          />
        </div>
      </Card>

      <div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {GROUP_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={`shrink-0 rounded-md border px-2.5 py-1 text-[12.5px] font-medium transition-colors capitalize ${
                category === cat
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-line text-ink-3 hover:border-line-strong hover:text-ink'
              }`}
            >
              {cat}
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
          icon={Users}
          title={category === 'All' && !debounced ? "No groups yet" : "No groups found"}
          description={category === 'All' && !debounced ? "Groups and communities will appear here." : "Try adjusting your search or category filter."}
        />
      )}

      {!isLoading && !error && !isEmpty && (
        <div className="space-y-3">
          {data.pages.map((page, i) => (
            <Fragment key={i}>
              {page.data.map((group) => (
                <GroupCard key={group.id} group={group} />
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

      <Modal
        open={createOpen}
        onClose={() => !createGroup.isPending && setCreateOpen(false)}
        title="Create Group"
        description="Start a new community or study group."
      >
        <GroupForm
          isSubmitting={createGroup.isPending}
          onSubmit={(formData) => {
            createGroup.mutate(formData, {
              onSuccess: (res) => {
                setCreateOpen(false);
                if (res.data?.id) {
                  navigate(`/groups/${res.data.id}`);
                }
              },
            });
          }}
        />
      </Modal>
    </div>
  );
}
