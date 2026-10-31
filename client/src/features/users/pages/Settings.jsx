import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Camera,
  Check,
  LogOut,
  Moon,
  Shield,
  Sun,
  Trash2,
  KeyRound,
  MailCheck,
  Bell,
  UserX,
  MonitorSmartphone,
} from 'lucide-react';
import { Avatar } from '../../../shared/ui/Avatar.jsx';
import { Card, SectionTitle } from '../../../shared/ui/Card.jsx';
import { Button } from '../../../shared/ui/Button.jsx';
import { Input, Select, Textarea } from '../../../shared/ui/Input.jsx';
import { Toggle } from '../../../shared/ui/Toggle.jsx';
import { TagPicker } from '../../../shared/ui/TagPicker.jsx';
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog.jsx';
import { authApi } from '../../auth/index.js';
;
import { errorMessage, fieldErrors } from '../../../shared/api/client.js';
import { toast } from '../../../shared/ui/Toast.jsx';
import { useAuthStore } from '../../auth/hooks/useAuthStore.js';
import { COURSES } from '../../../app/layout/navItems.js';
import { yearOfStudy } from '../../../shared/utils/format.js';

const SKILL_SUGGESTIONS = ['React', 'Node.js', 'Java', 'Python', 'MongoDB', 'SQL', 'DSA', 'Figma', 'C++', 'Machine Learning'];
const INTEREST_SUGGESTIONS = ['Open Source', 'DSA', 'Placement Prep', 'Competitive Programming', 'Design', 'Research', 'Startups', 'Photography'];

/**
 * The five notification categories, matching the `notificationPrefs` shape on
 * the User document. Declared here so the switch list and the API payload can
 * never drift.
 */
const PREF_LABELS = [
  { key: 'follows', label: 'New followers', description: 'When another student follows you.' },
  { key: 'likes', label: 'Likes on your posts', description: 'When someone likes something you wrote.' },
  { key: 'comments', label: 'Comments on your posts', description: 'When someone comments on your post.' },
  { key: 'replies', label: 'Replies to your comments', description: 'When someone replies to you in a thread.' },
  { key: 'shares', label: 'Shares of your posts', description: 'When someone shares your post.' },
];

