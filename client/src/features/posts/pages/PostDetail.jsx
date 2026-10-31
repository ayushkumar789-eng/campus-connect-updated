import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { PostCard } from '../components/PostCard.jsx';
import { CommentsPanel } from '../../comments/components/CommentsPanel.jsx';
import { PostSkeleton, ErrorState } from '../../../shared/ui/States.jsx';
import { usePost } from '../../../shared/hooks/useData.js';
import { errorMessage } from '../../../shared/api/client.js';
import { postsApi } from '../index.js';
import { toast } from '../../../shared/ui/Toast.jsx';

/**
 * A single post with its comment thread inline.
 *
 * This is the page a shared link lands on, so it must degrade well: a deleted
 * post and a network failure both render an explicit message with a way out
 * rather than an empty shell.
 */
export default function PostDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [isVoting, setIsVoting] = useState(false);

  const { data: post, error, isLoading, refetch, isError } = usePost(id);

  const handleVote = async (postId, optionId) => {
    setIsVoting(true);
    try {
      await postsApi.vote(postId, optionId);
      refetch();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not record your vote.'));
    } finally {
      setIsVoting(false);
    }
  };

  if (isLoading) return <PostSkeleton />;

  // A 404 is a normal outcome, not a failure — give it its own copy.
  if (isError && error?.response?.status === 404) {
    return (
      <div className="space-y-4">
        <BackLink onBack={() => navigate(-1)} />
        <ErrorState
          title="This post is no longer available"
          message="It may have been deleted by its author, or the link could be out of date."
          onRetry={() => navigate('/home')}
        >
          <Link to="/home" className="text-[13.5px] font-medium text-accent hover:underline">
            Go to the feed
          </Link>
        </ErrorState>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <BackLink onBack={() => navigate(-1)} />
        <ErrorState message={errorMessage(error)} onRetry={refetch} />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-4">
      <BackLink onBack={() => navigate(-1)} />

      <PostCard post={post} onVote={handleVote} isVoting={isVoting} />

      {/* A fixed max-height keeps the composer reachable without the page
          scrolling away underneath the comment list. */}
      <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-card">
        <CommentsPanel post={post} hideHeader className="max-h-[70vh]" />
      </div>
    </div>
  );
}

function BackLink({ onBack }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-ink-2 transition-colors hover:text-ink"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden /> Back
    </button>
  );
}
