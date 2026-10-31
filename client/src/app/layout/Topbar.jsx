import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Search, X, GraduationCap, Bell, Moon, Sun } from 'lucide-react';
import { Avatar } from '../../shared/ui/Avatar.jsx';
import { useAuthStore } from '../../features/auth/hooks/useAuthStore.js';
import { useDebounce } from '../../shared/hooks/useDebounce.js';
import { useSearch, useUnreadCount } from '../../shared/hooks/useData.js';
import { compactNumber, classNames, yearOfStudy } from '../../shared/utils/format.js';

const TABS = [
  { key: 'students', label: 'Students' },
  { key: 'posts', label: 'Posts' },
  { key: 'groups', label: 'Groups' },
  { key: 'notes', label: 'Notes' },
  { key: 'discussions', label: 'Discussions' },
];

/**
 * Global search. Results are fetched per tab and only after the user pauses,
 * and every result is keyboard reachable.
 */
export function GlobalSearch({ autoFocus = false, onNavigate }) {
  const [params, setParams] = useSearchParams();
  const [term, setTerm] = useState(params.get('q') ?? '');
  const [tab, setTab] = useState('students');
  const debounced = useDebounce(term, 350);
  // A primitive, so the URL-sync effect below depends on the value rather than
  // on a fresh URLSearchParams object on every render.
  const queryParam = params.get('q') ?? '';
  const navigate = useNavigate();
  const containerRef = useRef(null);

  const { data, isFetching } = useSearch(debounced.trim());

  // Keep the URL in sync so a search can be shared or reloaded.
  //
  // Both directions matter. Only ever setting it left `?q=` behind when the box
  // was cleared or fell under two characters, and since the input is seeded from
  // `?q=` on mount, a refresh — or anyone following a shared link — got the
  // abandoned query typed back in with its stale results. Each branch compares
  // against the live value first so a redundant write cannot bounce the effect
  // against its own dependency.
  useEffect(() => {
    const q = debounced.trim();

    if (q.length >= 2) {
      if (queryParam !== q) setParams({ q }, { replace: true });
    } else if (queryParam) {
      setParams({}, { replace: true });
    }
  }, [debounced, queryParam, setParams]);

  useEffect(() => {
    const onClickAway = (event) => {
      if (!containerRef.current?.contains(event.target)) onNavigate?.();
    };
    document.addEventListener('mousedown', onClickAway);
    return () => document.removeEventListener('mousedown', onClickAway);
  }, [onNavigate]);

  const hasQuery = debounced.trim().length >= 2;
  const availableTabs = TABS.filter((t) => (data?.[t.key]?.length ?? 0) > 0);

  const go = (path) => {
    onNavigate?.();
    navigate(path);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
        <input
          type="search"
          value={term}
          autoFocus={autoFocus}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search CampusConnect…"
          aria-label="Search students, groups, posts, notes and discussions"
          className={classNames(
            'h-9 w-full rounded-md border border-line bg-surface-2 pr-9 pl-9 text-sm text-ink',
            'placeholder:text-ink-3 focus:border-accent focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/25',
          )}
        />
        {term && (
          <button
            type="button"
            onClick={() => setTerm('')}
            aria-label="Clear search"
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-ink-3 hover:text-ink"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </div>

      {hasQuery && (
        <div className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-lg border border-line bg-surface shadow-overlay">
          <div className="flex items-center gap-1 overflow-x-auto border-b border-line px-2 py-2">
            {TABS.map((t) => {
              const count = data?.[t.key]?.length ?? 0;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={classNames(
                    'shrink-0 rounded-md px-2.5 py-1 text-[12.5px] font-medium transition-colors',
                    tab === t.key ? 'bg-accent-soft text-accent' : 'text-ink-3 hover:bg-surface-2 hover:text-ink',
                  )}
                >
                  {t.label}
                  {count > 0 && <span className="ml-1 opacity-70">{count}</span>}
                </button>
              );
            })}
            {isFetching && <span className="ml-auto px-1 text-[12px] text-ink-3">Searching…</span>}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {!availableTabs.length && !isFetching && (
              <p className="px-4 py-8 text-center text-sm text-ink-3">
                No matches for “{debounced}”. Try a different spelling.
              </p>
            )}

            {tab === 'students' &&
              data?.students?.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => go(`/u/${s.username}`)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-2"
                >
                  <Avatar user={s} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{s.name}</span>
                    <span className="block truncate text-[12.5px] text-ink-3">
                      {['@' + s.username, s.course, yearOfStudy(s.year)].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </button>
              ))}

            {tab === 'posts' &&
              data?.posts?.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => go(`/posts/${p.id}`)}
                  className="block w-full px-4 py-2.5 text-left transition-colors hover:bg-surface-2"
                >
                  <p className="line-clamp-2 text-sm text-ink">{p.content || p.resource?.title}</p>
                  <p className="mt-0.5 text-[12.5px] text-ink-3">
                    {p.author?.name} · {compactNumber(p.likeCount)} likes
                  </p>
                </button>
              ))}

            {tab === 'groups' &&
              data?.groups?.map((g) => (
                <div key={g.id} className="px-4 py-2.5">
                  <p className="text-sm font-medium text-ink">{g.name}</p>
                  <p className="line-clamp-2 text-[12.5px] text-ink-3">
                    {compactNumber(g.memberCount)} members · {g.description}
                  </p>
                </div>
              ))}

            {tab === 'notes' &&
              data?.notes?.map((n) => (
                <div key={n.id} className="px-4 py-2.5">
                  <p className="text-sm font-medium text-ink">{n.title}</p>
                  <p className="truncate text-[12.5px] text-ink-3">
                    {n.subject}
                    {n.semester ? ` · Sem ${n.semester}` : ''} · {compactNumber(n.downloadCount)} downloads
                  </p>
                </div>
              ))}

            {tab === 'discussions' &&
              data?.discussions?.map((d) => (
                <div key={d.id} className="px-4 py-2.5">
                  <p className="text-sm font-medium text-ink">{d.title}</p>
                  <p className="text-[12.5px] text-ink-3">
                    {compactNumber(d.score)} upvotes · {compactNumber(d.commentCount)} comments
                  </p>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Sticky app header: brand, search, notifications and account. */
export function Topbar() {
  const user = useAuthStore((s) => s.user);
  const theme = useAuthStore((s) => s.theme);
  const toggleTheme = useAuthStore((s) => s.toggleTheme);
  const [searchOpen, setSearchOpen] = useState(false);
  const unread = useUnreadCount(Boolean(user));

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface">
      <div className="flex h-14 items-center gap-3 px-4 sm:px-5">
        <Link to="/" className="flex shrink-0 items-center gap-2 lg:hidden">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-accent-ink">
            <GraduationCap className="h-4 w-4" aria-hidden />
          </span>
        </Link>

        <div className="hidden min-w-0 max-w-md flex-1 md:block">
          <GlobalSearch />
        </div>

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="Search"
            className="rounded-md p-2 text-ink-2 transition-colors hover:bg-surface-2 md:hidden"
          >
            <Search className="h-5 w-5" aria-hidden />
          </button>

          <Link
            to="/notifications"
            aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
            className="relative rounded-md p-2 text-ink-2 transition-colors hover:bg-surface-2"
          >
            <Bell className="h-5 w-5" aria-hidden />
            {unread > 0 && (
              <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white tabular-nums">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </Link>

          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="hidden rounded-md p-2 text-ink-2 transition-colors hover:bg-surface-2 sm:block"
          >
            {theme === 'dark' ? <Sun className="h-5 w-5" aria-hidden /> : <Moon className="h-5 w-5" aria-hidden />}
          </button>

          <Link to="/profile" className="ml-1 rounded-full" aria-label="Your profile">
            <Avatar user={user} size="sm" />
          </Link>
        </div>
      </div>

      {/* Mobile search is a full-width sheet instead of a cramped inline field. */}
      {searchOpen && (
        <div className="border-t border-line px-4 py-2 md:hidden">
          <GlobalSearch autoFocus onNavigate={() => setSearchOpen(false)} />
        </div>
      )}
    </header>
  );
}
