import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Heart,
  MessageCircle,
  Repeat2,
  Bookmark,
  MoreHorizontal,
  FileText,
  Download,
  BarChart3,
  Check,
} from 'lucide-react';
import { Avatar } from '../../../shared/ui/Avatar.jsx';
import { Button } from '../../../shared/ui/Button.jsx';
import { Modal } from '../../../shared/ui/Modal.jsx';
import { Dropdown } from '../../../shared/ui/Dropdown.jsx';
import { EditPostModal } from './EditPostModal.jsx';
import { useToggleLike, useToggleSave, useSharePost, useDeletePost } from '../../../shared/hooks/useData.js';
import { useUIStore } from '../../../app/store/uiStore.js';
import {
  compactNumber,
  timeAgo,
  formatBytes,
  linkify,
  classNames,
  resolveFileUrl,
  yearOfStudy,
} from '../../../shared/utils/format.js';

/** Renders post text with hashtags and links highlighted. */
function PostBody({ content }) {
  if (!content) return null;
  return (
    <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-ink">
      {linkify(content).map((part, i) => {
        if (part.type === 'tag') {
          return (
            <span key={i} className="font-medium text-accent">
              {part.value}
            </span>
          );
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

function MediaGrid({ media }) {
  if (!media?.length) return null;

  // A single image is shown large; a grid keeps multiple images compact.
  if (media.length === 1) {
    return (
      <div className="mt-3 overflow-hidden rounded-lg border border-line">
        <img
          src={resolveFileUrl(media[0].url)}
          alt={media[0].alt || ''}
          loading="lazy"
          decoding="async"
          className="max-h-[520px] w-full bg-surface-2 object-cover"
        />
      </div>
    );
  }

  const grid = media.length === 2 ? 'grid-cols-2' : media.length === 3 ? 'grid-cols-3' : 'grid-cols-2';

  return (
    <div className={classNames('mt-3 grid gap-0.5 overflow-hidden rounded-lg border border-line', grid)}>
      {media.slice(0, 4).map((m) => (
        <div key={m.url} className="aspect-square overflow-hidden bg-surface-2">
          {m.mimetype?.startsWith('video/') ? (
            <video src={resolveFileUrl(m.url)} controls className="h-full w-full object-cover" />
          ) : (
            <img
              src={resolveFileUrl(m.url)}
              alt={m.alt || ''}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          )}
        </div>
      ))}
    </div>
  );
}

/** Poll results are hidden until the viewer has voted or the poll has closed. */
function Poll({ poll, onVote, isVoting }) {
  if (!poll) return null;
  const showResults = poll.hasVoted || poll.isClosed;

  return (
    <div className="mt-3 rounded-lg border border-line p-3">
      <div className="mb-2.5 flex items-start gap-2">
        <BarChart3 className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
        <p className="text-sm font-semibold text-ink">{poll.question}</p>
      </div>

      <div className="space-y-1.5">
        {poll.options.map((option) => (
          <button
            key={option.id}
            type="button"
            disabled={!showResults || poll.isClosed || isVoting}
            onClick={() => onVote(option.id)}
            className={classNames(
              'relative w-full overflow-hidden rounded-md border px-3 py-2 text-left transition-colors',
              option.hasVoted ? 'border-accent bg-accent-soft' : 'border-line',
              showResults ? 'cursor-default' : 'hover:border-accent hover:bg-surface-2',
              !showResults && !poll.isClosed && 'cursor-pointer',
            )}
          >
            {/* Result bar sits behind the label so both stay readable. */}
            {showResults && (
              <span
                className={classNames(
                  'absolute inset-y-0 left-0 transition-[width] duration-500',
                  option.hasVoted ? 'bg-accent/20' : 'bg-surface-2',
                )}
                style={{ width: `${option.percentage}%` }}
                aria-hidden
              />
            )}
            <span className="relative flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-[13.5px] text-ink">
                {option.hasVoted && <Check className="h-3.5 w-3.5 text-accent" aria-hidden />}
                {option.text}
              </span>
              {showResults && (
                <span className="text-[12.5px] font-medium text-ink-2">
                  {option.percentage}% · {compactNumber(option.votes)}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>

      <p className="mt-2 text-[12px] text-ink-3">
        {poll.isClosed ? 'Poll closed' : `${compactNumber(poll.totalVotes)} votes`}
        {poll.endsAt && !poll.isClosed && ` · ends ${new Date(poll.endsAt).toLocaleDateString()}`}
      </p>
    </div>
  );
}

function ResourceCard({ resource, isOwner }) {
  const href = resolveFileUrl(resource.fileUrl);
  return (
    <div className="mt-3 flex items-center gap-3 rounded-lg border border-line bg-surface-2 p-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface text-accent">
        <FileText className="h-5 w-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-semibold text-ink">{resource.title || resource.name}</p>
        <p className="text-[12px] text-ink-3">
          {resource.name} · {formatBytes(resource.size)}
        </p>
      </div>
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          download={isOwner ? resource.name : undefined}
          className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1.5 text-[12.5px] font-medium text-ink-2 transition-colors hover:border-accent hover:text-accent"
        >
          <Download className="h-3.5 w-3.5" aria-hidden />
          Download
        </a>
      )}
    </div>
  );
}


export function PostCard({ post, onOpenComments, onVote, isVoting }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);

  const like = useToggleLike();
  const save = useToggleSave();
  const share = useSharePost();
  const remove = useDeletePost();
  const openReport = useUIStore((s) => s.openReport);

  const handleVote = (optionId) => onVote?.(post.id, optionId);

  return (
    <article className="rounded-lg border border-line bg-surface shadow-card transition-colors hover:border-line-strong">
      <div className="p-4">
        {/* Author */}
        <div className="flex items-start gap-3">
          <Link to={`/u/${post.author?.username}`} className="shrink-0">
            <Avatar user={post.author} size="md" />
          </Link>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link
                  to={`/u/${post.author?.username}`}
                  className="block truncate text-[14.5px] font-semibold text-ink hover:underline"
                >
                  {post.author?.name}
                </Link>
                <p className="truncate text-[12.5px] text-ink-3">
                  @{post.author?.username}
                  {post.author?.course && ` · ${post.author.course}`}
                  {post.author?.year && ` · ${yearOfStudy(post.author.year)}`}
                  {' · '}
                  <time dateTime={post.createdAt} title={new Date(post.createdAt).toLocaleString()}>
                    {timeAgo(post.createdAt)}
                  </time>
                  {post.editedAt && ' · edited'}
                </p>
              </div>

              {post.isOwner && (
                <Dropdown
                  trigger={
                    <button
                      type="button"
                      aria-label="Post options"
                      className="rounded-md p-1.5 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
                    >
                      <MoreHorizontal className="h-4 w-4" aria-hidden />
                    </button>
                  }
                  items={[
                    // The server refuses edits on polls (`updatePost` throws),
                    // so don't offer a menu item that can only ever fail.
                    ...(post.type === 'poll' ? [] : [{ label: 'Edit post', onSelect: () => setEditing(true) }]),
                    { label: 'Delete post', danger: true, onSelect: () => setConfirmDelete(true) },
                  ]}
                />
              )}
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="mt-3">
          <PostBody content={post.content} />
          <MediaGrid media={post.media} />
          {post.resource && <ResourceCard resource={post.resource} isOwner={post.isOwner} />}
          <Poll poll={post.poll} onVote={handleVote} isVoting={isVoting} />
        </div>

        {/* Actions */}
        <div className="mt-3 flex items-center gap-1 border-t border-line pt-2.5">
          <button
            type="button"
            onClick={() => onOpenComments?.(post)}
            aria-label={`Comment on this post — ${post.commentCount} comments`}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] font-medium text-ink-3 transition-colors hover:bg-surface-2 hover:text-accent"
          >
            <MessageCircle className="h-4 w-4" aria-hidden />
            <span className="tabular-nums">{compactNumber(post.commentCount)}</span>
          </button>

          <button
            type="button"
            onClick={() => like.mutate({ postId: post.id, isLiked: post.isLiked })}
            disabled={like.isPending}
            aria-pressed={post.isLiked}
            aria-label={post.isLiked ? 'Unlike' : 'Like'}
            className={classNames(
              'inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] font-medium transition-colors',
              'disabled:opacity-60',
              post.isLiked ? 'text-danger' : 'text-ink-3 hover:bg-surface-2 hover:text-danger',
            )}
          >
            <Heart className={classNames('h-4 w-4', post.isLiked && 'fill-current')} aria-hidden />
            <span className="tabular-nums">{compactNumber(post.likeCount)}</span>
          </button>

          <button
            type="button"
            onClick={() => share.mutate({ postId: post.id })}
            disabled={share.isPending}
            aria-label="Share"
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] font-medium text-ink-3 transition-colors hover:bg-surface-2 hover:text-accent disabled:opacity-60"
          >
            <Repeat2 className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline tabular-nums">{compactNumber(post.shareCount)}</span>
          </button>

          <button
            type="button"
            onClick={() => save.mutate({ postId: post.id })}
            disabled={save.isPending}
            aria-pressed={post.isSaved}
            aria-label={post.isSaved ? 'Remove from saved' : 'Save post'}
            className={classNames(
              'ml-auto inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] font-medium transition-colors',
              'disabled:opacity-60',
              post.isSaved ? 'text-accent' : 'text-ink-3 hover:bg-surface-2 hover:text-accent',
            )}
          >
            <Bookmark className={classNames('h-4 w-4', post.isSaved && 'fill-current')} aria-hidden />
            {/* The visible text has to describe the action the click takes, the
                same rule `getSavedPosts` follows for the cards it returns. A
                fixed "Save" left a bookmarked post — especially one sitting on
                the page called Saved — offering to save something already
                saved. Keeping it in step with the aria-label also keeps the
                visible label inside the accessible name. */}
            <span className="hidden sm:inline">{post.isSaved ? 'Saved' : 'Save'}</span>
          </button>
        </div>
      </div>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this post?"
        description="This removes the post, its comments and its likes. This cannot be undone."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={remove.isPending}
              onClick={async () => {
                setConfirmDelete(false);
                remove.mutate({ postId: post.id });
              }}
            >
              Delete post
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">Are you sure you want to delete this post?</p>
      </Modal>

      <EditPostModal post={post} open={editing} onClose={() => setEditing(false)} />

      {!post.isOwner && (
        <button
          type="button"
          onClick={() => openReport({ targetType: 'post', targetId: post.id })}
          className="sr-only focus:not-sr-only focus:absolute focus:right-3 focus:bottom-3 focus:rounded focus:border focus:bg-surface focus:px-2 focus:py-1 focus:text-[12px] focus:text-ink-2"
        >
          Report post
        </button>
      )}
    </article>
  );
}
