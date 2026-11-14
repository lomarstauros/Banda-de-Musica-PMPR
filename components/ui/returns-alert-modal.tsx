'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useFirebase } from '@/components/providers/firebase-provider';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { fmtDate, getTodayYMD, normalizeDateToYMD } from '@/lib/format-date';

export function ReturnsAlertModal() {
  const router = useRouter();
  const { user, userRole } = useFirebase();
  const [isOpen, setIsOpen] = useState(false);
  const [returningUsers, setReturningUsers] = useState<any[]>([]);
  const [tomorrowDateFormatted, setTomorrowDateFormatted] = useState('');

  useEffect(() => {
    if (!user) return;
    if (userRole !== 'admin' && userRole !== 'master') return;

    const checkReturningMusicians = async () => {
      try {
        // 1. Data de Hoje e de Amanhã
        const today = new Date();
        const localTodayStr = getTodayYMD();

        // 2. Verificar se o gestor já dispensou o aviso hoje ou já verificou nesta sessão
        const storageKey = `dismissed_returns_popup_${user.uid}_${localTodayStr}`;
        if (localStorage.getItem(storageKey) === 'true') {
          return;
        }

        const sessionKey = `checked_returns_${user.uid}_${localTodayStr}`;
        if (sessionStorage.getItem(sessionKey) === 'true') {
          return;
        }

        const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
        const yTomorrow = tomorrow.getFullYear();
        const mTomorrow = String(tomorrow.getMonth() + 1).padStart(2, '0');
        const dTomorrow = String(tomorrow.getDate()).padStart(2, '0');
        const localTomorrowStr = `${yTomorrow}-${mTomorrow}-${dTomorrow}`;

        // Format tomorrow date: DD/MM/AAAA (Dia da semana)
        const daysWeek = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
        const tomorrowDayWeek = daysWeek[tomorrow.getDay()];
        const formattedTomorrow = `${tomorrow.getDate().toString().padStart(2, '0')}/${(tomorrow.getMonth() + 1).toString().padStart(2, '0')}/${tomorrow.getFullYear()} (${tomorrowDayWeek})`;
        setTomorrowDateFormatted(formattedTomorrow);

        // 3. Buscar militares cujo afastamento se encerra hoje (retorno amanhã)
        const q = query(collection(db, 'profiles'), where('militaryStatus', '!=', 'Ativo'));
        const snap = await getDocs(q);

        const list = snap.docs
          .map(d => ({ id: d.id, ...d.data() } as any))
          .filter(p => !p.statusIndefinite && normalizeDateToYMD(p.statusEndDate) === localTodayStr);

        sessionStorage.setItem(sessionKey, 'true');

        if (list.length > 0) {
          setReturningUsers(list);
          setIsOpen(true);
        }
      } catch (err) {
        console.error('Erro ao verificar retornos de afastamentos:', err);
      }
    };

    checkReturningMusicians();
  }, [user, userRole]);

  const handleDismiss = () => {
    try {
      const localTodayStr = getTodayYMD();
      if (user?.uid) {
        localStorage.setItem(`dismissed_returns_popup_${user.uid}_${localTodayStr}`, 'true');
      }
    } catch { /* fallback */ }
    setIsOpen(false);
  };

  const handleNavigateToUnavailable = () => {
    handleDismiss();
    router.push('/admin/unavailable');
  };

  if (!isOpen || returningUsers.length === 0) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="bg-white dark:bg-[#151a24] border border-amber-500/30 rounded-3xl p-5 sm:p-6 w-full max-w-lg shadow-2xl flex flex-col gap-4 relative overflow-hidden"
        >
          {/* Barra de destaque superior colorida */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-500 via-green-500 to-amber-500" />

          {/* Cabeçalho do Pop-up */}
          <div className="flex items-start justify-between gap-3 pt-1">
            <div className="flex items-center gap-3">
              <div className="size-11 rounded-2xl bg-amber-500/10 text-amber-500 dark:text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/20 shadow-inner">
                <span className="material-symbols-outlined text-[26px]">notification_important</span>
              </div>
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full inline-block mb-1">
                  Primeiro Login do Dia • Sargenteação
                </span>
                <h3 className="font-bold text-gray-900 dark:text-white text-base sm:text-lg leading-tight">
                  Retornos Previstos para Amanhã
                </h3>
              </div>
            </div>

            {/* Botão de Fechar Rápido (X) */}
            <button
              onClick={handleDismiss}
              className="size-8 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-white transition-colors"
              title="Fechar (1 clique)"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>

          {/* Subtítulo com a data exata */}
          <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-2xl p-3 flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200">
            <span className="material-symbols-outlined text-[18px] text-amber-500 shrink-0 mt-0.5">info</span>
            <div>
              <p>
                O período de afastamento dos militares abaixo <strong>se encerra hoje</strong>. Eles estarão disponíveis para escala a partir de amanhã, <strong>{tomorrowDateFormatted}</strong>:
              </p>
            </div>
          </div>

          {/* Lista dos Militares que Retornarão */}
          <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1">
            {returningUsers.map((m) => (
              <div 
                key={m.id}
                className="bg-gray-50 dark:bg-black/30 border border-gray-100 dark:border-white/5 rounded-2xl p-3 flex items-center justify-between gap-3 shadow-sm hover:border-green-500/30 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="size-10 rounded-xl bg-green-500/10 text-green-600 dark:text-green-400 flex items-center justify-center font-bold text-xs shrink-0 border border-green-500/20">
                    {m.war_name?.[0] || m.name?.[0] || '?'}
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white truncate">
                      {m.rank} {m.war_name || m.name}
                    </h4>
                    <div className="flex items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                      <span className="font-semibold text-red-500 uppercase">
                        {m.militaryStatus}
                      </span>
                      {m.militaryStatus === 'Adido' && m.adidoTo && (
                        <span className="font-medium text-amber-600 dark:text-amber-400">
                          ({m.adidoTo})
                        </span>
                      )}
                      {m.instrument && (
                        <>
                          <span>•</span>
                          <span>{m.instrument}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-green-600 dark:text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/20">
                    <span className="size-1.5 rounded-full bg-green-500 animate-pulse"></span>
                    Retorna amanhã
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Rodapé com Botão de Fechar com 1 Clique */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
            <button
              onClick={handleNavigateToUnavailable}
              className="px-4 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs font-bold transition-all active:scale-95 flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]">visibility</span>
              Ver Afastamentos
            </button>

            <button
              onClick={handleDismiss}
              className="px-5 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-xs font-bold shadow-md shadow-green-600/20 transition-all active:scale-95 flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]">check_circle</span>
              Entendido, fechar aviso
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

