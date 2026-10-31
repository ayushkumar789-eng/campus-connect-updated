import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bell,
  CheckCheck,
  Heart,
  MessageCircle,
  Reply,
  Repeat2,
  UserPlus,
  Loader2,
} from 'lucide-react';import { Avatar } from '../../../shared/ui/Avatar.jsx';
import { Button } from '../../../shared/ui/Button.jsx';
import { EmptyState, ErrorState, Skeleton } from '../../../shared/ui/States.jsx';
import {
  useMarkNotificationsRead,
  useNotifications,
} from '../../../shared/hooks/useData.js';
import { errorMessage } from '../../../shared/api/client.js';
import { formatRelative, classNames } from '../../../shared/utils/format.js';

/** Icon + accent per notification type, so the list scans quickly. */
const KIND = {
  like: { icon: Heart, tone: 'text-danger' },
  comment: { icon: MessageCircle, tone: 'text-accent' },
  reply: { icon: Reply, tone: 'text-accent' },
  follow: { icon: UserPlus, tone: 'text-accent' },
  share: { icon: Repeat2, tone: 'text-ink-2' },
  message: { icon: MessageCircle, tone: 'text-accent' },
};

function Row({ notification, onOpen }) {
  const { icon: Icon, tone } = KIND[notification.type] ?? { icon: Bell, tone: 'text-ink-3' };

  // Posts deep-link; follows land on the actor's profile instead.
  //
  // The test has to be on `model === 'Post'`, not on `entity` merely being
  // present. A follow *does* carry an entity — `{ model: 'User', type: <the
  // recipient's own id> }` — so testing truthiness sent every follow
  // notification to `/posts/<a user id>`, a 404 that rendered "This post is no
  // longer available". Only a Post entity is a post route.
  const isPost = notification.entity?.model === 'Post';
  const target = isPost
    ? `/posts/${notification.entity.id}`
    : notification.actor
      ? `/u/${notification.actor.username}`
      : null;

  const body = (
    <>
      <span className="relative shrink-0">
        <Avatar user={notification.actor} size="md" />
        <span
          className={classNames(
            'absolute -right-1 -bottom-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-surface bg-surface',
            tone,
          )}
        >
          <Icon className="h-2.5 w-2.5" aria-hidden />
        </span>
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-[14px] leading-snug text-ink">
          {notification.actor ? (
            <span className="font-semibold">{notification.actor.name}</span>
          ) : (
            <span className="font-semibold">Someone</span>
          )}{' '}
          <span className="text-ink-2">{notification.text}</span>
        </span>

        {notification.entity?.content && (
          <span className="mt-1 block truncate text-[13px] text-ink-3">
            “{notification.entity.content}”
          </span>
        )}

        <span className="mt-1 block text-[12px] text-ink-3">
          {formatRelative(notification.createdAt)}
        </span>
      </span>
    </>
  );

  const className = classNames(
    'flex w-full items-start gap-3 border-b border-line px-4 py-3 text-left transition-colors last:border-b-0',
    notification.read ? 'bg-surface' : 'bg-accent-soft/40',
    target && 'hover:bg-surface-2',
  );

  if (!target) return <div className={className}>{body}</div>;

  return (
    <Link to={target} className={className} onClick={() => onOpen(notification)}>
      {body}
    </Link>
  );
}

export default function Notifications() {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const markRead = useMarkNotificationsRead();

  const { data, error, isLoading, isFetchingNextPage, fetchNextPage, hasNextPage, refetch } =
    useNotifications(unreadOnly);

  const items = data?.pages?.flatMap((p) => p.data) ?? [];
  const unreadCount = data?.pages?.[0]?.unreadCount ?? 0;

  const sentinelRef = useRef(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasNextPage) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isFetchingNextPage) fetchNextPage();
      },
      { rootMargin: '400px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-[-0.02em] text-ink">Notifications</h1>
          <p className="mt-0.5 text-[14px] text-ink-2">
            {unreadCount > 0 ? `${unreadCount} unread` : 'You are all caught up.'}
          </p>
        </div>

        {unreadCount > 0 && (
          <Button
            variant="secondary"
            size="sm"
            leftIcon={CheckCheck}
            loading={markRead.isPending}
            onClick={() => markRead.mutate({})}
          >
            Mark all read
          </Button>
        )}
      </div>

      <div className="flex gap-1 border-b border-line">
        {[
          { key: false, label: 'All' },
          { key: true, label: 'Unread' },
        ].map((tab) => (
          <button
            key={String(tab.key)}
            type="button"
            onClick={() => setUnreadOnly(tab.key)}
            className={classNames(
              '-mb-px border-b-2 px-3 py-2 text-[13.5px] font-medium transition-colors',
              unreadOnly === tab.key
                ? 'border-accent text-accent'
                : 'border-transparent text-ink-3 hover:text-ink',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2 rounded-lg border border-line bg-surface p-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-start gap-3 py-1">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-2.5 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <ErrorState message={errorMessage(error)} onRetry={refetch} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Bell}
          title={unreadOnly ? 'No unread notifications' : 'Nothing here yet'}
          description={
            unreadOnly
              ? 'You have read everything. Switch to All to see your history.'
              : 'When someone likes your post, comments, or follows you, it will show up here.'
          }
          action={
            unreadOnly ? (
              <Button variant="secondary" onClick={() => setUnreadOnly(false)}>
                Show all
              </Button>
            ) : (
              <Link to="/home">
                <Button>Go to the feed</Button>
              </Link>
            )
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-card">
          {items.map((n) => (
            <Row key={n.id} notification={n} onOpen={(item) => !item.read && markRead.mutate({ id: item.id })} />
          ))}

          {hasNextPage && (
            <div ref={sentinelRef} className="flex justify-center border-t border-line p-3">
              {isFetchingNextPage ? (
                <span className="inline-flex items-center gap-2 text-[13px] text-ink-3">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading more
                </span>
              ) : (
                <Button variant="secondary" size="sm" onClick={() => fetchNextPage()}>
                  Load more
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
