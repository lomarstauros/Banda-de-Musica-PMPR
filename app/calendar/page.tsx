'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function CalendarRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/admin/scales');
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background-light dark:bg-[#121620]">
      <div className="flex flex-col items-center gap-3">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary"></div>
        <p className="text-sm text-gray-500 font-medium">Redirecionando para Escalas...</p>
      </div>
    </div>
  );
}
