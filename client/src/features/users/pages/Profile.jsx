import { Link, useNavigate } from 'react-router-dom';
import {
  Settings,
  Shield,
  Bookmark,
  LogOut,
  Moon,
  Sun,
  User as UserIcon,
  ChevronRight,
  MessageSquare,
  Users,
} from 'lucide-react';
import { Avatar } from '../../../shared/ui/Avatar.jsx';
import { Badge, Card, SectionTitle } from '../../../shared/ui/Card.jsx';
import { Button } from '../../../shared/ui/Button.jsx';
import { Dropdown } from '../../../shared/ui/Dropdown.jsx';
import { useProfile, useSavedPosts } from '../../../shared/hooks/useData.js';
import { useAuthStore } from '../../auth/hooks/useAuthStore.js';
import { useUIStore } from '../../../app/store/uiStore.js';
import { compactNumber, formatDate, yearOfStudy } from '../../../shared/utils/format.js';

function MenuRow({ icon: Icon, label, description, to, onClick, danger, trailing }) {
  const content = (
    <>
      <span className={danger ? 'text-danger' : 'text-ink-3'}>
        <Icon className="h-[18px] w-[18px]" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-[14.5px] font-medium ${danger ? 'text-danger' : 'text-ink'}`}>{label}</span>
        {description && <span className="mt-0.5 block text-[13px] text-ink-3">{description}</span>}
      </span>
      {trailing ?? (to && <ChevronRight className="h-4 w-4 shrink-0 text-ink-3" aria-hidden />)}
    </>
  );

  const className =
    'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2';

  return to ? (
    <Link to={to} className={className}>
      {content}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  );
}

/**
 * The signed-in user's own profile. Distinct from `/u/:username` because it
 * exposes private affordances — settings, connections and your bookmarks — that
 * never appear on someone else's page.
 */
export default function Profile() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const theme = useAuthStore((s) => s.theme);
  const toggleTheme = useAuthStore((s) => s.toggleTheme);
  const logout = useAuthStore((s) => s.logout);
  const openComposer = useUIStore((s) => s.openComposer);

  const { data: profile } = useProfile(user?.username);
  const { data: savedData } = useSavedPosts();

  const me = profile ?? user;
  const savedCount = savedData?.pages?.reduce((sum, p) => sum + p.data.length, 0) ?? 0;

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="space-y-5 pb-4">
      {/* Identity card */}
      <Card className="overflow-hidden">
        <div className="h-20 bg-accent-soft" aria-hidden />
        <div className="px-4 pb-4">
          <div className="-mt-10 flex items-end justify-between gap-3">
            <Avatar user={me} size="2xl" ring className="border-2 border-surface" />
            <div className="flex items-center gap-2 pb-1">
              <Button variant="secondary" size="sm" leftIcon={Settings} onClick={() => navigate('/settings')}>
                Settings
              </Button>
              <Dropdown
                trigger={
                  <button
                    type="button"
                    aria-label="Account options"
                    className="rounded-md border border-line p-2 text-ink-3 hover:bg-surface-2"
                  >
                    <Shield className="h-4 w-4" aria-hidden />
                  </button>
                }
                items={[
                  {
                    label: user?.role === 'admin' ? 'Admin dashboard (P6)' : 'Admin dashboard is P6',
                    disabled: user?.role !== 'admin',
                    onSelect: () => navigate(user?.role === 'admin' ? '/admin' : '/unauthorized'),
                  },
                  { label: 'View public profile', onSelect: () => navigate(`/u/${user?.username}`) },
                  { label: 'Sign out', danger: true, onSelect: handleLogout },
                ]}
              />
            </div>
          </div>

          <div className="mt-3">
            <h1 className="text-xl font-bold tracking-[-0.02em] text-ink">{me?.name}</h1>
            <p className="text-[14px] text-ink-3">@{me?.username}</p>
            {me?.bio && <p className="mt-2 text-[14.5px] leading-relaxed text-ink">{me.bio}</p>}

            <p className="mt-2 text-[13px] text-ink-3">
              {[me?.course, yearOfStudy(me?.year), me?.college].filter(Boolean).join(' · ')}
            </p>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {(me?.skills ?? []).map((s) => (
                <Badge key={s} size="sm">
                  {s}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Posts', value: me?.postsCount },
          { label: 'Followers', value: me?.followersCount },
          { label: 'Following', value: me?.followingCount },
        ].map((stat) => (
          <Card key={stat.label} className="px-3 py-3 text-center">
            <p className="text-[18px] font-bold tabular-nums text-ink">{compactNumber(stat.value)}</p>
            <p className="mt-0.5 text-[12px] text-ink-3">{stat.label}</p>
          </Card>
        ))}
      </div>

      {/* Quick actions */}
      <div>
        <SectionTitle>Shortcuts</SectionTitle>
        <Card className="divide-y divide-line">
          <MenuRow
            icon={UserIcon}
            label="Write a post"
            description="Share an update, doubt or resource"
            onClick={() => openComposer()}
          />
          <MenuRow
            icon={Bookmark}
            label="Saved posts"
            description={savedCount > 0 ? `${savedCount} bookmarked` : 'Nothing bookmarked yet'}
            to="/saved"
          />
          <MenuRow
            icon={Users}
            label="Your posts"
            description={compactNumber(me?.postsCount)} onClick={() => navigate(`/u/${user?.username}`)}
          />
        </Card>
      </div>

      {/* Account */}
      <div>
        <SectionTitle>Account</SectionTitle>
        <Card className="divide-y divide-line">
          <MenuRow
            icon={theme === 'dark' ? Sun : Moon}
            label="Appearance"
            description={theme === 'dark' ? 'Dark theme' : 'Light theme'}
            onClick={toggleTheme}
            trailing={
              <span className="rounded-md border border-line px-2 py-0.5 text-[12px] text-ink-3">
                {theme === 'dark' ? 'Dark' : 'Light'}
              </span>
            }
          />
          <MenuRow
            icon={Settings}
            label="Profile & security"
            description="Edit your details, change your password"
            to="/settings"
          />
          <MenuRow
            icon={MessageSquare}
            label="Messages"
            description="Private chat lands in Phase 4"
            onClick={() => navigate('/messages')}
          />
          <MenuRow icon={LogOut} label="Sign out" description={`Signed in as @${user?.username}`} onClick={handleLogout} danger />
        </Card>
      </div>

      {me?.createdAt && (
        <p className="pt-1 text-center text-[12px] text-ink-3">Member since {formatDate(me.createdAt)}</p>
      )}
    </div>
  );
}
