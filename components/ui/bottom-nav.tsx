'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { doc, getDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useFirebase } from '@/components/providers/firebase-provider';

export function BottomNav() {
  const pathname = usePathname() || '';
  const { user } = useFirebase();
  const [userRole, setUserRole] = useState<'user' | 'admin' | 'master'>('user');
  const [pendingSwaps, setPendingSwaps] = useState(0);

  useEffect(() => {
    const checkRole = async () => {
      if (user) {
        try {
          const snap = await getDoc(doc(db, 'profiles', user.uid));
          if (snap.exists()) {
            const role = snap.data().role?.toLowerCase();
            if (role === 'master') {
              setUserRole('master');
            } else if (role === 'admin') {
              setUserRole('admin');
            }
          }
        } catch (error) {
          console.error("Erro ao verificar admin na bottom nav:", error);
        }
      }
    };
    checkRole();
  }, [user]);

  // Badge de permutas pendentes (onde o usuário é o substituto)
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'swaps'),
      where('substitute_id', '==', user.uid),
      where('status', '==', 'Aguardando Parceiro')
    );
    const unsub = onSnapshot(q, snap => {
      setPendingSwaps(snap.size);
    }, (err) => {
      console.error("Erro no listener da BottomNav (permutas pendentes):", err);
    });
    return () => unsub();
  }, [user]);

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white dark:bg-[#1A202C] border-t border-gray-100 dark:border-gray-800 pb-safe z-50 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
      <div className="grid grid-cols-5 h-16 items-center px-1">
        <Link href="/dashboard" className={`flex flex-col items-center justify-center h-full gap-1 group transition-colors ${pathname.startsWith('/dashboard') || pathname.startsWith('/scales') ? 'text-primary' : 'text-slate-400 dark:text-slate-500 hover:text-primary'}`}>
          <span className={`material-symbols-outlined text-[24px] group-hover:scale-110 transition-transform ${pathname.startsWith('/dashboard') || pathname.startsWith('/scales') ? 'filled' : ''}`}>format_list_bulleted</span>
          <span className="text-[10px] font-bold">Escalas</span>
        </Link>

        <Link href="/calendar" className={`flex flex-col items-center justify-center h-full gap-1 group transition-colors ${pathname.startsWith('/calendar') ? 'text-primary' : 'text-slate-400 dark:text-slate-500 hover:text-primary'}`}>
          <span className={`material-symbols-outlined text-[24px] group-hover:scale-110 transition-transform ${pathname.startsWith('/calendar') ? 'filled' : ''}`}>calendar_month</span>
          <span className="text-[10px] font-bold">Agenda</span>
        </Link>

        {userRole === 'master' ? (
          <Link href="/admin/master" className={`flex flex-col items-center justify-center h-full gap-1 group transition-colors ${pathname === '/admin/master' ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500 hover:text-amber-600 dark:hover:text-amber-400'}`}>
            <span className={`material-symbols-outlined text-[24px] group-hover:scale-110 transition-transform ${pathname === '/admin/master' ? 'filled drop-shadow-[0_2px_4px_rgba(217,119,6,0.4)]' : ''}`}>admin_panel_settings</span>
            <span className="text-[10px] font-bold">Master</span>
          </Link>
        ) : userRole === 'admin' ? (
          <Link href="/admin/swaps" className={`flex flex-col items-center justify-center h-full gap-1 group transition-colors ${pathname.startsWith('/admin') ? 'text-primary' : 'text-slate-400 dark:text-slate-500 hover:text-primary'}`}>
            <span className={`material-symbols-outlined text-[24px] group-hover:scale-110 transition-transform ${pathname.startsWith('/admin') ? 'filled' : ''}`}>shield_person</span>
            <span className="text-[10px] font-bold">Gestão</span>
          </Link>
        ) : (
          <Link href="/swaps" className={`relative flex flex-col items-center justify-center h-full gap-1 group transition-colors ${pathname.startsWith('/swaps') ? 'text-primary' : 'text-slate-400 dark:text-slate-500 hover:text-primary'}`}>
            <div className="relative">
              <span className={`material-symbols-outlined text-[24px] group-hover:scale-110 transition-transform ${pathname.startsWith('/swaps') ? 'filled' : ''}`}>swap_horiz</span>
              {pendingSwaps > 0 && (
                <span className="absolute -top-1 -right-1 size-4 bg-red-500 rounded-full flex items-center justify-center text-[9px] font-black text-white">
                  {pendingSwaps}
                </span>
              )}
            </div>
            <span className="text-[10px] font-bold">Permutas</span>
          </Link>
        )}

        <Link href="/notices" className={`flex flex-col items-center justify-center h-full gap-1 group transition-colors ${pathname.startsWith('/notices') ? 'text-primary' : 'text-slate-400 dark:text-slate-500 hover:text-primary'}`}>
          <span className={`material-symbols-outlined text-[24px] group-hover:scale-110 transition-transform ${pathname.startsWith('/notices') ? 'filled' : ''}`}>notifications</span>
          <span className="text-[10px] font-bold">Avisos</span>
        </Link>

        <Link href="/profile" className={`flex flex-col items-center justify-center h-full gap-1 group transition-colors ${pathname.startsWith('/profile') ? 'text-primary' : 'text-slate-400 dark:text-slate-500 hover:text-primary'}`}>
          <span className={`material-symbols-outlined text-[24px] group-hover:scale-110 transition-transform ${pathname.startsWith('/profile') ? 'filled' : ''}`}>person</span>
          <span className="text-[10px] font-bold">Perfil</span>
        </Link>
      </div>
    </nav>
  );
}
