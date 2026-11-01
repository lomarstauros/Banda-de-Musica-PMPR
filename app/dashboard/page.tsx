'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import { useEffect, useState, useMemo } from 'react';
import { useFirebase } from '@/components/providers/firebase-provider';
import { doc, getDoc, collection, query, orderBy, limit, getDocs, onSnapshot, where, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import { BottomNav } from '@/components/ui/bottom-nav';
import { LogoutButton } from '@/components/ui/logout-button';
import { generateScalePDF } from '@/lib/pdf-generator';
import { fmtDate } from '@/lib/format-date';
import { getCurrentMilitaryStatus } from '@/lib/military-status';
import { getFormatColors } from '@/lib/scale-formats';

export default function DashboardPage() {
  const { user, loading: authLoading } = useFirebase();
  const router = useRouter();
  const [profile, setProfile] = useState<{ 
    war_name?: string; 
    rank?: string; 
    name?: string;
    photo_url?: string; 
    instrument?: string;
    militaryStatus?: string;
    statusStartDate?: string;
    statusEndDate?: string;
    role?: string;
  } | null>(null);
  const [nextScales, setNextScales] = useState<any[]>([]);
  const [historyScales, setHistoryScales] = useState<any[]>([]);
  const [returningTomorrow, setReturningTomorrow] = useState<any[]>([]);
  const [loadingScales, setLoadingScales] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [viewedScales, setViewedScales] = useState<Record<string, { confirmed: boolean; notifId: string | null }>>({});
  const [verifying, setVerifying] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  // Estados da interface desktop estilo Átrio
  const [activeScaleIndex, setActiveScaleIndex] = useState(0);
  const [listFilter, setListFilter] = useState<'todas' | 'pendentes'>('todas');

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }

    const fetchDashboardData = async () => {
      try {
        // 1. Fetch Profile
        const docRef = doc(db, 'profiles', user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const profileData = docSnap.data();
          if (profileData.status === 'pending' && profileData.role?.toLowerCase() !== 'master') {
            setIsPending(true);
            setLoadingScales(false);
            return;
          }
          setProfile(profileData);

          // 2. Fetch Scales
          const userInstrument = (profileData.instrument || '').trim().toLowerCase();
          const FULL_VISIBILITY_ROLES = ['administrativo', 'regente', 'comando'];
          const hasFullVisibility = FULL_VISIBILITY_ROLES.includes(userInstrument);

          const scalesRef = collection(db, 'scales');
          const q = query(scalesRef, orderBy('date', 'desc'), limit(50));
          const querySnapshot = await getDocs(q);

          const allScales = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

          const visibleScales = allScales.filter((scale: any) => {
            if (hasFullVisibility) return true;
            return (scale.musicians || []).some((m: any) => m.id === user.uid);
          });

          const today = new Date();
          const tzOffset = today.getTimezoneOffset() * 60000;
          const todayStr = (new Date(Date.now() - tzOffset)).toISOString().split('T')[0];

          const futureScales = visibleScales.filter(s => s.date >= todayStr).sort((a, b) => a.date.localeCompare(b.date));
          const pastScales = visibleScales.filter(s => s.date < todayStr).sort((a, b) => b.date.localeCompare(a.date));

          setNextScales(futureScales);
          setHistoryScales(pastScales);

          // 3. Admin Notification for Leaves Ending Tomorrow
          if (profileData.role === 'admin' || profileData.role === 'master') {
            try {
              const qProfiles = query(collection(db, 'profiles'), where('militaryStatus', '!=', 'Ativo'));
              const profilesSnap = await getDocs(qProfiles);
              
              const tzOff = today.getTimezoneOffset() * 60000;
              const localTodayStr = (new Date(today.getTime() - tzOff)).toISOString().split('T')[0];

              const returning = profilesSnap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter((p: any) => p.statusEndDate === localTodayStr);
                
              setReturningTomorrow(returning);
            } catch (err) {
              console.error('Erro ao buscar retornos previstos:', err);
            }
          }
        }
      } catch (e) {
        console.error("Erro ao carregar dados do dashboard:", e);
      } finally {
        setLoadingScales(false);
      }
    };
    fetchDashboardData();

    // 4. Notificações não lidas
    const qNotifs = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid),
      where('read', '==', false)
    );
    const unsub = onSnapshot(qNotifs, (snapshot) => {
      setUnreadCount(snapshot.size);
    }, (err) => {
      console.error("Erro no listener de notificações não lidas:", err);
    });

    return () => unsub();
  }, [user, authLoading, router]);

  // Carregar status de visualização/confirmação das escalas
  useEffect(() => {
    if (!user || authLoading || isPending) return;

    const qAllNotifs = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid)
    );
    const unsubAll = onSnapshot(qAllNotifs, (snapshot) => {
      const map: Record<string, { confirmed: boolean; notifId: string | null }> = {};
      snapshot.docs.forEach((d) => {
        const data = d.data();
        if (data.scaleId) {
          map[data.scaleId] = {
            confirmed: !!data.read,
            notifId: d.id,
          };
        }
      });
      setViewedScales(map);
    }, (err) => {
      console.error("Erro no listener de confirmações:", err);
    });

    return () => unsubAll();
  }, [user, authLoading, isPending]);

  const displayName = profile ? `${profile.rank || ''} ${profile.war_name || profile.name || ''}`.trim() || 'Sem nome' : 'Carregando...';
  const firstName = profile?.war_name || profile?.name?.split(' ')[0] || 'Militar';
  const displayInstrument = profile?.instrument ? `Banda PMPR - ${profile.instrument}` : 'Banda PMPR';
  const displayPhoto = profile?.photo_url || null;
  const roleBadge = profile?.role === 'master' ? 'MASTER' : profile?.role === 'admin' ? 'ADM' : 'MÚSICO';

  // Data atual por extenso em caixa alta
  const todayFormatted = useMemo(() => {
    try {
      return new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
        .format(new Date())
        .toUpperCase();
    } catch {
      return '';
    }
  }, []);

  const handleVerify = async (e: React.MouseEvent, scale: any) => {
    e.preventDefault();
    if (!user || verifying === scale.id) return;
    const alreadyConfirmed = viewedScales[scale.id]?.confirmed;
    if (alreadyConfirmed) return;

    setVerifying(scale.id);
    try {
      const batch = writeBatch(db);
      const existing = viewedScales[scale.id];

      if (existing?.notifId) {
        batch.update(doc(db, 'notifications', existing.notifId), {
          read: true,
          confirmedAt: serverTimestamp(),
        });
      } else {
        const notifRef = doc(collection(db, 'notifications'));
        const profileData = profile as any;
        batch.set(notifRef, {
          userId: user.uid,
          scaleId: scale.id,
          scaleTitle: scale.title,
          scaleDate: scale.date,
          userName: profileData?.war_name || profileData?.name || 'Músico',
          userRank: profileData?.rank || '',
          type: 'scale_view',
          read: true,
          confirmedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        });
      }
      await batch.commit();
      setViewedScales(prev => ({
        ...prev,
        [scale.id]: { confirmed: true, notifId: prev[scale.id]?.notifId || null }
      }));
    } catch (err) {
      console.error('Erro ao confirmar visualização:', err);
    } finally {
      setVerifying(null);
    }
  };

  // Escala em destaque selecionada
  const currentFeaturedScale = nextScales[activeScaleIndex] || nextScales[0] || null;

  // Formatação de data em badge (DOM 01/11)
  const formatBadgeDate = (dateStr: string) => {
    try {
      const d = new Date(`${dateStr}T12:00:00`);
      const dayOfWeek = d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').toUpperCase();
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      return { dayOfWeek, dateFormatted: `${day}/${month}` };
    } catch {
      return { dayOfWeek: '---', dateFormatted: '--/--' };
    }
  };

  // Filtragem da coluna lateral direita
  const filteredNextScales = useMemo(() => {
    if (listFilter === 'pendentes') {
      return nextScales.filter(s => !viewedScales[s.id]?.confirmed && s.classification !== 'folga');
    }
    return nextScales;
  }, [nextScales, listFilter, viewedScales]);

  // Retorna se uma data é hoje ou amanhã
  const getDateLabel = (dateStr?: string) => {
    if (!dateStr) return '';
    const today = new Date();
    const tzOff = today.getTimezoneOffset() * 60000;
    const todayStr = (new Date(today.getTime() - tzOff)).toISOString().split('T')[0];
    const tomorrow = new Date(today.getTime() + 86400000 - tzOff);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    if (dateStr === todayStr) return 'HOJE';
    if (dateStr === tomorrowStr) return 'AMANHÃ';
    return fmtDate(dateStr);
  };

  if (isPending) {
    return (
      <div className="bg-background-light dark:bg-background-dark min-h-screen flex items-center justify-center p-6 text-center font-sans">
        <div className="bg-white dark:bg-[#1A202C] p-8 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 max-w-sm flex flex-col items-center">
          <div className="size-20 rounded-full border-4 border-amber-100 dark:border-amber-900/30 bg-amber-50 dark:bg-amber-900/10 flex items-center justify-center text-amber-500 dark:text-amber-400 mb-4 ring-8 ring-amber-50 dark:ring-amber-900/5">
            <span className="material-symbols-outlined text-[40px] animate-pulse">hourglass_empty</span>
          </div>
          <h2 className="text-[#111318] dark:text-white text-xl font-bold mb-2">Conta em Análise</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed mb-6">
            O seu cadastro foi recebido com sucesso na base de dados, mas o acesso ao escalonamento precisa ser liberado oficialmente por um Gestor do Comando. Retorne mais tarde.
          </p>
          <LogoutButton />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#0b0e14] text-slate-100 font-sans min-h-screen flex flex-col antialiased selection:bg-blue-500/30">
      
      {/* Mobile Top Header */}
      <header className="lg:hidden flex items-center bg-[#121620]/95 backdrop-blur-md px-4 py-3 justify-between sticky top-0 z-50 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="relative">
            {displayPhoto ? (
              <div
                className="bg-center bg-no-repeat aspect-square bg-cover rounded-full size-10 border-2 border-blue-500/30"
                style={{ backgroundImage: `url(${displayPhoto})` }}
              ></div>
            ) : (
              <div className="bg-blue-600/20 text-blue-400 aspect-square rounded-full size-10 border-2 border-blue-500/30 flex items-center justify-center font-bold text-sm uppercase">
                {profile?.war_name?.[0] || '?'}
              </div>
            )}
            <div className="absolute bottom-0 right-0 size-3 bg-emerald-500 border-2 border-[#121620] rounded-full"></div>
          </div>
          <div className="flex flex-col">
            <h2 className="text-white text-base font-bold leading-tight truncate max-w-[180px]">{displayName}</h2>
            <span className="text-[11px] text-gray-400 font-medium truncate max-w-[180px]">{displayInstrument}</span>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          <Link href="/notifications" className="relative flex size-10 items-center justify-center rounded-full text-gray-300 hover:bg-white/5 transition-colors">
            <span className="material-symbols-outlined">notifications</span>
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 size-4 bg-red-500 rounded-full flex items-center justify-center text-[9px] font-bold text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </Link>
          <LogoutButton />
        </div>
      </header>

      {/* Main Workspace Content Area */}
      <main className="flex-1 flex flex-col gap-6 min-w-0 w-full px-4 sm:px-6 lg:px-0 py-4 sm:py-6">
        
        {/* Top Bar on Desktop */}
          <section className="hidden lg:flex items-center justify-between pb-3 border-b border-white/5">
            <div className="flex flex-col">
              <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
                {todayFormatted}
              </span>
              <div className="flex items-center gap-3 mt-1">
                <h1 className="text-2xl font-black text-white tracking-tight">
                  Olá, {firstName}
                </h1>
                <span className="bg-blue-600/20 text-blue-400 border border-blue-500/30 text-[11px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                  {roleBadge}
                </span>
              </div>
            </div>

            {/* Profile & Notifications right pill */}
            <div className="flex items-center gap-3">
              <Link 
                href="/notifications" 
                className="relative flex size-11 items-center justify-center rounded-full bg-[#161a24] border border-white/10 text-gray-300 hover:text-white hover:border-blue-500/50 transition-all shadow-md"
                title="Notificações"
              >
                <span className="material-symbols-outlined text-[22px]">notifications</span>
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 size-4 bg-red-500 rounded-full flex items-center justify-center text-[9px] font-black text-white shadow-sm shadow-red-500/50">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </Link>

              <div className="flex items-center gap-3 pl-3 pr-2 py-1.5 rounded-2xl bg-[#161a24] border border-white/10 shadow-md">
                <div className="flex flex-col text-right">
                  <span className="text-sm font-bold text-white leading-tight">{displayName}</span>
                  <span className="text-[11px] text-gray-400 font-medium">{profile?.instrument || 'Banda de Música'}</span>
                </div>
                <div className="relative">
                  {displayPhoto ? (
                    <div
                      className="bg-center bg-no-repeat aspect-square bg-cover rounded-full size-10 border-2 border-blue-500/30"
                      style={{ backgroundImage: `url(${displayPhoto})` }}
                    ></div>
                  ) : (
                    <div className="bg-blue-600/20 text-blue-400 aspect-square rounded-full size-10 border-2 border-blue-500/30 flex items-center justify-center font-bold text-sm uppercase">
                      {profile?.war_name?.[0] || '?'}
                    </div>
                  )}
                  <div className="absolute bottom-0 right-0 size-3 bg-emerald-500 border-2 border-[#161a24] rounded-full"></div>
                </div>
                <div className="border-l border-white/10 pl-1 ml-1">
                  <LogoutButton />
                </div>
              </div>
            </div>
          </section>

          {/* Quick Action Circles / Shortcuts (Desktop & Mobile) */}
          <section className="flex gap-4 overflow-x-auto no-scrollbar py-1">
            {(profile?.role === 'admin' || profile?.role === 'master') && (
              <Link href="/admin/scales/new" className="flex flex-col items-center gap-2 group shrink-0">
                <div className="size-16 rounded-full bg-[#161a24] border border-white/10 flex items-center justify-center text-blue-400 group-hover:border-blue-500 group-hover:scale-105 group-hover:shadow-lg group-hover:shadow-blue-500/20 transition-all">
                  <span className="material-symbols-outlined text-[28px]">add</span>
                </div>
                <span className="text-xs font-semibold text-gray-300 group-hover:text-white">Publicar</span>
              </Link>
            )}

            <Link href={profile?.role === 'admin' || profile?.role === 'master' ? "/admin/scales" : "/scales"} className="flex flex-col items-center gap-2 group shrink-0">
              <div className="size-16 rounded-full bg-[#161a24] border border-white/10 flex items-center justify-center text-purple-400 group-hover:border-purple-500 group-hover:scale-105 group-hover:shadow-lg group-hover:shadow-purple-500/20 transition-all">
                <span className="material-symbols-outlined text-[28px]">queue_music</span>
              </div>
              <span className="text-xs font-semibold text-gray-300 group-hover:text-white">Escalas</span>
            </Link>

            {(profile?.role === 'admin' || profile?.role === 'master') && (
              <Link href="/admin/musicians" className="flex flex-col items-center gap-2 group shrink-0">
                <div className="size-16 rounded-full bg-[#161a24] border border-white/10 flex items-center justify-center text-emerald-400 group-hover:border-emerald-500 group-hover:scale-105 group-hover:shadow-lg group-hover:shadow-emerald-500/20 transition-all">
                  <span className="material-symbols-outlined text-[28px]">groups</span>
                </div>
                <span className="text-xs font-semibold text-gray-300 group-hover:text-white">Efetivo</span>
              </Link>
            )}

            <Link href={profile?.role === 'admin' || profile?.role === 'master' ? "/admin/swaps" : "/swaps"} className="flex flex-col items-center gap-2 group shrink-0">
              <div className="size-16 rounded-full bg-[#161a24] border border-white/10 flex items-center justify-center text-amber-400 group-hover:border-amber-500 group-hover:scale-105 group-hover:shadow-lg group-hover:shadow-amber-500/20 transition-all">
                <span className="material-symbols-outlined text-[28px]">swap_horiz</span>
              </div>
              <span className="text-xs font-semibold text-gray-300 group-hover:text-white">Permutas</span>
            </Link>

            <Link href="/notices" className="flex flex-col items-center gap-2 group shrink-0">
              <div className="size-16 rounded-full bg-[#161a24] border border-white/10 flex items-center justify-center text-rose-400 group-hover:border-rose-500 group-hover:scale-105 group-hover:shadow-lg group-hover:shadow-rose-500/20 transition-all">
                <span className="material-symbols-outlined text-[28px]">campaign</span>
              </div>
              <span className="text-xs font-semibold text-gray-300 group-hover:text-white">Avisos</span>
            </Link>
          </section>

          {/* Active Leave Alert */}
          {profile && getCurrentMilitaryStatus(profile) && (
            <section className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-start gap-3 shadow-md">
              <div className="size-10 rounded-full bg-red-500/20 flex items-center justify-center text-red-400 shrink-0">
                <span className="material-symbols-outlined text-[24px]">event_busy</span>
              </div>
              <div className="flex flex-col">
                <h4 className="text-red-400 font-bold text-sm">Afastamento Ativo</h4>
                <p className="text-red-300/80 text-xs leading-relaxed">
                  Você está atualmente em situação de <strong className="uppercase">{getCurrentMilitaryStatus(profile)}</strong> até {fmtDate(profile.statusEndDate)}. Durante este período, você não poderá ser escalado para novos eventos.
                </p>
              </div>
            </section>
          )}

          {/* Admin Notification for Leaves Ending Today */}
          {returningTomorrow.length > 0 && (
            <section className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex flex-col gap-3 shadow-md">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-400">warning</span>
                <h4 className="text-amber-400 font-bold text-sm">Retornos Previstos para Amanhã</h4>
              </div>
              <div className="flex flex-col gap-2">
                {returningTomorrow.map((m: any) => (
                  <div key={m.id} className="text-amber-200/90 text-xs">
                    • O período de <strong className="uppercase">{m.militaryStatus}</strong> de <strong>{m.rank} {m.war_name || m.name}</strong> se encerra hoje. Retorno automático previsto para amanhã.
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 2 COLUMNS ON DESKTOP: Left (Featured Scale) | Right (Upcoming Scale Cards) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* COLUMN 1 (Left 7 Cols): Featured Next Scale */}
            <div className="lg:col-span-7 flex flex-col gap-4">
              
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-widest text-gray-400">
                    PRÓXIMA ESCALA {currentFeaturedScale ? `• ${getDateLabel(currentFeaturedScale.date)}` : ''}
                  </span>
                  {nextScales.length > 1 && (
                    <span className="text-[10px] font-bold bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full border border-blue-500/30">
                      {activeScaleIndex + 1} de {nextScales.length}
                    </span>
                  )}
                </div>

                {/* Navigation arrows for multiple scales */}
                {nextScales.length > 1 && (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setActiveScaleIndex(prev => Math.max(0, prev - 1))}
                      disabled={activeScaleIndex === 0}
                      className="size-8 rounded-full bg-[#161a24] border border-white/10 flex items-center justify-center text-gray-400 hover:text-white disabled:opacity-30 disabled:hover:text-gray-400 transition-colors"
                      title="Anterior"
                    >
                      <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                    </button>
                    <button
                      onClick={() => setActiveScaleIndex(prev => Math.min(nextScales.length - 1, prev + 1))}
                      disabled={activeScaleIndex === nextScales.length - 1}
                      className="size-8 rounded-full bg-[#161a24] border border-white/10 flex items-center justify-center text-gray-400 hover:text-white disabled:opacity-30 disabled:hover:text-gray-400 transition-colors"
                      title="Próxima"
                    >
                      <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                    </button>
                  </div>
                )}
              </div>

              {loadingScales ? (
                <div className="flex justify-center py-16 bg-[#121620] rounded-3xl border border-white/5">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
                </div>
              ) : !currentFeaturedScale ? (
                <div className="bg-[#121620] rounded-3xl p-10 flex flex-col items-center justify-center text-center gap-3 border border-dashed border-white/10">
                  <span className="material-symbols-outlined text-5xl text-gray-600">calendar_today</span>
                  <p className="text-sm text-gray-400 font-medium">Nenhuma escala prevista para você no momento.</p>
                </div>
              ) : currentFeaturedScale.classification === 'folga' ? (
                /* Card de Folga */
                <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 to-teal-700 shadow-xl border border-white/10 p-8 flex flex-col items-center justify-center text-center">
                  <div className="absolute -right-6 -top-6 opacity-15 pointer-events-none">
                    <span className="material-symbols-outlined text-[160px] text-white">weekend</span>
                  </div>
                  <div className="flex flex-col items-center gap-3 z-10 text-white">
                    <span className="material-symbols-outlined text-[54px]">event_available</span>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-black uppercase tracking-widest text-emerald-200">
                        {fmtDate(currentFeaturedScale.date)}
                      </span>
                      <h2 className="text-4xl font-black tracking-[0.2em] uppercase">Folga</h2>
                    </div>
                    <p className="text-sm font-medium text-emerald-100 mt-2">Nenhum serviço escalado para esta data</p>
                  </div>
                </div>
              ) : (
                /* Card Principal da Escala Ativa (Átrio style) */
                <div className="relative rounded-3xl bg-[#121620] border border-white/10 p-6 sm:p-7 shadow-2xl flex flex-col gap-6">
                  
                  {/* Header do Card */}
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-2xl sm:text-3xl font-black text-white capitalize tracking-tight">
                        {new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }).format(new Date(`${currentFeaturedScale.date}T12:00:00`))}
                      </span>
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-black border ${getFormatColors(currentFeaturedScale.format).bg} ${getFormatColors(currentFeaturedScale.format).text} ${getFormatColors(currentFeaturedScale.format).border}`}>
                        {currentFeaturedScale.format || 'Evento'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-sm text-gray-400 font-medium">
                      <span className="text-white font-semibold">{currentFeaturedScale.title}</span>
                      <span>•</span>
                      <span className="text-blue-400 font-bold">
                        {currentFeaturedScale.startTime || currentFeaturedScale.departureTime}
                        {currentFeaturedScale.endTime ? ` às ${currentFeaturedScale.endTime}` : ''}
                      </span>
                    </div>
                  </div>

                  {/* Informações detalhadas em linhas elegantes */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4 border-y border-white/5">
                    {(() => {
                      const chief = currentFeaturedScale.serviceChief;
                      const chiefName = typeof chief === 'object' && chief !== null
                        ? `${chief.rank || ''} ${chief.war_name || chief.name || ''}`.trim()
                        : typeof chief === 'string' ? chief : '';
                      
                      if (!chiefName) return null;

                      return (
                        <div className="flex flex-col">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Chefe do Serviço</span>
                          <span className="text-sm font-semibold text-gray-200 mt-0.5 truncate">
                            {chiefName}
                          </span>
                        </div>
                      );
                    })()}
                    
                    <div className="flex flex-col">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Uniforme</span>
                      <span className="text-sm font-semibold text-gray-200 mt-0.5 truncate">
                        {currentFeaturedScale.uniform || 'A definir'}
                      </span>
                    </div>

                    <div className="flex flex-col sm:col-span-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Local do Evento</span>
                      <div className="flex items-center gap-1.5 text-gray-200 mt-0.5">
                        <span className="material-symbols-outlined text-[18px] text-blue-400">location_on</span>
                        <span className="text-sm font-semibold truncate">{currentFeaturedScale.location || 'Banda de Música PMPR'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Badges e Ações */}
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <span className="size-2 rounded-full bg-emerald-500"></span>
                        Tudo pronto
                      </span>
                      {currentFeaturedScale.musicians?.length > 0 && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-white/5 text-gray-300 border border-white/10">
                          <span className="material-symbols-outlined text-[16px]">groups</span>
                          {currentFeaturedScale.musicians.length} no efetivo
                        </span>
                      )}
                    </div>

                    {/* Botões de Ação */}
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={(e) => {
                          e.preventDefault();
                          generateScalePDF(currentFeaturedScale);
                        }}
                        title="Baixar PDF Oficial"
                        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/30 transition-all font-bold text-xs"
                      >
                        <span className="material-symbols-outlined text-[18px]">download</span>
                        <span>PDF</span>
                      </button>

                      <button
                        onClick={(e) => handleVerify(e, currentFeaturedScale)}
                        disabled={verifying === currentFeaturedScale.id}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs transition-all border ${
                          viewedScales[currentFeaturedScale.id]?.confirmed
                            ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/30'
                            : 'bg-white/5 border-white/10 text-gray-300 hover:border-blue-500 hover:text-white'
                        }`}
                      >
                        {verifying === currentFeaturedScale.id ? (
                          <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                        ) : viewedScales[currentFeaturedScale.id]?.confirmed ? (
                          <>
                            <span className="material-symbols-outlined text-[18px] filled">check_circle</span>
                            <span>Ciente</span>
                          </>
                        ) : (
                          <>
                            <span className="material-symbols-outlined text-[18px]">check_circle</span>
                            <span>Dar Ciência</span>
                          </>
                        )}
                      </button>

                      <Link href={`/scales/${currentFeaturedScale.id}`}>
                        <button className="flex items-center gap-2 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg shadow-blue-600/30 transition-all active:scale-95">
                          <span>Abrir escala</span>
                          <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                        </button>
                      </Link>
                    </div>
                  </div>

                  {/* Carrossel Dots se houver mais de uma escala */}
                  {nextScales.length > 1 && (
                    <div className="flex items-center justify-center gap-1.5 pt-2">
                      {nextScales.map((_, idx) => (
                        <button
                          key={idx}
                          onClick={() => setActiveScaleIndex(idx)}
                          className={`size-2 rounded-full transition-all ${
                            idx === activeScaleIndex ? 'w-6 bg-blue-500' : 'bg-white/20 hover:bg-white/40'
                          }`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* COLUMN 2 (Right 5 Cols): Upcoming Scales Cards (Átrio style) */}
            <div className="lg:col-span-5 flex flex-col gap-4">
              
              {/* Header with Filter Pills */}
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-bold uppercase tracking-widest text-gray-400">
                  PRÓXIMAS ESCALAS
                </span>

                <div className="flex items-center p-1 rounded-xl bg-[#121620] border border-white/10">
                  <button
                    onClick={() => setListFilter('todas')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                      listFilter === 'todas'
                        ? 'bg-white/10 text-white shadow-sm'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    Todas
                  </button>
                  <button
                    onClick={() => setListFilter('pendentes')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                      listFilter === 'pendentes'
                        ? 'bg-white/10 text-white shadow-sm'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    Pendentes
                  </button>
                </div>
              </div>

              {/* Stacked Cards List */}
              <div className="flex flex-col gap-3">
                {filteredNextScales.length === 0 ? (
                  <div className="bg-[#121620] rounded-2xl p-6 text-center text-gray-500 text-xs border border-white/5 font-medium">
                    {listFilter === 'pendentes' ? 'Nenhuma escala com pendência de ciência.' : 'Nenhum outro serviço agendado.'}
                  </div>
                ) : (
                  filteredNextScales.slice(0, 5).map((scale: any) => {
                    const { dayOfWeek, dateFormatted } = formatBadgeDate(scale.date);
                    const isConfirmed = viewedScales[scale.id]?.confirmed;
                    const isFolga = scale.classification === 'folga';

                    return (
                      <div
                        key={scale.id}
                        className="bg-[#121620] hover:bg-[#161a26] border border-white/10 hover:border-blue-500/40 rounded-2xl p-4 transition-all duration-200 flex items-center justify-between gap-4 group shadow-md"
                      >
                        {/* Date badge */}
                        <div className="flex flex-col items-center justify-center size-14 rounded-xl bg-white/5 border border-white/10 shrink-0">
                          <span className="text-[10px] font-black uppercase text-blue-400 tracking-wider">
                            {dayOfWeek}
                          </span>
                          <span className="text-base font-black text-white leading-tight">
                            {dateFormatted}
                          </span>
                        </div>

                        {/* Middle info */}
                        <div className="flex flex-col flex-1 min-w-0">
                          <h4 className="text-sm font-bold text-white truncate group-hover:text-blue-400 transition-colors">
                            {isFolga ? 'Folga' : scale.title}
                          </h4>
                          <span className="text-[11px] text-gray-400 truncate mt-0.5">
                            {isFolga ? 'Sem serviço escalado' : `${scale.format || 'Evento'} • ${scale.startTime || scale.departureTime || 'Horário a definir'}`}
                          </span>
                        </div>

                        {/* Status tag and Open button */}
                        <div className="flex items-center gap-2 shrink-0">
                          {!isFolga && !isConfirmed ? (
                            <span className="hidden sm:inline-block text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 uppercase">
                              Pendente
                            </span>
                          ) : !isFolga && isConfirmed ? (
                            <span className="hidden sm:inline-block text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 uppercase">
                              Ciente
                            </span>
                          ) : null}

                          <Link href={`/scales/${scale.id}`}>
                            <button className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-blue-600 text-gray-300 hover:text-white text-xs font-bold transition-all border border-white/10 hover:border-blue-500">
                              Abrir
                            </button>
                          </Link>
                        </div>
                      </div>
                    );
                  })
                )}

                {/* Footer link to calendar */}
                <Link href="/calendar" className="mt-2 text-xs font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1.5 self-start px-1 group">
                  <span>Ver o calendário completo</span>
                  <span className="material-symbols-outlined text-[16px] group-hover:translate-x-1 transition-transform">arrow_forward</span>
                </Link>
              </div>

              {/* Escalas Anteriores Timeline Recente (Desktop e Mobile) */}
              {historyScales.length > 0 && (
                <div className="flex flex-col gap-3 mt-6 pt-6 border-t border-white/5">
                  <span className="text-xs font-bold uppercase tracking-widest text-gray-400 px-1">
                    ÚLTIMAS ESCALAS REALIZADAS
                  </span>
                  <div className="flex flex-col gap-2.5">
                    {historyScales.slice(0, 3).map((scale: any) => {
                      const { dayOfWeek, dateFormatted } = formatBadgeDate(scale.date);
                      return (
                        <Link key={scale.id} href={`/scales/${scale.id}`}>
                          <div className="bg-[#121620]/60 hover:bg-[#121620] border border-white/5 hover:border-white/10 rounded-2xl p-3 flex items-center justify-between gap-3 transition-colors">
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="text-xs font-bold text-gray-400">{dayOfWeek} {dateFormatted}</span>
                              <span className="text-xs font-medium text-gray-300 truncate">{scale.title}</span>
                            </div>
                            <span className="text-[11px] text-gray-500 font-bold shrink-0">Concluído</span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>

          </div>

          <div className="h-16 lg:h-8"></div>
        </main>

      {/* BottomNav persists on mobile and is hidden on desktop */}
      <BottomNav />
    </div>
  );
}
