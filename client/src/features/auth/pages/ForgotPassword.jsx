import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Loader2, MailCheck, ArrowLeft } from 'lucide-react';
import { AuthLayout } from './AuthLayout.jsx';
import { Input } from '../../../shared/ui/Input.jsx';
import { Button } from '../../../shared/ui/Button.jsx';
import { authApi } from '../index.js';
;
import { errorMessage } from '../../../shared/api/client.js';

/**
 * "Forgot your password".
 *
 * The screen always confirms, whether or not the address is registered. That
 * is not politeness — a different message for a known address turns this form
 * into an account-enumeration oracle, which is exactly what it must not be.
 */
export default function ForgotPassword() {
  const [sent, setSent] = useState(false);
  const [devLink, setDevLink] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { email: '' } });

  const onSubmit = async ({ email }) => {
    try {
      const res = await authApi.forgotPassword(email);
      setSent(true);
      // Development only — the API returns the token when
      // EMAIL_VERIFICATION_DEV_BYPASS is on, so the flow is testable without a
      // mail provider. Production refuses to boot with that flag enabled.
      if (res.data?.devResetToken) {
        setDevLink(`/reset-password?token=${encodeURIComponent(res.data.devResetToken)}`);
      }
    } catch (err) {
      // Deliberately still shows "sent" on an unexpected error: whether the
      // address exists must not be inferable from the response.
      setSent(true);
      // eslint-disable-next-line no-console
      console.warn('forgot-password request failed:', errorMessage(err));
    }
  };

  if (sent) {
    return (
      <AuthLayout
        title="Check your inbox"
        subtitle="If that address has an account, a reset link is on its way."
        footer={
          <Link to="/login" className="font-medium text-accent hover:underline">
            Back to sign in
          </Link>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-surface p-6 text-center">
            <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-accent-soft text-accent">
              <MailCheck className="h-6 w-6" aria-hidden />
            </span>
            <p className="text-[14.5px] text-ink-2">
              The link expires in 30 minutes. If it does not arrive, check your spam folder.
            </p>
          </div>

          {devLink && (
            <div className="rounded-lg border border-dashed border-accent/50 bg-accent-soft/40 px-3.5 py-3 text-[13px] text-ink-2">
              <p className="font-medium text-ink">Development mode</p>
              <p className="mt-1">No mail provider is configured, so the link is shown here:</p>
              <Link to={devLink} className="mt-2 inline-block break-all font-medium text-accent hover:underline">
                {devLink}
              </Link>
            </div>
          )}
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter the email address on your account and we'll send a reset link."
      footer={
        <Link to="/login" className="inline-flex items-center gap-1.5 font-medium text-accent hover:underline">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back to sign in
        </Link>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Input
          label="Email address"
          type="email"
          autoComplete="email"
          placeholder="you@college.edu"
          error={errors.email?.message}
          {...register('email', {
            required: 'Email is required',
            pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Enter a valid email address' },
          })}
        />

        <Button type="submit" className="w-full justify-center" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Sending…
            </>
          ) : (
            'Send reset link'
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