function SettingRow({ icon: Icon, title, description, children }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3.5">
      <div className="flex min-w-0 items-start gap-3">
        <Icon className="mt-0.5 h-[18px] w-[18px] shrink-0 text-ink-3" aria-hidden />
        <div className="min-w-0">
          <p className="text-[14.5px] font-medium text-ink">{title}</p>
          {description && <p className="mt-0.5 text-[13px] text-ink-3">{description}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

export default function Settings() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);
  const logoutEverywhere = useAuthStore((s) => s.logoutEverywhere);
  const closeAccount = useAuthStore((s) => s.closeAccount);
  const theme = useAuthStore((s) => s.theme);
  const toggleTheme = useAuthStore((s) => s.toggleTheme);

  const fileRef = useRef(null);
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [formError, setFormError] = useState('');
  const [errors, setErrors] = useState({});
  const [passwordError, setPasswordError] = useState('');
  const [passwordFields, setPasswordFields] = useState({});
  const [accountError, setAccountError] = useState('');
  const [dialog, setDialog] = useState(null); // 'logoutAll' | 'deactivate' | 'delete' | null

  const [form, setForm] = useState({
    name: user?.name ?? '',
    username: user?.username ?? '',
    email: user?.email ?? '',
    bio: user?.bio ?? '',
    college: user?.college ?? '',
    course: user?.course || 'Other',
    branch: user?.branch ?? '',
    year: user?.year ?? '',
    semester: user?.semester ?? '',
  });
  const [skills, setSkills] = useState(user?.skills ?? []);
  const [interests, setInterests] = useState(user?.interests ?? []);
  const [password, setPassword] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [closePassword, setClosePassword] = useState('');
  const [prefs, setPrefs] = useState(user?.notificationPrefs ?? {});

  // Re-seed the form whenever the session user changes (e.g. after a save).
  useEffect(() => {
    if (!user) return;
    setForm((f) => ({
      ...f,
      name: user.name ?? '',
      username: user.username ?? '',
      email: user.email ?? '',
      bio: user.bio ?? '',
      college: user.college ?? '',
      course: user.course || 'Other',
      branch: user.branch ?? '',
      year: user.year ?? '',
      semester: user.semester ?? '',
    }));
    setSkills(user.skills ?? []);
    setInterests(user.interests ?? []);
    setPrefs(user.notificationPrefs ?? {});
  }, [user]);

  // Object URLs are revoked as soon as a new file is picked, so we do not leak.
  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreview(null);
      return undefined;
    }
    const url = URL.createObjectURL(avatarFile);
    setAvatarPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [avatarFile]);

  const update = (key) => (event) => {
    setForm((f) => ({ ...f, [key]: event.target.value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  // ── Save ────────────────────────────────────────────────────────────────
  const saveProfile = useMutation({
    mutationFn: () => {
      // Free-text fields are always sent, blank included. Omitting an empty one
      // meant "leave alone" to the server, so a student who typed the wrong
      // college could blank the box, hit Save, and watch it report "Profile
      // updated" having changed nothing. An empty string is the server's signal
      // to clear the field, and it distinguishes it from a partial update.
      //
      // The enum and number fields still go only when filled: they genuinely
      // have no empty value, and a select with nothing chosen must not wipe
      // what the student picked.
      const payload = {
        name: form.name.trim(),
        bio: form.bio.trim(),
        college: form.college.trim(),
        branch: form.branch.trim(),
        skills,
        interests,
      };
      if (form.course) payload.course = form.course;
      if (form.year) payload.year = Number(form.year);
      if (form.semester) payload.semester = Number(form.semester);

      // A new avatar forces multipart; otherwise JSON is enough.
      if (avatarFile) {
        const fd = new FormData();
        fd.append('avatar', avatarFile);
        for (const [k, v] of Object.entries(payload)) {
          if (Array.isArray(v)) v.forEach((item) => fd.append(k, item));
          else fd.append(k, v);
        }
        return authApi.updateProfile(fd);
      }

      return authApi.updateProfile(payload);
    },
    onSuccess: (res) => {
      setUser(res.data.user);
      setAvatarFile(null);
      setErrors({});
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      toast.success('Profile updated');
    },
    onError: (err) => {
      setFormError(errorMessage(err, 'Could not save your changes.'));
      setErrors(fieldErrors(err));
    },
  });

  /**
   * Username and email go to their own endpoint, because they carry rules the
   * profile fields do not: uniqueness, and re-verification on an address
   * change. Sent separately from the profile save so a clash there does not
   * block an ordinary bio edit, and vice versa.
   */
  const saveIdentity = useMutation({
    mutationFn: () => {
      const payload = {};
      if (form.name.trim() !== user?.name) payload.name = form.name.trim();
      if (form.username.trim().toLowerCase() !== user?.username) payload.username = form.username.trim().toLowerCase();
      if (form.email.trim().toLowerCase() !== user?.email) payload.email = form.email.trim().toLowerCase();
      return authApi.updateAccountDetails(payload);
    },
    onSuccess: (res) => {
      setUser(res.data.user);
      setErrors({});
      toast.success(res.message);
      // A changed address drops verification server-side, so the store's copy
      // is refreshed and the banner flips without a refetch.
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
    onError: (err) => {
      setFormError(errorMessage(err, 'Could not update your account details.'));
      setErrors(fieldErrors(err));
    },
  });

  const changePassword = useMutation({
    mutationFn: () => authApi.changePassword({
      currentPassword: password.currentPassword,
      newPassword: password.newPassword,
    }),
    onSuccess: () => {
      setPassword({ currentPassword: '', newPassword: '', confirm: '' });
      setPasswordError('');
      setPasswordFields({});
      toast.success('Password changed. Other devices have been signed out.');
    },
    onError: (err) => {
      setPasswordError(errorMessage(err, 'Could not change your password.'));
      setPasswordFields(fieldErrors(err));
    },
  });

  // ── Notification preferences ────────────────────────────────────────────
  // Optimistic: the switch moves immediately and is rolled back if the write
  // fails. Waiting for a round trip on a switch feels broken.
  const savePrefs = useMutation({
    mutationFn: (patch) => authApi.updateNotificationPrefs(patch),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: ['auth'] });
      const previous = prefs;
      setPrefs((p) => ({ ...p, ...patch }));
      return { previous };
    },
    onError: (err, _patch, context) => {
      if (context?.previous) setPrefs(context.previous);
      toast.error(errorMessage(err, 'Could not save that preference.'));
    },
    onSuccess: (res) => {
      // Trust the server's merged view, which defaults any category the
      // document did not already have.
      setUser((u) => (u ? { ...u, notificationPrefs: res.data.notificationPrefs } : u));
    },
  });

  const togglePref = (key) => (next) => savePrefs.mutate({ [key]: next });

  // ── Sessions ────────────────────────────────────────────────────────────
  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const handleLogoutEverywhere = async () => {
    setDialog(null);
    await logoutEverywhere();
    toast.success('Signed out on all devices');
    navigate('/login', { replace: true });
  };

  // ── Account closure ─────────────────────────────────────────────────────
  const handleDeactivate = async () => {
    setAccountError('');
    try {
      await closeAccount('deactivate', closePassword);
      setDialog(null);
      navigate('/login', { replace: true });
    } catch (err) {
      setAccountError(errorMessage(err, 'Could not deactivate your account.'));
    }
  };

  const handleDelete = async () => {
    setAccountError('');
    try {
      await closeAccount('delete', closePassword);
      setDialog(null);
      navigate('/', { replace: true });
    } catch (err) {
      setAccountError(errorMessage(err, 'Could not delete your account.'));
    }
  };

  const passwordMismatch = password.confirm.length > 0 && password.newPassword !== password.confirm;
  const identityDirty =
    form.name.trim() !== user?.name ||
    form.username.trim().toLowerCase() !== user?.username ||
    form.email.trim().toLowerCase() !== user?.email;

  return (
    <div className="space-y-5 pb-4">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-ink-2 transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back
      </button>

      <div>
        <h1 className="text-xl font-bold tracking-[-0.02em] text-ink">Settings</h1>
        <p className="mt-0.5 text-[14px] text-ink-2">Manage your account, profile, notifications and security.</p>
      </div>

      {formError && (
        <div
          role="alert"
          className="rounded-md border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-[13.5px] text-danger"
        >
          {formError}
        </div>
      )}

      {/* ── Verification status ────────────────────────────────────────── */}
      {!user?.emailVerified && (
        <Card className="flex items-start gap-3 border-accent/30 bg-accent-soft/40 p-4">
          <MailCheck className="mt-0.5 h-[18px] w-[18px] shrink-0 text-accent" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-medium text-ink">Confirm your email address</p>
            <p className="mt-0.5 text-[13px] text-ink-2">
              <span className="font-medium">{user?.email}</span> has not been confirmed yet. Some features stay
              limited until it is.
            </p>
          </div>
          <Button size="sm" onClick={() => navigate('/verify-email')}>
            Confirm
          </Button>
        </Card>
      )}

      {/* ── Avatar ────────────────────────────────────────────────────── */}
      <Card className="p-4">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label="Change profile photo"
            className="group relative shrink-0 rounded-full"
          >
            <Avatar
              user={avatarPreview ? { name: form.name, avatar: avatarPreview } : user}
              size="xl"
            />
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-ink/50 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              <Camera className="h-5 w-5" aria-hidden />
            </span>
          </button>

          <div className="min-w-0 flex-1">
            <p className="truncate text-[14.5px] font-semibold text-ink">{form.name || user?.name}</p>
            <p className="truncate text-[13px] text-ink-3">@{user?.username}</p>
            <div className="mt-2 flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
                {avatarFile ? 'Choose another' : 'Change photo'}
              </Button>
              {avatarFile && (
                <Button variant="ghost" size="sm" onClick={() => setAvatarFile(null)}>
                  Remove
                </Button>
              )}
            </div>
            <p className="mt-2 text-[12px] text-ink-3">JPG, PNG or WebP · up to 5 MB</p>
          </div>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) setAvatarFile(file);
            e.target.value = '';
          }}
        />
      </Card>

      {/* ── Account details ───────────────────────────────────────────── */}
      <div>
        <SectionTitle>Account</SectionTitle>
        <Card className="p-4">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              setFormError('');
              saveIdentity.mutate();
            }}
          >
            <Input label="Full name" required value={form.name} onChange={update('name')} error={errors.name} />

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Username"
                value={form.username}
                onChange={update('username')}
                error={errors.username}
                hint={form.username !== user?.username ? 'Your profile link will change.' : undefined}
                autoComplete="username"
              />
              <Input
                label="Email address"
                type="email"
                value={form.email}
                onChange={update('email')}
                error={errors.email}
                hint={
                  form.email.trim().toLowerCase() !== user?.email
                    ? 'You will need to confirm the new address.'
                    : undefined
                }
                autoComplete="email"
              />
            </div>

            {identityDirty && (
              <Button type="submit" loading={saveIdentity.isPending} leftIcon={Check}>
                Save account details
              </Button>
            )}
          </form>
        </Card>
      </div>

      {/* ── Profile ───────────────────────────────────────────────────── */}
      <div>
        <SectionTitle>Profile</SectionTitle>
        <Card className="p-4">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              setFormError('');
              saveProfile.mutate();
            }}
          >
            <Textarea
              label="Bio"
              rows={3}
              maxLength={280}
              value={form.bio}
              onChange={update('bio')}
              hint={`${form.bio.length}/280 · shown on your profile`}
              error={errors.bio}
            />

            <Input
              label="College"
              placeholder="Invertis University"
              value={form.college}
              onChange={update('college')}
              error={errors.college}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Select label="Course" value={form.course} onChange={update('course')} error={errors.course}>
                {COURSES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
              <Select label="Year of study" value={form.year} onChange={update('year')} error={errors.year}>
                <option value="">Not set</option>
                {[1, 2, 3, 4, 5, 6].map((y) => (
                  <option key={y} value={y}>
                    {yearOfStudy(y)}
                  </option>
                ))}
              </Select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Branch"
                placeholder="Computer Science"
                value={form.branch}
                onChange={update('branch')}
                error={errors.branch}
              />
              <Select label="Semester" value={form.semester} onChange={update('semester')} error={errors.semester}>
                <option value="">Not set</option>
                {Array.from({ length: 10 }, (_, i) => i + 1).map((s) => (
                  <option key={s} value={s}>
                    Semester {s}
                  </option>
                ))}
              </Select>
            </div>

            <TagPicker label="Skills" values={skills} onChange={setSkills} suggestions={SKILL_SUGGESTIONS} />
            <TagPicker label="Interests" values={interests} onChange={setInterests} suggestions={INTEREST_SUGGESTIONS} />

            <div className="flex items-center gap-2 pt-1">
              <Button type="submit" loading={saveProfile.isPending} leftIcon={Check}>
                Save changes
              </Button>
              {avatarFile && <span className="text-[13px] text-ink-3">Includes your new photo</span>}
            </div>
          </form>
        </Card>
      </div>

      {/* ── Appearance ────────────────────────────────────────────────── */}
      <div>
        <SectionTitle>Appearance</SectionTitle>
        <Card className="divide-y divide-line">
          <SettingRow
            icon={theme === 'dark' ? Sun : Moon}
            title="Theme"
            description="Applies immediately and is remembered on this device."
          >
            <Button variant="secondary" size="sm" onClick={toggleTheme}>
              {theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
            </Button>
          </SettingRow>
        </Card>
      </div>

      {/* ── Notifications ──────────────────────────────────────────────── */}
      <div>
        <SectionTitle>Notifications</SectionTitle>
        <Card className="divide-y divide-line">
          {PREF_LABELS.map(({ key, label, description }) => (
            <Toggle
              key={key}
              label={label}
              description={description}
              checked={prefs[key] !== false}
              onChange={togglePref(key)}
              disabled={savePrefs.isPending}
            />
          ))}
          <SettingRow
            icon={Bell}
            title="About notifications"
            description="You are never notified about your own actions, and the list is capped to the most recent."
          />
        </Card>
      </div>

      {/* ── Security ──────────────────────────────────────────────────── */}
      <div>
        <SectionTitle>Security</SectionTitle>
        <Card className="p-4">
          {passwordError && (
            <div
              role="alert"
              className="mb-4 rounded-md border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-[13.5px] text-danger"
            >
              {passwordError}
            </div>
          )}

          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              setPasswordError('');
              if (password.newPassword !== password.confirm) {
                setPasswordFields({ confirm: 'Passwords do not match' });
                return;
              }
              changePassword.mutate();
            }}
          >
            <Input
              label="Current password"
              type="password"
              autoComplete="current-password"
              value={password.currentPassword}
              onChange={(e) => setPassword((p) => ({ ...p, currentPassword: e.target.value }))}
              error={passwordFields.currentPassword}
              required
            />
            <Input
              label="New password"
              type="password"
              autoComplete="new-password"
              hint="At least 8 characters, with a letter and a number."
              value={password.newPassword}
              onChange={(e) => setPassword((p) => ({ ...p, newPassword: e.target.value }))}
              error={passwordFields.newPassword}
              required
            />
            <Input
              label="Confirm new password"
              type="password"
              autoComplete="new-password"
              value={password.confirm}
              onChange={(e) => setPassword((p) => ({ ...p, confirm: e.target.value }))}
              error={passwordMismatch ? 'Passwords do not match' : passwordFields.confirm}
              required
            />

            <Button
              type="submit"
              variant="secondary"
              leftIcon={KeyRound}
              loading={changePassword.isPending}
              disabled={!password.currentPassword || !password.newPassword}
            >
              Change password
            </Button>
            <p className="text-[12.5px] text-ink-3">
              Changing your password signs you out on every other device.
            </p>
          </form>
        </Card>
      </div>

      {/* ── Session ───────────────────────────────────────────────────── */}
      <div>
        <SectionTitle>Session</SectionTitle>
        <Card className="divide-y divide-line">
          <SettingRow
            icon={Shield}
            title={`Signed in as @${user?.username}`}
            description={user?.role === 'admin' ? 'Platform administrator' : 'Student account'}
          >
            <Button variant="secondary" size="sm" leftIcon={LogOut} onClick={handleLogout}>
              Sign out
            </Button>
          </SettingRow>

          <SettingRow
            icon={MonitorSmartphone}
            title="Sign out everywhere"
            description="Ends every session on every device, including this one."
          >
            <Button variant="secondary" size="sm" onClick={() => setDialog('logoutAll')}>
              Sign out all
            </Button>
          </SettingRow>
        </Card>
      </div>

      {/* ── Closing the account ───────────────────────────────────────── */}
      <div>
        <SectionTitle>Close account</SectionTitle>
        <Card className="divide-y divide-line">
          <SettingRow
            icon={UserX}
            title="Deactivate"
            description="Hides your profile and signs you out. Your posts stay on campus, and you can ask for the account to be restored."
          >
            <Button variant="secondary" size="sm" onClick={() => { setAccountError(''); setDialog('deactivate'); }}>
              Deactivate
            </Button>
          </SettingRow>

          <SettingRow
            icon={Trash2}
            title="Delete account"
            description="Permanently removes your profile and personal data. Your posts are kept but stripped of anything that identifies you, so other students' threads survive."
          >
            <Button size="sm" variant="danger" onClick={() => { setAccountError(''); setDialog('delete'); }}>
              Delete
            </Button>
          </SettingRow>
        </Card>
      </div>

      <p className="pt-1 text-center text-[12px] text-ink-3">
        Changes apply immediately across CampusConnect.
      </p>

      {/* ── Confirmations ─────────────────────────────────────────────── */}
      <ConfirmDialog
        open={dialog === 'logoutAll'}
        onClose={() => setDialog(null)}
        onConfirm={handleLogoutEverywhere}
        title="Sign out everywhere?"
        body="Every device, including this one, will be signed out. You will need to sign in again."
        confirmLabel="Sign out everywhere"
      />

      <ConfirmDialog
        open={dialog === 'deactivate'}
        onClose={() => setDialog(null)}
        onConfirm={handleDeactivate}
        error={accountError}
        title="Deactivate your account?"
        body={
          <>
            <p>
              Your profile, posts and comments stay exactly as they are, but your name and photo are hidden and you
              will not be able to sign in.
            </p>
            <p className="mt-2">Contact campus administration if you want it restored.</p>
            <label className="mt-4 block text-[13px] text-ink-2">
              Confirm your password
              <input
                type="password"
                autoComplete="current-password"
                value={closePassword}
                onChange={(e) => setClosePassword(e.target.value)}
                className="mt-1.5 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
              />
            </label>
          </>
        }
        confirmLabel="Deactivate"
      />

      <ConfirmDialog
        open={dialog === 'delete'}
        onClose={() => setDialog(null)}
        onConfirm={handleDelete}
        error={accountError}
        title="Delete your account permanently?"
        danger
        phrase="DELETE"
        body={
          <>
            <p>
              This removes your profile, your email address, your bio, your follows, your saved posts and every
              session you have open.
            </p>
            <p className="mt-2">
              <span className="font-medium text-ink">Your posts and comments are kept</span> but are reassigned to a
              generic "Departed student" account, so conversations in other people&apos;s threads do not collapse.
              Your uploaded photos stay with those posts.
            </p>
            <p className="mt-2">This cannot be undone.</p>
            <label className="mt-4 block text-[13px] text-ink-2">
              Confirm your password
              <input
                type="password"
                autoComplete="current-password"
                value={closePassword}
                onChange={(e) => setClosePassword(e.target.value)}
                className="mt-1.5 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
              />
            </label>
          </>
        }
        confirmLabel="Delete my account"
      />
    </div>
  );
}
