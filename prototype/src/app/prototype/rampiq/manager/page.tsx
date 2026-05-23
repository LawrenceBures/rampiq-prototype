'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Redirect old /manager route to /dashboard
export default function ManagerRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/prototype/rampiq/dashboard');
  }, [router]);
  return (
    <div className="rq-quiet" style={{ padding: '40px 16px' }}>
      Redirecting to dashboard...
    </div>
  );
}
