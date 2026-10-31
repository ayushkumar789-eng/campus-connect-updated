import { useState, useRef, useEffect, Fragment } from 'react';
import { useForm } from 'react-hook-form';
import { Loader2, Reply, MoreHorizontal, CheckCircle2, ChevronUp, ChevronDown } from 'lucide-react';
import { Card } from '../../../shared/ui/Card.jsx';
import { Button } from '../../../shared/ui/Button.jsx';
import { Avatar } from '../../../shared/ui/Avatar.jsx';
import { Dropdown } from '../../../shared/ui/Dropdown.jsx';
import { Textarea } from '../../../shared/ui/Input.jsx';
import { timeAgo, linkify, compactNumber } from '../../../shared/utils/format.js';
import {
  useDiscussionComments,
  useCreateDiscussionComment,
  useUpdateDiscussionComment,
  useDeleteDiscussionComment,
  useVoteDiscussionComment,
  useMarkDiscussionAnswer,
} from '../../../shared/hooks/useData.js';
import { useAuthStore } from '../../auth/hooks/useAuthStore.js';

function CommentBody({ content }) {
  if (!content) return null;
  return (
    <p className="whitespace-pre-wrap break-words text-[14.5px] leading-relaxed text-ink">
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
  );
}

function CommentItem({ comment, discussionId, isDiscussionOwner, onReply }) {
  const { user } = useAuthStore();
  const [isEditing, setIsEditing] = useState(false);
  
  const voteMutation = useVoteDiscussionComment();
  const markAnswerMutation = useMarkDiscussionAnswer();
  const deleteMutation = useDeleteDiscussionComment();
  const updateMutation = useUpdateDiscussionComment();

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({
    defaultValues: { body: comment.body },
  });

  const isOwner = user?.id === (comment.author?.id ?? comment.author);
  const isAdmin = user?.role === 'admin';

  const handleVote = (value) => {
    if (!user) return;
    voteMutation.mutate({ id: comment.id, discussionId, value });
  };

  const onUpdate = (data) => {
    updateMutation.mutate(
      { id: comment.id, payload: { body: data.body.trim() } },
      { onSuccess: () => setIsEditing(false) }
    );
  };

  return (
    <div className={`flex gap-3 pt-4 ${comment.isAnswer ? 'rounded-lg bg-green-50/50 p-4 dark:bg-green-900/10' : ''}`}>
      <div className="flex shrink-0 flex-col items-center gap-1">
        <Avatar user={comment.author} size="sm" />
        <div className="mt-2 flex flex-col items-center gap-1">
          <button
            type="button"
            onClick={() => handleVote(1)}
            className={`flex h-6 w-6 items-center justify-center rounded transition-colors ${
              comment.viewerVote === 1 ? 'bg-accent/10 text-accent' : 'text-ink-3 hover:bg-surface-2 hover:text-ink'
            }`}
          >
            <ChevronUp className="h-4 w-4" />
          </button>
          <span className={`text-[12px] font-medium ${comment.viewerVote === 1 ? 'text-accent' : comment.viewerVote === -1 ? 'text-red-500' : 'text-ink-2'}`}>
            {compactNumber(comment.score)}
          </span>
          <button
            type="button"
            onClick={() => handleVote(-1)}
            className={`flex h-6 w-6 items-center justify-center rounded transition-colors ${
              comment.viewerVote === -1 ? 'bg-red-500/10 text-red-500' : 'text-ink-3 hover:bg-surface-2 hover:text-ink'
            }`}
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
      </div>
      
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[13px]">
            <span className="font-semibold text-ink">{comment.author?.name}</span>
            <span className="text-ink-3">·</span>
            <span className="text-ink-3">{timeAgo(comment.createdAt)}</span>
            {comment.isAnswer && (
              <>
                <span className="text-ink-3">·</span>
                <span className="flex items-center gap-1 font-medium text-green-600">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Accepted Answer
                </span>
              </>
            )}
          </div>
          
          {(isOwner || isAdmin || isDiscussionOwner) && (
            <Dropdown
              trigger={
                <button type="button" className="p-1 text-ink-3 hover:text-ink">
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              }
              items={[
                isDiscussionOwner && !comment.isAnswer && {
                  label: 'Mark as Answer',
                  onClick: () => markAnswerMutation.mutate({ discussionId, commentId: comment.id }),
                },
                isOwner && {
                  label: 'Edit',
                  onClick: () => setIsEditing(true),
                },
                (isOwner || isAdmin) && {
                  label: 'Delete',
                  danger: true,
                  onClick: () => {
                    if (window.confirm('Delete this comment?')) {
                      deleteMutation.mutate({ id: comment.id, discussionId });
                    }
                  },
                },
              ].filter(Boolean)}
            />
          )}
        </div>

        <div className="mt-1">
          {isEditing ? (
            <form onSubmit={handleSubmit(onUpdate)} className="mt-2 space-y-2">
              <Textarea
                {...register('body', { required: 'Cannot be empty' })}
                error={errors.body?.message}
                rows={3}
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => { setIsEditing(false); reset(); }}>Cancel</Button>
                <Button size="sm" type="submit" disabled={isSubmitting}>Save</Button>
              </div>
            </form>
          ) : (
            <CommentBody content={comment.body} />
          )}
        </div>

        <div className="mt-2">
          <button
            type="button"
            onClick={() => onReply(comment)}
            className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink-3 hover:text-ink"
          >
            <Reply className="h-3.5 w-3.5" />
            Reply
          </button>
        </div>
      </div>
    </div>
  );
}

