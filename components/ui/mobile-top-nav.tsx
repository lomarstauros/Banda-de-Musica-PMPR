'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { doc, getDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useFirebase } from '@/components/providers/firebase-provider';
import { LogoutButton } from '@/components/ui/logout-button';
import { canAccessReports } from '@/lib/permissions';

export function MobileTopNav() {
  const pathname = usePathname() || '';
  const { user } = useFirebase();

  const [userRole, setUserRole] = useState<'user' | 'admin' | 'master'>('user');
  const [userName, setUserName] = useState<string>('');
  const [userRank, setUserRank] = useState<string>('');
  const [userInstrument, setUserInstrument] = useState<string>('');
  const [userPhoto, setUserPhoto] = useState<string>('');
  const [hasReportsAccess, setHasReportsAccess] = useState(false);
  const [pendingSwaps, setPendingSwaps] = useState(0);
  const [unreadNotifs, setUnreadNotifs] = useState(0);

  // Carrega os dados do perfil do usuário
  useEffect(() => {
    if (!user) return;
    const fetchProfile = async () => {
      try {
        const snap = await getDoc(doc(db, 'profiles', user.uid));
        if (snap.exists()) {
          const data = snap.data();
          const role = data.role?.toLowerCase();
          if (role === 'master') {
            setUserRole('master');
          } else if (role === 'admin' || role === 'manager') {
            setUserRole('admin');
          }
          setUserName(data.war_name || data.name || '');
          setUserRank(data.rank || '');
          setUserInstrument(data.instrument || '');
          setUserPhoto(data.photo_url || '');
          setHasReportsAccess(canAccessReports(data, user.email));
        }
      } catch (err) {
        console.error('Erro ao carregar perfil para MobileTopNav:', err);
      }
    };
    fetchProfile();
  }, [user]);

  // Listener de permutas pendentes (badge)
  useEffect(() => {
    if (!user) return;

    let q;
    if (userRole === 'admin' || userRole === 'master') {
      q = query(
        collection(db, 'swaps'),
        where('status', '==', 'Aguardando Gestor')
      );
    } else {
      q = query(
        collection(db, 'swaps'),
        where('substitute_id', '==', user.uid),
        where('status', '==', 'Aguardando Parceiro')
      );
    }

    const unsub = onSnapshot(q, (snap) => {
      setPendingSwaps(snap.size);
    }, (err) => {
      console.error('Erro no listener de permutas pendentes (MobileTopNav):', err);
    });

    return () => unsub();
  }, [user, userRole]);

  // Listener de notificações não lidas
  useEffect(() => {
    if (!user) return;
    const qNotifs = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid),
      where('read', '==', false)
    );
    const unsub = onSnapshot(qNotifs, (snapshot) => {
      setUnreadNotifs(snapshot.size);
    }, (err) => {
      console.error('Erro no listener de notificações não lidas (MobileTopNav):', err);
    });

    return () => unsub();
  }, [user]);

  // Itens de navegação correspondentes à DesktopSidebar, respeitando permissões
  const navItems = [
    {
      label: 'Início',
      href: '/dashboard',
      icon: 'home',
      active: pathname === '/dashboard',
      color: 'text-blue-400',
    },
    {
      label: 'Escalas',
      href: '/admin/scales',
      icon: 'format_list_bulleted',
      active: pathname.startsWith('/admin/scales') || (pathname.startsWith('/scales') && !pathname.startsWith('/swaps')),
      color: 'text-purple-400',
    },
    ...(userRole === 'admin' || userRole === 'master'
      ? [
          {
            label: 'Efetivo',
            href: '/admin/musicians',
            icon: 'groups',
            active: pathname.startsWith('/admin/musicians'),
            color: 'text-emerald-400',
          },
          {
            label: 'Painel Gestor',
            href: '/admin/scales/new',
            icon: 'shield_person',
            active: pathname.startsWith('/admin/scales/new') || pathname.startsWith('/admin/scales/import') || pathname.startsWith('/admin/swaps') || pathname.startsWith('/admin/forecasts'),
            badge: pendingSwaps > 0 ? pendingSwaps : undefined,
            color: 'text-amber-400',
          },
          {
            label: 'Afastamentos',
            href: '/admin/unavailable',
            icon: 'event_busy',
            active: pathname.startsWith('/admin/unavailable'),
            color: 'text-red-400',
          },
        ]
      : [
          {
            label: 'Permutas',
            href: '/swaps',
            icon: 'swap_horiz',
            active: pathname.startsWith('/swaps'),
            badge: pendingSwaps > 0 ? pendingSwaps : undefined,
            color: 'text-amber-400',
          },
        ]),
    ...(hasReportsAccess
      ? [
          {
            label: 'Relatórios',
            href: '/admin/reports',
            icon: 'analytics',
            active: pathname.startsWith('/admin/reports'),
            color: 'text-cyan-400',
          },
        ]
      : []),
    {
      label: 'Avisos',
      href: '/notices',
      icon: 'campaign',
      active: pathname.startsWith('/notices') || pathname.startsWith('/admin/notices'),
      color: 'text-rose-400',
    },
    {
      label: 'Perfil',
      href: '/profile',
      icon: 'person',
      active: pathname.startsWith('/profile'),
      color: 'text-sky-400',
    },
    ...(userRole === 'master'
      ? [
          {
            label: 'Master',
            href: '/admin/master',
            icon: 'admin_panel_settings',
            active: pathname === '/admin/master',
            color: 'text-amber-400',
          },
        ]
      : []),
  ];

  return (
    <nav 
      aria-label="Navegação Superior Mobile" 
      className="lg:hidden w-full sticky top-0 z-50 bg-[#0e121a]/95 backdrop-blur-xl border-b border-white/10 shadow-xl flex flex-col"
    >
      {/* Barra de Identificação do Usuário */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 gap-3">
        <Link href="/dashboard" className="flex items-center gap-2.5 min-w-0 flex-1 group">
          <div className="relative shrink-0">
            {userPhoto ? (
              <div
                className="bg-center bg-no-repeat aspect-square bg-cover rounded-full size-9 border-2 border-blue-500/40"
                style={{ backgroundImage: `url(${userPhoto})` }}
              />
            ) : (
              <div className="bg-blue-600/20 text-blue-400 aspect-square rounded-full size-9 border-2 border-blue-500/40 flex items-center justify-center font-bold text-xs uppercase">
                {userName?.[0] || 'M'}
              </div>
            )}
            <div className="absolute bottom-0 right-0 size-2.5 bg-emerald-500 border-2 border-[#0e121a] rounded-full" />
          </div>

          <div className="flex flex-col min-w-0">
            <h2 className="text-white text-xs sm:text-sm font-bold leading-tight truncate group-hover:text-blue-400 transition-colors">
              {userRank ? `${userRank} ` : ''}{userName || 'Banda PMPR'}
            </h2>
            <span className="text-[10px] text-gray-400 font-medium truncate">
              {userRole === 'master' ? 'Master' : userRole === 'admin' ? 'Gestão' : userInstrument || 'Banda de Música'}
            </span>
          </div>
        </Link>

        {/* Notificações e Logout */}
        <div className="flex items-center justify-end gap-1 shrink-0">
          <Link
            href="/notifications"
            className="relative flex size-9 items-center justify-center rounded-full text-gray-300 hover:text-white hover:bg-white/5 transition-colors"
            title="Notificações"
          >
            <span className="material-symbols-outlined text-[20px]">notifications</span>
            {unreadNotifs > 0 && (
              <span className="absolute top-1 right-1 size-3.5 bg-red-500 rounded-full flex items-center justify-center text-[8px] font-bold text-white shadow-sm shadow-red-500/50">
                {unreadNotifs > 9 ? '9+' : unreadNotifs}
              </span>
            )}
          </Link>
          <LogoutButton />
        </div>
      </div>

      {/* Linha de Ícones Redondos de Navegação (Mesmos da barra lateral do PC) */}
      <div className="w-full overflow-x-auto no-scrollbar py-2.5 px-3 flex items-center gap-3 sm:gap-4 shrink-0 bg-[#121620]/60">
        {navItems.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className="flex flex-col items-center gap-1 group shrink-0 min-w-[54px] sm:min-w-[62px]"
          >
            <div
              className={`relative size-12 sm:size-13 rounded-full flex items-center justify-center transition-all ${
                item.active
                  ? 'bg-blue-600/30 border-2 border-blue-500 text-white shadow-lg shadow-blue-500/30 scale-105 ring-2 ring-blue-500/20'
                  : 'bg-[#161a24] border border-white/10 text-gray-400 group-hover:border-white/30 group-hover:text-white group-hover:scale-105'
              }`}
            >
              <span className={`material-symbols-outlined text-[22px] sm:text-[24px] ${item.active ? 'text-white' : item.color}`}>
                {item.icon}
              </span>

              {item.badge !== undefined && (
                <span className="absolute -top-1 -right-1 size-4 bg-red-500 rounded-full flex items-center justify-center text-[9px] font-black text-white shadow-md shadow-red-500/50">
                  {item.badge > 9 ? '9+' : item.badge}
                </span>
              )}
            </div>

            <span
              className={`text-[10px] sm:text-[11px] font-bold text-center truncate max-w-[60px] ${
                item.active ? 'text-blue-400 font-extrabold' : 'text-gray-400 group-hover:text-gray-200'
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

