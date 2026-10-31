import { Link } from 'react-router-dom';
import { GraduationCap, Moon, Sun } from 'lucide-react';
import { useAuthStore } from '../hooks/useAuthStore.js';

/**
 * Shared frame for the login, register and setup screens so they stay visually
 * identical apart from their form.
 */
export function AuthLayout({ title, subtitle, children, footer }) {
  const theme = useAuthStore((s) => s.theme);
  const toggleTheme = useAuthStore((s) => s.toggleTheme);

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="flex h-14 items-center justify-between px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-accent-ink">
            <GraduationCap className="h-4 w-4" aria-hidden />
          </span>
          <span className="text-[15px] font-bold tracking-[-0.02em] text-ink">CampusConnect</span>
        </Link>

        <button
          type="button"
          onClick={toggleTheme}
          aria-label="Toggle dark mode"
          className="rounded-md p-2 text-ink-2 transition-colors hover:bg-surface-2"
        >
          {theme === 'dark' ? <Sun className="h-5 w-5" aria-hidden /> : <Moon className="h-5 w-5" aria-hidden />}
        </button>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <div className="mb-7 text-center">
            <h1 className="text-2xl font-bold tracking-[-0.02em] text-ink">{title}</h1>
            {subtitle && <p className="mt-1.5 text-[14.5px] text-ink-2">{subtitle}</p>}
          </div>

          {children}

          {footer && <div className="mt-6 text-center text-[13.5px] text-ink-2">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
