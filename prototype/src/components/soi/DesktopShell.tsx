import { DesktopTopbar } from './DesktopTopbar';
import { DesktopSidebar } from './DesktopSidebar';

/**
 * Desktop operations shell.
 * Provides persistent sidebar navigation + topbar for all
 * desktop command surfaces (dashboard, operations, workforce).
 *
 * NOT an operational primitive — this is layout infrastructure.
 */
export function DesktopShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rq-desktop" data-surface="desktop">
      <DesktopTopbar />
      <div className="rq-desktop-body">
        <DesktopSidebar />
        <main className="rq-desktop-main">{children}</main>
      </div>
    </div>
  );
}
