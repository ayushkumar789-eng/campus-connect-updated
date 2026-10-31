import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../features/auth/hooks/useAuthStore.js';
import { FullPageLoader } from '../../shared/ui/FullPageLoader.jsx';

/** Gate for signed-in routes. Sends unauthenticated visitors to /login. */
export function ProtectedRoute() {
  const status = useAuthStore((s) => s.status);
  const location = useLocation();

  if (status === 'loading') return <FullPageLoader />;
  if (status !== 'authenticated') {
    // Remember where they were headed so login can return them there.
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  return <Outlet />;
}

/** Inverse of ProtectedRoute — keeps signed-in users off the auth screens. */
export function PublicOnlyRoute() {
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);

  if (status === 'loading') return <FullPageLoader />;
  if (status === 'authenticated') {
    return <Navigate to={user?.profileCompleted ? '/home' : '/setup'} replace />;
  }
  return <Outlet />;
}

/** Role gate for the admin area. */
export function AdminRoute() {
  const user = useAuthStore((s) => s.user);
  if (user?.role !== 'admin') return <Navigate to="/unauthorized" replace />;
  return <Outlet />;
}
