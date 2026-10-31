import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, SlidersHorizontal, X, Users } from 'lucide-react';
import { Select } from '../../../../shared/ui/Input.jsx';
import { Button } from '../../../../shared/ui/Button.jsx';
import { Avatar } from '../../../../shared/ui/Avatar.jsx';
import { EmptyState, ErrorState } from '../../../../shared/ui/States.jsx';
import { useDirectory, useFollow } from '../../../../shared/hooks/useData.js';
import { useDebounce } from '../../../../shared/hooks/useDebounce.js';
import { useAuthStore } from '../../../auth/hooks/useAuthStore.js';
import { COURSES } from '../../../../app/layout/navItems.js';
import { yearOfStudy } from '../../../../shared/utils/format.js';

/**
 * Student directory.
 *
 * The real discovery surface: search across name, username, college, course and
 * skills, narrowed by course and year, paginated on the server.
 *
 * Two things keep it fast as the directory grows:
 *  • the text box is debounced, so typing "priya" fires one request, not five;
 *  • paging is server-side cursor pagination, so the browser never holds the
 *    full user collection.
 */
export default function Students() {
  const [text, setText] = useState('');
  const [course, setCourse] = useState('');
  const [year, setYear] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const debouncedText = useDebounce(text, 350);
  const sentinel = useRef(null);

  const filters = { search: debouncedText, course, year };
  const { data, isLoading, isFetching, isError, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useDirectory(filters);

  const students = data?.pages.flatMap((page) => page.data) ?? [];
  const isFiltered = Boolean(debouncedText.trim() || course || year);

  // Infinite scroll, but only once the user has actually reached the end.
  // Firing on mount would fetch every page of an unfiltered directory before
  // anyone has scrolled.
  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) return undefined;
    const node = sentinel.current;
    if (!node) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) fetchNextPage();
      },
      // Start loading before the spinner is actually on screen.
      { rootMargin: '400px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, students.length]);

  const clearFilters = () => {
    setText('');
    setCourse('');
    setYear('');
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <header>
        <h1 className="text-xl font-bold tracking-[-0.02em] text-ink">Find students</h1>
        <p className="mt-0.5 text-[14px] text-ink-2">Search by name, username, college, course or skills.</p>
      </header>

      {/* ── Search ───────────────────────────────────────────────────── */}
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3"
            aria-hidden
          />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Search students…"
            aria-label="Search students"
            className="h-10 w-full rounded-md border border-line bg-surface pl-9 pr-9 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
          />
          {text && (
            <button
              type="button"
              onClick={() => setText('')}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded text-ink-3 transition-colors hover:text-ink"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>

        <Button
          variant={showFilters || course || year ? 'primary' : 'secondary'}
          onClick={() => setShowFilters((v) => !v)}
          aria-expanded={showFilters}
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Filters</span>
          {(course || year) && <span className="ml-0.5 text-[12px] opacity-80">{Number(Boolean(course)) + Number(Boolean(year))}</span>}
        </Button>
      </div>

      {showFilters && (
        <div className="grid gap-3 rounded-lg border border-line bg-surface p-3 sm:grid-cols-2">
          <Select label="Course" value={course} onChange={(e) => setCourse(e.target.value)}>
            <option value="">Any course</option>
            {COURSES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Select label="Year" value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="">Any year</option>
            {[1, 2, 3, 4, 5].map((y) => (
              <option key={y} value={y}>
                {yearOfStudy(y)}
              </option>
            ))}
          </Select>
          {isFiltered && (
            <div className="sm:col-span-2">
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="h-3.5 w-3.5" aria-hidden />
                Clear all filters
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── Results ──────────────────────────────────────────────────── */}
      {isError ? (
        <ErrorState
          title="Could not load students"
          message={error?.message}
          onRetry={() => refetch()}
        />
      ) : isLoading ? (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {Array.from({ length: 6 }).map((_, i) => (
            <li key={i} className="flex items-center gap-3 p-3.5">
              <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-surface-3" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-32 animate-pulse rounded bg-surface-3" />
                <div className="h-2.5 w-48 animate-pulse rounded bg-surface-3" />
              </div>
            </li>
          ))}
        </ul>
      ) : students.length === 0 ? (
        <EmptyState
          icon={Users}
          title={isFiltered ? 'No students found' : 'No students yet'}
          description={
            isFiltered
              ? `Nobody matches ${[debouncedText.trim() && `"${debouncedText.trim()}"`, course, year && yearOfStudy(year)]
                  .filter(Boolean)
                  .join(' · ')}. Try a broader search.`
              : 'You are the first student on CampusConnect. When others join, they will appear here.'
          }
          action={
            isFiltered ? (
              <Button variant="secondary" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : null
          }
        />
      ) : (
        <>
          <p className="text-[13px] text-ink-3" aria-live="polite">
            {students.length} student{students.length === 1 ? '' : 's'}
            {isFetching && !isFetchingNextPage ? ' · updating…' : ''}
          </p>

          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {students.map((person) => (
              <StudentRow key={person.id} person={person} />
            ))}
          </ul>

          {/* Infinite-scroll trigger. Kept in the layout (not conditionally
              rendered) so the observer has a stable node to watch. */}
          <div ref={sentinel} className="h-px w-full" aria-hidden />

          {isFetchingNextPage && (
            <p className="py-3 text-center text-[13px] text-ink-3">Loading more students…</p>
          )}

          {!hasNextPage && students.length > 0 && (
            <p className="py-3 text-center text-[13px] text-ink-3">That is everyone.</p>
          )}

          {/* Keyboard users get an explicit control; infinite scroll alone
              would make the rest of the list unreachable without a mouse. */}
          {hasNextPage && (
            <div className="flex justify-center pb-4">
              <Button variant="secondary" onClick={() => fetchNextPage()} loading={isFetchingNextPage}>
                Load more students
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StudentRow({ person }) {
  const currentUser = useAuthStore((s) => s.user);
  const follow = useFollow();

  // The API already excludes the viewer, but the guard is cheap and keeps the
  // invariant local rather than something to remember later.
  const isSelf = currentUser?.id === person.id || currentUser?.username === person.username;
  // `useFollow` takes `{ id }`, so the pending check must match on the
  // variable's id rather than comparing the object itself.
  const busy = follow.isPending && follow.variables?.id === person.id;

  return (
    <li className="flex items-center gap-3 p-3.5">
      <Link to={`/u/${person.username}`} className="shrink-0">
        <Avatar user={person} size="md" />
      </Link>

      <div className="min-w-0 flex-1">
        <Link to={`/u/${person.username}`} className="block truncate text-[14px] font-semibold text-ink hover:underline">
          {person.name}
        </Link>
        <p className="truncate text-[12.5px] text-ink-3">
          @{person.username}
          {person.college ? ` · ${person.college}` : ''}
          {person.course ? ` · ${person.course}` : ''}
          {person.year ? ` · ${yearOfStudy(person.year)}` : ''}
        </p>
        {person.skills?.length > 0 && (
          <p className="mt-0.5 truncate text-[12px] text-ink-3">{person.skills.slice(0, 3).join(' · ')}</p>
        )}
      </div>

      {!isSelf && (
        <Button size="sm" onClick={() => follow.mutate({ id: person.id })} disabled={busy}>
          {busy ? 'Following…' : 'Follow'}
        </Button>
      )}
    </li>
  );
}
