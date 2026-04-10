'use client';

import { useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useState } from 'react';

export function LogoutButton() {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await signOut(auth);
      router.push('/login');
    } catch (error) {
      console.error('Error signing out: ', error);
      setIsLoggingOut(false);
    }
  };

  return (
    <button 
      onClick={handleLogout}
      disabled={isLoggingOut}
      className={`relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-white dark:bg-surface-dark text-slate-600 dark:text-slate-300 shadow-sm ring-1 ring-black/5 dark:ring-white/10 active:scale-95 transition-all ${isLoggingOut ? 'opacity-50' : 'hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 border border-transparent hover:border-red-100 dark:hover:border-red-900/50'}`}
      aria-label="Sair da conta"
    >
      {isLoggingOut ? (
        <span className="material-symbols-outlined text-[20px] animate-spin">progress_activity</span>
      ) : (
        <span className="material-symbols-outlined text-[24px]">logout</span>
      )}
    </button>
  );
}
