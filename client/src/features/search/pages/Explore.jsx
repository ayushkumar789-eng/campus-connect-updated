import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Compass, Search as SearchIcon, MessageCircle } from 'lucide-react';
import { Avatar } from '../../../shared/ui/Avatar.jsx';
import { Card, Badge } from '../../../shared/ui/Card.jsx';
import { Button } from '../../../shared/ui/Button.jsx';
import { EmptyState, ErrorState, CardSkeleton } from '../../../shared/ui/States.jsx';
import { useDebounce } from '../../../shared/hooks/useDebounce.js';
import { useSearch } from '../../../shared/hooks/useData.js';
import { errorMessage } from '../../../shared/api/client.js';
import { compactNumber, timeAgo, formatBytes, yearOfStudy } from '../../../shared/utils/format.js';
import { SUBJECTS } from '../../../app/layout/navItems.js';

const TABS = [
  { key: 'students', label: 'Students' },
  { key: 'groups', label: 'Groups' },
  { key: 'notes', label: 'Notes' },
  { key: 'posts', label: 'Posts' },
  { key: 'discussions', label: 'Discussions' },
];

const SUBJECT_FILTERS = ['All', ...SUBJECTS];

/**
 * Explore: browse the campus directory and filter by course, or search across
 * every content type. The rail below the filters is the Phase 3 Notes/Groups
 * surface, populated from live search results.
 */
