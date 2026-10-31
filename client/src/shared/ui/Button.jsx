import { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { classNames } from '../utils/format.js';

const VARIANTS = {
  primary:
    'bg-accent text-accent-ink hover:bg-accent-hover border border-transparent shadow-sm disabled:hover:bg-accent',
  secondary:
    'bg-surface text-ink border border-line hover:bg-surface-2 hover:border-line-strong',
  ghost: 'bg-transparent text-ink-2 hover:bg-surface-2 hover:text-ink border border-transparent',
  subtle: 'bg-accent-soft text-accent border border-transparent hover:brightness-95 dark:hover:brightness-125',
  danger: 'bg-danger text-white border border-transparent hover:brightness-95',
  outline: 'bg-transparent text-accent border border-accent hover:bg-accent-soft',
};

const SIZES = {
  sm: 'h-8 px-3 text-[13px] gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-11 px-6 text-[15px] gap-2',
  icon: 'h-9 w-9 p-0',
  'icon-sm': 'h-8 w-8 p-0',
};

/**
 * The single button primitive. Kept deliberately flat: a 1px border and a
 * restrained radius rather than heavy shadows or pill shapes.
 */
export const Button = forwardRef(function Button(
  {
    children,
    variant = 'primary',
    size = 'md',
    loading = false,
    disabled,
    className,
    type = 'button',
    leftIcon: LeftIcon,
    rightIcon: RightIcon,
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={classNames(
        'inline-flex select-none items-center justify-center rounded-md font-medium',
        'transition-colors duration-150',
        'disabled:cursor-not-allowed disabled:opacity-55',
        VARIANTS[variant] ?? VARIANTS.primary,
        SIZES[size] ?? SIZES.md,
        className,
      )}
      {...props}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
      ) : (
        LeftIcon && <LeftIcon className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} aria-hidden />
      )}
      {children}
      {RightIcon && !loading && <RightIcon className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} aria-hidden />}
    </button>
  );
});
