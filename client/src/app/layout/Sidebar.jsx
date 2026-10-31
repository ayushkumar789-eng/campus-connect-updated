import { NavLink } from 'react-router-dom';
import { GraduationCap, Moon, Sun, LogOut, Settings, PlusCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { MOBILE_NAV, NAV_ITEMS, profileNav } from './navItems.js';
import { Avatar } from '../../shared/ui/Avatar.jsx';
import { useAuthStore } from '../../features/auth/hooks/useAuthStore.js';
import { useUIStore } from '../store/uiStore.js';
import { classNames } from '../../shared/utils/format.js';

function NavItem({ item, onNavigate }) {
  const Icon = item.icon;

  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        classNames(
          'group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
          isActive
            ? 'bg-accent-soft text-accent'
            : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon className={classNames('h-[18px] w-[18px] shrink-0', isActive ? 'text-accent' : 'text-ink-3 group-hover:text-ink-2')} aria-hidden />
          <span className="flex-1 truncate">{item.label}</span>
          {!item.available && (
            <span className="rounded border border-line px-1 text-[10px] font-medium text-ink-3">P{item.phase}</span>
          )}
        </>
      )}
    </NavLink>
  );
}

/** Persistent desktop navigation. Hidden below the `lg` breakpoint. */
export function Sidebar() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const theme = useAuthStore((s) => s.theme);
  const toggleTheme = useAuthStore((s) => s.toggleTheme);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-surface lg:flex xl:w-64">
      <div className="flex h-14 items-center gap-2.5 border-b border-line px-5">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-accent-ink">
          <GraduationCap className="h-4 w-4" aria-hidden />
        </span>
        <span className="text-[15px] font-bold tracking-[-0.02em] text-ink">CampusConnect</span>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
        {NAV_ITEMS.map((item) => (
          <NavItem key={item.to} item={item} />
        ))}

        <div className="my-3 border-t border-line" />

        {profileNav
          .filter((item) => !item.adminOnly || user?.role === 'admin')
          .map((item) => (
            <NavItem key={item.to} item={item} />
          ))}
      </nav>

      {/* Account block doubles as the theme switch and sign-out control. */}
      <div className="border-t border-line p-3">
        <div className="flex items-center gap-2.5 rounded-md p-2">
          <Avatar user={user} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-ink">{user?.name}</p>
            <p className="truncate text-[12px] text-ink-3">@{user?.username}</p>
          </div>
        </div>

        <div className="mt-1 flex items-center gap-1">
          <button
            type="button"
            onClick={toggleTheme}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md py-2 text-[12.5px] font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
          <NavLink
            to="/settings"
            aria-label="Settings"
            className="rounded-md p-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <Settings className="h-4 w-4" aria-hidden />
          </NavLink>
          <button
            type="button"
            onClick={handleLogout}
            aria-label="Sign out"
            className="rounded-md p-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-danger"
          >
            <LogOut className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    </aside>
  );
}

/** Fixed bottom tab bar. The centre action opens the composer. */
export function MobileNav() {
  const user = useAuthStore((s) => s.user);
  const composerOpen = useUIStore((s) => s.composerOpen);
  const openComposer = useUIStore((s) => s.openComposer);
  const closeComposer = useUIStore((s) => s.closeComposer);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface lg:hidden">
      <div className="grid grid-cols-5">
        {MOBILE_NAV.map((item) => {
          const Icon = item.icon;

          if (item.isAction) {
            return (
              <button
                key={item.to}
                type="button"
                onClick={composerOpen ? closeComposer : openComposer}
                aria-label="Create a post"
                className="flex flex-col items-center gap-0.5 py-2 text-ink-3"
              >
                <span className="-mt-4 flex h-11 w-11 items-center justify-center rounded-full border-4 border-canvas bg-accent text-accent-ink shadow-pop">
                  <PlusCircle className="h-6 w-6" aria-hidden />
                </span>
                <span className="text-[11px] font-medium">{composerOpen ? 'Close' : 'Post'}</span>
              </button>
            );
          }

          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                classNames(
                  'flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors',
                  isActive ? 'text-accent' : 'text-ink-3',
                )
              }
            >
              {item.to === '/profile' && <Avatar user={user} size="xs" className="h-5 w-5" />}
              <Icon className="h-5 w-5" aria-hidden />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </div>
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}
