import rateLimit from 'express-rate-limit';
import { env, isTest } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

const shared = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Rate limiters are useless behind a proxy unless trust proxy is set correctly.
  handler: (req, res, next) => next(ApiError.tooMany('Too many requests. Please slow down.')),
};

/**
 * Tests run hundreds of requests against one shared IP with no delay, which is
 * indistinguishable from the flood these limiters exist to stop. Disabling them
 * under NODE_ENV=test keeps suites deterministic without weakening production:
 * the guard below is `isTest`, not a value any production process can reach,
 * because `NODE_ENV=production` is itself a boot requirement.
 */
const notInTest = isTest;

export const apiLimiter = rateLimit({
  ...shared,
  windowMs: 15 * 60 * 1000,
  limit: 600,
  // Health checks are excluded. A platform probe (Render, Fly, Kubernetes,
  // an uptime monitor) polls this endpoint on a fixed interval, often from a
  // single shared egress IP. Counting those calls against the same bucket as
  // real traffic means a busy application eventually answers the probe with a
  // 429 and gets itself reported as down — the limiter causing the outage it
  // was added to prevent.
  skip: (req) => req.path === '/health' || req.path === '/health/',
});

/**
 * Registration is a different threat from signing in — mass account creation
 * rather than password guessing — so it gets its own budget rather than sharing
 * the credential one.
 *
 * Sharing them was actively harmful: an attacker grinding one password could
 * exhaust the bucket and stop every *other* student on the same NAT address
 * from registering at all. The inverse (someone registering in a loop locking
 * out sign-ins) was just as real.
 *
 * Counted per IP, because a brand-new account has no identifier worth keying
 * on yet.
 */
export const registerLimiter = rateLimit({
  ...shared,
  windowMs: 60 * 60 * 1000,
  limit: env.RATE_LIMIT_REGISTER_PER_HOUR,
  handler: (req, res, next) =>
    next(
      ApiError.tooMany('Too many accounts created from this network. Try again later.'),
    ),
});

/**
 * Tight limiter on credential endpoints to blunt brute-force attempts.
 *
 * Keyed on the *account being attempted*, not the caller's IP. That is where
 * brute force actually lands, and it changes the failure modes:
 *
 *  • An attacker rotating source addresses still shares one bucket per account,
 *    so the limit keeps working against them. An IP-keyed bucket is defeated by
 *    simply spreading the attempts out.
 *  • A university campus puts every student behind one NAT address, so an
 *    IP-keyed credential limit is a shared budget: one confused student
 *    repeatedly mistyping a password could lock an entire institution out of
 *    its own accounts.
 *
 * A request with no identifier to key on — a malformed probe, or a flood
 * against the endpoint itself — falls back to the IP so it is still bounded.
 *
 * The window is short on purpose. `skipSuccessfulRequests` means only failures
 * count, but the limit is enforced *before* the password is ever checked, so a
 * correct password cannot clear the lockout — it is rejected without being
 * compared. That makes the lockout unavoidable for the legitimate owner too,
 * and so its cost is the product of the count and the window. 20 attempts in 5
 * minutes still caps a distributed attack at 240 guesses an hour against a
 * bcrypt hash, while a student who fat-fingers their password a few times waits
 * minutes rather than a quarter of an hour.
 *
 * Both numbers are configurable: a deployment that fronts this with a shared
 * campus NAT can widen them without a code change.
 */
export const authLimiter = rateLimit({
  ...shared,
  windowMs: env.RATE_LIMIT_LOGIN_WINDOW_MINUTES * 60 * 1000,
  limit: env.RATE_LIMIT_LOGIN_ATTEMPTS,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const identifier = typeof req.body?.identifier === 'string' ? req.body.identifier.trim().toLowerCase() : '';
    return identifier ? `acct:${identifier}` : `ip:${req.ip}`;
  },
  // Its own message: "slow down" reads as a rebuke to a student who simply
  // cannot remember their password, and tells them nothing about how long to
  // wait or what to try instead.
  handler: (req, res, next) =>
    next(
      ApiError.tooMany(
        'Too many sign-in attempts for this account. Wait a few minutes, or reset your password.',
      ),
    ),
});

/**
 * Keyed per account when the caller is authenticated, per IP otherwise.
 *
 * The post/comment/content buckets are the ones a campus NAT breaks: every
 * student on the institution shares one address, so an IP-keyed budget is a
 * budget they all spend from each other. Keying on the authenticated user
 * bounds the account that is actually misbehaving while leaving the shared
 * address alone. Unauthenticated requests still fall back to the IP, which is
 * the only identifier available at that point.
 *
 * @param {string} prefix namespace so one user cannot spend another's bucket
 */
const perUserOrIp = (prefix) => (req) =>
  req.user?._id ? `${prefix}:u:${req.user._id}` : `${prefix}:ip:${req.ip}`;

/** Limits content creation so a scripted client cannot flood the feed. */
export const createLimiter = rateLimit({
  ...shared,
  windowMs: 60 * 60 * 1000,
  limit: 120,
  keyGenerator: perUserOrIp('create'),
  skip: () => notInTest,
});

/**
 * Search runs an escaped regex across users, posts, groups, notes and
 * discussions simultaneously, which makes it the most expensive read in the
 * API and the one most worth bounding.
 *
 * Aimed at the authenticated user rather than the IP for the NAT reason above.
 * This is a *ceiling*, not the primary throttle: the global `apiLimiter` still
 * bounds anonymous traffic, and this one stops one signed-in account from
 * occupying a worker pool with back-to-back regex sweeps.
 */
export const searchLimiter = rateLimit({
  ...shared,
  windowMs: 5 * 60 * 1000,
  limit: env.RATE_LIMIT_SEARCH_PER_5MIN,
  keyGenerator: perUserOrIp('search'),
  skip: () => notInTest,
  handler: (req, res, next) =>
    next(ApiError.tooMany('Too many searches. Wait a moment before searching again.')),
});

/**
 * Comments and replies. Separate from `createLimiter` because they are the
 * cheapest write available — a few hundred bytes each, no upload pipeline — and
 * therefore the fastest way to bloat a collection.
 */
export const commentLimiter = rateLimit({
  ...shared,
  windowMs: 60 * 60 * 1000,
  limit: env.RATE_LIMIT_COMMENTS_PER_HOUR,
  keyGenerator: perUserOrIp('comment'),
  skip: () => notInTest,
});

/**
 * Outbound mail is the expensive part of verification and password reset, so
 * these get their own bucket.
 *
 * This is deliberately *generous*, because it is keyed by IP and a university
 * campus puts every student behind one NAT address: a limit tight enough to stop
 * an abuser is also tight enough to lock out a whole institution on a busy
 * morning. 40/hour sheds volumetric floods without that failure mode.
 *
 * The limit that actually protects the mail provider's quota is per-account,
 * and lives in `verification.service.js` (`RESEND_COOLDOWN_MS`) where it is
 * unaffected by the caller's IP.
 */
export const emailLimiter = rateLimit({
  ...shared,
  windowMs: 60 * 60 * 1000,
  limit: env.RATE_LIMIT_EMAIL_PER_HOUR,
  // A verification already sitting in the user's inbox is a success from the
  // user's point of view, so only failures count against the bucket.
  skipSuccessfulRequests: true,
});
