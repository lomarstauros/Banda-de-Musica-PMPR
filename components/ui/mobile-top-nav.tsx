'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useFirebase } from '@/components/providers/firebase-provider';
import { LogoutButton } from '@/components/ui/logout-button';
import { canAccessReports } from '@/lib/permissions';

export function MobileTopNav() {
  const pathname = usePathname() || '';
  const { user, profile, userRole, unreadNotificationsCount, pendingSwapsCount } = useFirebase();

  const userName = profile?.war_name || profile?.name || '';
  const userRank = profile?.rank || '';
  const userInstrument = profile?.instrument || '';
  const userPhoto = profile?.photo_url || '';
  const hasReportsAccess = canAccessReports(profile, user?.email);
  const pendingSwaps = pendingSwapsCount;
  const unreadNotifs = unreadNotificationsCount;

  // Itens de navegação correspondentes à DesktopSidebar, respeitando permissões
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
    <nav 
      aria-label="Navegação Superior Mobile" 
      className="lg:hidden w-full sticky top-0 z-50 bg-[#0b101b]/95 backdrop-blur-xl border-b border-white/[0.08] shadow-2xl flex flex-col"
    >
      {/* Barra de Identificação do Usuário */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06] gap-3">
        <Link href="/dashboard" className="flex items-center gap-2.5 min-w-0 flex-1 group">
          <div className="relative shrink-0">
            {userPhoto ? (
              <div
                className="bg-center bg-no-repeat aspect-square bg-cover rounded-full size-9 border-2 border-blue-500/40 shadow-sm"
                style={{ backgroundImage: `url(${userPhoto})` }}
              />
            ) : (
              <div className="bg-white/[0.05] text-blue-400 aspect-square rounded-full size-9 border border-blue-500/30 flex items-center justify-center font-bold text-xs uppercase shadow-inner">
                {userName?.[0] || 'M'}
              </div>
            )}
            <div className="absolute bottom-0 right-0 size-2.5 bg-emerald-500 border-2 border-[#0b101b] rounded-full" />
          </div>

          <div className="flex flex-col min-w-0">
            <h2 className="text-white text-xs sm:text-sm font-bold leading-tight truncate group-hover:text-blue-400 transition-colors">
              {userRank ? `${userRank} ` : ''}{userName || 'Banda PMPR'}
            </h2>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="bg-blue-500/15 text-blue-400 border border-blue-500/30 px-1.5 py-0.2 rounded text-[9px] font-extrabold uppercase tracking-wider">
                {userRole === 'master' ? 'MASTER' : userRole === 'admin' ? 'GESTOR' : 'MÚSICO'}
              </span>
              <span className="text-[10px] text-slate-400 font-medium truncate">
                {userInstrument || 'Banda de Música'}
              </span>
            </div>
          </div>
        </Link>

        {/* Notificações e Logout */}
        <div className="flex items-center justify-end gap-1.5 shrink-0">
          <Link
            href="/notifications"
            className="relative flex size-9 items-center justify-center rounded-xl bg-white/[0.03] border border-white/[0.06] text-slate-300 hover:text-white hover:bg-white/[0.08] transition-colors shadow-sm"
            title="Notificações"
          >
            <span className="material-symbols-outlined text-[19px]">notifications</span>
            {unreadNotifs > 0 && (
              <span className="absolute -top-1 -right-1 size-3.5 bg-amber-500 rounded-full flex items-center justify-center text-[8px] font-black text-slate-950 shadow-sm">
                {unreadNotifs > 9 ? '9+' : unreadNotifs}
              </span>
            )}
          </Link>
          <LogoutButton />
        </div>
      </div>

      {/* Linha de Micro-Cards de Navegação (Design Moderno Dark Clean) */}
      <div className="w-full overflow-x-auto no-scrollbar py-2.5 px-3 flex items-center gap-2.5 shrink-0 bg-[#070b12]/60">
        {navItems.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            onClick={(e) => {
              if (item.href === '/dashboard' && pathname === '/dashboard') {
                e.preventDefault();
                window.location.href = '/dashboard';
              }
            }}
            className="flex flex-col items-center gap-1.5 group shrink-0 min-w-[56px]"
          >
            {/* Micro-Card Emoldurando o Ícone no Mobile */}
            <div
              className={`relative size-11 rounded-2xl flex items-center justify-center transition-all ${
                item.active
                  ? 'bg-blue-600 text-white border border-blue-400/40 shadow-lg shadow-blue-900/50 scale-105'
                  : 'bg-white/[0.03] border border-white/[0.06] text-slate-400 group-hover:border-white/20 group-hover:text-white group-hover:scale-105 shadow-sm'
              }`}
            >
              <span className={`material-symbols-outlined text-[20px] ${item.active ? 'filled text-white' : ''}`}>
                {item.icon}
              </span>

              {item.badge !== undefined && (
                <span className="absolute -top-1 -right-1 size-4 bg-amber-500 rounded-full flex items-center justify-center text-[9px] font-black text-slate-950 shadow-md">
                  {item.badge > 9 ? '9+' : item.badge}
                </span>
              )}
            </div>

            <span
              className={`text-[10px] font-bold text-center truncate max-w-[58px] tracking-tight ${
                item.active ? 'text-blue-400 font-extrabold' : 'text-slate-400 group-hover:text-slate-200'
              }`}
            >
              {item.label}
            </span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
