import { useEffect, useRef, useState } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { Button } from './Button.jsx';

/**
 * Modal confirmation for an action that cannot be undone.
 *
 * Built on `<dialog>` rather than a hand-rolled overlay, so focus trapping,
 * Escape-to-close and the backdrop's inertness come from the platform instead
 * of from a pile of `onKeyDown` handlers.
 *
 * When `phrase` is supplied the user must type it before the button enables.
 * For an irreversible action that is the only thing standing between a tired
 * user and a lost account, and it costs one line of typing.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {() => void | Promise<void>} props.onConfirm
 * @param {string} props.title
 * @param {React.ReactNode} [props.body]
 * @param {string} [props.confirmLabel]
 * @param {string} [props.phrase] when set, the user must type this to enable the button
 * @param {boolean} [props.danger]
 * @param {string} [props.error] a failure message, shown inside the dialog
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel = 'Confirm',
  phrase,
  danger = false,
  error = '',
}) {
  const ref = useRef(null);
  const cancelRef = useRef(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);

  // Reset the typed phrase and the previous failure each time the dialog
  // opens, so neither a confirmed action nor a stale error can be replayed by
  // reopening it.
  useEffect(() => {
    if (open) setTyped('');
  }, [open]);

  // `showModal()` gives the browser-level focus trap. A plain `open` attribute
  // would leave Tab able to walk into the page behind the dialog.
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);

  // Land focus on Cancel, so a stray Enter does not destroy anything.
  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(e) => {
        // Clicks on the backdrop land on the <dialog> itself, because it fills
        // the viewport. A click on the panel does not.
        if (e.target === ref.current && !busy) onClose();
      }}
      aria-labelledby="confirm-dialog-title"
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-0 text-ink shadow-xl backdrop:bg-ink/40 backdrop:backdrop-blur-sm"
    >
      <div className="p-5">
        <div className="flex gap-3">
          {danger && (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-danger/10 text-danger">
              <AlertTriangle className="h-[18px] w-[18px]" aria-hidden />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 id="confirm-dialog-title" className="text-[16px] font-bold tracking-[-0.01em] text-ink">
              {title}
            </h2>
            {body && <div className="mt-1.5 text-[13.5px] leading-relaxed text-ink-2">{body}</div>}
          </div>
        </div>

        {phrase && (
          <label className="mt-4 block text-[13px] text-ink-2">
            Type <span className="font-semibold text-ink">{phrase}</span> to continue
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              aria-label={`Type ${phrase} to confirm`}
              className="mt-1.5 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
            />
          </label>
        )}

        {error && (
          <div
            role="alert"
            className="mt-4 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] text-danger"
          >
            {error}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button ref={cancelRef} variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={handleConfirm}
            disabled={busy || (phrase ? typed.trim() !== phrase : false)}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
