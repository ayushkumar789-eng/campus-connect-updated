import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Trash2, CornerDownRight } from 'lucide-react';
import { Avatar } from '../../../shared/ui/Avatar.jsx';
import { Button } from '../../../shared/ui/Button.jsx';
import { postsApi } from '../../posts/index.js';
import { errorMessage } from '../../../shared/api/client.js';
import { toast } from '../../../shared/ui/Toast.jsx';
import { useAddComment, useComments, keys } from '../../../shared/hooks/useData.js';
import { useAuthStore } from '../../auth/hooks/useAuthStore.js';
import { compactNumber, timeAgo, classNames } from '../../../shared/utils/format.js';

function CommentItem({ comment, onReply, onDelete, depth = 0 }) {
  return (
    <div className={classNames('flex gap-2.5', depth > 0 && 'ml-8 mt-3')}>
      <Link to={`/u/${comment.author?.username}`} className="shrink-0">
        <Avatar user={comment.author} size={depth > 0 ? 'xs' : 'sm'} />
      </Link>

      <div className="min-w-0 flex-1">
        <div className="rounded-lg bg-surface-2 px-3 py-2">
          <div className="flex items-baseline gap-2">
            <Link to={`/u/${comment.author?.username}`} className="text-[13px] font-semibold text-ink hover:underline">
              {comment.author?.name}
            </Link>
            <span className="text-[11.5px] text-ink-3">@{comment.author?.username}</span>
            <span className="ml-auto shrink-0 text-[11.5px] text-ink-3">{timeAgo(comment.createdAt)}</span>
          </div>

          <p className="mt-0.5 whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-ink">{comment.content}</p>
        </div>

        <div className="mt-1 flex items-center gap-2 pl-1">
          {/* Threads are two levels deep. The server refuses a reply to a reply
              (such a comment could never be read back), so offering the button
              here would only lead to a dead end. */}
          {depth === 0 && (
            <button
              type="button"
              onClick={() => onReply?.(comment)}
              className="inline-flex items-center gap-1 text-[12px] font-medium text-ink-3 transition-colors hover:text-accent"
            >
              <CornerDownRight className="h-3 w-3" aria-hidden /> Reply
            </button>
          )}
          {comment.isOwner && (
            <button
              type="button"
              onClick={() => onDelete(comment)}
              className="inline-flex items-center gap-1 text-[12px] font-medium text-ink-3 transition-colors hover:text-danger"
            >
              <Trash2 className="h-3 w-3" aria-hidden /> Delete
            </button>
          )}
        </div>

        {comment.replies?.map((reply) => (
          <CommentItem key={reply.id} comment={reply} onReply={onReply} onDelete={onDelete} depth={depth + 1} />
        ))}
      </div>
    </div>
  );
}

/**
 * Comment thread for a post. Rendered as a drawer from the feed, and inline on
 * the post detail page (`hideHeader` drops the drawer chrome and close button).
 */
