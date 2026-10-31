import { useState } from 'react';
import { X, Plus } from 'lucide-react';
import { Button } from './Button.jsx';

/**
 * Free-form tag editor that turns a list of strings into the array shape the
 * API stores.
 *
 * Used for skills and interests in onboarding and in Settings, so the two
 * places cannot drift in behaviour — notably the case-insensitive duplicate
 * check, which stops a list reading "React, react, REACT".
 */
export function TagPicker({ label, values = [], suggestions = [], onChange, max = 15, hint }) {
  const [draft, setDraft] = useState('');

  const add = (value) => {
    const v = String(value).trim();
    if (!v || values.length >= max) return;
    if (values.some((x) => x.toLowerCase() === v.toLowerCase())) return;
    onChange([...values, v.slice(0, 40)]);
    setDraft('');
  };

  const remaining = suggestions
    .filter((s) => !values.some((v) => v.toLowerCase() === s.toLowerCase()))
    .slice(0, 8);

  const full = values.length >= max;

  return (
    <div>
      <span className="mb-1.5 block text-[13px] font-medium text-ink-2">{label}</span>

      {values.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5">
          {values.map((v) => (
            <li
              key={v}
              className="inline-flex items-center gap-1 rounded-md border border-accent/30 bg-accent-soft px-2 py-1 text-[12.5px] font-medium text-accent"
            >
              {v}
              <button
                type="button"
                onClick={() => onChange(values.filter((x) => x !== v))}
                aria-label={`Remove ${v}`}
                className="rounded transition-colors hover:text-danger"
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter commits rather than submitting the surrounding form, which
            // would otherwise jump the user to the next wizard step.
            if (e.key === 'Enter') {
              e.preventDefault();
              add(draft);
            }
          }}
          placeholder="Type and press Enter"
          disabled={full}
          aria-label={label}
          className="h-9 min-w-0 flex-1 rounded-md border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 disabled:opacity-50"
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => add(draft)}
          disabled={!draft.trim() || full}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Add
        </Button>
      </div>

      {remaining.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {remaining.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="rounded-md border border-line px-2 py-0.5 text-[12px] text-ink-3 transition-colors hover:border-accent hover:text-accent"
            >
              + {s}
            </button>
          ))}
        </div>
      )}

      <p className="mt-1.5 text-[12px] text-ink-3">
        {hint ?? `${values.length}/${max} added${full ? ' — maximum reached' : ''}`}
      </p>
    </div>
  );
}
