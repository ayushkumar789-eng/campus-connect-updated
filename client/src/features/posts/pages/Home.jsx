import { useEffect, useRef, useState } from 'react';
import { Users, Globe, Loader2 } from 'lucide-react';
import { Composer } from '../components/Composer.jsx';
import { PostCard } from '../components/PostCard.jsx';
import { CommentsPanel } from '../../comments/components/CommentsPanel.jsx';
import { FeedSkeleton, EmptyState, ErrorState } from '../../../shared/ui/States.jsx';
import { Avatar } from '../../../shared/ui/Avatar.jsx';
import { Button } from '../../../shared/ui/Button.jsx';
import { useFeed, useSuggestedUsers, useFollow } from '../../../shared/hooks/useData.js';
import { postsApi } from '../index.js';
import { errorMessage } from '../../../shared/api/client.js';
import { toast } from '../../../shared/ui/Toast.jsx';
import { useAuthStore } from '../../auth/hooks/useAuthStore.js';
import { useUIStore } from '../../../app/store/uiStore.js';
import { classNames, yearOfStudy } from '../../../shared/utils/format.js';

/** "Follow these students" card shown when a new account has an empty feed. */
function EmptyFollowingFeed({ onBrowse }) {
  const { data: suggested, isLoading } = useSuggestedUsers();
  const follow = useFollow();

  return (
    <div className="rounded-lg border border-line bg-surface p-5 shadow-card">
      <h2 className="text-[16px] font-semibold text-ink">Your feed is quiet</h2>
      <p className="mt-1 text-[14px] text-ink-2">
        Follow a few students and their posts will show up here. Try these from your campus.
      </p>

      <div className="mt-4 space-y-2">
        {isLoading
          ? [0, 1, 2].map((i) => <div key={i} className="skeleton h-14 rounded-lg" />)
          : suggested?.map((s) => (
              <div key={s.id} className="flex items-center gap-3 rounded-lg border border-line p-3">
                <Avatar user={s} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold text-ink">{s.name}</p>
                  <p className="truncate text-[12.5px] text-ink-3">
                    @{s.username} · {[s.course, yearOfStudy(s.year)].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  loading={follow.isPending && follow.variables?.id === s.id}
                  onClick={() => follow.mutate({ id: s.id, isFollowing: false })}
                >
                  Follow
                </Button>
              </div>
            ))}
      </div>

      <Button variant="secondary" className="mt-4 w-full" onClick={onBrowse}>
        Browse everyone instead
      </Button>
    </div>
  );
}

export default function Home() {
  const [scope, setScope] = useState('following');
  const [activePost, setActivePost] = useState(null);
  const [votingId, setVotingId] = useState(null);
  const user = useAuthStore((s) => s.user);
  const openComposer = useUIStore((s) => s.openComposer);

  const { data, error, isLoading, isFetchingNextPage, fetchNextPage, hasNextPage, refetch, isRefetching } =
    useFeed(scope);

  const posts = data?.pages?.flatMap((p) => p.data) ?? [];

  // Infinite scroll via IntersectionObserver, which is cheaper than a scroll
  // listener and never fires after unmount.
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

  const handleVote = async (postId, optionId) => {
    setVotingId(postId);
    try {
      await postsApi.vote(postId, optionId);
      // Poll tallies are server-computed, so refetch rather than guess.
      refetch();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not record your vote.'));
    } finally {
      setVotingId(null);
    }
  };

  return (
    <div className="space-y-4 pb-4">
      {/* Scope toggle */}
      <div className="sticky top-14 z-20 -mx-4 border-b border-line bg-canvas/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="mx-auto flex w-full max-w-2xl gap-1 rounded-lg border border-line bg-surface p-1">
          {[
            { key: 'following', label: 'Following', icon: Users },
            { key: 'all', label: 'All posts', icon: Globe },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setScope(tab.key)}
              className={classNames(
                'flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-[13.5px] font-medium transition-colors',
                scope === tab.key ? 'bg-accent-soft text-accent' : 'text-ink-3 hover:text-ink',
              )}
            >
              <tab.icon className="h-4 w-4" aria-hidden />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <Composer />

      {isLoading ? (
        <FeedSkeleton />
      ) : error ? (
        <ErrorState message={errorMessage(error)} onRetry={refetch} />
      ) : posts.length === 0 ? (
        scope === 'following' ? (
          <EmptyFollowingFeed onBrowse={() => setScope('all')} />
        ) : (
          <EmptyState
            title="No posts yet"
            description="Nobody on campus has posted anything. Be the first — your batch is waiting."
            action={<Button onClick={openComposer}>Write the first post</Button>}
          />
        )
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onOpenComments={setActivePost}
              onVote={handleVote}
              isVoting={votingId === post.id}
            />
          ))}

          {hasNextPage && (
            <div ref={sentinelRef} className="flex justify-center py-4">
              {isFetchingNextPage ? (
                <span className="inline-flex items-center gap-2 text-[13px] text-ink-3">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading more
                </span>
              ) : (
                <Button variant="secondary" size="sm" onClick={() => fetchNextPage()}>
                  Load more
                </Button>
              )}
            </div>
          )}

          {!hasNextPage && posts.length > 0 && (
            <p className="py-6 text-center text-[13px] text-ink-3">
              You are all caught up{scope === 'following' ? ' with the students you follow' : ''}.
            </p>
          )}
        </div>
      )}

      {isRefetching && !isLoading && (
        <span className="sr-only" role="status">
          Refreshing feed
        </span>
      )}

      {/* Comments open as a side drawer on desktop and a full sheet on mobile. */}
      {activePost && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setActivePost(null)} role="button" tabIndex={-1} aria-label="Close comments" />
          <div className="relative z-10 h-full w-full border-l border-line shadow-overlay sm:max-w-md">
            <CommentsPanel post={activePost} onClose={() => setActivePost(null)} />
          </div>
        </div>
      )}

      {!user?.profileCompleted && (
        <p className="text-center text-[13px] text-ink-3">
          Tip: add your course and year so classmates can find you.
        </p>
      )}
    </div>
  );
}