export function CommentsPanel({ post, onClose, hideHeader = false, className }) {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState(null);

  const { data, isLoading, isFetchingNextPage, fetchNextPage, hasNextPage } = useComments(post.id);
  const addComment = useAddComment(post.id);

  const comments = data?.pages?.flatMap((p) => p.data) ?? [];

  /**
   * The header tally, tracked here rather than read off `post.commentCount`.
   *
   * In the three drawers the parent snapshots the post object into state at the
   * moment the panel opens and hands that frozen copy down, so the count went
   * stale the instant you posted a comment from inside the panel: the list
   * gained an entry, the header kept claiming the old number, and it stayed
   * wrong until you closed and reopened. A tally that disagrees with the list
   * directly beneath it is worse than no tally.
   *
   * Every path that changes the count already runs through this component —
   * adding here, deleting below — so tracking it here is exact rather than a
   * second source of truth to keep in sync. The prop seeds it, and the only
   * cost is that the panel must not outlive its post; the drawers unmount on
   * close, and the post detail page renders a single post.
   */
  const [commentCount, setCommentCount] = useState(post.commentCount ?? 0);

  const submit = async (event) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content) return;

    try {
      await addComment.mutateAsync({ content, parent: replyTo?.id ?? null });
      setCommentCount((n) => n + 1);
      setDraft('');
      setReplyTo(null);
    } catch {
      // The mutation already surfaced a toast.
    }
  };

  const handleDelete = async (comment) => {
    if (!window.confirm('Delete this comment? Replies to it will be removed too.')) return;
    try {
      await postsApi.deleteComment(comment.id);
      toast.success('Comment deleted');
      // The server drops the comment *and* its replies, and decrements the post
      // by the same total, so the header has to move by the same number.
      setCommentCount((n) => Math.max(0, n - (1 + (comment.replyCount ?? 0))));
      // Replies cascade, so refetch the thread and the post counters.
      queryClient.invalidateQueries({ queryKey: keys.comments(post.id) });
      queryClient.invalidateQueries({ queryKey: keys.post(post.id) });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    } catch (err) {
      toast.error(errorMessage(err, 'Could not delete that comment.'));
    }
  };

  return (
    <div className={classNames('flex h-full flex-col bg-surface', className)}>
      {!hideHeader && (
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
          <h2 className="text-[15px] font-semibold text-ink">
            Comments{commentCount ? ` · ${compactNumber(commentCount)}` : ''}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close comments"
            className="rounded-md p-1.5 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
          >
            ✕
          </button>
        </header>
      )}

      {hideHeader && (
        <h2 className="shrink-0 border-b border-line px-4 py-3 text-[15px] font-semibold text-ink">
          Comments{commentCount ? ` · ${compactNumber(commentCount)}` : ''}
        </h2>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {isLoading ? (
          <div className="space-y-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex gap-2.5">
                <div className="skeleton h-9 w-9 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-8 w-full rounded-lg" />
                  <div className="skeleton h-3 w-24" />
                </div>
              </div>
            ))}
          </div>
        ) : comments.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm font-medium text-ink">No comments yet</p>
            <p className="mt-1 text-[13px] text-ink-3">Be the first to reply.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {comments.map((comment) => (
              <CommentItem key={comment.id} comment={comment} onReply={setReplyTo} onDelete={handleDelete} />
            ))}

            {hasNextPage && (
              <Button
                variant="secondary"
                size="sm"
                className="w-full"
                loading={isFetchingNextPage}
                onClick={() => fetchNextPage()}
              >
                Load more comments
              </Button>
            )}
          </div>
        )}
      </div>

      <form onSubmit={submit} className="shrink-0 border-t border-line bg-surface p-3">
        {replyTo && (
          <div className="mb-2 flex items-center justify-between rounded-md bg-surface-2 px-2.5 py-1.5 text-[12.5px] text-ink-2">
            <span>
              Replying to <strong>{replyTo.author?.name}</strong>
            </span>
            <button
              type="button"
              onClick={() => setReplyTo(null)}
              // The only content is the ✕ glyph, which some screen readers
              // announce as "times" or skip entirely. Every other icon-only
              // control in this panel carries a label, so this one did too.
              aria-label="Cancel reply"
              className="text-ink-3 hover:text-ink"
            >
              ✕
            </button>
          </div>
        )}

        <div className="flex items-end gap-2">
          <Avatar user={user} size="sm" className="mb-1" />
          <div className="relative flex-1">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, 1000))}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit(e);
              }}
              rows={1}
              placeholder={replyTo ? `Reply to ${replyTo.author?.name}…` : 'Add a comment…'}
              className="w-full resize-none rounded-md border border-line bg-surface-2 px-3 py-2 text-[13.5px] leading-relaxed text-ink placeholder:text-ink-3 focus:border-accent focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/25"
            />
          </div>
          <Button type="submit" size="sm" disabled={!draft.trim()} loading={addComment.isPending} className="mb-1">
            Post
          </Button>
        </div>
      </form>
    </div>
  );
}
