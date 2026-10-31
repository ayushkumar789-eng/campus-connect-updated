import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { classNames } from '../utils/format.js';

/**
 * Lightweight toast host. Deliberately self-contained rather than pulling in
 * a notification library — the API surface here is small and stable.
 */
const createEvent = () => {
  const listeners = new Set();
  return {
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    emit(payload) {
      for (const fn of listeners) fn(payload);
    },
  };
};

export const toastEvents = createEvent();

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const TONES = {
  success: 'border-success/40 text-success',
  error: 'border-danger/40 text-danger',
  warning: 'border-warning/40 text-warning',
  info: 'border-line text-ink-2',
};

let counter = 0;

export function toast(message, { type = 'info', duration = 4000, action } = {}) {
  counter += 1;
  toastEvents.emit({ id: counter, message, type, duration, action });
}

toast.success = (message, options) => toast(message, { ...options, type: 'success' });
toast.error = (message, options) => toast(message, { ...options, type: 'error', duration: 5000 });
toast.info = (message, options) => toast(message, { ...options, type: 'info' });

function ToastItem({ toast: t, onDismiss }) {
  const Icon = ICONS[t.type] ?? Info;

  useEffect(() => {
    const timer = setTimeout(() => onDismiss(t.id), t.duration);
    return () => clearTimeout(timer);
  }, [t, onDismiss]);

  return (
    <div
      role="status"
      className={classNames(
        'pointer-events-auto flex w-full items-start gap-3 rounded-lg border bg-surface px-4 py-3 shadow-overlay',
        'animate-fade-up',
        TONES[t.type] ?? TONES.info,
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1 text-sm leading-snug text-ink">{t.message}</p>
      {t.action && (
        <button
          type="button"
          onClick={() => {
            t.action.onClick();
            onDismiss(t.id);
          }}
          className="shrink-0 text-[13px] font-semibold text-accent hover:underline"
        >
          {t.action.label}
        </button>
      )}
      <button
        type="button"
        onClick={() => onDismiss(t.id)}
        aria-label="Dismiss"
        className="-mr-1 shrink-0 rounded p-0.5 text-ink-3 hover:text-ink"
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}

export function Toaster() {
  const [items, setItems] = useState([]);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return toastEvents.subscribe((t) => setItems((prev) => [...prev.slice(-3), t]));
  }, []);

  const dismiss = (id) => setItems((prev) => prev.filter((t) => t.id !== id));

  if (!items.length) return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:top-0 sm:items-end">
      {items.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
      ))}
    </div>,
    document.body,
  );
}
