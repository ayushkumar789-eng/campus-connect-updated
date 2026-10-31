import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  ArrowLeft,
  MoreHorizontal,
  ChevronUp,
  ChevronDown,
  Eye,
  Clock
} from 'lucide-react';
import { Card, Badge } from '../../../shared/ui/Card.jsx';
import { Avatar } from '../../../shared/ui/Avatar.jsx';
import { Dropdown } from '../../../shared/ui/Dropdown.jsx';
import { ErrorState } from '../../../shared/ui/States.jsx';
import { DiscussionComments } from '../components/DiscussionComments.jsx';
import { DiscussionComposer } from '../components/DiscussionComposer.jsx';
import {
  useDiscussion,
  useDeleteDiscussion,
  useVoteDiscussion,
} from '../../../shared/hooks/useData.js';
import { useAuthStore } from '../../auth/hooks/useAuthStore.js';
import { compactNumber, timeAgo, linkify } from '../../../shared/utils/format.js';
import { errorMessage } from '../../../shared/api/client.js';

function DiscussionBody({ content }) {
  if (!content) return null;
  return (
    <div className="prose prose-sm max-w-none dark:prose-invert">
      <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-ink">
        {linkify(content).map((part, i) => {
          if (part.type === 'tag') {
            return <span key={i} className="font-medium text-accent">{part.value}</span>;
          }
          if (part.type === 'link') {
            return (
              <a
                key={i}
                href={part.value.startsWith('http') ? part.value : `https://${part.value}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent underline underline-offset-2 hover:no-underline"
              >
                {part.value}
              </a>
            );
          }
          return <span key={i}>{part.value}</span>;
        })}
      </p>
    </div>
  );
}

export default function DiscussionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  
  const { data: discussion, isLoading, error, refetch } = useDiscussion(id);
  const deleteMutation = useDeleteDiscussion();
  const voteMutation = useVoteDiscussion();

  const [composerOpen, setComposerOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-4 pb-12 animate-pulse">
        <div className="h-8 w-1/4 rounded bg-surface-2"></div>
        <Card className="h-64 p-4"></Card>
      </div>
    );
  }

  if (error || !discussion) {
    return <ErrorState message={errorMessage(error) || 'Discussion not found'} onRetry={refetch} />;
  }

  const isOwner = user?.id === (discussion.author?.id ?? discussion.author);
  const isAdmin = user?.role === 'admin';
  const hasUpvoted = discussion.viewerVote === 1;
  const hasDownvoted = discussion.viewerVote === -1;

  const handleVote = (value) => {
    if (!user) return;
    voteMutation.mutate({ id: discussion.id, value });
  };

  const handleDelete = () => {
    if (window.confirm('Are you sure you want to delete this discussion?')) {
      deleteMutation.mutate(discussion.id, {
        onSuccess: () => navigate('/discussions'),
      });
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-12">
      <div>
        <button
          onClick={() => navigate(-1)}
          className="group flex items-center gap-1.5 text-[13.5px] font-medium text-ink-3 hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
          Back
        </button>
      </div>

      <Card className="p-4 sm:p-6">
        <div className="flex gap-4 sm:gap-6">
          {/* Voting Column */}
          <div className="hidden sm:flex shrink-0 flex-col items-center gap-2">
            <button
              onClick={() => handleVote(1)}
              className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
                hasUpvoted ? 'bg-accent/10 text-accent' : 'bg-surface-2 text-ink-3 hover:bg-surface-3 hover:text-ink'
              }`}
            >
              <ChevronUp className="h-7 w-7" />
            </button>
            <span className={`text-base font-semibold ${hasUpvoted ? 'text-accent' : hasDownvoted ? 'text-red-500' : 'text-ink'}`}>
              {compactNumber(discussion.score)}
            </span>
            <button
              onClick={() => handleVote(-1)}
              className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
                hasDownvoted ? 'bg-red-500/10 text-red-500' : 'bg-surface-2 text-ink-3 hover:bg-surface-3 hover:text-ink'
              }`}
            >
              <ChevronDown className="h-7 w-7" />
            </button>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-4">
              <h1 className="text-xl font-bold tracking-[-0.02em] text-ink sm:text-2xl">
                {discussion.title}
              </h1>
              
              {(isOwner || isAdmin) && (
                <Dropdown
                  trigger={
                    <button className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink">
                      <MoreHorizontal className="h-5 w-5" />
                    </button>
                  }
                  items={[
                    isOwner && {
                      label: 'Edit',
                      onClick: () => setComposerOpen(true),
                    },
                    (isOwner || isAdmin) && {
                      label: 'Delete',
                      danger: true,
                      onClick: handleDelete,
                    }
                  ].filter(Boolean)}
                />
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-ink-3">
              <Badge size="sm" tone="accent">{discussion.category}</Badge>
              {discussion.tags?.map(t => (
                <Badge key={t} size="sm">#{t}</Badge>
              ))}
              
              {discussion.group && (
                <span className="font-medium">
                  in Group Discussion
                </span>
              )}
            </div>

            <div className="mt-4 flex items-center gap-3 border-y border-line py-3">
              <Link to={`/u/${discussion.author?.username}`}>
                <Avatar user={discussion.author} size="sm" />
              </Link>
              <div className="flex flex-col">
                <Link to={`/u/${discussion.author?.username}`} className="text-[13.5px] font-semibold text-ink hover:underline">
                  {discussion.author?.name}
                </Link>
                <div className="flex items-center gap-2 text-[12px] text-ink-3">
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {timeAgo(discussion.createdAt)}</span>
                  <span>·</span>
                  <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> {compactNumber(discussion.viewCount)} views</span>
                </div>
              </div>
            </div>

            <div className="mt-6">
              <DiscussionBody content={discussion.body} />
            </div>

            {/* Mobile Voting */}
            <div className="mt-6 flex items-center gap-3 sm:hidden">
              <div className="flex items-center rounded-full bg-surface-2">
                <button
                  onClick={() => handleVote(1)}
                  className={`flex h-9 w-10 items-center justify-center rounded-l-full transition-colors ${
                    hasUpvoted ? 'text-accent' : 'text-ink-3 hover:text-ink'
                  }`}
                >
                  <ChevronUp className="h-6 w-6" />
                </button>
                <span className={`px-2 text-[13.5px] font-semibold ${hasUpvoted ? 'text-accent' : hasDownvoted ? 'text-red-500' : 'text-ink'}`}>
                  {compactNumber(discussion.score)}
                </span>
                <button
                  onClick={() => handleVote(-1)}
                  className={`flex h-9 w-10 items-center justify-center rounded-r-full transition-colors ${
                    hasDownvoted ? 'text-red-500' : 'text-ink-3 hover:text-ink'
                  }`}
                >
                  <ChevronDown className="h-6 w-6" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <div>
        <div className="mb-4 flex items-center gap-2">
          <h2 className="text-lg font-bold text-ink">Comments</h2>
          <Badge size="sm" tone="neutral">{compactNumber(discussion.commentCount)}</Badge>
        </div>
        
        <DiscussionComments 
          discussionId={discussion.id} 
          isDiscussionOwner={isOwner} 
        />
      </div>

      {composerOpen && (
        <DiscussionComposer
          open={composerOpen}
          onClose={() => setComposerOpen(false)}
          discussionToEdit={discussion}
        />
      )}
    </div>
  );
}
