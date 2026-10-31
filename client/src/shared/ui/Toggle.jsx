/**
 * Accessible on/off switch.
 *
 * A real `<button role="switch">` rather than a styled checkbox, so it is
 * reachable by keyboard, announced correctly ("follows, switch, on") and
 * operable with Space as well as Enter.
 *
 * @param {object} props
 * @param {string} props.label
 * @param {string} [props.description]
 * @param {boolean} props.checked
 * @param {(next: boolean) => void} props.onChange
 * @param {boolean} [props.disabled]
 */
export function Toggle({ label, description, checked, onChange, disabled = false }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3.5">
      <div className="min-w-0">
        <p className="text-[14.5px] font-medium text-ink">{label}</p>
        {description && <p className="mt-0.5 text-[13px] text-ink-3">{description}</p>}
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={[
          'relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition-colors duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
          'disabled:cursor-not-allowed disabled:opacity-50',
          checked ? 'bg-accent' : 'bg-surface-3',
        ].join(' ')}
      >
        <span
          className={[
            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-150',
            checked ? 'translate-x-[1.125rem]' : 'translate-x-0.5',
          ].join(' ')}
        />
      </button>
    </div>
  );
}
