import { DesktopShell } from '@/components/soi/DesktopShell';

export default function OperationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DesktopShell>{children}</DesktopShell>;
}
