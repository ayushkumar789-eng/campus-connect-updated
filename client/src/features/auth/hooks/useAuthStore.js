/**
 * Session store.
 *
 * The access token is deliberately NOT persisted: it lives in memory only, so
 * a page reload re-establishes the session from the httpOnly refresh cookie
 * instead of leaving a long-lived credential in localStorage where any XSS
 * could read it.
 *
 * The refresh cookie is the only durable credential, and the server holds the
 * revocation counter (`tokenVersion`) that decides whether it is still honoured.
 * A password change or "sign out everywhere" bumps that counter, so every
 * outstanding session — including a refresh token that never expires from the
 * browser's point of view — stops working immediately.
 */
import { create } from 'zustand';
import { authApi } from '../index.js';

import { setAccessToken, setSessionLostHandler } from '../../../shared/api/client.js';

const THEME_KEY = 'cc-theme';

function readTheme() {
  if (typeof window === 'undefined') return 'light';
  return window.localStorage.getItem(THEME_KEY) ?? 'light';
}

function applyTheme(theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.style.colorScheme = theme;
}

/** Where to send someone after they authenticate. */
function destinationFor(user) {
  if (!user) return '/home';
  // An account that has never been confirmed gets the resend screen rather
  // than the feed, so the verification prompt is not something they have to
  // remember.
  if (!user.emailVerified) return '/verify-email';
  // A brand-new account with no bio and no college has not been set up.
  if (!user.profileCompleted) return '/setup';
  return '/home';
}

export const useAuthStore = create((set, get) => ({
  user: null,
  // 'loading' until the initial session probe finishes, so protected routes do
  // not flash the login screen on a hard refresh.
  status: 'loading',
  theme: readTheme(),

  /** Re-establishes the session from the refresh cookie on app boot. */
  bootstrap: async () => {
    // Guard against the double invocation React StrictMode performs in dev:
    // without it, two concurrent probes race and the loser can clobber the
    // winner's state after the user has already navigated away.
    if (get().status !== 'loading') return;

    try {
      // `me()` already unwraps to the user document. The axios 401
      // interceptor has already tried a refresh before we get here, so a
      // failure now genuinely means "no usable session".
      const user = await authApi.me();
      set({ user, status: 'authenticated' });
    } catch {
      set({ user: null, status: 'unauthenticated' });
    }
  },

  login: async (identifier, password) => {
    const res = await authApi.login({ identifier, password });
    setAccessToken(res.data.accessToken);
    const user = res.data.user;
    set({ user, status: 'authenticated' });
    return user;
  },

  register: async (payload) => {
    const res = await authApi.register(payload);
    setAccessToken(res.data.accessToken);
    const user = res.data.user;
    set({ user, status: 'authenticated' });
    return { user, devVerificationToken: res.data.devVerificationToken };
  },

  /**
   * Records a user change without a refetch.
   *
   * Accepts either the new user or an updater function, because the updater
   * form is what a caller reaches for by default — it is the shape
   * `useState` and `useReducer` use, and the difference is invisible at the
   * call site until the whole app renders `undefined`.
   *
   * Supporting both here is cheaper than policing the value-only form at every
   * call site: a missed one does not fail loudly, it just quietly replaces the
   * session with a function.
   */
  setUser: (next) =>
    set((s) => ({ user: typeof next === 'function' ? next(s.user) : next })),

  logout: async () => {
    try {
      await authApi.logout();
    } catch {
      // Even if the request fails, drop the local session.
    }
    setAccessToken(null);
    set({ user: null, status: 'unauthenticated' });
  },

  /**
   * Revokes every session server-side, then drops the local one. The caller's
   * refresh cookie is no longer valid, so this cannot be undone client-side.
   */
  logoutEverywhere: async () => {
    try {
      await authApi.logoutEverywhere();
    } catch {
      // Best effort — the local session is cleared regardless.
    }
    setAccessToken(null);
    set({ user: null, status: 'unauthenticated' });
  },

  /**
   * Deactivates or deletes the account, then ends the session.
   *
   * The local session is dropped only on success. Clearing it in a `finally`
   * would mean a mistyped password signed the user out of an account that is
   * still very much alive — the most alarming possible response to "wrong
   * password", and one the user could not undo by typing it again.
   *
   * The error is rethrown so the caller can show why it failed.
   */
  closeAccount: async (mode, password, reason) => {
    if (mode === 'delete') await authApi.deleteAccount(password);
    else await authApi.deactivate(password, reason);

    // Only now is the session genuinely gone: the server has ended it, and
    // every outstanding refresh token has been revoked.
    setAccessToken(null);
    set({ user: null, status: 'unauthenticated' });
  },

  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark';
    window.localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
    set({ theme: next });
  },
}));

// A refresh failure anywhere means the session is genuinely gone — either the
// cookie expired, or the server revoked it via `tokenVersion`.
setSessionLostHandler(() => {
  useAuthStore.setState({ user: null, status: 'unauthenticated' });
});

export { destinationFor };
applyTheme(readTheme());
