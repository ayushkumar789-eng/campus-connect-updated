import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { AuthLayout } from './AuthLayout.jsx';
import { Input, Select } from '../../../shared/ui/Input.jsx';
import { Button } from '../../../shared/ui/Button.jsx';
import { useAuthStore, destinationFor } from '../hooks/useAuthStore.js';
import { errorMessage } from '../../../shared/api/client.js';
import { toast } from '../../../shared/ui/Toast.jsx';
import { COURSES } from '../../../app/layout/navItems.js';
import { yearOfStudy } from '../../../shared/utils/format.js';

export default function Register() {
  const registerUser = useAuthStore((s) => s.register);
  const navigate = useNavigate();
  const [formError, setFormError] = useState('');

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: {
      name: '',
      username: '',
      email: '',
      password: '',
      confirm: '',
      college: '',
      course: 'MCA',
      branch: '',
      year: 1,
    },
  });

  const password = watch('password');

  // Mirrors the server rules so the user gets feedback before submitting.
  const passwordChecks = [
    { label: 'At least 8 characters', ok: password?.length >= 8 },
    { label: 'Contains a letter', ok: /[a-zA-Z]/.test(password ?? '') },
    { label: 'Contains a number', ok: /[0-9]/.test(password ?? '') },
  ];

  const onSubmit = async ({ confirm: _confirm, ...values }) => {
    setFormError('');
    try {
      // Drop empty optional fields so the server's strict schema accepts them.
      // `confirm` is client-only and must never be sent.
      const payload = Object.fromEntries(
        Object.entries(values).filter(([, v]) => v !== '' && v !== null),
      );
      const { user, devVerificationToken } = await registerUser(payload);

      toast.success('Welcome to CampusConnect!');

      // Development convenience: with no mail provider configured the API hands
      // back the verification token, so the flow is walkable end to end.
      // Never present in production.
      if (devVerificationToken) {
        navigate(`/verify-email?token=${encodeURIComponent(devVerificationToken)}`, { replace: true });
        return;
      }

      navigate(destinationFor(user), { replace: true });
    } catch (err) {
      setFormError(errorMessage(err, 'Could not create your account.'));
    }
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="One account for your feed, notes, groups and messages."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-accent hover:underline">
            Sign in
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

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Full name"
            placeholder="Aarav Sharma"
            autoComplete="name"
            autoFocus
            error={errors.name?.message}
            {...register('name', { required: 'Your name is required', minLength: { value: 2, message: 'Too short' } })}
          />
          <Input
            label="Username"
            placeholder="aarav_sharma"
            autoComplete="username"
            error={errors.username?.message}
            {...register('username', {
              required: 'Pick a username',
              pattern: { value: /^[a-z0-9_.]+$/i, message: 'Letters, numbers, dots and underscores only' },
              minLength: { value: 3, message: 'At least 3 characters' },
            })}
          />
        </div>

        <Input
          label="Email"
          type="email"
          placeholder="you@college.edu"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email', {
            required: 'Your email is required',
            pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Enter a valid email address' },
          })}
        />

        <div>
          <Input
            label="Password"
            type="password"
            placeholder="At least 8 characters"
            autoComplete="new-password"
            error={errors.password?.message}
            {...register('password', { required: 'Choose a password' })}
          />
          <ul className="mt-2 space-y-1">
            {passwordChecks.map((c) => (
              <li
                key={c.label}
                className={`flex items-center gap-1.5 text-[12.5px] ${c.ok ? 'text-success' : 'text-ink-3'}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${c.ok ? 'bg-success' : 'bg-line-strong'}`} aria-hidden />
                {c.label}
              </li>
            ))}
          </ul>
        </div>

        <Input
          label="Confirm password"
          type="password"
          placeholder="Type it again"
          autoComplete="new-password"
          error={errors.confirm?.message}
          {...register('confirm', {
            required: 'Confirm your password',
            validate: (v) => v === password || 'The two passwords do not match',
          })}
        />

        <div className="rounded-lg border border-line bg-surface-2 p-3.5">
          <p className="mb-3 text-[13px] font-semibold text-ink">Your academic details</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="College"
              placeholder="Invertis University"
              className="sm:col-span-2"
              error={errors.college?.message}
              {...register('college')}
            />
            <Select label="Course" {...register('course')}>
              {COURSES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
            <Select label="Year of study" {...register('year', { valueAsNumber: true })}>
              {[1, 2, 3, 4, 5].map((y) => (
                <option key={y} value={y}>
                  {yearOfStudy(y)}
                </option>
              ))}
            </Select>
            <Input label="Branch" placeholder="Computer Science" className="sm:col-span-2" {...register('branch')} />
          </div>
        </div>

        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          Create account
        </Button>

        <p className="text-center text-[12.5px] leading-relaxed text-ink-3">
          By joining you agree to keep it respectful. No spam, no fake giveaways. We will email you a link to
          confirm your address.
        </p>
      </form>
    </AuthLayout>
  );
}
