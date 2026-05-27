import { DesktopShell } from '@/components/soi/DesktopShell';

export default function WorkforceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DesktopShell>{children}</DesktopShell>;
}
