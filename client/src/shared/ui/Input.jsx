import { forwardRef, useId } from 'react';
import { AlertCircle } from 'lucide-react';
import { classNames } from '../utils/format.js';

const FIELD =
  'w-full rounded-md border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-3 ' +
  'transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 ' +
  'disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-ink-3';

const invalid = (hasError) => (hasError ? 'border-danger focus:border-danger focus:ring-danger/25' : '');

export function Field({ label, error, hint, required, children, className, htmlFor }) {
  return (
    <div className={classNames('space-y-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className="block text-[13px] font-medium text-ink-2">
          {label}
          {required && <span className="ml-0.5 text-danger">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="flex items-start gap-1.5 text-[12.5px] font-medium text-danger">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : (
        hint && <p className="text-[12.5px] text-ink-3">{hint}</p>
      )}
    </div>
  );
}

export const Input = forwardRef(function Input({ label, error, hint, className, required, id, ...props }, ref) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <Field label={label} error={error} hint={hint} required={required} htmlFor={inputId} className={className}>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? 'true' : undefined}
        className={classNames(FIELD, 'h-10', invalid(Boolean(error)), props.className)}
        {...props}
      />
    </Field>
  );
});

export const Textarea = forwardRef(function Textarea(
  { label, error, hint, className, required, id, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <Field label={label} error={error} hint={hint} required={required} htmlFor={inputId} className={className}>
      <textarea
        ref={ref}
        id={inputId}
        aria-invalid={error ? 'true' : undefined}
        className={classNames(FIELD, 'min-h-24 resize-y py-2.5 leading-relaxed', invalid(Boolean(error)), props.className)}
        {...props}
      />
    </Field>
  );
});

export const Select = forwardRef(function Select({ label, error, hint, className, required, id, children, ...props }, ref) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <Field label={label} error={error} hint={hint} required={required} htmlFor={inputId} className={className}>
      <select
        ref={ref}
        id={inputId}
        className={classNames(FIELD, 'h-10 cursor-pointer pr-8', invalid(Boolean(error)), props.className)}
        {...props}
      >
        {children}
      </select>
    </Field>
  );
});
