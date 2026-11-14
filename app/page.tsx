'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useFirebase } from '@/components/providers/firebase-provider';

export default function WelcomePage() {
  const { user, loading } = useFirebase();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (user) {
      router.replace('/dashboard');
    } else {
      router.replace('/login');
    }
  }, [user, loading, router]);

  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="size-20 rounded-2xl bg-[#1c1f27] border border-[#3b4354] flex items-center justify-center shadow-xl p-3 animate-pulse">
          <img src="/brasao_banda.png" alt="Banda PMPR" className="h-full w-full object-contain" />
        </div>
      </div>
    </div>
  );
}
