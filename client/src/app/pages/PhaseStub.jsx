import { Link } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Construction, Home, Mail } from 'lucide-react';
import { Card, Badge } from '../../shared/ui/Card.jsx';
import { Button } from '../../shared/ui/Button.jsx';
import { useAuthStore } from '../../features/auth/hooks/useAuthStore.js';

/**
 * Placeholder for a module whose models exist but whose API lands in a later
 * phase. It states what is coming and when, rather than showing an empty page
 * or pretending the feature is broken.
 *
 * @param {{ module: string, phase: number, adminOnly?: boolean }} props
 */
export default function PhaseStub({ module, phase, adminOnly = false }) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  // The admin area also enforces a role check, so an admin-only stub should not
  // tease a non-admin behind a wall they were never meant to reach.
  if (adminOnly && user?.role !== 'admin') return <NavigateToHome />;

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-4">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-ink-2 transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back
      </button>

      <Card className="px-6 py-12 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Construction className="h-6 w-6" aria-hidden />
        </span>

        <div className="mt-4 flex items-center justify-center gap-2">
          <h1 className="text-xl font-bold tracking-[-0.02em] text-ink">{module}</h1>
          <Badge tone="accent">Phase {phase}</Badge>
        </div>

        <p className="mx-auto mt-2 max-w-md text-[14.5px] leading-relaxed text-ink-2">
          The data model and index for this module are already in place, and search already
          returns its records. The screens and endpoints are being built next — the sidebar
          entry is here on purpose so you can see what is coming.
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <Link to="/home">
            <Button leftIcon={Home}>Back to feed</Button>
          </Link>
          <Link to="/explore">
            <Button variant="secondary">Explore instead</Button>
          </Link>
        </div>
      </Card>

      <p className="flex items-center justify-center gap-1.5 text-[12.5px] text-ink-3">
        <Mail className="h-3.5 w-3.5" aria-hidden />
        Want to help prioritise what lands first? Tell your campus admin.
      </p>
    </div>
  );
}

function NavigateToHome() {
  return (
    <div className="py-8">
      <Card className="px-6 py-12 text-center">
        <h1 className="text-xl font-bold tracking-[-0.02em] text-ink">Nothing to see here</h1>
        <p className="mx-auto mt-2 max-w-md text-[14.5px] text-ink-2">
          This area is restricted to platform administrators.
        </p>
        <div className="mt-6 flex justify-center">
          <Link to="/home">
            <Button leftIcon={Home}>Back to feed</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
