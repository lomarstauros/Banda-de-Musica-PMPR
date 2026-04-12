'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useFirebase } from '@/components/providers/firebase-provider';
import { doc, getDoc, collection, query, orderBy, limit, getDocs, onSnapshot, where, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import { BottomNav } from '@/components/ui/bottom-nav';
import { LogoutButton } from '@/components/ui/logout-button';
import { generateScalePDF } from '@/lib/pdf-generator';
import { fmtDate } from '@/lib/format-date';

export default function DashboardPage() {
  const { user, loading: authLoading } = useFirebase();
  const router = useRouter();
  const [profile, setProfile] = useState<{ war_name?: string; rank?: string; photo_url?: string; instrument?: string } | null>(null);
  const [nextScales, setNextScales] = useState<any[]>([]);
  const [loadingScales, setLoadingScales] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  // scaleId → { confirmed: boolean, notifId: string | null }
  const [viewedScales, setViewedScales] = useState<Record<string, { confirmed: boolean; notifId: string | null }>>({});
  const [verifying, setVerifying] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user || !user.emailVerified) {
      router.push('/login');
      return;
    }

    const fetchDashboardData = async () => {
      try {
        // 1. Fetch Profile
        const docRef = doc(db, 'profiles', user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setProfile(docSnap.data());

          // 2. Fetch Scales — regra de visibilidade:
          //    - Funções especiais (Administrativo, Regente, Comando) → veem TODAS as escalas
          //    - Escala sem músicos → aparece para todos
          //    - Escala com músicos → aparece só para os escalados
          const profileData = docSnap.data();
          const userInstrument = (profileData.instrument || '').trim().toLowerCase();
          const FULL_VISIBILITY_ROLES = ['administrativo', 'regente', 'comando'];
          const hasFullVisibility = FULL_VISIBILITY_ROLES.includes(userInstrument);

          const scalesRef = collection(db, 'scales');
          const q = query(scalesRef, orderBy('date', 'asc'), limit(20));
          const querySnapshot = await getDocs(q);

          const allScales = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

          const visibleScales = allScales.filter((scale: any) => {
            if (hasFullVisibility) return true; // Administrativo/Regente/Comando veem tudo
            const hasMusicians = scale.musicians && scale.musicians.length > 0;
            if (!hasMusicians) return true; // sem efetivo → visível para todos
            return scale.musicians.some((m: any) => m.id === user.uid); // apenas se escalado
          });

          setNextScales(visibleScales);
        }
      } catch (e) {
        console.error("Erro ao carregar dados do dashboard:", e);
      } finally {
        setLoadingScales(false);
      }
    };
    fetchDashboardData();

    // 3. Escutar notificações (convocações) em tempo real → conta não lidas + mapeia estado por escala
    const qNotif = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid)
    );
    const unsubNotif = onSnapshot(qNotif, (snap) => {
      let unread = 0;
      const map: Record<string, { confirmed: boolean; notifId: string | null }> = {};
      snap.docs.forEach(d => {
        const data = d.data();
        if (!data.read) unread++;
        if (data.scaleId) {
          // Se ainda não mapeado ou não confirmado, registra
          if (!map[data.scaleId] || !map[data.scaleId].confirmed) {
            map[data.scaleId] = { confirmed: !!data.read, notifId: d.id };
          }
        }
      });
      setUnreadCount(unread);
      setViewedScales(map);
    });

    return () => unsubNotif();
  }, [user, authLoading, router]);

  const displayName = profile ? `${profile.rank || ''} ${profile.war_name || ''}`.trim() || 'Sem nome' : 'Carregando...';
  const displayInstrument = profile?.instrument ? `Banda PMPR - ${profile.instrument}` : 'Banda PMPR';
  const displayPhoto = profile?.photo_url || null;

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
        // Confirma a notificação de convocação existente
        batch.update(doc(db, 'notifications', existing.notifId), {
          read: true,
          confirmedAt: serverTimestamp(),
        });
      } else {
        // Cria um registro de visualização (escala sem convocação prévia)
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
      // Atualiza estado local imediatamente
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

  return (
    <div className="bg-background-light dark:bg-background-dark font-sans min-h-screen flex flex-col antialiased selection:bg-primary/20">
      <header className="flex items-center bg-white dark:bg-[#1A202C] px-4 py-3 justify-between sticky top-0 z-50 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-3">
          <div className="relative">
            {displayPhoto ? (
              <div
                className="bg-center bg-no-repeat aspect-square bg-cover rounded-full size-10 border-2 border-primary/20"
                style={{ backgroundImage: `url(${displayPhoto})` }}
              ></div>
            ) : (
              <div className="bg-primary/10 text-primary aspect-square rounded-full size-10 border-2 border-primary/20 flex items-center justify-center font-bold text-sm uppercase">
                {profile?.war_name?.[0] || '?'}
              </div>
            )}
            <div className="absolute bottom-0 right-0 size-3 bg-green-500 border-2 border-white dark:border-[#1A202C] rounded-full"></div>
          </div>
          <div className="flex flex-col">
            <h2 className="text-[#111318] dark:text-white text-base font-bold leading-tight">{displayName}</h2>
            <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{displayInstrument}</span>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          <Link href="/notifications" className="relative flex size-10 items-center justify-center rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
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

      <main className="flex-1 overflow-x-hidden flex flex-col gap-6 p-4 max-w-md mx-auto w-full">
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-[#111318] dark:text-white text-lg font-bold">Próxima Escala</h3>
            {nextScales.length > 0 && (
              <span className="bg-primary/10 text-primary text-xs font-bold px-2 py-1 rounded-full">Publicada</span>
            )}
          </div>
          
          {loadingScales ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
            </div>
          ) : nextScales.length === 0 ? (
            <div className="bg-white dark:bg-[#1A202C] rounded-xl p-8 flex flex-col items-center justify-center text-center gap-3 border border-dashed border-gray-200 dark:border-gray-800">
              <span className="material-symbols-outlined text-4xl text-gray-300">calendar_today</span>
              <p className="text-sm text-gray-500">Nenhuma escala prevista para você no momento.</p>
            </div>
          ) : (
            <Link href={`/scales/${nextScales[0].id}`}>
              <div className="bg-white dark:bg-[#1A202C] rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden group cursor-pointer">
                <div className="relative h-32 w-full bg-primary">
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                  <div className="absolute bottom-3 left-4 text-white">
                    <p className="text-xs font-medium opacity-90 mb-0.5">{nextScales[0].format}</p>
                    <h2 className="text-xl font-bold leading-tight">{nextScales[0].title}</h2>
                  </div>
                  {/* Badge: escala aberta (sem efetivo definido) */}
                  {(!nextScales[0].musicians || nextScales[0].musicians.length === 0) && (
                    <span className="absolute top-3 right-3 bg-amber-400 text-amber-900 text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wide">
                      Efetivo em aberto
                    </span>
                  )}
                </div>
                <div className="p-4 flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                        <span className="material-symbols-outlined text-[18px]">calendar_month</span>
                        <span className="text-xs font-medium uppercase tracking-wide">Data e Início</span>
                      </div>
                      <p className="text-[#111318] dark:text-white font-semibold">
                        {fmtDate(nextScales[0].date)} • {nextScales[0].startTime || nextScales[0].departureTime}
                      </p>
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                        <span className="material-symbols-outlined text-[18px]">styler</span>
                        <span className="text-xs font-medium uppercase tracking-wide">Uniforme</span>
                      </div>
                      <p className="text-[#111318] dark:text-white font-semibold truncate">{nextScales[0].uniform}</p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                      <span className="material-symbols-outlined text-[18px]">location_on</span>
                      <span className="text-xs font-medium uppercase tracking-wide">Local</span>
                    </div>
                    <p className="text-[#111318] dark:text-white font-semibold truncate">{nextScales[0].location || 'A definir'}</p>
                  </div>
                  <div className="mt-2 pt-4 border-t border-gray-100 dark:border-gray-700">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="flex -space-x-2">
                          {nextScales[0].musicians?.slice(0, 3).map((m: any, i: number) => (
                             <div key={i} className="size-8 rounded-full bg-gray-200 border-2 border-white dark:border-[#1A202C] flex items-center justify-center text-[10px] font-bold text-gray-500">
                               {m.war_name?.[0] || m.name?.[0]}
                             </div>
                          ))}
                          {nextScales[0].musicians?.length > 3 && (
                            <div className="size-8 rounded-full bg-gray-100 dark:bg-gray-800 border-2 border-white dark:border-[#1A202C] flex items-center justify-center text-[10px] font-bold text-gray-500">
                              +{nextScales[0].musicians.length - 3}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={(e) => {
                            e.preventDefault();
                            generateScalePDF(nextScales[0]);
                          }}
                          title="Baixar PDF da Escala"
                          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-all border border-red-200"
                        >
                          <span className="material-symbols-outlined text-[20px]">download</span>
                        </button>
                        <button
                          onClick={(e) => handleVerify(e, nextScales[0])}
                          disabled={verifying === nextScales[0].id}
                          className={`flex items-center gap-2 px-4 py-2 rounded-lg shadow-lg active:scale-95 transition-all font-bold text-sm border-2 ${
                            viewedScales[nextScales[0].id]?.confirmed
                              ? 'bg-primary border-primary text-white shadow-primary/30'
                              : 'bg-white dark:bg-transparent border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:border-primary hover:text-primary'
                          }`}
                        >
                          {verifying === nextScales[0].id ? (
                            <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                          ) : viewedScales[nextScales[0].id]?.confirmed ? (
                            <>
                              <span className="material-symbols-outlined text-[18px] filled">check_circle</span>
                              <span>Verificado</span>
                            </>
                          ) : (
                            <>
                              <span className="material-symbols-outlined text-[18px]">check_circle</span>
                              <span>Verificar</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-[#111318] dark:text-white text-lg font-bold">Próximos Eventos</h3>
            <Link href="/calendar">
              <button className="text-primary text-sm font-semibold hover:underline">Ver calendário</button>
            </Link>
          </div>
          <div className="relative pl-2">
            <div className="absolute left-[27px] top-4 bottom-4 w-0.5 bg-gray-200 dark:bg-gray-700"></div>
                  {nextScales.slice(1).map((scale: any) => (
              <Link key={scale.id} href={`/scales/${scale.id}`} className="relative grid grid-cols-[54px_1fr] gap-4 mb-6 group cursor-pointer">
                <div className="flex flex-col items-center z-10">
                  <div className="size-14 rounded-xl bg-white dark:bg-[#1A202C] border border-gray-100 dark:border-gray-700 shadow-sm flex flex-col items-center justify-center shrink-0 group-hover:border-primary/30 transition-colors">
                    <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">
                      {new Date(scale.date).toLocaleDateString('pt-BR', { month: 'short' })}
                    </span>
                    <span className="text-xl font-bold text-[#111318] dark:text-white">
                      {new Date(scale.date).toLocaleDateString('pt-BR', { day: '2-digit' })}
                    </span>
                  </div>
                </div>
                <div className="bg-white dark:bg-[#1A202C] p-4 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm transition-transform active:scale-[0.99] group-hover:shadow-md">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h4 className="text-[#111318] dark:text-white font-bold text-base">{scale.title}</h4>
                      <div className="flex items-center gap-1 mt-1 text-gray-500 dark:text-gray-400 text-sm">
                        <span className="material-symbols-outlined text-[16px]">schedule</span>
                        <span className="font-bold text-primary">Início: {scale.startTime || scale.departureTime}</span>
                        <span className="mx-1">•</span>
                        <span className="truncate max-w-[100px]">{scale.uniform}</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700/50 flex items-center justify-between">
                    <div className="flex -space-x-2">
                      {scale.musicians?.slice(0, 2).map((m: any, i: number) => (
                        <div key={i} className="size-6 rounded-full bg-gray-200 border border-white dark:border-gray-800 flex items-center justify-center text-[8px] font-bold text-gray-500">
                          {m.war_name?.[0] || m.name?.[0]}
                        </div>
                      ))}
                      {scale.musicians?.length > 2 && (
                        <div className="size-6 rounded-full bg-gray-100 dark:bg-gray-700 border border-white dark:border-gray-800 flex items-center justify-center text-[8px] font-bold text-gray-500">
                          +{scale.musicians.length - 2}
                        </div>
                      )}
                    </div>
                    <button 
                      className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-primary text-white shadow-sm shadow-primary/30 active:scale-[0.98] transition-all"
                    >
                      <span className="material-symbols-outlined text-[16px] filled">check_circle</span>
                      <span className="text-xs font-bold">Ver</span>
                    </button>
                  </div>
                </div>
              </Link>
            ))}

            {nextScales.length <= 1 && (
              <div className="py-8 text-center text-gray-400 text-sm italic">
                Sem eventos adicionais previstos.
              </div>
            )}
          </div>
        </section>
        <div className="h-20"></div>
      </main>

      <BottomNav />
    </div>
  );
}
