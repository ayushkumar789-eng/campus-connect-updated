import { initials, resolveFileUrl, classNames } from '../utils/format.js';

const SIZES = {
  xs: 'h-7 w-7 text-[11px]',
  sm: 'h-9 w-9 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-base',
  xl: 'h-24 w-24 text-2xl',
  '2xl': 'h-32 w-32 text-4xl',
};

/**
 * Avatar with a deterministic colour fallback. The hue is derived from the
 * username, so a student keeps the same colour everywhere in the app without
 * any stored value.
 */
export function Avatar({ user, size = 'md', className, ring = false }) {
  const name = user?.name ?? '';
  const username = user?.username ?? name ?? '';
  const src = user?.avatar?.url ?? user?.avatar ?? '';

  let hash = 0;
  for (let i = 0; i < username.length; i += 1) {
    hash = (hash * 31 + username.charCodeAt(i)) % 360;
  }

  return (
    <span
      className={classNames(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full',
        'font-semibold text-white select-none',
        SIZES[size] ?? SIZES.md,
        ring && 'ring-2 ring-surface',
        className,
      )}
      style={src ? undefined : { backgroundColor: `oklch(52% 0.13 ${hash})` }}
    >
      {src ? (
        <img
          src={resolveFileUrl(src)}
          alt={name ? `${name}'s avatar` : 'Avatar'}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      ) : (
        <span aria-hidden>{initials(name || username)}</span>
      )}
    </span>
  );
}
