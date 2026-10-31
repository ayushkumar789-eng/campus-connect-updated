import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, Loader2, Sparkles, UserPlus, PartyPopper } from 'lucide-react';
import { AuthLayout } from './AuthLayout.jsx';
import { Input, Textarea, Select } from '../../../shared/ui/Input.jsx';
import { Button } from '../../../shared/ui/Button.jsx';
import { Avatar } from '../../../shared/ui/Avatar.jsx';
import { TagPicker } from '../../../shared/ui/TagPicker.jsx';
import { EmptyState } from '../../../shared/ui/States.jsx';
import { useAuthStore } from '../hooks/useAuthStore.js';
import { authApi } from '../index.js';
import { errorMessage } from '../../../shared/api/client.js';
import { toast } from '../../../shared/ui/Toast.jsx';
import { useFollow, useSuggestedUsers } from '../../../shared/hooks/useData.js';
import { COURSES } from '../../../app/layout/navItems.js';
import { yearOfStudy } from '../../../shared/utils/format.js';

const SKILL_SUGGESTIONS = [
  'React', 'Node.js', 'Java', 'Python', 'MongoDB', 'SQL', 'DSA', 'Figma', 'C++', 'Machine Learning',
];
const INTEREST_SUGGESTIONS = [
  'Open Source', 'DSA', 'Placement Prep', 'Competitive Programming', 'Design', 'Research', 'Startups', 'Photography',
];

/**
 * The eight onboarding steps, in order.
 *
 * `optional` marks a step the user may genuinely skip. Nothing is ever
 * required beyond what the product actually needs to function, because a
 * signup wall is the fastest way to lose a new user.
 */
const STEPS = [
  { id: 'identity', title: 'Your name', subtitle: 'This is how you appear on campus.', optional: false },
  { id: 'college', title: 'Where you study', subtitle: 'Helps you find the right people.', optional: true },
  { id: 'academic', title: 'Course and year', subtitle: 'Only if you want it shown.', optional: true },
  { id: 'photo', title: 'Profile photo', subtitle: 'Not required — initials work fine.', optional: true },
  { id: 'bio', title: 'A line about you', subtitle: 'Optional, but it gets you followed.', optional: true },
  { id: 'tags', title: 'Skills and interests', subtitle: 'Makes you discoverable by search.', optional: true },
  { id: 'people', title: 'Find some students', subtitle: 'Follow a few to fill your feed.', optional: true },
  { id: 'finish', title: 'You are all set', subtitle: '', optional: false },
];

const LAST_STEP = STEPS.length; // 8

/**
 * Eight-step onboarding.
 *
 * Two design decisions worth stating:
 *
 *  • **Progress is durable.** Every advance is written to `onboardingStep`, so
 *    closing the tab and coming back next week resumes where they stopped
 *    rather than restarting. The wizard can only move forward through the API;
 *    `updateOnboardingStep` refuses to accept a lower number.
 *  • **Steps save as you go.** Each Next persists that step's fields before
 *    advancing, so a crash on step 6 does not throw away steps 1–5.
 */
