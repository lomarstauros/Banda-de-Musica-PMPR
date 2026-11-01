'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { doc, getDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useFirebase } from '@/components/providers/firebase-provider';

export function DesktopSidebar() {
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
          console.error("Erro ao verificar papel na sidebar:", error);
        }
      }
    };
    checkRole();
  }, [user]);

  // Badge de permutas pendentes
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
      console.error("Erro no listener da DesktopSidebar (permutas pendentes):", err);
    });
    return () => unsub();
  }, [user]);

  const navItems = [
    {
      label: 'Início',
      href: '/dashboard',
      icon: 'home',
      active: pathname === '/dashboard',
    },
    {
      label: 'Programação',
      href: '/calendar',
      icon: 'calendar_month',
      active: pathname.startsWith('/calendar'),
    },
    ...(userRole === 'admin' || userRole === 'master'
      ? [
          {
            label: 'Escalas',
            href: '/admin/scales',
            icon: 'format_list_bulleted',
            active: pathname.startsWith('/admin/scales'),
          },
          {
            label: 'Músicos',
            href: '/admin/musicians',
            icon: 'groups',
            active: pathname.startsWith('/admin/musicians'),
          },
          {
            label: 'Permutas',
            href: '/admin/swaps',
            icon: 'swap_horiz',
            active: pathname.startsWith('/admin/swaps'),
            badge: pendingSwaps > 0 ? pendingSwaps : undefined,
          },
        ]
      : [
          {
            label: 'Permutas',
            href: '/swaps',
            icon: 'swap_horiz',
            active: pathname.startsWith('/swaps'),
            badge: pendingSwaps > 0 ? pendingSwaps : undefined,
          },
        ]),
    {
      label: 'Avisos',
      href: '/notices',
      icon: 'notifications',
      active: pathname.startsWith('/notices'),
    },
    {
      label: 'Perfil',
      href: '/profile',
      icon: 'person',
      active: pathname.startsWith('/profile'),
    },
    ...(userRole === 'master'
      ? [
          {
            label: 'Master',
            href: '/admin/master',
            icon: 'admin_panel_settings',
            active: pathname === '/admin/master',
          },
        ]
      : []),
  ];

  return (
    <aside className="hidden lg:flex flex-col w-64 shrink-0 self-start sticky top-6 max-h-[calc(100vh-3rem)]">
      <div className="bg-[#121620]/90 dark:bg-[#121620]/90 backdrop-blur-2xl border border-white/10 dark:border-white/10 rounded-3xl p-5 shadow-2xl flex flex-col h-full gap-6">
        {/* Brand / Logo */}
        <Link href="/dashboard" className="flex items-center gap-3 px-2 group">
          <div className="size-11 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center p-2 shadow-lg shadow-blue-500/25 group-hover:scale-105 transition-transform">
            <span className="material-symbols-outlined text-white text-[24px]">music_note</span>
          </div>
          <div className="flex flex-col">
            <span className="text-base font-extrabold text-white tracking-tight leading-tight">Banda PMPR</span>
            <span className="text-[11px] font-medium text-gray-400">Gestão de Escalas</span>
          </div>
        </Link>

        {/* Navigation Links */}
        <nav className="flex flex-col gap-1.5 flex-1 overflow-y-auto no-scrollbar">
          {navItems.map((item) => {
            const isActive = item.active;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative flex items-center gap-3.5 px-4 py-3 rounded-2xl text-sm font-semibold transition-all duration-200 group ${
                  isActive
                    ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500/30 font-bold'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <span
                  className={`material-symbols-outlined text-[22px] transition-transform group-hover:scale-110 ${
                    isActive ? 'filled text-white' : 'text-gray-400 group-hover:text-white'
                  }`}
                >
                  {item.icon}
                </span>
                <span className="flex-1">{item.label}</span>
                {item.badge !== undefined && (
                  <span className="bg-red-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-sm">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Footer Info */}
        <div className="pt-4 border-t border-white/5 flex items-center justify-between px-2">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-bold tracking-wider text-gray-500">PMPR • 1854</span>
            <span className="text-[11px] text-gray-400 font-medium">Banda de Música</span>
          </div>
          <span className="size-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" title="Online" />
        </div>
      </div>
    </aside>
  );
}
