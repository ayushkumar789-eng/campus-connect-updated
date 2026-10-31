import { z } from 'zod';

/**
 * Coerces optional numeric fields coming from HTML forms.
 *
 * A multipart form sends `""` for an untouched input. `z.coerce.number()`
 * would turn that into `0` and fail the range check, so empty strings are
 * normalised to `undefined` first.
 */
export const optionalInt = (min, max) =>
  z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : v),
    z.coerce.number().int().min(min).max(max).optional().nullable(),
  );

/** Trims and normalises optional strings from forms. */
export const optionalText = (max) =>
  z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : v),
    z.string().trim().max(max).optional(),
  );

export const trimmed = (min, max, label) =>
  z
    .string()
    .trim()
    .min(min, `${label} must be at least ${min} characters`)
    .max(max, `${label} cannot exceed ${max} characters`);

export const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id');

/**
 * Array fields arrive from multipart as repeated keys (`skills=A&skills=B`),
 * which multer already turns into an array. A single value is wrapped so
 * `"React"` also validates as `["React"]`, and an absent or empty value becomes
 * an empty list.
 *
 * An empty list is valid, and that matters: a profile with no skills yet is
 * the normal state for a new account, and clearing the last skill sends `[]`.
 * A `.min(1)` here would reject that, so a student could add skills but never
 * remove them. The per-element `trimmed(1, …)` is what rejects a blank entry,
 * which is the mistake that rule was actually aiming at.
 */
export const stringArray = (maxItems, maxLength = 40) =>
  z.preprocess(
    (v) => (v === undefined || v === null || v === '' ? [] : v),
    z.array(trimmed(1, maxLength, 'Value')).max(maxItems),
  );
