'use client';

import Link from 'next/link';
import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { collection, query, getDocs, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { fmtDate } from '@/lib/format-date';

function UnavailableMusiciansContent() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') as 'current' | 'upcoming' | 'past';

  const [currentMusicians, setCurrentMusicians] = useState<any[]>([]);
  const [pastMusicians, setPastMusicians] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'current' | 'upcoming' | 'past'>(
    initialTab === 'upcoming' || initialTab === 'past' ? initialTab : 'current'
  );
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const fetchUnavailable = async () => {
      try {
        const q = query(collection(db, 'profiles'), orderBy('name', 'asc'));
        const snap = await getDocs(q);
        const docs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
        
        const current: any[] = [];
        const pastGrouped: any[] = [];

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        docs.forEach((p: any) => {
          let hasCurrentLeave = false;
          const userPastLeaves: any[] = [];

          // Verifica o leave principal
          if (p.militaryStatus && p.militaryStatus !== 'Ativo') {
            let isPast = false;
            if (p.statusEndDate && !p.statusIndefinite) {
              const end = new Date(p.statusEndDate + 'T23:59:59');
              if (today > end) isPast = true;
            }
            if (isPast) {
              userPastLeaves.push({
                status: p.militaryStatus,
                startDate: p.statusStartDate,
                endDate: p.statusEndDate,
                statusIndefinite: false,
                adidoTo: p.adidoTo
              });
            } else {
              hasCurrentLeave = true;
              current.push(p);
            }
          }

          // Verifica os leaves no histórico
          if (Array.isArray(p.leaveHistory)) {
            p.leaveHistory.forEach((leave: any) => {
              const isCurrentActiveLeave = hasCurrentLeave && 
                p.militaryStatus === leave.status && 
                p.statusStartDate === leave.startDate && 
                p.statusEndDate === leave.endDate;

              if (isCurrentActiveLeave) return;

              const alreadyExists = userPastLeaves.find(
                (l) => l.startDate === leave.startDate && l.endDate === leave.endDate && l.status === leave.status
              );
              
              if (!alreadyExists) {
                userPastLeaves.push(leave);
              }
            });
          }

          if (userPastLeaves.length > 0) {
            userPastLeaves.sort((a, b) => {
              if (!a.endDate) return 1;
              if (!b.endDate) return -1;
              return new Date(b.endDate).getTime() - new Date(a.endDate).getTime();
            });
            pastGrouped.push({ user: p, leaves: userPastLeaves });
          }
        });

        setCurrentMusicians(current);
        setPastMusicians(pastGrouped);
      } catch (e) {
        console.error("Erro ao buscar músicos indisponíveis:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchUnavailable();
  }, []);

  const toggleExpand = (id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  const getReturnDate = (endDateStr?: string, isIndefinite?: boolean) => {
    if (isIndefinite || !endDateStr) return 'Tempo Indeterminado';
    const date = new Date(endDateStr + 'T12:00:00');
    date.setDate(date.getDate() + 1);
    return date.toLocaleDateString('pt-BR');
  };

  // ─── Lista ordenada de Próximos Retornos (do mais próximo ao mais distante) ──
  const upcomingReturns = useMemo(() => {
    return [...currentMusicians].sort((a, b) => {
      const isIndefA = !!a.statusIndefinite || !a.statusEndDate;
      const isIndefB = !!b.statusIndefinite || !b.statusEndDate;
      if (isIndefA && !isIndefB) return 1; // Indeterminado vai para o fim
      if (!isIndefA && isIndefB) return -1;
      const endA = a.statusEndDate || '';
      const endB = b.statusEndDate || '';
      // Ordem cronológica crescente: retorno mais próximo primeiro
      return endA.localeCompare(endB);
    });
  }, [currentMusicians]);

  // Informações detalhadas do retorno (data exata, dia da semana, badge de contagem)
  const getReturnDetails = (endDateStr?: string, isIndefinite?: boolean) => {
    if (isIndefinite || !endDateStr) {
      return {
        formattedDate: 'Tempo Indeterminado',
        dayOfWeek: '',
        countdown: 'Indeterminado',
        badgeColor: 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30',
        diffDays: 9999,
        isToday: false,
        isTomorrow: false
      };
    }

    try {
      const end = new Date(endDateStr + 'T12:00:00');
      const returnDate = new Date(end);
      returnDate.setDate(returnDate.getDate() + 1);

      const daysWeek = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
      const dayOfWeek = daysWeek[returnDate.getDay()];
      const formattedDate = returnDate.toLocaleDateString('pt-BR');

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const returnZero = new Date(returnDate);
      returnZero.setHours(0, 0, 0, 0);

      const diffMs = returnZero.getTime() - today.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

      let countdown = '';
      let badgeColor = '';
      const isToday = diffDays === 0;
      const isTomorrow = diffDays === 1;

      if (isToday) {
        countdown = 'Retorna Hoje!';
        badgeColor = 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30';
      } else if (isTomorrow) {
        countdown = 'Retorna Amanhã!';
        badgeColor = 'bg-green-500/15 text-green-600 dark:text-green-400 border border-green-500/30';
      } else if (diffDays === 2) {
        countdown = 'Retorna em 2 dias';
        badgeColor = 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30';
      } else if (diffDays > 0) {
        countdown = `Retorna em ${diffDays} dias`;
        badgeColor = 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20';
      } else {
        countdown = 'Período encerrado';
        badgeColor = 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30';
      }

      return { formattedDate, dayOfWeek, countdown, badgeColor, diffDays, isToday, isTomorrow };
    } catch {
      return {
        formattedDate: endDateStr,
        dayOfWeek: '',
        countdown: 'Data indefinida',
        badgeColor: 'bg-gray-100 text-gray-700',
        diffDays: 9999,
        isToday: false,
        isTomorrow: false
      };
    }
  };

  return (
    <div className="bg-transparent font-sans flex flex-col items-center lg:items-stretch w-full">
      <div className="relative w-full max-w-md lg:max-w-none bg-background-light dark:bg-[#121620]/90 backdrop-blur-xl lg:rounded-3xl lg:border lg:border-white/10 flex flex-col h-full min-h-screen lg:min-h-0 shadow-2xl">
        
        {/* Header */}
        <header className="sticky top-0 z-10 bg-background-light/95 dark:bg-[#121620]/95 backdrop-blur-md px-4 lg:px-6 py-3.5 flex items-center justify-between border-b border-gray-200 dark:border-white/10 lg:rounded-t-3xl">
          <Link href="/admin/scales">
            <button className="flex items-center justify-center p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors text-gray-900 dark:text-white" title="Voltar">
              <span className="material-symbols-outlined">arrow_back_ios_new</span>
            </button>
          </Link>
          <div className="flex flex-col items-center flex-1 pr-6">
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">Afastamentos</h1>
            <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400">
              Controle de Indisponibilidade & Retornos
            </span>
          </div>
          <div className="size-6"></div>
        </header>

        <main className="flex-1 p-4 lg:p-6 flex flex-col gap-4 pb-24">
          
          {/* Navegação entre as Abas */}
          <div className="flex bg-gray-100 dark:bg-gray-800/80 p-1.5 rounded-2xl gap-1 border border-gray-200 dark:border-white/5">
            <button
              onClick={() => setActiveTab('current')}
              className={`flex-1 py-2.5 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'current'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">event_busy</span>
              Afastados ({currentMusicians.length})
            </button>

            <button
              onClick={() => setActiveTab('upcoming')}
              className={`flex-1 py-2.5 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'upcoming'
                  ? 'bg-white dark:bg-gray-700 text-green-600 dark:text-green-400 shadow-sm'
                  : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">event_available</span>
              Próximos Retornos ({upcomingReturns.length})
            </button>

            <button
              onClick={() => setActiveTab('past')}
              className={`flex-1 py-2.5 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'past'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">history</span>
              Anteriores ({pastMusicians.length})
            </button>
          </div>

          {/* Cabeçalho da Seção Ativa */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 px-1">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                {activeTab === 'current' && 'Efetivo Atualmente Afastado'}
                {activeTab === 'upcoming' && 'Próximos Retornos ao Efetivo'}
                {activeTab === 'past' && 'Histórico de Afastamentos Anteriores'}
              </h2>
              {activeTab === 'upcoming' && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Ordenados cronologicamente do retorno mais próximo ao mais distante.
                </p>
              )}
            </div>

            <span className={`text-xs font-bold px-2.5 py-1 rounded-full self-start sm:self-auto ${
              activeTab === 'upcoming'
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : activeTab === 'current'
                ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
            }`}>
              {activeTab === 'current' && `${currentMusicians.length} militares`}
              {activeTab === 'upcoming' && `${upcomingReturns.length} previstos`}
              {activeTab === 'past' && `${pastMusicians.length} registros`}
            </span>
          </div>

          {/* Conteúdo das Abas */}
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
            </div>
          ) : activeTab === 'upcoming' ? (
            // ═════════════════════════════════════════════════════════════════
            // ABA: PRÓXIMOS RETORNOS (DO MAIS PRÓXIMO AO MAIS DISTANTE)
            // ═════════════════════════════════════════════════════════════════
            upcomingReturns.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400 text-center bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-6">
                <span className="material-symbols-outlined text-[48px] text-green-500 mb-2">check_circle</span>
                <p className="text-sm font-bold text-gray-700 dark:text-gray-300">Nenhum militar afastado no momento.</p>
                <p className="text-xs text-gray-500 mt-1">Todo o efetivo está disponível e pronto para o serviço.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {upcomingReturns.map((m) => {
                  const ret = getReturnDetails(m.statusEndDate, m.statusIndefinite);
                  return (
                    <div 
                      key={m.id} 
                      className={`bg-white dark:bg-gray-900 rounded-2xl border p-4 shadow-sm flex flex-col gap-3 transition-all ${
                        ret.isToday
                          ? 'border-emerald-500/40 bg-emerald-50/10 dark:bg-emerald-950/10'
                          : ret.isTomorrow
                          ? 'border-green-500/40 bg-green-50/10 dark:bg-green-950/10'
                          : 'border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700'
                      }`}
                    >
                      {/* Topo do Card */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`size-11 rounded-2xl flex items-center justify-center font-bold text-sm shrink-0 border shadow-inner ${
                            ret.isTomorrow || ret.isToday
                              ? 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30'
                              : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700'
                          }`}>
                            {m.war_name?.[0] || m.name?.[0] || '?'}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-gray-900 dark:text-white truncate">
                              {m.rank} {m.war_name || m.name}
                            </p>
                            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
                              <span className="font-bold text-red-500 uppercase tracking-wide">
                                {m.militaryStatus}
                              </span>
                              {m.militaryStatus === 'Adido' && m.adidoTo && (
                                <>
                                  <span>•</span>
                                  <span className="font-semibold text-amber-600 dark:text-amber-400">
                                    Adido a: {m.adidoTo}
                                  </span>
                                </>
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

                        {/* Tag de Proximidade */}
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold shrink-0 flex items-center gap-1 ${ret.badgeColor}`}>
                          {(ret.isTomorrow || ret.isToday) && (
                            <span className="size-1.5 rounded-full bg-green-500 animate-pulse"></span>
                          )}
                          {ret.countdown}
                        </span>
                      </div>

                      {/* Bloco de Destaque da Data de Retorno */}
                      <div className="bg-green-50/60 dark:bg-green-950/20 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border border-green-500/20">
                        <div className="flex items-center gap-2.5">
                          <div className="size-8 rounded-lg bg-green-500/20 text-green-600 dark:text-green-400 flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined text-[20px]">event_available</span>
                          </div>
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-green-700 dark:text-green-400 block">
                              Data do Retorno (Disponível)
                            </span>
                            <span className="text-sm font-bold text-gray-900 dark:text-white">
                              {ret.formattedDate} {ret.dayOfWeek ? `(${ret.dayOfWeek})` : ''}
                            </span>
                          </div>
                        </div>

                        <div className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1.5 sm:text-right">
                          <span>Término do afastamento:</span>
                          <strong className="text-gray-900 dark:text-gray-200 font-mono">
                            {m.statusIndefinite ? 'Tempo Indeterminado' : (m.statusEndDate ? fmtDate(m.statusEndDate) : 'Não informado')}
                          </strong>
                        </div>
                      </div>

                      {/* Rodapé do Card */}
                      <div className="flex items-center justify-between text-xs pt-1 border-t border-gray-100 dark:border-gray-800">
                        <span className="text-gray-400">
                          Início do afastamento: {m.statusStartDate ? fmtDate(m.statusStartDate) : 'N/A'}
                        </span>
                        <Link href={`/admin/musicians/${m.id}/edit`}>
                          <button className="text-xs font-bold text-primary hover:underline flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px]">edit</span>
                            Editar Afastamento
                          </button>
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : activeTab === 'current' ? (
            // ═════════════════════════════════════════════════════════════════
            // ABA: AFASTADOS (ATUAIS)
            // ═════════════════════════════════════════════════════════════════
            currentMusicians.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400 text-center">
                <span className="material-symbols-outlined text-[48px] mb-2 text-green-500">check_circle</span>
                <p className="text-sm">Todo o efetivo está disponível e Ativo.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {currentMusicians.map(m => {
                  const isExpanded = expandedId === m.id;
                  return (
                    <div key={m.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden transition-all">
                      <button 
                        onClick={() => toggleExpand(m.id)}
                        className="w-full p-4 flex items-center justify-between text-left focus:outline-none"
                      >
                        <div className="flex items-center gap-3">
                          <div className="size-10 rounded-full bg-red-50 dark:bg-red-900/20 text-red-500 flex items-center justify-center font-bold text-sm shrink-0">
                            {m.war_name?.[0] || m.name?.[0] || '?'}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-gray-900 dark:text-white">{m.rank} {m.war_name || m.name}</p>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="text-xs font-bold text-red-500 uppercase tracking-wide">{m.militaryStatus}</p>
                              {m.militaryStatus === 'Adido' && m.adidoTo && (
                                <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
                                  ({m.adidoTo})
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <span className={`material-symbols-outlined text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                          expand_more
                        </span>
                      </button>

                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="px-4 pb-4 pt-1"
                          >
                            <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 flex flex-col gap-3 border border-gray-100 dark:border-gray-700">
                              {m.militaryStatus === 'Adido' && m.adidoTo && (
                                <>
                                  <div className="flex justify-between items-center">
                                    <div className="flex flex-col gap-0.5">
                                      <span className="text-[10px] font-bold text-gray-400 uppercase">Destino / Adido a</span>
                                      <span className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-1">
                                        <span className="material-symbols-outlined text-[16px] text-amber-500">domain</span>
                                        {m.adidoTo}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="h-px w-full bg-gray-200 dark:bg-gray-700"></div>
                                </>
                              )}

                              <div className="flex justify-between items-center">
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-[10px] font-bold text-gray-400 uppercase">Início do Afastamento</span>
                                  <span className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-1">
                                    <span className="material-symbols-outlined text-[16px] text-red-500">event_busy</span>
                                    {m.statusStartDate ? fmtDate(m.statusStartDate) : 'Não informado'}
                                  </span>
                                </div>
                              </div>
                              
                              <div className="h-px w-full bg-gray-200 dark:bg-gray-700"></div>

                              <div className="flex justify-between items-center">
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-[10px] font-bold text-gray-400 uppercase">Retorno Previsto (Disponível)</span>
                                  <span className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-1">
                                    <span className="material-symbols-outlined text-[16px] text-green-500">event_available</span>
                                    {getReturnDate(m.statusEndDate, m.statusIndefinite)}
                                  </span>
                                </div>
                              </div>

                              <div className="mt-2 flex justify-end">
                                <Link href={`/admin/musicians/${m.id}/edit`}>
                                  <button className="text-xs font-bold text-primary hover:underline flex items-center gap-1">
                                    <span className="material-symbols-outlined text-[14px]">edit</span>
                                    Editar Perfil
                                  </button>
                                </Link>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            // ═════════════════════════════════════════════════════════════════
            // ABA: ANTERIORES (HISTÓRICO)
            // ═════════════════════════════════════════════════════════════════
            pastMusicians.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400 text-center">
                <span className="material-symbols-outlined text-[48px] mb-2 text-gray-400">history</span>
                <p className="text-sm">Nenhum histórico de afastamento encontrado.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {pastMusicians.map(group => {
                  const m = group.user;
                  const isExpanded = expandedId === m.id;
                  return (
                    <div key={m.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden transition-all">
                      <button 
                        onClick={() => toggleExpand(m.id)}
                        className="w-full p-4 flex items-center justify-between text-left focus:outline-none"
                      >
                        <div className="flex items-center gap-3">
                          <div className="size-10 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 flex items-center justify-center font-bold text-sm shrink-0">
                            {m.war_name?.[0] || m.name?.[0] || '?'}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-gray-900 dark:text-white">{m.rank} {m.war_name || m.name}</p>
                            <p className="text-xs font-bold text-gray-500">{group.leaves.length} afastamento(s) anterior(es)</p>
                          </div>
                        </div>
                        <span className={`material-symbols-outlined text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                          expand_more
                        </span>
                      </button>

                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="px-4 pb-4 pt-1"
                          >
                            <div className="flex flex-col gap-3">
                              {group.leaves.map((leave: any, idx: number) => (
                                <div key={idx} className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 flex flex-col gap-2 border border-gray-100 dark:border-gray-700">
                                  <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-[16px] text-gray-400">history</span>
                                    <span className="text-sm font-bold text-gray-900 dark:text-white uppercase">{leave.status}</span>
                                    {leave.status === 'Adido' && leave.adidoTo && (
                                      <span className="text-xs font-normal text-amber-600 dark:text-amber-400">
                                        ({leave.adidoTo})
                                      </span>
                                    )}
                                  </div>
                                  <div className="grid grid-cols-2 gap-2 mt-1">
                                    <div className="flex flex-col">
                                      <span className="text-[10px] font-bold text-gray-400 uppercase">Início</span>
                                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                                        {leave.startDate ? fmtDate(leave.startDate) : 'N/A'}
                                      </span>
                                    </div>
                                    <div className="flex flex-col">
                                      <span className="text-[10px] font-bold text-gray-400 uppercase">Fim</span>
                                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                                        {leave.statusIndefinite ? 'Tempo Indeterminado' : (leave.endDate ? fmtDate(leave.endDate) : 'N/A')}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </main>
      </div>
    </div>
  );
}

export default function UnavailableMusiciansPage() {
  return (
    <Suspense fallback={
      <div className="bg-background-light dark:bg-background-dark min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary"></div>
      </div>
    }>
      <UnavailableMusiciansContent />
    </Suspense>
  );
}
