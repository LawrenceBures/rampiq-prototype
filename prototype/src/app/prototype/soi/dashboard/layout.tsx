import { DesktopShell } from '@/components/soi/DesktopShell';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DesktopShell>
      <div className="rq-console">{children}</div>
    </DesktopShell>
  );
}
