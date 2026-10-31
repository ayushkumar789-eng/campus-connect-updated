import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  MapPin,
  Calendar,
  UserPlus,
  UserCheck,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Shield,
} from 'lucide-react';
import { Avatar } from '../../../../shared/ui/Avatar.jsx';
import { Badge, Card } from '../../../../shared/ui/Card.jsx';
import { Button } from '../../../../shared/ui/Button.jsx';
import { Dropdown } from '../../../../shared/ui/Dropdown.jsx';
import { FeedSkeleton, ErrorState, EmptyState } from '../../../../shared/ui/States.jsx';
import { PostCard } from '../../../posts/components/PostCard.jsx';
import { CommentsPanel } from '../../../comments/components/CommentsPanel.jsx';
import { useProfile, useUserPosts, useSavedPosts, useFollow } from '../../../../shared/hooks/useData.js';
import { useUIStore } from '../../../../app/store/uiStore.js';
import { useAuthStore } from '../../../auth/hooks/useAuthStore.js';
import { errorMessage } from '../../../../shared/api/client.js';
import { compactNumber, formatDate, plural, yearOfStudy } from '../../../../shared/utils/format.js';

const TABS = [
  { key: 'posts', label: 'Posts' },
  { key: 'saved', label: 'Saved' },
  { key: 'groups', label: 'Groups', phase: 3 },
];

/** `User.year` is a 1–6 year of study, not a calendar year. */

function ProfileHeader({ profile, onMessage }) {
  const viewer = useAuthStore((s) => s.user);
  const follow = useFollow();
  const isSelf = viewer?.id === profile.id;

  // The schema stores year of study, not a graduation year, so show the batch
  // as course + year rather than inventing a graduation date.
  const academicLine = [profile.course, yearOfStudy(profile.year)]
    .filter(Boolean)
    .join(' · ');

  return (
    <Card className="overflow-hidden">
      {/* Cover strip keeps the header from feeling bare without a gradient. */}
      <div className="h-20 bg-accent-soft" aria-hidden />

      <div className="px-4 pb-4">
        <div className="-mt-10 flex items-end justify-between gap-3">
          <Avatar user={profile} size="2xl" ring className="border-2 border-surface" />

          <div className="flex items-center gap-2 pb-1">
            {isSelf ? (
              <>
                <Link to="/settings">
                  <Button variant="secondary" size="sm" leftIcon={Pencil}>
                    Edit profile
                  </Button>
                </Link>
                <Dropdown
                  trigger={
                    <button type="button" aria-label="More options" className="rounded-md border border-line p-2 text-ink-3 hover:bg-surface-2">
                      <MoreHorizontal className="h-4 w-4" aria-hidden />
                    </button>
                  }
                  items={[
                    { label: 'Settings', onSelect: () => onMessage('/settings') },
                    { label: 'Copy profile link', onSelect: () => navigator.clipboard?.writeText(window.location.href) },
                  ]}
                />
              </>
            ) : profile.role === 'admin' ? (
              <Badge tone="accent">
                <Shield className="h-3 w-3" aria-hidden /> Platform admin
              </Badge>
            ) : (
              <>
                <Button
                  variant={profile.isFollowing ? 'secondary' : 'primary'}
                  size="sm"
                  leftIcon={profile.isFollowing ? UserCheck : UserPlus}
                  loading={follow.isPending && follow.variables?.id === profile.id}
                  onClick={() => follow.mutate({ id: profile.id, isFollowing: profile.isFollowing })}
                >
                  {profile.isFollowing ? 'Following' : 'Follow'}
                </Button>
                <Button variant="secondary" size="sm" leftIcon={MessageSquare} onClick={() => onMessage(`/messages/${profile.id}`)}>
                  Message
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="mt-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold tracking-[-0.02em] text-ink">{profile.name}</h1>
            {profile.role !== 'student' && profile.role !== 'admin' && (
              <Badge size="sm" tone="accent">
                {profile.role === 'group_admin' ? 'Group admin' : 'Member'}
              </Badge>
            )}
          </div>
          <p className="text-[14px] text-ink-3">@{profile.username}</p>

          {(profile.course || profile.college) && (
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px] text-ink-2">
              {academicLine && (
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5 text-ink-3" aria-hidden />
                  {academicLine}
                </span>
              )}
              {profile.college && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 text-ink-3" aria-hidden />
                  {profile.college}
                </span>
              )}
            </p>
          )}

          {profile.bio && <p className="mt-2.5 text-[14.5px] leading-relaxed text-ink">{profile.bio}</p>}

          {profile.skills?.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {profile.skills.map((s) => (
                <Badge key={s}>{s}</Badge>
              ))}
            </div>
          )}

          <div className="mt-4 flex gap-5 border-t border-line pt-3 text-[13.5px]">
            <span className="text-ink-2">
              <strong className="font-semibold text-ink">{compactNumber(profile.postsCount)}</strong>{' '}
              {plural(profile.postsCount, 'post')}
            </span>
            <span className="text-ink-2">
              <strong className="font-semibold text-ink">{compactNumber(profile.followersCount)}</strong>{' '}
              {plural(profile.followersCount, 'follower')}
            </span>
            <span className="text-ink-2">
              <strong className="font-semibold text-ink">{compactNumber(profile.followingCount)}</strong>{' '}
              {plural(profile.followingCount, 'following', 'following')}
            </span>
            {profile.notesCount > 0 && (
              <span className="text-ink-2">
                <strong className="font-semibold text-ink">{compactNumber(profile.notesCount)}</strong> notes
              </span>
            )}
            <span className="ml-auto hidden text-ink-3 sm:inline">
              Joined {profile.createdAt ? formatDate(profile.createdAt) : 'recently'}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}

