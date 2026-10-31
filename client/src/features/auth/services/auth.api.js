import { api, setAccessToken } from '../../../shared/api/client.js';

const unwrap = (promise) => promise.then((r) => r.data?.data ?? null);

export const authApi = {
  register: (payload) => api.post('/auth/register', payload).then((r) => r.data),
  login: (payload) => api.post('/auth/login', payload).then((r) => r.data),
  logout: () => api.post('/auth/logout').then((r) => r.data),
  // Invalidates every outstanding refresh token, on this device and all others.
  logoutEverywhere: () => api.post('/auth/logout-all').then((r) => r.data),
  me: () => unwrap(api.get('/auth/me')).then((d) => d.user),
  /**
   * Skills and interests are arrays, so with a file attached they only survive
   * the trip as multipart, repeated as separate parts (the caller builds the
   * `FormData`).
   *
   * Returns the whole envelope — `res.data.user` — like every other `authApi`
   * method. It used to return the unwrapped `data` for the JSON path and the
   * envelope for the multipart path, which meant `setUser(res.data.user)`
   * quietly produced `undefined` for one of the two. The asymmetry bought
   * nothing and cost a session.
   */
  updateProfile: (payload) => {
    if (!(payload instanceof FormData)) return api.put('/auth/profile', payload).then((r) => r.data);
    return api
      .put('/auth/profile', payload, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then((r) => r.data);
  },
  // Name, username and email. Separate endpoint because these carry
  // uniqueness and re-verification rules the profile fields do not.
  updateAccountDetails: (payload) => api.patch('/auth/account-details', payload).then((r) => r.data),
  /**
   * Changing the password bumps the account's `tokenVersion`, which
   * deliberately invalidates every token minted before it — including the one
   * this tab is holding. The server therefore issues a replacement pair, and
   * this adopts the new access token rather than returning it to be handled at
   * the call site.
   *
   * Done here rather than in the component because forgetting it fails quietly:
   * the request succeeds, and the *next* one 401s and silently refreshes. The
   * user sees nothing unless the new refresh cookie is also dropped, in which
   * case they are signed out immediately after changing their password.
   */
  changePassword: (payload) =>
    api.post('/auth/change-password', payload).then((r) => {
      if (r.data?.data?.accessToken) setAccessToken(r.data.data.accessToken);
      return r.data;
    }),
  updateNotificationPrefs: (prefs) => api.patch('/auth/notification-prefs', prefs).then((r) => r.data),
  updateOnboardingStep: (step) => api.patch('/auth/onboarding', { step }).then((r) => r.data),

  // ── Email verification ──
  verifyEmail: (token) => api.post('/auth/verify-email', { token }).then((r) => r.data),
  resendVerification: (email) => api.post('/auth/resend-verification', { email }).then((r) => r.data),

  // ── Password reset ──
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }).then((r) => r.data),
  resetPassword: (token, password) => api.post('/auth/reset-password', { token, password }).then((r) => r.data),

  // ── Account closure ──
  deactivate: (password, reason) => api.post('/auth/deactivate', { password, reason }).then((r) => r.data),
  deleteAccount: (password) => api.delete('/auth/account', { data: { password } }).then((r) => r.data),
};
