export * from './services/auth.api.js';
// These two modules export named bindings, not a default. Re-exporting them as
// `default as …` asked for a default export that does not exist, and the dev
// server rejected the module graph outright:
//
//   SyntaxError: The requested module '/src/features/auth/hooks/useAuthStore.js'
//   does not provide an export named 'default'
//
// That killed the whole app — a blank page at every route, with no React error
// boundary able to catch it, because the failure was in module resolution
// before any component ran. The production build did not catch it either: Rollup
// resolves the barrel statically and tree-shakes an unused re-export away, so
// `npm run build` passed and emitted a working bundle. Only running the dev
// server surfaced it.
export { useAuthStore } from './hooks/useAuthStore.js';
export { AuthLayout } from './pages/AuthLayout.jsx';
export { default as ForgotPassword } from './pages/ForgotPassword.jsx';
export { default as Landing } from './pages/Landing.jsx';
export { default as Login } from './pages/Login.jsx';
// `ProfileSetup` is deliberately NOT re-exported here.
//
// `App.jsx` reaches it with `lazy(() => import('./pages/ProfileSetup.jsx'))` so
// the onboarding form is fetched only when a new account actually needs it.
// A static re-export from a barrel that App.jsx also pulls in cancels that
// split: Vite reported it plainly at build time —
//
//   ProfileSetup.jsx is dynamically imported by App.jsx but also statically
//   imported by features/auth/index.js, dynamic import will not move module
//   into another chunk
//
// — and the whole form ended up inside the main bundle, paid for by every
// visitor who never registers. Import it directly where it is used.
export { default as Register } from './pages/Register.jsx';
export { default as ResetPassword } from './pages/ResetPassword.jsx';
export { default as VerifyEmail } from './pages/VerifyEmail.jsx';
