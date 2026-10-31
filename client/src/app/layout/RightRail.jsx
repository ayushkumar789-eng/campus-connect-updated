import { Link } from 'react-router-dom';
import { TrendingUp, Sparkles } from 'lucide-react';
import { Card, SectionTitle, Badge } from '../../shared/ui/Card.jsx';
import { Avatar } from '../../shared/ui/Avatar.jsx';
import { Button } from '../../shared/ui/Button.jsx';
import { useSuggestedUsers, useFeed } from '../../shared/hooks/useData.js';
import { useAuthStore } from '../../features/auth/hooks/useAuthStore.js';
import { useFollow } from '../../shared/hooks/useData.js';
import { compactNumber, timeAgo, yearOfStudy } from '../../shared/utils/format.js';

/**
 * Right rail. Hidden on tablet and below because the primary content needs the
 * width there; the same information stays reachable via the Explore page.
 */
export function RightRail() {
  const user = useAuthStore((s) => s.user);
  const { data: suggested, isLoading } = useSuggestedUsers();
  const { data: feedData } = useFeed('all');
  const follow = useFollow();

  // Trending is derived from real post engagement rather than a static list.
  const trending = [...(feedData?.pages?.[0]?.data ?? [])]
    .sort((a, b) => (b.likeCount ?? 0) - (a.likeCount ?? 0))
    .slice(0, 4);

  return (
    <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-72 shrink-0 space-y-4 overflow-y-auto p-4 xl:block">
      {/* Who to follow */}
      <section>
        <SectionTitle
          action={
            <Link to="/explore" className="text-[12.5px] font-medium text-accent hover:underline">
              See all
            </Link>
          }
        >
          Suggested students
        </SectionTitle>

        <Card className="divide-y divide-line">
          {isLoading ? (
            <div className="space-y-3 p-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="skeleton h-9 w-9 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <div className="skeleton h-3 w-24" />
                    <div className="skeleton h-2.5 w-16" />
                  </div>
                </div>
              ))}
            </div>
          ) : suggested?.length ? (
            suggested.map((s) => (
              <div key={s.id} className="flex items-center gap-3 p-3">
                <Link to={`/u/${s.username}`} className="shrink-0">
                  <Avatar user={s} size="sm" />
                </Link>
                <div className="min-w-0 flex-1">
                  <Link to={`/u/${s.username}`} className="block truncate text-[13.5px] font-semibold text-ink hover:underline">
                    {s.name}
                  </Link>
                  <p className="truncate text-[12px] text-ink-3">
                    {[s.course, yearOfStudy(s.year)].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  loading={follow.isPending && follow.variables?.id === s.id}
                  onClick={() => follow.mutate({ id: s.id, isFollowing: false })}
                >
                  Follow
                </Button>
              </div>
            ))
          ) : (
            <p className="p-4 text-center text-[13px] text-ink-3">
              You are following everyone we could suggest. Nice network.
            </p>
          )}
        </Card>
      </section>

      {/* Trending, computed from live engagement */}
      <section>
        <SectionTitle
          action={
            <Link to="/explore" className="text-[12.5px] font-medium text-accent hover:underline">
              Explore
            </Link>
          }
        >
          <span className="inline-flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" aria-hidden /> Trending
          </span>
        </SectionTitle>

        <Card className="divide-y divide-line">
          {trending.length ? (
            trending.map((post, i) => (
              <Link key={post.id} to={`/posts/${post.id}`} className="block p-3 transition-colors hover:bg-surface-2">
                <p className="text-[11px] font-semibold text-ink-3">#{i + 1}</p>
                <p className="mt-0.5 line-clamp-2 text-[13.5px] font-medium text-ink">
                  {post.content || post.resource?.title}
                </p>
                <p className="mt-1 text-[12px] text-ink-3">
                  {compactNumber(post.likeCount)} likes · {timeAgo(post.createdAt)}
                </p>
              </Link>
            ))
          ) : (
            <p className="p-4 text-center text-[13px] text-ink-3">Nothing trending yet.</p>
          )}
        </Card>
      </section>

      {/* Nudges the roadmap modules that exist as models but not yet as APIs. */}
      <Card className="p-4">
        <div className="mb-2 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent" aria-hidden />
          <h3 className="text-[13.5px] font-semibold text-ink">Coming to your campus</h3>
        </div>
        <p className="text-[12.5px] leading-relaxed text-ink-3">
          Notes, subject groups, discussion forums, private chat and events are being built on this same
          foundation.
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {['Notes', 'Groups', 'Discussions', 'Chat', 'Events'].map((label) => (
            <Badge key={label} size="sm">
              {label}
            </Badge>
          ))}
        </div>
      </Card>

      <p className="px-1 pb-2 text-[11.5px] leading-relaxed text-ink-3">
        CampusConnect · Built with React, Node, MongoDB
        <br />
        Signed in as @{user?.username}
      </p>
    </aside>
  );
}
