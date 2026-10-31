import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { AuthLayout } from './AuthLayout.jsx';
import { Input } from '../../../shared/ui/Input.jsx';
import { Button } from '../../../shared/ui/Button.jsx';
import { useAuthStore, destinationFor } from '../hooks/useAuthStore.js';
import { errorMessage, fieldErrors } from '../../../shared/api/client.js';
import { toast } from '../../../shared/ui/Toast.jsx';

export default function Login() {
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const location = useLocation();
  const [formError, setFormError] = useState('');

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { identifier: '', password: '' } });

  const onSubmit = async (values) => {
    setFormError('');
    try {
      const user = await login(values.identifier, values.password);

      // A message from the reset flow is worth surfacing, but not on top of the
      // greeting — the two together read like an error.
      if (location.state?.message) toast.success(location.state.message);
      else toast.success(`Welcome back, ${user.name.split(' ')[0]}`);

      // Return the user to wherever they were headed before the redirect,
      // otherwise follow the account's own state: unverified goes to the
      // resend screen, a brand-new account to onboarding, everyone else home.
      navigate(location.state?.from ?? destinationFor(user), { replace: true });
    } catch (err) {
      setFormError(errorMessage(err, 'Could not sign you in.'));
      const fields = fieldErrors(err);
      for (const [field, message] of Object.entries(fields)) {
        if (['identifier', 'password'].includes(field)) setError(field, { message });
      }
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to pick up where you left off."
      footer={
        <>
          New to CampusConnect?{' '}
          <Link to="/register" className="font-semibold text-accent hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {formError && (
          <div role="alert" className="rounded-md border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-[13.5px] text-danger">
            {formError}
          </div>
        )}

        <Input
          label="Email or username"
          placeholder="you@college.edu"
          autoComplete="username"
          autoFocus
          error={errors.identifier?.message}
          {...register('identifier', { required: 'Enter your email or username' })}
        />

        <Input
          label="Password"
          type="password"
          placeholder="••••••••"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password', { required: 'Enter your password' })}
        />

        <div className="flex items-center justify-between">
          {/* Sessions last 7 days by design, so a "keep me signed in" toggle
              would be a control that does nothing. State the real behaviour. */}
          <span className="text-[13px] text-ink-3">You&apos;ll stay signed in for 7 days</span>
          <Link to="/forgot-password" className="text-[13px] font-medium text-accent hover:underline">
            Forgot password?
          </Link>
        </div>

        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}
