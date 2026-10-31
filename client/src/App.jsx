import { Suspense, lazy, useEffect } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Toaster } from './shared/ui/Toast.jsx';
import { ReportModal } from './shared/ui/ReportModal.jsx';
import { ProtectedRoute, PublicOnlyRoute } from './app/layout/Guards.jsx';
import { AppShell } from './app/layout/AppShell.jsx';
import { ComposerSheet } from './features/posts/components/ComposerSheet.jsx';
import { useAuthStore } from './features/auth/hooks/useAuthStore.js';
import { FullPageLoader } from './shared/ui/FullPageLoader.jsx';
import { RouteFallback } from './shared/ui/RouteFallback.jsx';

// Route-level code splitting: the landing and auth screens must not block on
// the feed, profile and admin bundles.
const Landing = lazy(() => import('./features/auth/pages/Landing.jsx'));
const Login = lazy(() => import('./features/auth/pages/Login.jsx'));
const Register = lazy(() => import('./features/auth/pages/Register.jsx'));
const ProfileSetup = lazy(() => import('./features/auth/pages/ProfileSetup.jsx'));
const VerifyEmail = lazy(() => import('./features/auth/pages/VerifyEmail.jsx'));
const ForgotPassword = lazy(() => import('./features/auth/pages/ForgotPassword.jsx'));
const ResetPassword = lazy(() => import('./features/auth/pages/ResetPassword.jsx'));
const Students = lazy(() => import('./features/users/pages/directory/Students.jsx'));
const Home = lazy(() => import('./features/posts/pages/Home.jsx'));
const Explore = lazy(() => import('./features/search/pages/Explore.jsx'));
const Saved = lazy(() => import('./features/saved/pages/Saved.jsx'));
const Profile = lazy(() => import('./features/users/pages/Profile.jsx'));
const UserProfile = lazy(() => import('./features/users/pages/profile/UserProfile.jsx'));
const PostDetail = lazy(() => import('./features/posts/pages/PostDetail.jsx'));
const Settings = lazy(() => import('./features/users/pages/Settings.jsx'));
const Notifications = lazy(() => import('./features/notifications/pages/Notifications.jsx'));
const NotFound = lazy(() => import('./app/pages/NotFound.jsx'));
const Unauthorized = lazy(() => import('./app/pages/Unauthorized.jsx'));
const PhaseStub = lazy(() => import('./app/pages/PhaseStub.jsx'));

const Notes = lazy(() => import('./features/notes/pages/Notes.jsx'));
const NoteDetail = lazy(() => import('./features/notes/pages/NoteDetail.jsx'));

const Groups = lazy(() => import('./features/groups/pages/Groups.jsx'));
const GroupDetail = lazy(() => import('./features/groups/pages/GroupDetail.jsx'));

const Discussions = lazy(() => import('./features/discussions/pages/Discussions.jsx'));
const DiscussionDetail = lazy(() => import('./features/discussions/pages/DiscussionDetail.jsx'));

const Messages = lazy(() => import('./features/messages/pages/Messages.jsx'));

const Events = lazy(() => import('./features/events/pages/Events.jsx'));
const EventDetail = lazy(() => import('./features/events/pages/EventDetail.jsx'));

export default function App() {
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const status = useAuthStore((s) => s.status);

  // Re-establish the session from the refresh cookie before any protected
  // route decides whether to render.
  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  if (status === 'loading') return <FullPageLoader />;

  return (
    <>
      {/* Every route is a lazy chunk, so the tree always suspends once on
          first paint. Without this boundary React throws instead of waiting. */}
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          {/* Public */}
          <Route element={<PublicOnlyRoute />}>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            {/* Opening a reset link while still signed in must work, so this
                one is not behind PublicOnlyRoute. */}
            <Route path="/reset-password" element={<ResetPassword />} />
          </Route>

          {/* Authenticated */}
          <Route element={<ProtectedRoute />}>
            <Route path="/setup" element={<ProfileSetup />} />
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route element={<AppShell />}>
              <Route path="/home" element={<Home />} />
              <Route path="/explore" element={<Explore />} />
              <Route path="/saved" element={<Saved />} />
              <Route path="/students" element={<Students />} />
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/u/:username" element={<UserProfile />} />
              <Route path="/posts/:id" element={<PostDetail />} />
              <Route path="/notes" element={<Notes />} />
              <Route path="/notes/:id" element={<NoteDetail />} />
              <Route path="/groups" element={<Groups />} />
              <Route path="/groups/:id" element={<GroupDetail />} />
              <Route path="/discussions" element={<Discussions />} />
              <Route path="/discussions/:id" element={<DiscussionDetail />} />
              <Route path="/events" element={<Events />} />
              <Route path="/events/:id" element={<EventDetail />} />
            </Route>

            {/* Phase placeholders — real pages replace these as modules land. */}
            <Route path="/messages" element={<Messages />} />
            <Route path="/admin" element={<PhaseStub module="Admin Dashboard" phase={6} adminOnly />} />
          </Route>

          <Route path="/unauthorized" element={<Unauthorized />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>

      {/* The composer is reachable from the feed and the mobile bottom bar. */}
      <ComposerSheet />
      <ReportModal />
      <Toaster />
    </>
  );
}
