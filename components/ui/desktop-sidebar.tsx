'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useFirebase } from '@/components/providers/firebase-provider';
import { LogoutButton } from '@/components/ui/logout-button';
import { canAccessReports } from '@/lib/permissions';

export function DesktopSidebar() {
  const pathname = usePathname() || '';
  const { user, profile, userRole, pendingSwapsCount } = useFirebase();

  const userName = profile?.war_name || profile?.name || '';
  const userRank = profile?.rank || '';
  const hasReportsAccess = canAccessReports(profile, user?.email);
  const pendingSwaps = pendingSwapsCount;

  const navItems = [
    {
      label: 'Início',
      href: '/dashboard',
      icon: 'home',
      active: pathname === '/dashboard',
    },
    {
      label: 'Escalas',
      href: '/admin/scales',
      icon: 'format_list_bulleted',
      active: (pathname === '/admin/scales' || pathname.startsWith('/scales') || pathname.startsWith('/admin/scales/')) && !pathname.startsWith('/admin/scales/new') && !pathname.startsWith('/admin/scales/import') && !pathname.startsWith('/swaps'),
    },
    ...(userRole === 'admin' || userRole === 'master'
      ? [
          {
            label: 'Efetivo',
            href: '/admin/musicians',
            icon: 'groups',
            active: pathname.startsWith('/admin/musicians'),
          },
          {
            label: 'Painel Gestor',
            href: '/admin/scales/new',
            icon: 'shield_person',
            active: pathname.startsWith('/admin/scales/new') || pathname.startsWith('/admin/scales/import') || pathname.startsWith('/admin/swaps') || pathname.startsWith('/admin/forecasts'),
            badge: pendingSwaps > 0 ? pendingSwaps : undefined,
          },
          {
            label: 'Afastamentos',
            href: '/admin/unavailable',
            icon: 'event_busy',
            active: pathname.startsWith('/admin/unavailable'),
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
    ...(hasReportsAccess
      ? [
          {
            label: 'Relatórios',
            href: '/admin/reports',
            icon: 'analytics',
            active: pathname.startsWith('/admin/reports'),
          },
        ]
      : []),
    {
      label: 'Avisos',
      href: '/notices',
      icon: 'notifications',
      active: pathname.startsWith('/notices') || pathname.startsWith('/admin/notices'),
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
      {/* Container com Glassmorphism Dark Clean e Sombreamento Nobre */}
      <div className="bg-[#0b101b]/95 dark:bg-[#0b101b]/95 backdrop-blur-2xl border border-white/[0.08] dark:border-white/[0.08] rounded-3xl p-4 shadow-2xl shadow-black/80 flex flex-col h-full gap-4">
        
        {/* Brand / Logo com micro-card */}
        <Link href="/dashboard" className="flex items-center gap-3 px-2 py-1 group">
          <div className="size-10 rounded-xl bg-white/[0.04] border border-white/10 flex items-center justify-center p-1.5 shadow-md shadow-black/30 group-hover:scale-105 group-hover:border-blue-500/30 transition-all overflow-hidden shrink-0">
            <img 
              src="/brasao_banda.png" 
              alt="Brasão Banda de Música PMPR" 
              className="w-full h-full object-contain drop-shadow" 
            />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-black text-white tracking-tight leading-tight group-hover:text-blue-400 transition-colors">
              Banda PMPR
            </span>
            <span className="text-[11px] font-medium text-slate-400 truncate">
              {userRole === 'master' ? 'Painel Master' : userRole === 'admin' ? 'Painel Gestor' : 'Portal do Efetivo'}
            </span>
          </div>
        </Link>

        <div className="h-px bg-white/[0.06] mx-1" />

        {/* Navigation Links com Micro-Cards para Ícones (Opção 2 - Military Dark Clean) */}
        <nav className="flex flex-col gap-1 flex-1 overflow-y-auto no-scrollbar pr-0.5">
          {navItems.map((item) => {
            const isActive = item.active;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={(e) => {
                  if (item.href === '/dashboard' && pathname === '/dashboard') {
                    e.preventDefault();
                    window.location.href = '/dashboard';
                  }
                }}
                className={`relative flex items-center gap-3 px-3 py-2.5 rounded-2xl text-[13px] transition-all duration-200 group ${
                  isActive
                    ? 'bg-blue-600 text-white font-bold shadow-lg shadow-blue-900/40 border border-blue-400/30'
                    : 'text-slate-400 font-semibold hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                {/* Micro-Card Emoldurando o Ícone */}
                <div
                  className={`size-9 rounded-xl flex items-center justify-center shrink-0 transition-all duration-200 ${
                    isActive
                      ? 'bg-white/20 text-white border border-white/20 shadow-inner'
                      : 'bg-white/[0.03] border border-white/[0.06] text-slate-400 group-hover:text-white group-hover:bg-white/[0.08] group-hover:border-white/10 shadow-sm'
                  }`}
                >
                  <span className={`material-symbols-outlined text-[19px] ${isActive ? 'filled' : ''}`}>
                    {item.icon}
                  </span>
                </div>

                <span className="flex-1 truncate tracking-tight">{item.label}</span>

                {item.badge !== undefined && (
                  <span className="bg-amber-500 text-slate-950 text-[10px] font-black px-2 py-0.5 rounded-full shadow-sm animate-pulse">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* User identification & Status Footer */}
        <div className="pt-2 border-t border-white/[0.06] flex flex-col gap-2.5">
          {user && (
            <div className="flex items-center justify-between px-2.5 py-2 bg-white/[0.03] border border-white/[0.06] rounded-2xl shadow-inner">
              <div className="flex flex-col min-w-0 pr-2">
                <span className="text-xs font-bold text-white truncate">
                  {userRank ? `${userRank} ` : ''}{userName || 'Militar'}
                </span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="bg-blue-500/15 text-blue-400 border border-blue-500/30 px-1.5 py-0.2 rounded text-[9px] font-extrabold uppercase tracking-wider">
                    {userRole === 'master' ? 'MASTER' : userRole === 'admin' ? 'GESTOR' : 'MÚSICO'}
                  </span>
                </div>
              </div>
              <LogoutButton />
            </div>
          )}

          {/* Footer Info Militar */}
          <div className="flex items-center justify-between px-2 pt-0.5">
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500">PMPR • 1854</span>
              <span className="text-[10px] text-slate-400 font-medium">Banda de Música</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="relative flex size-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full size-2 bg-emerald-500"></span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
