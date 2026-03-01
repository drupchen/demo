"use client";

import { useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

function PlayerRedirect() {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const instance = searchParams.get('instance') || 'rpn_ngondro_1';
    const session = searchParams.get('session') || '';
    const time = searchParams.get('time') || '';
    const sylId = searchParams.get('sylId') || '';

    let url = `/reader?instance=${instance}`;
    if (session) url += `&session=${session}`;
    if (time) url += `&time=${time}`;
    if (sylId) url += `&sylId=${sylId}`;

    router.replace(url);
  }, [searchParams, router]);

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ color: '#D4AF37' }}>
      Redirecting to reader...
    </div>
  );
}

export default function PlayerPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center" style={{ color: '#D4AF37' }}>Redirecting...</div>}>
      <PlayerRedirect />
    </Suspense>
  );
}