export function DiscussionComments({ discussionId, isDiscussionOwner }) {
  const { data, hasNextPage, fetchNextPage, isFetchingNextPage, isLoading } = useDiscussionComments(discussionId);
  const createMutation = useCreateDiscussionComment();
  const [replyTo, setReplyTo] = useState(null);

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({
    defaultValues: { body: '' }
  });

  const onSubmit = (formData) => {
    const payload = { body: formData.body.trim() };
    if (replyTo) {
      payload.parent = replyTo.id;
    }
    createMutation.mutate(
      { discussionId, payload },
      {
        onSuccess: () => {
          reset();
          setReplyTo(null);
        }
      }
    );
  };

  const sentinelRef = useRef(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isFetchingNextPage) fetchNextPage();
      },
      { rootMargin: '200px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // For a production app, we would build a tree of comments based on the `parent` field here.
  // For now, we will render them flatly with an indication of who they are replying to, 
  // or a shallow nested structure. We will keep it simple and flat as requested to avoid recursive rendering overheads,
  // but logically linked by the backend.

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <h3 className="text-sm font-semibold text-ink">Add a Comment</h3>
        
        {replyTo && (
          <div className="mt-3 flex items-center justify-between rounded bg-surface-2 px-3 py-2 text-[13px]">
            <span className="text-ink-2">
              Replying to <span className="font-medium text-ink">{replyTo.author?.name}</span>
            </span>
            <button type="button" onClick={() => setReplyTo(null)} className="text-ink-3 hover:text-ink">
              Cancel
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="mt-3">
          <Textarea
            placeholder="Write your comment..."
            rows={3}
            error={errors.body?.message}
            {...register('body', { required: 'Comment cannot be empty', maxLength: { value: 8000, message: 'Too long' } })}
          />
          <div className="mt-3 flex justify-end">
            <Button type="submit" disabled={isSubmitting || createMutation.isPending}>
              {createMutation.isPending ? 'Posting...' : 'Post Comment'}
            </Button>
          </div>
        </form>
      </Card>

      <div className="space-y-4">
        {data?.pages.map((page, i) => (
          <Fragment key={i}>
            {page.data.map((comment) => (
              <CommentItem
                key={comment.id}
                comment={comment}
                discussionId={discussionId}
                isDiscussionOwner={isDiscussionOwner}
                onReply={setReplyTo}
              />
            ))}
          </Fragment>
        ))}

        {isLoading && (
          <div className="flex justify-center p-4">
            <Loader2 className="h-6 w-6 animate-spin text-ink-3" />
          </div>
        )}

        {hasNextPage && (
          <div ref={sentinelRef} className="flex justify-center p-4">
            <Loader2 className="h-6 w-6 animate-spin text-ink-3" />
          </div>
        )}
      </div>
    </div>
  );
}
