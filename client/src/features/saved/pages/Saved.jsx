import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Bookmark } from 'lucide-react';
import { PostCard } from '../../posts/components/PostCard.jsx';
import { CommentsPanel } from '../../comments/components/CommentsPanel.jsx';
import { FeedSkeleton, EmptyState, ErrorState } from '../../../shared/ui/States.jsx';
import { Button } from '../../../shared/ui/Button.jsx';
import { useSavedPosts } from '../../../shared/hooks/useData.js';
import { errorMessage } from '../../../shared/api/client.js';
import { postsApi } from '../../posts/index.js';
import { toast } from '../../../shared/ui/Toast.jsx';

/**
 * The signed-in user's bookmarks. Shares the `posts/saved` cache key with the
 * Saved tab on the profile page, so saving from the feed updates both.
 */
export default function Saved() {
  const [activePost, setActivePost] = useState(null);
  const [votingId, setVotingId] = useState(null);

  const { data, error, isLoading, isFetchingNextPage, fetchNextPage, hasNextPage, refetch } = useSavedPosts();
  const posts = data?.pages?.flatMap((p) => p.data) ?? [];

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
      refetch();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not record your vote.'));
    } finally {
      setVotingId(null);
    }
  };

  return (
    <div className="space-y-4 pb-4">
      <div>
        <h1 className="text-xl font-bold tracking-[-0.02em] text-ink">Saved</h1>
        <p className="mt-0.5 text-[14px] text-ink-2">
          Posts and resources you bookmarked. Only you can see this list.
        </p>
      </div>

      {isLoading ? (
        <FeedSkeleton />
      ) : error ? (
        <ErrorState message={errorMessage(error)} onRetry={refetch} />
      ) : posts.length === 0 ? (
        <EmptyState
          icon={Bookmark}
          title="Nothing saved yet"
          description="Tap the bookmark icon on any post to keep it here for later — handy for notes links and exam resources."
          action={<Link to="/home"><Button>Back to feed</Button></Link>}
        />
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
        </div>
      )}

      {activePost && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-ink/40"
            onClick={() => setActivePost(null)}
            role="button"
            tabIndex={-1}
            aria-label="Close comments"
          />
          <div className="relative z-10 h-full w-full border-l border-line shadow-overlay sm:max-w-md">
            <CommentsPanel post={activePost} onClose={() => setActivePost(null)} />
          </div>
        </div>
      )}
    </div>
  );
}