export default function ProfileSetup() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Resume from the server, but never above where this render already is.
  const [step, setStep] = useState(() => Math.min((user?.onboardingStep ?? 0) + 1, LAST_STEP));
  const [formError, setFormError] = useState('');
  const [avatarPreview, setAvatarPreview] = useState(null);
  const avatarInput = useRef(null);
  const headingRef = useRef(null);

  const [form, setForm] = useState({
    name: user?.name ?? '',
    college: user?.college ?? '',
    course: user?.course || 'MCA',
    branch: user?.branch ?? '',
    year: user?.year ?? 1,
    semester: user?.semester ?? '',
    bio: user?.bio ?? '',
    skills: user?.skills ?? [],
    interests: user?.interests ?? [],
  });

  const update = useCallback((key) => (event) => {
    setForm((f) => ({ ...f, [key]: event.target.value }));
    setFormError('');
  }, []);

  /** The fields belonging to each step, in the exact shape the API accepts. */
  const payloadForStep = useCallback(
    (stepId) => {
      // The profile validator is `.strict()`, so an unfilled optional field is
      // omitted rather than sent as an empty string — `college: ''` would fail
      // its min-length check and block the whole save.
      switch (stepId) {
        case 'identity':
          return { name: form.name.trim() };
        case 'college':
          return form.college.trim() ? { college: form.college.trim() } : {};
        case 'academic': {
          const payload = { course: form.course };
          if (form.branch.trim()) payload.branch = form.branch.trim();
          if (form.year) payload.year = Number(form.year);
          if (form.semester) payload.semester = Number(form.semester);
          return payload;
        }
        case 'bio':
          return { bio: form.bio.trim() };
        case 'tags':
          return { skills: form.skills, interests: form.interests };
        default:
          return {};
      }
    },
    [form],
  );

  // ── Persisting ──────────────────────────────────────────────────────────
  const saveStep = useMutation({
    mutationFn: async (stepId) => {
      // The avatar step persists through its own FormData upload, so there is
      // nothing here to save.
      const payload = payloadForStep(stepId);
      if (!Object.keys(payload).length) return undefined;
      return authApi.updateProfile(payload);
    },
    onSuccess: (res) => {
      setFormError('');
      if (res?.data?.user) {
        setUser(res.data.user);
        queryClient.invalidateQueries({ queryKey: ['profile'] });
        queryClient.invalidateQueries({ queryKey: ['feed'] });
      }
    },
    onError: (err) => setFormError(errorMessage(err, 'Could not save that. Please try again.')),
  });

  // ── Navigation ──────────────────────────────────────────────────────────
  const goTo = useCallback((target) => {
    const clamped = Math.min(Math.max(target, 1), LAST_STEP);
    setStep(clamped);
    setFormError('');
    // Durable progress, fire-and-forget: failing to record the step must never
    // trap the user on the screen they just left.
    authApi.updateOnboardingStep(clamped - 1).catch(() => {});
    // Move focus into the new step so a screen-reader user is told the wizard
    // advanced, rather than being left on the button they just pressed.
    requestAnimationFrame(() => headingRef.current?.focus());
  }, []);

  const back = () => goTo(step - 1);

  /** Save the current step, then advance. A failed save holds the user here. */
  const next = useCallback(() => {
    const stepId = STEPS[step - 1].id;
    saveStep.mutate(stepId, {
      onSuccess: () => goTo(step + 1),
    });
  }, [step, saveStep, goTo]);

  // ── Avatar ──────────────────────────────────────────────────────────────
  const uploadAvatar = async (file) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setFormError('That image is over 5MB. Please choose a smaller one.');
      return;
    }
    if (!file.type.startsWith('image/')) {
      setFormError('Please choose an image file.');
      return;
    }

    // Immediate local preview, so the user sees their photo before the upload
    // round-trips rather than after.
    setAvatarPreview(URL.createObjectURL(file));
    setFormError('');

    const data = new FormData();
    data.append('avatar', file);
    try {
      const res = await authApi.updateProfile(data);
      setUser(res.data.user);
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      toast.success('Profile photo updated');
    } catch (err) {
      setAvatarPreview(null);
      setFormError(errorMessage(err, 'Could not upload that image.'));
    }
  };

  // ── Step 7: follow suggestions inline ───────────────────────────────────
  const { data: suggested, isLoading: loadingPeople } = useSuggestedUsers();
  const follow = useFollow();

  const people = useMemo(() => suggested ?? [], [suggested]);

  // ── Finish ──────────────────────────────────────────────────────────────
  const finish = useCallback(async () => {
    // One final save so a bio typed on step 5 is never lost if the user
    // skipped the intervening Next presses.
    try {
      const payload = {
        bio: form.bio.trim(),
        skills: form.skills,
        interests: form.interests,
      };
      if (form.college.trim()) payload.college = form.college.trim();
      const res = await authApi.updateProfile(payload);
      setUser(res.data.user);
    } catch {
      // Not worth blocking the finish for — the wizard's job is done.
    }
    queryClient.invalidateQueries({ queryKey: ['profile'] });
    queryClient.invalidateQueries({ queryKey: ['feed'] });
    toast.success('Profile ready — welcome aboard!');
    navigate('/home', { replace: true });
  }, [form, navigate, queryClient, setUser]);

  const current = STEPS[step - 1];

  // Can the user leave this step? Only the name is genuinely required.
  const blocked = current.id === 'identity' && form.name.trim().length < 2;

  return (
    <AuthLayout
      title={current.title}
      subtitle={current.subtitle}
      footer={
        <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
          <span>
            Step {step} of {LAST_STEP}
          </span>
          {current.optional && <span className="text-ink-3">· optional, you can skip</span>}
        </p>
      }
    >
      <div className="mb-6">
        <div
          className="h-1 overflow-hidden rounded-full bg-surface-3"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={LAST_STEP}
          aria-valuenow={step}
          aria-label={`Onboarding step ${step} of ${LAST_STEP}`}
        >
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-300"
            style={{ width: `${(step / LAST_STEP) * 100}%` }}
          />
        </div>
      </div>

      {formError && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-danger/30 bg-danger/5 px-3.5 py-2.5 text-[13.5px] text-danger"
        >
          {formError}
        </div>
      )}

      <div ref={headingRef} tabIndex={-1} className="focus:outline-none">
        {/* ── 1 · Identity ─────────────────────────────────────────── */}
        {current.id === 'identity' && (
          <div className="space-y-5">
            <div className="flex items-center gap-4 rounded-lg border border-line bg-surface p-4">
              <Avatar user={user} size="xl" />
              <div className="min-w-0">
                <p className="truncate text-[16px] font-semibold text-ink">{user?.name}</p>
                <p className="truncate text-[13.5px] text-ink-3">@{user?.username}</p>
              </div>
            </div>

            <Input
              label="Display name"
              value={form.name}
              onChange={update('name')}
              maxLength={60}
              autoComplete="name"
              placeholder="Aarav Sharma"
            />
            <p className="text-[12.5px] text-ink-3">
              Your username <span className="font-medium text-ink-2">@{user?.username}</span> is fixed — it is how
              people find you.
            </p>
          </div>
        )}

        {/* ── 2 · College ──────────────────────────────────────────── */}
        {current.id === 'college' && (
          <div className="space-y-4">
            <Input
              label="College or university"
              value={form.college}
              onChange={update('college')}
              maxLength={120}
              placeholder="Invertis University"
              hint="Other students from the same college show up first in search."
            />
            {user?.college && form.college !== user.college && (
              <p className="text-[12.5px] text-ink-3">You signed up with {user.college}.</p>
            )}
          </div>
        )}

        {/* ── 3 · Academic ─────────────────────────────────────────── */}
        {current.id === 'academic' && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Select label="Course" value={form.course} onChange={update('course')}>
                {COURSES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
              <Select label="Year" value={form.year} onChange={update('year')}>
                {[1, 2, 3, 4, 5].map((y) => (
                  <option key={y} value={y}>
                    {yearOfStudy(y)}
                  </option>
                ))}
              </Select>
            </div>
            <Input label="Branch" value={form.branch} onChange={update('branch')} maxLength={80} placeholder="Computer Science" />
            <Select label="Semester" value={form.semester} onChange={update('semester')}>
              <option value="">Not set</option>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((s) => (
                <option key={s} value={s}>
                  Semester {s}
                </option>
              ))}
            </Select>
          </div>
        )}

        {/* ── 4 · Photo ─────────────────────────────────────────────── */}
        {current.id === 'photo' && (
          <div className="flex flex-col items-center gap-4 py-2">
            <Avatar user={avatarPreview ? { name: form.name, avatar: avatarPreview } : user} size="2xl" />
            <input
              ref={avatarInput}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="sr-only"
              onChange={(e) => uploadAvatar(e.target.files?.[0])}
            />
            <Button variant="secondary" onClick={() => avatarInput.current?.click()}>
              <Camera className="h-4 w-4" aria-hidden />
              {avatarPreview || user?.avatar ? 'Change photo' : 'Upload a photo'}
            </Button>
            <p className="max-w-xs text-center text-[12.5px] text-ink-3">
              PNG, JPG or WebP up to 5MB. Skip this and you will keep the coloured initials.
            </p>
          </div>
        )}

        {/* ── 5 · Bio ──────────────────────────────────────────────── */}
        {current.id === 'bio' && (
          <Textarea
            label="Bio"
            rows={4}
            maxLength={280}
            value={form.bio}
            onChange={update('bio')}
            placeholder="Building for the web. React, Node and too many side projects."
            hint={`${form.bio.length}/280`}
          />
        )}

        {/* ── 6 · Skills and interests ─────────────────────────────── */}
        {current.id === 'tags' && (
          <div className="space-y-5">
            <TagPicker
              label="Skills"
              values={form.skills}
              onChange={(v) => setForm((f) => ({ ...f, skills: v }))}
              suggestions={SKILL_SUGGESTIONS}
              hint="Students searching for a skill will find you."
            />
            <TagPicker
              label="Interests"
              values={form.interests}
              onChange={(v) => setForm((f) => ({ ...f, interests: v }))}
              suggestions={INTEREST_SUGGESTIONS}
            />
          </div>
        )}

        {/* ── 7 · Suggested students ───────────────────────────────── */}
        {current.id === 'people' && (
          <div className="space-y-3">
            {loadingPeople ? (
              <div className="flex flex-col items-center gap-2 py-8 text-ink-3">
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                <p className="text-[13.5px]">Finding students for you…</p>
              </div>
            ) : people.length === 0 ? (
              <EmptyState
                title="No students to suggest yet"
                description={
                  form.course
                    ? `Nobody else is on CampusConnect yet. Once others join ${form.course}, they will show up here.`
                    : 'Once other students join, they will show up here. Find them yourself in the meantime.'
                }
              />
            ) : (
              <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
                {people.map((person) => (
                  <SuggestionRow key={person.id} person={person} follow={follow} />
                ))}
              </ul>
            )}
            <p className="pt-1 text-center text-[12.5px] text-ink-3">
              You can always find more students in Explore.
            </p>
          </div>
        )}

        {/* ── 8 · Finish ───────────────────────────────────────────── */}
        {current.id === 'finish' && (
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft text-accent">
              <PartyPopper className="h-7 w-7" aria-hidden />
            </span>
            <div>
              <p className="text-[15px] font-semibold text-ink">Welcome to CampusConnect, {form.name.split(' ')[0]}</p>
              <p className="mt-1 text-[14px] text-ink-2">
                Your profile is live. Post something, and your feed will fill up as you follow people.
              </p>
            </div>
            <dl className="grid w-full grid-cols-2 gap-2 text-left sm:grid-cols-4">
              <Stat label="Name" value={form.name || '—'} />
              <Stat label="College" value={form.college || 'Not set'} />
              <Stat label="Course" value={form.course} />
              <Stat label="Skills" value={form.skills.length ? String(form.skills.length) : 'None'} />
            </dl>
          </div>
        )}
      </div>

      {/* ── Controls ────────────────────────────────────────────────── */}
      <div className="mt-6 flex gap-2">
        {step > 1 && (
          <Button variant="secondary" size="lg" onClick={back} className="flex-1" disabled={saveStep.isPending}>
            Back
          </Button>
        )}

        {current.id === 'finish' ? (
          <Button size="lg" onClick={finish} className="flex-1 justify-center" rightIcon={Sparkles}>
            Go to my feed
          </Button>
        ) : (
          <>
            {current.optional && (
              <Button
                variant="ghost"
                size="lg"
                className="flex-1"
                onClick={() => next(current.id)}
                disabled={saveStep.isPending}
              >
                Skip
              </Button>
            )}
            <Button
              size="lg"
              className="flex-1 justify-center"
              onClick={next}
              disabled={blocked || saveStep.isPending}
              loading={saveStep.isPending}
            >
              Continue
            </Button>
          </>
        )}
      </div>

      {blocked && (
        <p className="mt-2 text-center text-[12.5px] text-ink-3">A display name of at least 2 characters is needed.</p>
      )}

      {step > 1 && step < LAST_STEP && (
        <button
          type="button"
          onClick={() => navigate('/home')}
          className="mt-4 block w-full text-center text-[13px] text-ink-3 transition-colors hover:text-ink-2"
        >
          Finish later
        </button>
      )}
    </AuthLayout>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2">
      <dt className="text-[11.5px] uppercase tracking-wide text-ink-3">{label}</dt>
      <dd className="mt-0.5 truncate text-[13.5px] font-medium text-ink">{value}</dd>
    </div>
  );
}

/** One row of the suggestions list, with its own optimistic follow button. */
function SuggestionRow({ person, follow }) {
  const mutation = follow.mutate;
  // `isPending` with a matching id tells us which row is mid-flight, so only
  // that row shows a spinner.
  const busy = mutation.isPending && mutation.variables?.id === person.id;

  return (
    <li className="flex items-center gap-3 p-3">
      <Avatar user={person} size="md" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold text-ink">{person.name}</p>
        <p className="truncate text-[12.5px] text-ink-3">
          @{person.username}
          {person.course ? ` · ${person.course}` : ''}
          {person.skills?.length ? ` · ${person.skills[0]}` : ''}
        </p>
      </div>
      <Button
        size="sm"
        variant={busy ? 'secondary' : 'primary'}
        onClick={() => mutation.mutate({ id: person.id })}
        disabled={busy}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <UserPlus className="h-3.5 w-3.5" aria-hidden />}
        Follow
      </Button>
    </li>
  );
}

export { STEPS };
