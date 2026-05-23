'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function EquipmentRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/prototype/rampiq/mobile'); }, [router]);
  return <div className="rq-quiet" style={{ padding: '40px 16px' }}>Redirecting...</div>;
}