export default function Explore() {
  const [term, setTerm] = useState('');
  const [tab, setTab] = useState('students');
  const [subject, setSubject] = useState('All');

  const debounced = useDebounce(term.trim(), 350);
  const hasQuery = debounced.length >= 2;
  const { data, isLoading, error, refetch } = useSearch(debounced);

  const students = hasQuery ? (data?.students ?? []) : [];
  const notes = (hasQuery ? (data?.notes ?? []) : []).filter((n) => subject === 'All' || n.subject === subject);
  const groups = hasQuery ? (data?.groups ?? []) : [];
  const posts = hasQuery ? (data?.posts ?? []) : [];
  const discussions = hasQuery ? (data?.discussions ?? []) : [];

  const resultCounts = {
    students: students.length,
    groups: groups.length,
    notes: notes.length,
    posts: posts.length,
    discussions: discussions.length,
  };

  return (
    <div className="space-y-4 pb-4">
      <div>
        <h1 className="text-xl font-bold tracking-[-0.02em] text-ink">Explore</h1>
        <p className="mt-0.5 text-[14px] text-ink-2">
          {hasQuery ? `Results for “${debounced}”` : 'Search your campus, or browse by subject.'}
        </p>
      </div>

      {/* Search field */}
      <Card className="p-3">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <input
            type="search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search students, groups, posts, notes…"
            aria-label="Search CampusConnect"
            className="h-10 w-full rounded-md border border-line bg-surface-2 pr-3 pl-9 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/25"
          />
        </div>

        {hasQuery && (
          <div className="mt-3 flex gap-1 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`shrink-0 rounded-md px-2.5 py-1.5 text-[12.5px] font-medium transition-colors ${
                  tab === t.key ? 'bg-accent-soft text-accent' : 'text-ink-3 hover:bg-surface-2 hover:text-ink'
                }`}
              >
                {t.label}
                {resultCounts[t.key] > 0 && <span className="ml-1 opacity-70">{resultCounts[t.key]}</span>}
              </button>
            ))}
          </div>
        )}
      </Card>

      {/* Subject filter, shown for notes and while browsing */}
      <div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {SUBJECT_FILTERS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setSubject(s);
                // The subject rail only filters the notes tab, which is itself
                // behind `hasQuery`. Picking a subject with an empty box would
                // otherwise highlight a chip and show nothing, so seed the
                // query and jump to the tab the filter can actually affect.
                if (s !== 'All' && !hasQuery) {
                  setTerm(s);
                  setTab('notes');
                }
              }}
              className={`shrink-0 rounded-md border px-2.5 py-1 text-[12.5px] font-medium transition-colors ${
                subject === s
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-line text-ink-3 hover:border-line-strong hover:text-ink'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {error && <ErrorState message={errorMessage(error)} onRetry={refetch} />}

      {isLoading && hasQuery && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <CardSkeleton key={i} lines={2} />
          ))}
        </div>
      )}

      {/* Results */}
      {!isLoading && hasQuery && (
        <>
          {tab === 'students' && (
            <div className="space-y-2">
              {students.length ? (
                students.map((s) => <StudentRow key={s.id} student={s} />)
              ) : (
                <EmptyState icon={Compass} title="No students found" description="Try a different name or username." />
              )}
            </div>
          )}

          {tab === 'groups' && (
            <div className="space-y-2">
              {groups.length ? (
                groups.map((g) => (
                  <Card key={g.id} className="p-4">
                    <div className="flex items-start gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
                        <Compass className="h-5 w-5" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-semibold text-ink">{g.name}</p>
                        <p className="mt-0.5 line-clamp-2 text-[13.5px] text-ink-2">{g.description}</p>
                        <p className="mt-1.5 text-[12.5px] text-ink-3">{compactNumber(g.memberCount)} members</p>
                      </div>
                      <Button size="sm" variant="outline" disabled>
                        Join
                      </Button>
                    </div>
                  </Card>
                ))
              ) : (
                <EmptyState title="No groups found" description="Groups are landing in Phase 3." />
              )}
            </div>
          )}

          {tab === 'notes' && (
            <div className="space-y-2">
              {notes.length ? (
                notes.map((n) => (
                  <Card key={n.id} className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-semibold text-ink">{n.title}</p>
                        <p className="mt-0.5 line-clamp-2 text-[13.5px] text-ink-2">{n.description}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <Badge size="sm" tone="accent">
                            {n.subject}
                          </Badge>
                          {n.course && <Badge size="sm">{n.course}</Badge>}
                          {n.semester && <Badge size="sm">Sem {n.semester}</Badge>}
                        </div>
                        <p className="mt-2 text-[12px] text-ink-3">
                          {compactNumber(n.downloadCount)} downloads · {n.file?.name} · {formatBytes(n.file?.size)}
                        </p>
                      </div>
                    </div>
                  </Card>
                ))
              ) : (
                <EmptyState
                  title={subject === 'All' ? 'No notes found' : `No notes for ${subject}`}
                  description="Search for a subject like DBMS, or browse the Notes section once it is live."
                />
              )}
            </div>
          )}

          {tab === 'posts' && (
            <div className="space-y-2">
              {posts.length ? (
                posts.map((p) => (
                  <Card key={p.id} className="p-4">
                    <div className="flex items-center gap-2">
                      <Avatar user={p.author} size="xs" />
                      <Link to={`/u/${p.author?.username}`} className="text-[13px] font-semibold text-ink hover:underline">
                        {p.author?.name}
                      </Link>
                      <span className="text-[12px] text-ink-3">{timeAgo(p.createdAt)}</span>
                    </div>
                    <p className="mt-2 line-clamp-3 text-[14px] text-ink">{p.content || p.resource?.title}</p>
                    <p className="mt-1.5 flex items-center gap-1 text-[12.5px] text-ink-3">
                      <MessageCircle className="h-3.5 w-3.5" aria-hidden />
                      {compactNumber(p.commentCount)} comments · {compactNumber(p.likeCount)} likes
                    </p>
                  </Card>
                ))
              ) : (
                <EmptyState title="No posts found" description="Try a different phrase." />
              )}
            </div>
          )}

          {tab === 'discussions' && (
            <div className="space-y-2">
              {discussions.length ? (
                discussions.map((d) => (
                  <Card key={d.id} className="p-4">
                    <p className="text-[15px] font-semibold text-ink">{d.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-[13.5px] text-ink-2">{d.body}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <Badge size="sm" tone="accent">
                        {d.category}
                      </Badge>
                      <span className="text-[12px] text-ink-3">
                        {compactNumber(d.score)} upvotes · {compactNumber(d.commentCount)} comments
                      </span>
                    </div>
                  </Card>
                ))
              ) : (
                <EmptyState title="No discussions found" description="The discussion forum lands in Phase 3." />
              )}
            </div>
          )}
        </>
      )}

      {/* Idle state: guide the user into their first search. */}
      {!hasQuery && (
        <EmptyState
          icon={Compass}
          title="Start typing to explore"
          description="Search across students, groups, notes, posts and discussions — or pick a subject above to jump straight to resources."
          action={
            <button
              type="button"
              onClick={() => document.querySelector('input[type="search"]')?.focus()}
              className="text-[13.5px] font-medium text-accent hover:underline"
            >
              Focus the search box
            </button>
          }
        />
      )}
    </div>
  );
}

function StudentRow({ student }) {
  return (
    <Link to={`/u/${student.username}`}>
      <Card className="flex items-center gap-3 p-3 transition-colors hover:border-line-strong">
        <Avatar user={student} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14.5px] font-semibold text-ink">{student.name}</p>
          <p className="truncate text-[12.5px] text-ink-3">
            @{student.username}
            {student.course && ` · ${student.course}`}
            {yearOfStudy(student.year) && ` · ${yearOfStudy(student.year)}`}
            {student.college && ` · ${student.college}`}
          </p>
          {student.skills?.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {student.skills.slice(0, 3).map((s) => (
                <Badge key={s} size="sm">
                  {s}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </Card>
    </Link>
  );
}
