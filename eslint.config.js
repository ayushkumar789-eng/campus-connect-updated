/**
 * ESLint flat config.
 *
 * Scope is deliberately narrow: correctness rules only. No formatting or
 * stylistic rules, because a codebase that predates a linter should not be
 * reformatted by the act of adopting one — that would bury real fixes in
 * thousands of unrelated whitespace hunks and make the change unreviewable.
 *
 * The rule that matters most here is `no-undef`. A JSX file that references an
 * undeclared identifier still builds: Rollup treats the unknown name as a
 * global and emits a bundle without complaint. The failure only appears in the
 * browser, as a `ReferenceError` thrown from inside a query function or event
 * handler. That is exactly how `useData.js` shipped with five missing imports
 * and a feed, search, notifications, events and notes surface that all
 * rendered an error while `npm run build` stayed green. A linter is the only
 * static check that sees this class of bug.
 *
 * `react-hooks` is included for the same reason: a hook called conditionally is
 * also invisible to the bundler and corrupts React's internal state.
 */
import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

/** Rules that catch logic errors regardless of language version or runtime. */
const correctness = {
  ...js.configs.recommended.rules,

  // Keep these on: they are cheap, they have no false positives on real code,
  // and each one is a genuine bug when it fires.
  'no-unused-vars': ['error', {
    argsIgnorePattern: '^_',
    varsIgnorePattern: '^_',
    caughtErrors: 'none',
  }],
  'no-empty': ['error', { allowEmptyCatch: true }],
  'no-constant-condition': ['error', { checkLoops: false }],
  'no-fallthrough': 'error',
  'no-self-compare': 'error',
  'no-sparse-arrays': 'error',
  'use-isnan': 'error',
  'valid-typeof': 'error',
  'no-dupe-keys': 'error',
  'no-dupe-args': 'error',
  'no-duplicate-case': 'error',
  'no-unreachable': 'error',
  'no-const-assign': 'error',
  'no-func-assign': 'error',
  'no-import-assign': 'error',
  'no-unsafe-negation': 'error',
  'no-unsafe-optional-chaining': 'error',
  'no-dupe-else-if': 'error',
  'no-ex-assign': 'error',
  'no-undef': 'error',

  // Deliberately off. These fire constantly on idiomatic React and JS without
  // ever indicating a defect.
  'no-unused-labels': 'off',
  'no-unused-expressions': 'off',
  'no-empty-pattern': 'off',
};

export default [
  {
    ignores: [
      '**/node_modules/**',
      'client/dist/**',
      'server/data/**',
      '**/coverage/**',
      'server/scripts/**', // one-off operational scripts, checked separately
    ],
  },

  // ── Client: browser + React ─────────────────────────────────────────────
  {
    files: ['client/src/**/*.{js,jsx}'],
    ...js.configs.recommended,
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: 'detect' } },
    // The codebase already carries `eslint-disable-next-line no-console`,
    // `no-await-in-loop` and similar comments from an earlier lint setup that
    // no longer exists in the tree. None of those rules are enabled here, so
    // reporting each directive as unused would emit ~57 warnings about
    // suppressions that are simply inert — noise that hides real findings.
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    rules: {
      ...correctness,

      // React 17+ auto-batches and the JSX transform makes the classic rules
      // obsolete; only the genuinely-broken-pattern rules stay on.
      'react/jsx-uses-react': 'off',
      'react/react-in-jsx-scope': 'off',

      // Essential, and easy to miss: without this, `import { Home } from …`
      // followed by `<Home />` is reported as an unused variable, because
      // core ESLint does not count a JSX tag as a reference. Turning it off
      // produced 573 bogus errors across 76 files.
      'react/jsx-uses-vars': 'error',
      'react/jsx-key': 'error',
      'react/no-unescaped-entities': 'off',
      'react/no-direct-mutation-state': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  // ── Server: Node + ESM (`"type": "module"`) ─────────────────────────────
  {
    files: ['server/**/*.js'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    // See the note in the client block above.
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    rules: correctness,
  },
];