import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ShieldAlert, Home } from 'lucide-react';
import { Button } from '../../shared/ui/Button.jsx';
import { useAuthStore } from '../../features/auth/hooks/useAuthStore.js';

/**
 * 403. The route exists, but this account cannot open it — almost always the
 * admin area for a non-admin.
 */
export default function Unauthorized() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const status = useAuthStore((s) => s.status);

  const home = status === 'authenticated' ? '/home' : '/login';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-6 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger">
        <ShieldAlert className="h-6 w-6" aria-hidden />
      </span>

      <h1 className="mt-4 text-3xl font-bold tracking-[-0.03em] text-ink sm:text-4xl">
        You do not have access
      </h1>
      <p className="mt-2.5 max-w-md text-[15px] leading-relaxed text-ink-2">
        This area is restricted to platform administrators.
        {user && ` You are signed in as @${user.username}.`}
      </p>

      <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
        <Link to={home}>
          <Button size="lg" leftIcon={Home}>
            {status === 'authenticated' ? 'Back to feed' : 'Sign in'}
          </Button>
        </Link>
        <Button size="lg" variant="secondary" leftIcon={ArrowLeft} onClick={() => navigate(-1)}>
          Go back
        </Button>
      </div>
    </div>
  );
}
