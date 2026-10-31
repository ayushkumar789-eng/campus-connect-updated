#!/usr/bin/env node
/**
 * Production boot-gate probe.
 *
 * Boots the real server in `NODE_ENV=production` with a series of
 * configurations and records whether it refuses. This is a behavioural test of
 * `assertProductionSafety()` in server/src/config/env.js — not a read of the
 * source. A guard that looks correct in the source but does not actually stop
 * the boot is not a guard, and the only way to know which one you have is to
 * start the process.
 *
 * Secrets are never printed. Each configuration is described by name only, and
 * the values live in this file as throwaway test fixtures.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(__dirname, '..');

const BOOT_MS = 9000;

const STRONG = 'a3f8c1d94b2e70615f8a3c9d24e7b0516c2d8f4a1e9b7d035c6f2a8e4b1d709';
const STRONG_2 = '7c2b9e05f14a8d63b0e2f7c95a1d4806f3b2e7c90a5d1f68b4e37c02a9d5f18';

const base = {
  NODE_ENV: 'production',
  PORT: '5095',
  MONGO_URI: 'mongodb://127.0.0.1:27017/campusconnect_prodgate',
  JWT_SECRET: STRONG,
  JWT_REFRESH_SECRET: STRONG_2,
  EMAIL_PROVIDER: 'resend',
  EMAIL_FROM: 'no-reply@campusconnect.example',
  EMAIL_VERIFICATION_DEV_BYPASS: 'false',
  CLIENT_URL: 'https://app.campusconnect.example',
  SERVER_URL: 'https://api.campusconnect.example',
  COOKIE_SECURE: 'true',
  ALLOW_LOCAL_STORAGE: 'true',
  CLOUDINARY_CLOUD_NAME: 'probe',
  CLOUDINARY_API_KEY: 'probe',
  CLOUDINARY_API_SECRET: 'probe',
};

const CASES = [
  { name: 'a fully valid production config', expect: 'boots', env: {} },
  { name: 'no durable storage configured', expect: 'refuses', env: { ALLOW_LOCAL_STORAGE: 'false', CLOUDINARY_CLOUD_NAME: '', CLOUDINARY_API_KEY: '', CLOUDINARY_API_SECRET: '' } },
  { name: 'JWT_SECRET === JWT_REFRESH_SECRET', expect: 'refuses', env: { JWT_REFRESH_SECRET: STRONG } },
  { name: 'placeholder JWT_SECRET', expect: 'refuses', env: { JWT_SECRET: 'changeme-please-do-not-ship-this' } },
  { name: 'JWT_SECRET shorter than 32 chars', expect: 'refuses', env: { JWT_SECRET: 'tooshort' } },
  { name: 'placeholder JWT_REFRESH_SECRET', expect: 'refuses', env: { JWT_REFRESH_SECRET: 'replace-with-a-real-secret' } },
  { name: 'EMAIL_PROVIDER=console', expect: 'refuses', env: { EMAIL_PROVIDER: 'console' } },
  { name: 'EMAIL_FROM is a placeholder domain', expect: 'refuses', env: { EMAIL_FROM: 'noreply@campusconnect.local' } },
  { name: 'EMAIL_FROM missing', expect: 'refuses', env: { EMAIL_FROM: '' } },
  { name: 'EMAIL_VERIFICATION_DEV_BYPASS=true', expect: 'refuses', env: { EMAIL_VERIFICATION_DEV_BYPASS: 'true' } },
  { name: 'CLIENT_URL points at localhost', expect: 'refuses', env: { CLIENT_URL: 'http://localhost:5173' } },
  { name: 'SERVER_URL points at localhost', expect: 'refuses', env: { SERVER_URL: 'http://localhost:5050' } },
  { name: 'MONGO_URI missing', expect: 'refuses', env: { MONGO_URI: '' } },
  { name: 'JWT_SECRET missing', expect: 'refuses', env: { JWT_SECRET: '' } },
  { name: 'COOKIE_SECURE=false (should warn, still boot)', expect: 'boots-with-warning', env: { COOKIE_SECURE: 'false' } },
];

function boot(env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['src/server.js'], {
      cwd: serverDir,
      env: { PATH: process.env.PATH, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve({ verdict: 'boots', out });
    }, BOOT_MS);

    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ verdict: 'exits', code, out });
    });
  });
}

function classify(res) {
  if (res.verdict === 'boots') return 'boots';
  if (/Refusing to start in production/.test(res.out)) {
    return res.out.includes('⚠') ? 'refuses-with-warning' : 'refuses';
  }
  if (/Invalid environment|ZodError|invalid_type|Required/i.test(res.out)) return 'refuses-schema';
  return `exits(${res.code})`;
}

const results = [];
console.log('Production boot gate — does the server actually refuse unsafe config?\n');

for (const c of CASES) {
  const res = await boot({ ...base, ...c.env });
  const verdict = classify(res);
  const ok =
    c.expect === 'boots'
      ? verdict === 'boots'
      : c.expect === 'boots-with-warning'
        ? verdict === 'boots' && /⚠/.test(res.out)
        : verdict.startsWith('refuses');

  const reasons = (res.out.match(/^\s*•\s*(.+)$/gm) ?? [])
    .map((l) => l.replace(/^\s*•\s*/, '').trim())
    .slice(0, 3);

  results.push({ ...c, verdict, ok, reasons, out: res.out });
  const tag = ok ? 'PASS' : 'FAIL';
  const detail = reasons.length
    ? reasons.join('; ')
    : verdict.startsWith('refuses')
      ? 'rejected by env schema'
      : verdict === 'boots'
        ? 'server started and stayed up'
        : `exit ${res.code}`;
  console.log(`  ${tag}  ${c.name.padEnd(42)} → ${verdict}`);
  if (ok && detail !== 'server started and stayed up') console.log(`          ${detail}`);
  if (!ok) console.log(`          unexpected: ${res.out.split('\n').slice(0, 4).join(' | ').slice(0, 200)}`);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n  ${results.length - failed.length}/${results.length} boot-gate cases behaved as specified.`);

// Confirm nothing leaked: the fixtures are throwaway, but assert the process
// never wrote one of them to stdout.
const leaked = results.filter((r) => (r.out ?? '').includes(STRONG) || (r.out ?? '').includes(STRONG_2));
if (leaked.length) {
  console.log(`  ! ${leaked.length} configuration(s) echoed a secret value to stdout`);
} else {
  console.log('  ✓ no secret value appeared in any server output');
}

const total = results.length;
console.log(`  ${total - failed.length} passed, ${failed.length} failed  (${total} total)`);

process.exit(failed.length ? 1 : 0);