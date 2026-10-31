import { classNames } from '../utils/format.js';

/** Surface primitive: 1px border, small radius, no heavy shadow. */
export function Card({ as: Tag = 'div', className, children, ...props }) {
  return (
    <Tag className={classNames('rounded-lg border border-line bg-surface shadow-card', className)} {...props}>
      {children}
    </Tag>
  );
}

export function CardHeader({ title, description, action, className }) {
  return (
    <div className={classNames('flex items-start justify-between gap-4 border-b border-line px-4 py-3', className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-ink-3">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** Small neutral pill used for subjects, courses and tags. */
export function Badge({ children, tone = 'neutral', className, size = 'md' }) {
  const tones = {
    neutral: 'bg-surface-2 text-ink-2 border-line',
    accent: 'bg-accent-soft text-accent border-transparent',
    success: 'bg-success/10 text-success border-transparent',
    warning: 'bg-warning/15 text-warning border-transparent',
    danger: 'bg-danger/10 text-danger border-transparent',
  };

  return (
    <span
      className={classNames(
        'inline-flex items-center gap-1 rounded-md border font-medium whitespace-nowrap',
        size === 'sm' ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-0.5 text-xs',
        tones[tone] ?? tones.neutral,
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Section heading used above lists and inside the right rail. */
export function SectionTitle({ children, action, className }) {
  return (
    <div className={classNames('mb-2.5 flex items-center justify-between gap-3', className)}>
      <h3 className="text-[13px] font-semibold tracking-wide text-ink-3 uppercase">{children}</h3>
      {action}
    </div>
  );
}

export function Divider({ className }) {
  return <hr className={classNames('border-0 border-t border-line', className)} />;
}
