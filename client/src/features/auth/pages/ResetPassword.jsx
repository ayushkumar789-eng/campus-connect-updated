import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { AuthLayout } from './AuthLayout.jsx';
import { Input } from '../../../shared/ui/Input.jsx';
import { Button } from '../../../shared/ui/Button.jsx';
import { authApi } from '../index.js';
;
import { errorMessage } from '../../../shared/api/client.js';

/** Mirrors the server rule in `auth.validator.js` so the two cannot drift. */
const RULES = [
  { test: (v) => v.length >= 8, message: 'At least 8 characters' },
  { test: (v) => /[a-zA-Z]/.test(v), message: 'A letter' },
  { test: (v) => /[0-9]/.test(v), message: 'A number' },
];

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';
  const [error, setError] = useState('');

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { password: '', confirm: '' } });

  const password = watch('password') ?? '';
  const unmet = RULES.filter((r) => !r.test(password)).map((r) => r.message);

  const onSubmit = async ({ password: newPassword }) => {
    setError('');
    try {
      await authApi.resetPassword(token, newPassword);
      // Deliberately routed to sign-in rather than the feed: the reset bumped
      // the revocation counter, so any existing session is now dead and a
      // half-authenticated state would be a confusing dead end.
      navigate('/login', { state: { message: 'Password updated. Please sign in.' } });
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  if (!token) {
    return (
      <AuthLayout
        title="Reset link missing"
        subtitle="Open the link from your email, or request a new one."
        footer={
          <Link to="/forgot-password" className="font-medium text-accent hover:underline">
            Request a new link
          </Link>
        }
      >
        <div className="flex gap-2.5 rounded-lg border border-danger/30 bg-danger/5 px-3.5 py-3 text-[13.5px] text-danger">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>This page needs the one-time code from your reset email.</span>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Choose a new password"
      subtitle="Setting a new password signs you out everywhere else."
      footer={
        <Link to="/login" className="font-medium text-accent hover:underline">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {error && (
          <div
            role="alert"
            className="flex gap-2.5 rounded-lg border border-danger/30 bg-danger/5 px-3.5 py-3 text-[13.5px] text-danger"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{error}</span>
          </div>
        )}

        <Input
          label="New password"
          type="password"
          autoComplete="new-password"
          error={errors.password?.message}
          {...register('password', {
            required: 'Choose a password',
            validate: () => unmet.length === 0 || `Password needs: ${unmet.join(', ').toLowerCase()}`,
          })}
        />

        <Input
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          error={errors.confirm?.message}
          {...register('confirm', {
            required: 'Repeat the new password',
            validate: (v) => v === password || 'The two passwords do not match',
          })}
        />

        <Button type="submit" className="w-full justify-center" disabled={isSubmitting || unmet.length > 0}>
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Updating…
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4" aria-hidden /> Update password
            </>
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
