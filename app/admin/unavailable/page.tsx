'use client';

import Link from 'next/link';
import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect } from 'react';
import { collection, query, getDocs, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { fmtDate } from '@/lib/format-date';

export default function UnavailableMusiciansPage() {
  const [currentMusicians, setCurrentMusicians] = useState<any[]>([]);
  const [pastMusicians, setPastMusicians] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'current' | 'past'>('current');
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const fetchUnavailable = async () => {
      try {
        const q = query(collection(db, 'profiles'), orderBy('name', 'asc'));
        const snap = await getDocs(q);
        const docs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
        
        // Filtrar todos que não estão 'Ativo'
        const unavailable = docs.filter((p: any) => p.militaryStatus && p.militaryStatus !== 'Ativo');

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const current: any[] = [];
        const past: any[] = [];

        unavailable.forEach((p: any) => {
          let isPast = false;
          if (p.statusEndDate) {
            const end = new Date(p.statusEndDate + 'T23:59:59');
            if (today > end) {
              isPast = true;
            }
          }
          
          if (isPast) {
            past.push(p);
          } else {
            current.push(p);
          }
        });

        setCurrentMusicians(current);
        setPastMusicians(past);
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

  const getReturnDate = (endDateStr: string) => {
    if (!endDateStr) return 'Não definida';
    const date = new Date(endDateStr + 'T12:00:00');
    date.setDate(date.getDate() + 1); // Disponível no dia seguinte ao término
    return date.toLocaleDateString('pt-BR');
  };

  return (
    <div className="bg-background-light dark:bg-background-dark font-sans min-h-screen flex flex-col items-center">
      <div className="relative w-full max-w-md bg-background-light dark:bg-background-dark flex flex-col h-full min-h-screen shadow-2xl">
        <header className="sticky top-0 z-10 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md px-4 py-3 flex items-center justify-between border-b border-gray-200 dark:border-gray-800">
          <Link href="/admin/swaps">
            <button className="flex items-center justify-center p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors text-gray-900 dark:text-white">
              <span className="material-symbols-outlined">arrow_back_ios_new</span>
            </button>
          </Link>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white flex-1 text-center pr-10">Afastamentos</h1>
        </header>

        <main className="flex-1 p-4 flex flex-col gap-4 pb-24">
          <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-xl mb-2">
            <button
              onClick={() => setActiveTab('current')}
              className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${
                activeTab === 'current'
                  ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Afastados
            </button>
            <button
              onClick={() => setActiveTab('past')}
              className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${
                activeTab === 'past'
                  ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Anteriores
            </button>
          </div>

          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              {activeTab === 'current' ? 'Efetivo Indisponível' : 'Afastamentos Anteriores'}
            </h2>
            <span className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-xs font-bold px-2 py-1 rounded-full">
              {activeTab === 'current' ? currentMusicians.length : pastMusicians.length} militares
            </span>
          </div>

          {loading ? (
            <div className="flex justify-center py-10">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
            </div>
          ) : (activeTab === 'current' ? currentMusicians : pastMusicians).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400 text-center">
              <span className="material-symbols-outlined text-[48px] mb-2">check_circle</span>
              <p className="text-sm">
                {activeTab === 'current' 
                  ? 'Todo o efetivo está disponível e Ativo.' 
                  : 'Nenhum histórico de afastamento encontrado.'}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {(activeTab === 'current' ? currentMusicians : pastMusicians).map(m => {
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
                          <p className="text-xs font-bold text-red-500 uppercase tracking-wide">{m.militaryStatus}</p>
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
                                  {getReturnDate(m.statusEndDate)}
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
          )}
        </main>
      </div>
    </div>
  );
}