/** Bookmarks are only ever the signed-in user's own list, so this reads the
 *  same `posts/saved` cache key the Saved page writes to. */
function SavedTab({ data, isLoading, onOpenComments }) {
  const posts = data?.pages?.flatMap((p) => p.data) ?? [];

  if (isLoading) return <FeedSkeleton count={2} />;
  if (!posts.length) {
    return (
      <EmptyState
        title="Nothing saved yet"
        description="Bookmark a post from the feed and it will show up here."
        action={<Link to="/home"><Button>Back to feed</Button></Link>}
      />
    );
  }

  return (
    <div className="space-y-3">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} onOpenComments={onOpenComments} />
      ))}
    </div>
  );
}

export default function UserProfile() {
  const { username } = useParams();
  const navigate = useNavigate();
  const viewer = useAuthStore((s) => s.user);
  const openReport = useUIStore((s) => s.openReport);
  const [tab, setTab] = useState('posts');
  const [activePost, setActivePost] = useState(null);

  const { data: profile, error, isLoading } = useProfile(username);
  const { data: postsData, isLoading: loadingPosts } = useUserPosts(profile?.username);
  const posts = postsData?.pages?.flatMap((p) => p.data) ?? [];
  // Disabled for other profiles so the request never fires on a public page.
  const { data: savedData, isLoading: loadingSaved } = useSavedPosts(viewer?.username === profile?.username);

  useEffect(() => {
    setTab('posts');
  }, [username]);

  if (isLoading) return <FeedSkeleton count={2} />;
  if (error) return <ErrorState message={errorMessage(error)} onRetry={() => navigate(0)} />;

  const isSelf = viewer?.id === profile?.id;

  return (
    <div className="space-y-4 pb-4">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-ink-2 transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back
      </button>

      <ProfileHeader profile={profile} onMessage={navigate} />

      <div className="flex gap-1 border-b border-line">
        {TABS.filter((t) => t.key !== 'saved' || isSelf).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-[13.5px] font-medium transition-colors ${
              tab === t.key ? 'border-accent text-accent' : 'border-transparent text-ink-3 hover:text-ink'
            }`}
          >
            {t.label}
            {t.phase && <span className="ml-1.5 text-[10.5px] text-ink-3">Phase {t.phase}</span>}
          </button>
        ))}
      </div>

      {tab === 'posts' &&
        (loadingPosts ? (
          <FeedSkeleton count={2} />
        ) : posts.length ? (
          <div className="space-y-3">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} onOpenComments={setActivePost} />
            ))}
          </div>
        ) : (
          <EmptyState
            title={isSelf ? 'You have not posted yet' : `${profile.name} has not posted yet`}
            description={isSelf ? 'Share something with your campus — a project update, a doubt, a resource.' : 'Check back later.'}
            action={isSelf ? <Link to="/home"><Button>Write a post</Button></Link> : null}
          />
        ))}

      {tab === 'saved' && isSelf && (
        <SavedTab data={savedData} isLoading={loadingSaved} onOpenComments={setActivePost} />
      )}

      {tab === 'groups' && (
        <EmptyState
          title="Groups land in Phase 3"
          description="Subject groups and course communities are being built on the models already in place."
        />
      )}

      {!isSelf && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={() => openReport({ targetType: 'user', targetId: profile.id })}
            className="text-[12.5px] text-ink-3 transition-colors hover:text-danger"
          >
            Report this profile
          </button>
        </div>
      )}

      {activePost && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setActivePost(null)} role="button" tabIndex={-1} aria-label="Close" />
          <div className="relative z-10 h-full w-full border-l border-line sm:max-w-md">
            <CommentsPanel post={activePost} onClose={() => setActivePost(null)} />
          </div>
        </div>
      )}
    </div>
  );
}
