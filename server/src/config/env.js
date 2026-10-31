import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

// This file lives at server/src/config/env.js, so three levels up is server/.
const __dirname = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
export const SERVER_ROOT = __dirname;

dotenv.config({ path: path.join(SERVER_ROOT, '.env') });

/**
 * Environment contract.
 *
 * Two jobs, both of which have to happen before the process does anything else:
 *
 *  1. Reject malformed config immediately. A missing variable discovered deep
 *     inside a request handler is a confusing 500; discovered here it is a
 *     readable boot failure.
 *  2. Refuse to boot in production with a value that is only safe in
 *     development. Development may use a console mailer, local disk storage and
 *     a permissive cookie policy. Production may not — and the failure must be
 *     loud rather than a silent downgrade that only surfaces under load.
 */
export const isVercel = Boolean(process.env.VERCEL);
const vercelDomain = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
const vercelUrl = vercelDomain ? `https://${vercelDomain}` : '';

const bool = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

const schema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default(isVercel ? 'production' : 'development'),
  PORT: z.coerce.number().int().positive().default(5050),

  MONGO_URI: z.string().min(1, 'MONGO_URI is required'),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  CLIENT_URL: z.string().default(vercelUrl || 'http://localhost:5173'),
  SERVER_URL: z.string().default(vercelUrl || 'http://localhost:5050'),
  // Drives the cookie policy in production: `secure` + `SameSite=None` is
  // required when the SPA and the API live on different sites, otherwise
  // `SameSite=Strict`.
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default(isVercel ? 'true' : 'false')
    .transform((v) => v === 'true'),
  // Extra origins for CORS, comma separated. Needed when several frontends
  // (staging, preview deployments) point at one API.
  EXTRA_CLIENT_URLS: z.string().optional().default(''),

  // ── Email ────────────────────────────────────────────────────────────
  // `console` prints the message and is development-only: it never actually
  // delivers mail, and production refuses to start with it selected.
  EMAIL_PROVIDER: z.enum(['console', 'smtp', 'resend', 'sendgrid', 'ses']).default('console'),
  EMAIL_FROM: z.string().default('CampusConnect <no-reply@campusconnect.local>'),
  EMAIL_FROM_NAME: z.string().optional().default(''),

  // SMTP (also the transport shape Resend's SMTP interface expects)
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_SECURE: bool.optional(),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),

  // HTTP providers
  RESEND_API_KEY: z.string().optional().default(''),
  SENDGRID_API_KEY: z.string().optional().default(''),
  AWS_REGION: z.string().optional().default(''),
  AWS_ACCESS_KEY_ID: z.string().optional().default(''),
  AWS_SECRET_ACCESS_KEY: z.string().optional().default(''),

  // When true the API returns the verification link in the response instead of
  // sending mail. Development convenience, hard-refused in production because it
  // would let anyone who knows an email address take over an account.
  EMAIL_VERIFICATION_DEV_BYPASS: bool,

  // ── Storage ──────────────────────────────────────────────────────────
  CLOUDINARY_CLOUD_NAME: z.string().optional().default(''),
  CLOUDINARY_API_KEY: z.string().optional().default(''),
  CLOUDINARY_API_SECRET: z.string().optional().default(''),
  CLOUDINARY_FOLDER: z.string().default('campusconnect'),

  // Escape hatch for platforms with a persistent volume (Fly, Railway with a
  // mount, a container with a disk). Without it, production refuses local disk
  // because the filesystem is usually ephemeral and files vanish on redeploy.
  ALLOW_LOCAL_STORAGE: bool,
  // Serve uploaded documents (PDF/DOCX) only to their owner. Off by default
  // because it needs signed URLs rather than a plain static path.
  PRIVATE_RESOURCES: bool,

  MAX_UPLOAD_MB: z.coerce.number().positive().default(25),

  // ── Rate limits ─────────────────────────────────────────────────────────
  // Configurable because a hardcoded number cannot be right for every
  // deployment. The defaults are set for a *campus behind one NAT address*,
  // since that is the common case and the one a constant tuned on a laptop
  // reliably gets wrong: every student shares one IP, so a per-IP budget is a
  // shared budget.
  //
  // Note what actually stops bulk account creation here: registration requires
  // a verified email address, and each account may only be mailed a link once
  // per `RESEND_COOLDOWN_MS`. That bound is on the *provider's* quota and
  // cannot be sidestepped by changing IP. These limits are the cheap floor
  // that sheds naive scripted floods, not the real defence — raise them for a
  // large intake and lower them for a public unauthenticated deployment.
  RATE_LIMIT_REGISTER_PER_HOUR: z.coerce.number().positive().default(30),
  RATE_LIMIT_LOGIN_ATTEMPTS: z.coerce.number().positive().default(20),
  RATE_LIMIT_LOGIN_WINDOW_MINUTES: z.coerce.number().positive().default(5),
  RATE_LIMIT_EMAIL_PER_HOUR: z.coerce.number().positive().default(40),

  // Searches per window, keyed on the signed-in user (falling back to the IP
  // for anonymous visitors). Search runs an escaped regex across five
  // collections at once, so it is the most expensive read in the API.
  //
  // Keyed per *user* rather than per IP on purpose: a campus is normally one
  // NAT address, so an IP-keyed budget here would be a shared budget across the
  // whole institution — the one thing guaranteed to break on the morning the
  // new intake all search for the same thing at once. An IP-keyed cap on the
  // global limiter already bounds anonymous traffic; this one bounds a single
  // abusive *account*, which is the case worth stopping.
  RATE_LIMIT_SEARCH_PER_5MIN: z.coerce.number().positive().default(120),

  // Comments + replies per hour, per user. The same NAT argument applies, and
  // comment creation is the cheapest way to fill the database.
  RATE_LIMIT_COMMENTS_PER_HOUR: z.coerce.number().positive().default(60),

  // Socket.IO mounts on the same HTTP server but stays off until the realtime
  // work lands, so the current build is a plain REST API.
  ENABLE_SOCKETS: bool,

  /**
   * How aggressively index definitions are reconciled at boot.
   *
   *  create — add indexes the schema declares and are missing. Never removes.
   *            This is the production default: a schema change must not be able
   *            to drop a live unique constraint without an operator deciding to.
   *  sync   — also drop indexes the schema no longer declares. Convenient in
   *            development, dangerous in production, where the boot would be a
   *            destructive migration nobody approved.
   *
   * Defaults to `sync` outside production, where the blast radius is a local
   * database that can be re-seeded in seconds.
   */
  INDEX_SYNC: z.enum(['create', 'sync']).optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  // eslint-disable-next-line no-console
  console.error(`\n✖ Invalid environment configuration:\n${issues}\n\nCopy .env.example to .env and fill in the values.\n`);
  process.exit(1);
}

