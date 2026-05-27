import { DesktopShell } from '@/components/soi/DesktopShell';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DesktopShell>{children}</DesktopShell>;
}
