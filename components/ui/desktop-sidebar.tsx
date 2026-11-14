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
      <div className="bg-[#121620]/95 dark:bg-[#121620]/95 backdrop-blur-2xl border border-white/10 dark:border-white/10 rounded-3xl p-5 shadow-2xl flex flex-col h-full gap-5">
        {/* Brand / Logo */}
        <Link href="/dashboard" className="flex items-center gap-3 px-2 group">
          <div className="size-11 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center p-1.5 shadow-lg shadow-black/20 group-hover:scale-105 transition-transform overflow-hidden shrink-0">
            <img 
              src="/brasao_banda.png" 
              alt="Brasão Banda de Música PMPR" 
              className="w-full h-full object-contain drop-shadow" 
            />
          </div>
          <div className="flex flex-col">
            <span className="text-base font-extrabold text-white tracking-tight leading-tight">Banda PMPR</span>
            <span className="text-[11px] font-medium text-gray-400">
              {userRole === 'master' ? 'Painel Master' : userRole === 'admin' ? 'Painel Gestor' : 'Portal do Efetivo'}
            </span>
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
                onClick={(e) => {
                  if (item.href === '/dashboard' && pathname === '/dashboard') {
                    e.preventDefault();
                    window.location.href = '/dashboard';
                  }
                }}
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
                <span className="flex-1 truncate">{item.label}</span>
                {item.badge !== undefined && (
                  <span className="bg-red-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-sm animate-pulse">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* User identification & Logout */}
        <div className="pt-3 border-t border-white/5 flex flex-col gap-3">
          {user && (
            <div className="flex items-center justify-between px-2 bg-white/5 rounded-2xl p-2.5">
              <div className="flex flex-col min-w-0 pr-2">
                <span className="text-xs font-bold text-white truncate">
                  {userRank ? `${userRank} ` : ''}{userName || 'Usuário'}
                </span>
                <span className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider">
                  {userRole === 'master' ? 'Master' : userRole === 'admin' ? 'Gestor' : 'Músico'}
                </span>
              </div>
              <LogoutButton />
            </div>
          )}

          {/* Footer Info */}
          <div className="flex items-center justify-between px-2">
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-bold tracking-wider text-gray-500">PMPR • 1854</span>
              <span className="text-[11px] text-gray-400 font-medium">Banda de Música</span>
            </div>
            <span className="size-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" title="Online" />
          </div>
        </div>
      </div>
    </aside>
  );
}

