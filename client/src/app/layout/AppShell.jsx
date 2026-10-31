import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar, MobileNav } from './Sidebar.jsx';
import { Topbar } from './Topbar.jsx';
import { RightRail } from './RightRail.jsx';
import { useChatStore } from '../../features/messages/store/chatStore.js';

/**
 * Three-column desktop shell that collapses to a single scrolling column with
 * a top bar and a bottom tab bar on mobile.
 */
export function AppShell() {
  const connect = useChatStore((s) => s.connect);
  const disconnect = useChatStore((s) => s.disconnect);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return (
    <div className="flex min-h-screen bg-canvas">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />

        <div className="flex min-w-0 flex-1">
          <main className="min-w-0 flex-1 px-4 pt-4 pb-20 sm:px-6 lg:pb-8">
            <div className="mx-auto w-full max-w-2xl">
              <Outlet />
            </div>
          </main>

          <RightRail />
        </div>
      </div>

      <MobileNav />
    </div>
  );
}
