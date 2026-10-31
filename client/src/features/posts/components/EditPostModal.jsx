import { useEffect, useState } from 'react';
import { Modal } from '../../../shared/ui/Modal.jsx';
import { Button } from '../../../shared/ui/Button.jsx';
import { useUpdatePost } from '../../../shared/hooks/useData.js';

const MAX = 2200;

/**
 * Edit dialog for a post body.
 *
 * The server only accepts `content` (`updatePostSchema` is `.strict()`), so
 * media, polls and attached resources are deliberately not editable here —
 * pretending otherwise would offer controls the API silently rejects. The
 * composer is the place to change those.
 */
export function EditPostModal({ post, open, onClose }) {
  const [content, setContent] = useState(post?.content ?? '');
  const update = useUpdatePost();

  // Re-seed the draft each time the dialog opens so a cancelled edit never
  // leaks into the next one.
  useEffect(() => {
    if (open) setContent(post?.content ?? '');
  }, [open, post?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (update.isSuccess && !update.isPending) onClose?.();
  }, [update.isSuccess, update.isPending]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!post) return null;

  const trimmed = content.trim();
  const tooLong = content.length > MAX;
  const unchanged = trimmed === post.content;
  const canSubmit = trimmed.length > 0 && !tooLong && !unchanged && !update.isPending;

  const submit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;
    try {
      await update.mutateAsync({ postId: post.id, content: trimmed });
    } catch {
      // The mutation already surfaced a toast; keep the draft so nothing is lost.
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Edit post" size="md">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="edit-post-content" className="sr-only">
            Post content
          </label>
          <textarea
            id="edit-post-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && canSubmit) submit(e);
            }}
            rows={6}
            maxLength={MAX + 100}
            autoFocus
            className="w-full resize-y rounded-md border border-line bg-surface-2 px-3 py-2 text-sm leading-relaxed text-ink placeholder:text-ink-3 focus:border-accent focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/25"
          />
          <div className="mt-1 flex items-center justify-between text-[11.5px]">
            <span className={tooLong ? 'font-medium text-danger' : 'text-ink-3'}>
              {tooLong ? `${content.length - MAX} over the limit` : 'Cmd + Enter to save'}
            </span>
            <span className={tooLong ? 'text-danger' : 'text-ink-3'}>{content.length}/{MAX}</span>
          </div>
        </div>

        {post.media?.length > 0 && (
          <p className="rounded-md bg-surface-2 px-3 py-2 text-[12.5px] text-ink-3">
            Media, polls and attached files can&apos;t be changed after posting.
          </p>
        )}

        <div className="flex justify-end gap-2 border-t border-line pt-3">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit} loading={update.isPending}>
            Save changes
          </Button>
        </div>
      </form>
    </Modal>
  );
}
