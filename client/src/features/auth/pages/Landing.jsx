import { Link } from 'react-router-dom';
import {
  GraduationCap,
  BookOpen,
  Users,
  MessageSquare,
  CalendarDays,
  ArrowRight,
  Moon,
  Sun,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { Button } from '../../../shared/ui/Button.jsx';
import { useAuthStore } from '../hooks/useAuthStore.js';
import { useDebounce } from '../../../shared/hooks/useDebounce.js';
import { useSearch } from '../../../shared/hooks/useData.js';
import { Avatar } from '../../../shared/ui/Avatar.jsx';

const FEATURES = [
  { icon: BookOpen, title: 'Share notes & resources', body: 'Upload PDFs, tag them by subject and semester, and let the whole batch download them.' },
  { icon: Users, title: 'Join subject groups', body: 'Course batches, tech communities and placement circles with their own discussions.' },
  { icon: MessageSquare, title: 'Ask, answer, discuss', body: 'A Reddit-style forum where a good answer gets the same respect as a good post.' },
  { icon: CalendarDays, title: 'Never miss an event', body: 'Hackathons, tech fests and placement drives, with reminders before they start.' },
];

const STEPS = [
  { n: 1, title: 'Create your account', body: 'Email, username and a password. Takes about thirty seconds.' },
  { n: 2, title: 'Set up your profile', body: 'Add your college, course, year and the skills you want to be known for.' },
  { n: 3, title: 'Follow a few students', body: 'Start with your classmates. Your feed fills in from there.' },
];

/**
 * A small live preview of real search results, so the landing page shows the
 * actual product rather than a mock screenshot.
 */
function LivePreview() {
  const [term] = useState('react'); // fixed sample query; no input on this page
  const debounced = useDebounce(term, 500);
  const { data } = useSearch(debounced);

  const students = data?.students?.slice(0, 2) ?? [];
  const posts = data?.posts?.slice(0, 1) ?? [];

  return (
    <div className="w-full max-w-md rounded-xl border border-line bg-surface p-4 shadow-overlay">
      <div className="mb-3 flex items-center gap-2 rounded-md border border-line bg-surface-2 px-3 py-2">
        <span className="text-[13px] text-ink-3">Search CampusConnect…</span>
        <span className="ml-auto rounded border border-line bg-surface px-1.5 py-0.5 text-[11px] text-ink-3">{term}</span>
      </div>

      {students.length ? (
        <div className="space-y-3">
          {students.map((s) => (
            <div key={s.id} className="flex items-center gap-2.5">
              <Avatar user={s} size="sm" />
              <div className="min-w-0">
                <p className="truncate text-[13.5px] font-semibold text-ink">{s.name}</p>
                <p className="truncate text-[12px] text-ink-3">
                  @{s.username} · {s.course}
                </p>
              </div>
            </div>
          ))}
          {posts.map((p) => (
            <div key={p.id} className="rounded-lg border border-line bg-surface-2 p-2.5">
              <p className="line-clamp-2 text-[12.5px] text-ink">{p.content}</p>
              <p className="mt-1 text-[11px] text-ink-3">{p.author?.name}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-2.5">
              <div className="skeleton h-9 w-9 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <div className="skeleton h-3 w-28" />
                <div className="skeleton h-2.5 w-20" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Landing() {
  const theme = useAuthStore((s) => s.theme);
  const toggleTheme = useAuthStore((s) => s.toggleTheme);
  const [year, setYear] = useState(new Date().getFullYear());

  useEffect(() => setYear(new Date().getFullYear()), []);

  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-accent-ink">
            <GraduationCap className="h-4 w-4" aria-hidden />
          </span>
          <span className="text-[15px] font-bold tracking-[-0.02em] text-ink">CampusConnect</span>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle dark mode"
              className="rounded-md p-2 text-ink-2 transition-colors hover:bg-surface-2"
            >
              {theme === 'dark' ? <Sun className="h-4.5 w-4.5" aria-hidden /> : <Moon className="h-4.5 w-4.5" aria-hidden />}
            </button>
            <Link to="/login">
              <Button variant="ghost" size="sm">
                Log in
              </Button>
            </Link>
            <Link to="/register">
              <Button size="sm">Get started</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 pt-14 pb-12 sm:px-6 sm:pt-20">
        <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-[12.5px] font-medium text-ink-2">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
              For college students
            </span>

            <h1 className="mt-5 text-4xl leading-[1.08] font-bold tracking-[-0.03em] text-ink sm:text-5xl lg:text-[3.4rem]">
              One platform built
              <br />
              for college life.
            </h1>

            <p className="mt-5 max-w-lg text-[17px] leading-relaxed text-ink-2">
              CampusConnect is where your batch shares notes, argues about placements, finds events and
              actually talks to each other — instead of scattering across five different apps.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link to="/register" className="sm:w-auto">
                <Button size="lg" className="w-full" rightIcon={ArrowRight}>
                  Create your account
                </Button>
              </Link>
              <Link to="/login" className="sm:w-auto">
                <Button size="lg" variant="secondary" className="w-full">
                  I already have one
                </Button>
              </Link>
            </div>

            <p className="mt-4 text-[13px] text-ink-3">Free forever. No email verification, no ads.</p>
          </div>

          <div className="flex justify-center lg:justify-end">
            <LivePreview />
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="max-w-xl text-2xl font-bold tracking-[-0.02em] text-ink sm:text-3xl">
            Everything a student network actually needs.
          </h2>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-lg border border-line bg-canvas p-5">
                <span className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-md bg-accent-soft text-accent">
                  <f.icon className="h-[18px] w-[18px]" aria-hidden />
                </span>
                <h3 className="text-[15px] font-semibold text-ink">{f.title}</h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-ink-2">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Getting started */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <h2 className="text-2xl font-bold tracking-[-0.02em] text-ink sm:text-3xl">Up and running in three steps.</h2>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
              No onboarding tour, no "import your contacts". Just tell us who you are and start posting.
            </p>
          </div>

          <ol className="space-y-3">
            {STEPS.map((step) => (
              <li key={step.n} className="flex gap-4 rounded-lg border border-line bg-surface p-4">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-[13px] font-bold text-accent-ink">
                  {step.n}
                </span>
                <div>
                  <h3 className="text-[15px] font-semibold text-ink">{step.title}</h3>
                  <p className="mt-0.5 text-[14px] text-ink-2">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="border-t border-line bg-surface">
        <div className="mx-auto max-w-3xl px-4 py-14 text-center sm:px-6">
          <h2 className="text-2xl font-bold tracking-[-0.02em] text-ink sm:text-3xl">
            Your batch is already here.
          </h2>
          <p className="mx-auto mt-3 max-w-md text-[15px] text-ink-2">
            Join the students sharing notes, solving problems and finding events on one platform.
          </p>
          <Link to="/register" className="mt-6 inline-block">
            <Button size="lg" rightIcon={ArrowRight}>
              Create your account
            </Button>
          </Link>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-[12.5px] text-ink-3 sm:flex-row sm:px-6">
          <p>© {year} CampusConnect — Student Social & Academic Community Platform.</p>
          <p className="flex items-center gap-1.5">
            Built with <span className="font-medium text-ink-2">React, Node, MongoDB</span>
          </p>
        </div>
      </footer>
    </div>
  );
}
