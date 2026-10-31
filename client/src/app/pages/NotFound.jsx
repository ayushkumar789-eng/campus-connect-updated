import { Link } from 'react-router-dom';
import { Compass, Home, Search } from 'lucide-react';
import { Button } from '../../shared/ui/Button.jsx';
import { useAuthStore } from '../../features/auth/hooks/useAuthStore.js';

const SUGGESTIONS = [
  { to: '/home', label: 'Home feed', icon: Home },
  { to: '/explore', label: 'Explore campus', icon: Compass },
  { to: '/search', label: 'Search', icon: Search },
];

/** 404. Kept outside the app shell so it renders for signed-out visitors too. */
export default function NotFound() {
  const status = useAuthStore((s) => s.status);
  const isSignedIn = status === 'authenticated';
  const home = isSignedIn ? '/home' : '/';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-6 text-center">
      <p className="text-[13px] font-semibold tracking-[0.2em] text-accent uppercase">Error 404</p>
      <h1 className="mt-3 text-3xl font-bold tracking-[-0.03em] text-ink sm:text-4xl">
        This page does not exist
      </h1>
      <p className="mt-2.5 max-w-md text-[15px] leading-relaxed text-ink-2">
        The link may be out of date, or the post, group or profile it pointed to has been removed.
      </p>

      <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
        <Link to={home}>
          <Button size="lg" leftIcon={Home}>
            {isSignedIn ? 'Back to feed' : 'Go to CampusConnect'}
          </Button>
        </Link>
        <Link to="/explore">
          <Button size="lg" variant="secondary" leftIcon={Compass}>
            Explore
          </Button>
        </Link>
      </div>

      <div className="mt-10 flex flex-wrap items-center justify-center gap-2 border-t border-line pt-6">
        {SUGGESTIONS.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 text-[13px] font-medium text-ink-2 transition-colors hover:border-accent hover:text-accent"
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}
