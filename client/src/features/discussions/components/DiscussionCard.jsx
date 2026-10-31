import { Link } from 'react-router-dom';
import { MessageSquare, CheckCircle2, ChevronUp, ChevronDown } from 'lucide-react';
import { Card, Badge } from '../../../shared/ui/Card.jsx';
import { Avatar } from '../../../shared/ui/Avatar.jsx';
import { compactNumber, timeAgo } from '../../../shared/utils/format.js';
import { useVoteDiscussion } from '../../../shared/hooks/useData.js';
import { useAuthStore } from '../../auth/hooks/useAuthStore.js';

export function DiscussionCard({ discussion, hideAuthor = false }) {
  const { user } = useAuthStore();
  const voteMutation = useVoteDiscussion();

  const handleVote = (e, value) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) return; // Optional: prompt login
    voteMutation.mutate({ id: discussion.id, value });
  };

  const hasUpvoted = discussion.viewerVote === 1;
  const hasDownvoted = discussion.viewerVote === -1;

  return (
    <Card className="p-4 transition-colors hover:border-line-strong">
      <div className="flex gap-4">
        {/* Voting controls */}
        <div className="flex shrink-0 flex-col items-center gap-1">
          <button
            type="button"
            onClick={(e) => handleVote(e, 1)}
            disabled={voteMutation.isPending}
            className={`flex h-8 w-8 items-center justify-center rounded transition-colors ${
              hasUpvoted ? 'bg-accent/10 text-accent' : 'text-ink-3 hover:bg-surface-2 hover:text-ink'
            }`}
          >
            <ChevronUp className="h-6 w-6" />
          </button>
          <span className={`text-[13.5px] font-medium ${hasUpvoted ? 'text-accent' : hasDownvoted ? 'text-red-500' : 'text-ink-2'}`}>
            {compactNumber(discussion.score)}
          </span>
          <button
            type="button"
            onClick={(e) => handleVote(e, -1)}
            disabled={voteMutation.isPending}
            className={`flex h-8 w-8 items-center justify-center rounded transition-colors ${
              hasDownvoted ? 'bg-red-500/10 text-red-500' : 'text-ink-3 hover:bg-surface-2 hover:text-ink'
            }`}
          >
            <ChevronDown className="h-6 w-6" />
          </button>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <Link to={`/discussions/${discussion.id}`} className="group min-w-0">
                <h3 className="text-base font-semibold text-ink group-hover:underline">
                  {discussion.title}
                </h3>
              </Link>
              {discussion.body && (
                <p className="mt-1 line-clamp-2 text-[13.5px] leading-relaxed text-ink-2">
                  {discussion.body}
                </p>
              )}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <Badge size="sm" tone="accent">{discussion.category}</Badge>
            {discussion.tags?.map(t => (
              <Badge key={t} size="sm">#{t}</Badge>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px] text-ink-3">
            {!hideAuthor && discussion.author && (
              <Link to={`/u/${discussion.author.username}`} className="flex items-center gap-1.5 hover:text-ink">
                <Avatar user={discussion.author} size="xs" />
                <span className="truncate max-w-[120px] font-medium">{discussion.author.name}</span>
              </Link>
            )}
            
            <Link to={`/discussions/${discussion.id}`} className="flex items-center gap-1.5 hover:text-ink">
              <MessageSquare className="h-3.5 w-3.5" aria-hidden />
              <span>{compactNumber(discussion.commentCount)}</span>
            </Link>

            {discussion.isAnswered && (
              <div className="flex items-center gap-1 text-green-600">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Answered</span>
              </div>
            )}

            <span>{timeAgo(discussion.createdAt)}</span>
          </div>
        </div>
      </div>
    </Card>
  );
}
