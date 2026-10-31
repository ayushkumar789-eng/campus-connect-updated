/** Loading, empty and error states. Every list in the app uses these so
 *  there is never a blank screen while data is in flight. */
import { AlertCircle, Inbox, RefreshCw } from 'lucide-react';
import { Button } from './Button.jsx';
import { classNames } from '../utils/format.js';

export function Skeleton({ className }) {
  return <div className={classNames('skeleton rounded-md', className)} aria-hidden />;
}

export function PostSkeleton() {
  return (
    <div className="rounded-lg border border-line bg-surface p-4 shadow-card">
      <div className="flex gap-3">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-40" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-11/12" />
        <Skeleton className="h-3 w-2/3" />
      </div>
      <div className="mt-4 flex gap-4 border-t border-line pt-3">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-16" />
      </div>
    </div>
  );
}

export function FeedSkeleton({ count = 3 }) {
  return (
    <div className="space-y-3" role="status" aria-label="Loading posts">
      {Array.from({ length: count }).map((_, i) => (
        <PostSkeleton key={i} />
      ))}
    </div>
  );
}

export function CardSkeleton({ lines = 3 }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4 shadow-card">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className={classNames('h-3', i === lines - 1 ? 'w-2/3' : 'w-full')} />
        ))}
      </div>
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-line px-6 py-14 text-center">
      <span className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 text-ink-3">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm leading-relaxed text-ink-3">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = 'Something went wrong', message, onRetry, action, className, children }) {
  return (
    <div className={classNames('rounded-lg border border-danger/30 bg-danger/5 px-6 py-10 text-center', className)}>
      <span className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-danger/10 text-danger">
        <AlertCircle className="h-5 w-5" aria-hidden />
      </span>
      <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
      {message && <p className="mx-auto mt-1 max-w-sm text-sm text-ink-2">{message}</p>}
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-4" leftIcon={RefreshCw} onClick={onRetry}>
          Try again
        </Button>
      )}
      {action && <div className="mt-3">{action}</div>}
      {children}
    </div>
  );
}
