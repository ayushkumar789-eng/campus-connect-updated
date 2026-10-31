/**
 * Formatters and small helpers shared across the UI.
 */
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Compact relative time: "now", "5m", "3h", "2d", then a date.
 * Kept short because it sits inline next to author names.
 */
export function timeAgo(value) {
  if (!value) return '';
  const then = new Date(value).getTime();
  const diff = Date.now() - then;
  if (Number.isNaN(diff)) return '';

  if (diff < MINUTE) return 'now';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}d`;

  return new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** Longer form used in notifications and chat. */
export function formatRelative(value) {
  if (!value) return '';
  const diff = Date.now() - new Date(value).getTime();
  if (diff < MINUTE) return 'just now';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} min ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} hr ago`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)} d ago`;
  return new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** 12500 → "12.5K". Used for follower and like counts. */
export function compactNumber(value = 0) {
  const n = Number(value) || 0;
  if (n < 1000) return String(n);
  if (n < 1_000_000) {
    const k = n / 1000;
    return `${k % 1 === 0 ? k : k.toFixed(1)}K`;
  }
  const m = n / 1_000_000;
  return `${m % 1 === 0 ? m : m.toFixed(1)}M`;
}

/**
 * Picks the plural form for a count. Only `1` is singular in English, so
 * `0 posts` stays plural — "0 post" reads as a bug.
 * @example plural(1, 'post') // 'post'
 * @example plural(0, 'post') // 'posts'
 */
export function plural(count, singular, pluralForm = `${singular}s`) {
  return Math.abs(Number(count) || 0) === 1 ? singular : pluralForm;
}

/**
 * Renders a year of study the way students say it out loud.
 *
 * `User.year` is the 1–6 year of study, never a calendar year, so "Year 2"
 * and "2nd year" both appear in the wild — pick one and use it everywhere or
 * the same student is described two different ways on two screens.
 * @example yearOfStudy(2) // '2nd year'
 * @example yearOfStudy(null) // ''
 */
export function yearOfStudy(year) {
  const n = Number(year);
  if (!Number.isFinite(n) || n <= 0) return '';
  const suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[n] ?? 'th';
  return `${n}${suffix} year`;
}

/** 482113 → "482 KB" */
export function formatBytes(bytes = 0) {
  const n = Number(bytes) || 0;
  if (!n) return '0 KB';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  const value = n / 1024 ** i;
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

/** "2026-04-12T10:30" → "12 Apr 2026, 10:30 am" */
export function formatDateTime(value, opts) {
  if (!value) return '';
  return new Date(value).toLocaleString(undefined, opts ?? {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Turn "#tag" and bare URLs in post text into tappable elements. */
export function linkify(text = '') {
  const parts = [];
  const pattern = /(#[\w]+)|((?:https?:\/\/|www\.)[^\s]+)/gi;
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    parts.push({ type: match[1] ? 'tag' : 'link', value: match[0] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push({ type: 'text', value: text.slice(lastIndex) });
  return parts;
}

/** Consistent initials for the avatar fallback. */
export function initials(name = '') {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase() || '?';
}

/** Builds the absolute URL for a locally uploaded file. */
export function resolveFileUrl(url) {
  if (!url) return '';
  if (/^https?:\/\//.test(url)) return url;
  return `${import.meta.env.VITE_SERVER_URL ?? ''}${url}`;
}

export function classNames(...parts) {
  return twMerge(clsx(parts));
}
