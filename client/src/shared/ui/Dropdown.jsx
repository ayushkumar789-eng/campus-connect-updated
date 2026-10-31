import { useEffect, useRef, useState, useCallback } from 'react';
import { classNames } from '../utils/format.js';

/**
 * Small anchored menu. Closes on outside click, Escape, or scroll, and moves
 * focus to the first item so it is usable from the keyboard.
 */
export function Dropdown({ trigger, items, align = 'right' }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const menuRef = useRef(null);
  const triggerRef = useRef(null);

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      if (menuRef.current?.contains(event.target) || triggerRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close();
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, close]);

  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const menuHeight = menuRef.current?.offsetHeight ?? items.length * 36;

    setPosition({
      top: Math.min(rect.bottom + 6, window.innerHeight - menuHeight - 8),
      left: align === 'right' ? Math.max(8, rect.right - 192) : rect.left,
    });
    menuRef.current?.querySelector('button')?.focus();
  }, [open, align, items.length]);

  return (
    <>
      <span
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen(true);
          }
        }}
        role="button"
        tabIndex={0}
        className="inline-flex"
      >
        {trigger}
      </span>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          style={{ top: position.top, left: position.left }}
          className="fixed z-50 min-w-48 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-overlay"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect?.();
              }}
              className={classNames(
                'flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13.5px] transition-colors',
                'disabled:cursor-not-allowed disabled:opacity-50',
                item.danger ? 'text-danger hover:bg-danger/10' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
              )}
            >
              {item.icon && <item.icon className="h-4 w-4" aria-hidden />}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
