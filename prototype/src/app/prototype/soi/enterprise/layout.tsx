import { ExecutiveTopbar } from '@/components/soi/ExecutiveTopbar';

export default function EnterpriseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="rq-console" data-surface="executive">
      <ExecutiveTopbar />
      <main className="rq-exec-main">{children}</main>
    </div>
  );
}
