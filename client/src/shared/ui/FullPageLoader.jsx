import { GraduationCap } from 'lucide-react';

export function FullPageLoader({ label = 'Loading CampusConnect' }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-canvas">
      <span className="flex h-11 w-11 animate-pulse items-center justify-center rounded-lg bg-accent text-accent-ink">
        <GraduationCap className="h-6 w-6" aria-hidden />
      </span>
      <p className="text-sm text-ink-3">{label}…</p>
    </div>
  );
}
