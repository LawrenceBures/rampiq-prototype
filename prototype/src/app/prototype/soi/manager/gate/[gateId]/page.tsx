'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ManagerGateRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/prototype/soi/dashboard'); }, [router]);
  return <div className="rq-quiet" style={{ padding: '40px 16px' }}>Redirecting...</div>;
}