export const env = parsed.data;

export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
export const isDev = !isProd && !isTest;

/**
 * Production boot gate.
 *
 * Every entry is a config that is harmless locally and dangerous in production.
 * The process exits rather than starting in a state that would leak data or
 * quietly discard uploads.
 */
function assertProductionSafety() {
  if (!isProd) return;

  const fatal = [];
  const advise = [];

  if (env.JWT_SECRET === env.JWT_REFRESH_SECRET) {
    fatal.push('JWT_SECRET and JWT_REFRESH_SECRET must be different from each other.');
  }

  // Well-known development values, or a value that is obviously a placeholder.
  if (/^(replace|changeme|secret|password)/i.test(env.JWT_SECRET) || env.JWT_SECRET.length < 32) {
    fatal.push('JWT_SECRET must be at least 32 characters in production and must not be a placeholder.');
  }
  if (/^(replace|changeme|secret|password)/i.test(env.JWT_REFRESH_SECRET) || env.JWT_REFRESH_SECRET.length < 32) {
    fatal.push('JWT_REFRESH_SECRET must be at least 32 characters in production and must not be a placeholder.');
  }

  if (env.EMAIL_PROVIDER === 'console') {
    fatal.push('EMAIL_PROVIDER is "console" — it does not deliver mail. Configure smtp/resend/sendgrid/ses.');
  }
  if (!env.EMAIL_FROM || env.EMAIL_FROM.includes('campusconnect.local')) {
    fatal.push('EMAIL_FROM must be a real sender address in production.');
  }
  if (env.EMAIL_VERIFICATION_DEV_BYPASS) {
    fatal.push('EMAIL_VERIFICATION_DEV_BYPASS cannot be enabled in production — it hands account access to anyone who knows an email address.');
  }

  if (!hasCloudinary && !env.ALLOW_LOCAL_STORAGE) {
    fatal.push(
      'No durable storage configured. Set the CLOUDINARY_* variables, or set ALLOW_LOCAL_STORAGE=true if this host has a persistent volume.',
    );
  }

  if (env.CLIENT_URL.includes('localhost') || env.SERVER_URL.includes('localhost')) {
    fatal.push('CLIENT_URL and SERVER_URL must not point at localhost in production.');
  }

  if (env.NODE_ENV === 'production' && !env.COOKIE_SECURE) {
    advise.push('COOKIE_SECURE is false — the refresh cookie will travel over plaintext HTTP.');
  }

  if (fatal.length) {
    // eslint-disable-next-line no-console
    console.error(`\n✖ Refusing to start in production:\n${fatal.map((f) => `  • ${f}`).join('\n')}\n`);
    process.exit(1);
  }

  if (advise.length) {
    // eslint-disable-next-line no-console
    console.warn(`\n⚠ ${advise.join('\n  ')}\n`);
  }
}

/** True only when every Cloudinary credential is present. */
export const hasCloudinary = Boolean(
  env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET,
);

export const UPLOAD_DIR = isVercel ? '/tmp/uploads' : path.join(SERVER_ROOT, 'uploads');

/** Origins allowed to make credentialed requests. */
export const allowedOrigins = [
  ...env.CLIENT_URL.split(','),
  ...env.EXTRA_CLIENT_URLS.split(','),
  ...(vercelUrl ? [vercelUrl] : []),
]
  .map((o) => o.trim())
  .filter(Boolean);

assertProductionSafety();
