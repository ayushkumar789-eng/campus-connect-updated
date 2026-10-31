import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Composer } from './Composer.jsx';
import { useUIStore } from '../../../app/store/uiStore.js';

/**
 * Composer in a bottom sheet on mobile and a centred dialog on desktop, so
 * the same component serves both the "New post" button and the mobile action.
 */
export function ComposerSheet() {
  const open = useUIStore((s) => s.composerOpen);
  const close = useUIStore((s) => s.closeComposer);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-ink/45" onClick={close} role="button" tabIndex={-1} aria-label="Close" />

      <div className="relative z-10 w-full max-w-lg animate-fade-up rounded-t-xl border border-line bg-canvas shadow-overlay sm:rounded-xl">
        <div className="flex h-12 items-center justify-between border-b border-line px-4">
          <h2 className="text-[15px] font-semibold text-ink">New post</h2>
          <button
            type="button"
            onClick={close}
            aria-label="Close composer"
            className="rounded-md p-1.5 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="p-3">
          <Composer autoFocus onPosted={close} />
        </div>

        <div className="h-[env(safe-area-inset-bottom)] sm:hidden" />
      </div>
    </div>,
    document.body,
  );
}
