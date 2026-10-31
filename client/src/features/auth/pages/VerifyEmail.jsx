import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { MailCheck, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { AuthLayout } from './AuthLayout.jsx';
import { Button } from '../../../shared/ui/Button.jsx';
import { authApi } from '../index.js';
;
import { errorMessage } from '../../../shared/api/client.js';
import { useAuthStore } from '../hooks/useAuthStore.js';
import { toast } from '../../../shared/ui/Toast.jsx';

const COOLDOWN_SECONDS = 45;

/**
 * "Confirm your email".
 *
 * Reached three ways, and must work in all of them:
 *  • straight after registration, where `?token=` is already in the URL;
 *  • by clicking the link in the email later, possibly in another browser;
 *  • by navigating here manually and asking for another link.
 */
export default function VerifyEmail() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const token = params.get('token');

  // 'verifying' | 'verified' | 'idle' | 'error'
  const [state, setState] = useState(token ? 'verifying' : 'idle');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  /**
   * The in-flight verification, held so it is issued exactly once.
   *
   * A ref holding the *promise* rather than a "have I run?" boolean, because
   * those two are not equivalent under React StrictMode. StrictMode mounts an
   * effect, tears it down, then runs it again; a boolean guard makes the second
   * run bail while the first run's result is discarded by its cleanup, so the
   * screen sits on "Verifying…" forever. Storing the promise means the repeat
   * invocation awaits the request already in flight and applies the same
   * result — one request, and the state always lands.
   */
  const inFlight = useRef(null);

  useEffect(() => {
    if (!token) return;

    inFlight.current ??= authApi
      .verifyEmail(token)
      .then((res) => {
        setUser(res.data.user);
        setState('verified');
        // Clear the token from the address bar so a refresh cannot re-submit a
        // link that has already been spent.
        window.history.replaceState({}, '', '/verify-email');
      })
      .catch((err) => {
        setError(errorMessage(err));
        setState('error');
      });

    return undefined;
  }, [token, setUser]);

  // Resend cooldown, ticked client-side so the button cannot be hammered into
  // the server's rate limit.
  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const resend = async () => {
    if (!user?.email) return;
    setSending(true);
    try {
      const res = await authApi.resendVerification(user.email);
      setCooldown(COOLDOWN_SECONDS);
      toast.success(res.message);
      // Development convenience: the API hands back the token so the flow is
      // testable with no mail provider. Never present in production.
      if (res.data?.devVerificationToken) {
        navigate(`/verify-email?token=${encodeURIComponent(res.data.devVerificationToken)}`);
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  // ── Success ──────────────────────────────────────────────────────────────
  if (state === 'verified') {
    return (
      <AuthLayout title="Email confirmed" subtitle="Your address is verified and your account is ready.">
        <div className="rounded-xl border border-border bg-surface p-6 text-center">
          <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-accent-soft text-success">
            <CheckCircle2 className="h-6 w-6" aria-hidden />
          </span>
          <p className="text-[14.5px] text-ink-2">
            <span className="font-medium text-ink">{user?.email}</span> is now confirmed.
          </p>
          <Button className="mt-5 w-full justify-center" onClick={() => navigate('/setup')}>
            Continue to your profile
          </Button>
        </div>
      </AuthLayout>
    );
  }

  // ── Verifying ────────────────────────────────────────────────────────────
  if (state === 'verifying') {
    return (
      <AuthLayout title="Confirming your email" subtitle="One moment while we check your link.">
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-surface px-6 py-10">
          <Loader2 className="h-6 w-6 animate-spin text-accent" aria-hidden />
          <p className="text-[14.5px] text-ink-2">Verifying your confirmation link…</p>
        </div>
      </AuthLayout>
    );
  }

  // ── Idle or error: ask for the link / offer a retry ──────────────────────
  return (
    <AuthLayout
      title={state === 'error' ? 'That link did not work' : 'Confirm your email'}
      subtitle={
        state === 'error'
          ? 'Verification links expire and can only be used once.'
          : `We sent a confirmation link to ${user?.email ?? 'your email address'}.`
      }
      footer={
        <Link to="/home" className="font-medium text-accent hover:underline">
          Skip for now
        </Link>
      }
    >
      <div className="space-y-4">
        {state === 'error' && (
          <div
            role="alert"
            className="flex gap-2.5 rounded-lg border border-danger/30 bg-danger/5 px-3.5 py-3 text-[13.5px] text-danger"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{error}</span>
          </div>
        )}

        <div className="rounded-xl border border-border bg-surface p-6 text-center">
          <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-accent-soft text-accent">
            <MailCheck className="h-6 w-6" aria-hidden />
          </span>
          <p className="text-[14.5px] text-ink-2">
            A confirmed address lets other students trust your posts and messages. It takes one click.
          </p>

          <Button
            className="mt-5 w-full justify-center"
            onClick={resend}
            disabled={sending || cooldown > 0 || !user?.email}
          >
            {sending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Sending…
              </>
            ) : cooldown > 0 ? (
              `Send again in ${cooldown}s`
            ) : state === 'error' ? (
              'Send me a new link'
            ) : (
              'Resend the link'
            )}
          </Button>

          {!user?.email && (
            <p className="mt-3 text-[13px] text-ink-2">
              Signed in as a different account?{' '}
              <Link to="/login" className="font-medium text-accent hover:underline">
                Sign in again
              </Link>
            </p>
          )}
        </div>
      </div>
    </AuthLayout>
  );
}
