'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, addDoc, serverTimestamp, query, orderBy, limit, getDocs, writeBatch, doc, getDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { isMusicianAvailable } from '@/lib/military-status';
import { sortByRankThenName } from '@/lib/sort-military';



export default function AdminNewScalePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentScales, setRecentScales] = useState<any[]>([]);
  const [musicians, setMusicians] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    title: '',
    date: '',
    departureTime: '',
    startTime: '',
    endTime: '',
    returnTime: '',
    location: '',
    uniform: 'Especial A1-A / A1-B',
    customUniform: '',
    format: 'Ensaio',
    customFormat: ''
  });

  const [selectedMusicians, setSelectedMusicians] = useState<string[]>([]);
  // null = nenhum selecionado; string = ID do músico chefe
  const [serviceChief, setServiceChief] = useState<string>('');

  // Expediente Administrativo
  const [expediente, setExpediente] = useState({
    referencia: '',
    regenteMaestro: '',
    arquivo: '',
    sargenteacao: '',
    p4FinancasTransporte: '',
    administrativo: [] as string[],
    obra: [] as string[],
    permanencia: [] as string[],
  });

  const toggleMulti = (field: 'administrativo' | 'permanencia' | 'obra', id: string) => {
    setExpediente(prev => ({
      ...prev,
      [field]: prev[field].includes(id)
        ? prev[field].filter((x: string) => x !== id)
        : [...prev[field], id]
    }));
  };

  const getMusicianLabel = (id: string) => {
    const m = musicians.find(x => x.id === id);
    if (!m) return id;
    return m.war_name ? `${m.rank || ''} ${m.war_name}`.trim() : m.name || id;
  };

  // Conjunto de todas as funções de Comando/Administração
  const ADMIN_INSTRUMENTS = [
    'comandante da banda de música',
    'subcomandante da banda de música',
    'aux. p1/sargenteante',
    'auxiliar p/3',
    'auxiliar p/4',
    'auxiliar p/5',
    'administrativo',
    'comando',
    'regente',
  ];

  const isAdminFunction = (m: any) =>
    ADMIN_INSTRUMENTS.includes((m.instrument || '').toLowerCase());

  useEffect(() => {
    const fetchRecentScales = async () => {
      try {
        const q = query(collection(db, "scales"), orderBy("createdAt", "desc"), limit(5));
        const querySnapshot = await getDocs(q);
        const scales = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setRecentScales(scales);
      } catch (err) {
        console.error("Erro ao buscar escalas recentes:", err);
      }
    };
    fetchRecentScales();

    const fetchMusicians = async () => {
      try {
        const q = query(collection(db, "profiles"), orderBy("name", "asc"));
        const querySnapshot = await getDocs(q);
        const docs = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })).sort(sortByRankThenName);
        setMusicians(docs);
      } catch (err) {
        console.error("Erro ao buscar músicos:", err);
      }
    };
    fetchMusicians();
  }, []);

  const applySuggestion = (musicians: any[]) => {
    if (!musicians) return;
    const ids = musicians.map(m => m.id);
    
    // Verifica se todos os IDs sugeridos já estão na seleção atual (e apenas eles)
    const isAlreadyApplied = ids.length === selectedMusicians.length && 
                             ids.every(id => selectedMusicians.includes(id));

    if (isAlreadyApplied) {
      setSelectedMusicians([]);
    } else {
      setSelectedMusicians(ids);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleMusicianToggle = (id: string) => {
    const musician = musicians.find(m => m.id === id);
    if (musician && !isMusicianAvailable(musician, formData.date)) {
      return; // Não permite selecionar se estiver afastado
    }
    if (id === serviceChief) {
      return; // Não permite selecionar o chefe como efetivo
    }
    setSelectedMusicians(prev =>
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    );
  };

  const handleCreateScale = async () => {
    const isReducedFormat = formData.format === 'Ensaio' || formData.format === 'Expediente Administrativo';
    if (!formData.title || !formData.date || (!isReducedFormat && !formData.departureTime) || (isReducedFormat && !formData.startTime)) {
      setError(isReducedFormat ? "Preencha ao menos o Nome, Data e Início Previsto." : "Preencha ao menos o Nome, Data e Horário de Saída.");
      return;
    }
    
    setLoading(true);
    setError(null);
    try {
      const musiciansData = musicians.filter(m => selectedMusicians.includes(m.id));
      const finalUniform = formData.uniform === 'Outros' ? formData.customUniform : formData.uniform;
      const finalFormat = formData.format === 'Outros' ? formData.customFormat : formData.format;

      // Chefe do serviço (objeto com dados ou null)
      const chiefData = serviceChief
        ? musicians.find(m => m.id === serviceChief) || null
        : null;

      const scaleRef = await addDoc(collection(db, "scales"), {
        ...formData,
        uniform: finalUniform,
        format: finalFormat,
        musicians: musiciansData,
        serviceChief: chiefData
          ? { id: chiefData.id, name: chiefData.name, war_name: chiefData.war_name || '', rank: chiefData.rank || '' }
          : null,
        expediente: {
          referencia: expediente.referencia,
          regenteMaestro: expediente.regenteMaestro
            ? getMusicianLabel(expediente.regenteMaestro)
            : '',
          regenteMaestroId: expediente.regenteMaestro || null,
          arquivo: expediente.arquivo
            ? getMusicianLabel(expediente.arquivo)
            : '',
          arquivoId: expediente.arquivo || null,
          sargenteacao: expediente.sargenteacao
            ? getMusicianLabel(expediente.sargenteacao)
            : '',
          sargenteacaoId: expediente.sargenteacao || null,
          p4FinancasTransporte: expediente.p4FinancasTransporte
            ? getMusicianLabel(expediente.p4FinancasTransporte)
            : '',
          p4FinancasTransporteId: expediente.p4FinancasTransporte || null,
          administrativo: expediente.administrativo.map(id => ({
            id,
            label: getMusicianLabel(id)
          })),
          obra: expediente.obra.map(id => ({
            id,
            label: getMusicianLabel(id)
          })),
          permanencia: expediente.permanencia.map(id => ({
            id,
            label: getMusicianLabel(id)
          }))
        },
        status: 'published',
        createdAt: serverTimestamp()
      });

      // Disparar notificações para cada músico escalado
      if (musiciansData.length > 0) {
        const batch = writeBatch(db);
        musiciansData.forEach((musician: any) => {
          const notifRef = doc(collection(db, 'notifications'));
          batch.set(notifRef, {
            userId: musician.id,
            scaleId: scaleRef.id,
            scaleTitle: (finalFormat === 'Ensaio' || finalFormat === 'Expediente Administrativo') ? `${finalFormat} — ${formData.title}` : formData.title,
            scaleDate: formData.date,
            read: false,
            confirmedAt: null,
            createdAt: serverTimestamp()
          });
        });
        await batch.commit();

        // Disparar Notificações Push Reais (Mobile)
        try {
          const userIds = musiciansData.map(m => m.id);
          const notificationTitle = 'Banda de Música PMPR';
          const notificationBody = `Você tem uma nova escala: ${formData.title}`;
          
          fetch('/api/notifications/push', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userIds,
              title: notificationTitle,
              body: notificationBody,
              scaleId: scaleRef.id
            })
          }).catch(err => console.error('Erro assíncrono ao enviar push:', err));

        } catch (pushErr) {
          console.error("Erro ao preparar envio de notificações push:", pushErr);
        }
      }

      // Registro de Auditoria
      try {
        const currentUser = auth.currentUser;
        if (currentUser) {
          const adminSnap = await getDoc(doc(db, 'profiles', currentUser.uid));
          const adminData = adminSnap.data();
          const adminName = adminData?.war_name || adminData?.name || currentUser.email || 'Admin';

          await addDoc(collection(db, "audit_logs"), {
            userId: currentUser.uid,
            userName: adminName,
            action: 'create',
            entityId: scaleRef.id,
            entityTitle: formData.title,
            timestamp: serverTimestamp()
          });
        }
      } catch (auditErr) {
        console.error("Erro ao registrar log de auditoria:", auditErr);
      }

      setSuccess(true);
      setTimeout(() => {
        router.push('/dashboard');
      }, 2000);
    } catch (err: any) {
      console.error(err);
      setError("Erro ao publicar a Escala. Tente novamente.");
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="bg-background-light dark:bg-background-dark font-sans min-h-screen flex flex-col items-center justify-center">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center justify-center p-6 text-center max-w-md">
          <div className="size-24 bg-green-100 dark:bg-green-900/30 text-green-500 rounded-full flex items-center justify-center mb-6 ring-8 ring-green-50 dark:ring-green-900/10">
            <span className="material-symbols-outlined text-[48px]">check_circle</span>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">Escala Publicada!</h2>
          <p className="text-gray-500 dark:text-gray-400 leading-relaxed mb-10">
            A escala <strong className="text-gray-700 dark:text-gray-300">{formData.title}</strong> foi salva no sistema com sucesso. Os músicos serão notificados em breve.
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="bg-background-light dark:bg-background-dark font-sans min-h-screen flex flex-col items-center">
      <div className="relative w-full max-w-md bg-background-light dark:bg-background-dark flex flex-col h-full min-h-screen shadow-2xl">
        <header className="sticky top-0 z-20 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md px-4 py-3 flex items-center justify-between border-b border-gray-200 dark:border-gray-800">
          <Link href="/admin/swaps">
            <button className="flex items-center justify-center p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors text-gray-900 dark:text-white">
              <span className="material-symbols-outlined">close</span>
            </button>
          </Link>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white flex-1 text-center pr-10">Nova Escala</h1>
        </header>

        <main className="flex-1 p-6 flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Criar Escala de Serviço</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">Defina detalhadamente a grade de horários e convoque o efetivo.</p>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-xl border border-red-100 text-sm font-semibold">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-5">
            {/* Bloco 2: Estrutura de Horários */}
            <div className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-100 dark:border-gray-800 flex flex-col gap-4 shadow-sm">
              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Cronograma</h3>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Data</span>
                <input 
                  name="date" type="date" value={formData.date} onChange={handleChange}
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-3 text-sm focus:ring-2 focus:ring-primary outline-none transition-all" 
                />
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Formato</span>
                <div className="relative">
                  <select 
                    name="format" value={formData.format} onChange={handleChange}
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-3 text-sm focus:ring-2 focus:ring-primary outline-none appearance-none transition-all"
                  >
                    <option>Ensaio</option>
                    <option>Expediente Administrativo</option>
                    <option>Apresentação local fechado</option>
                    <option>Apresentação local aberto</option>
                    <option>Formatura Militar</option>
                    <option>Outros</option>
                  </select>
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-400">
                    <span className="material-symbols-outlined text-[20px]">expand_more</span>
                  </div>
                </div>
              </label>

              {formData.format === 'Outros' && (
                <motion.label initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-2">
                  <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Descreva o Formato</span>
                  <input 
                    name="customFormat" value={formData.customFormat} onChange={handleChange}
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-3 text-sm focus:ring-2 focus:ring-primary outline-none transition-all" 
                    placeholder="Ex: Formatura Extraordinária"
                  />
                </motion.label>
              )}
              
              <div className="grid grid-cols-2 gap-4">
                {formData.format !== 'Ensaio' && formData.format !== 'Expediente Administrativo' && (
                  <motion.label initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex flex-col gap-2">
                    <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Saída da BM</span>
                    <input 
                      name="departureTime" type="time" value={formData.departureTime} onChange={handleChange}
                      className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-amber-50 dark:bg-amber-900/10 px-3 py-3 text-sm focus:ring-2 focus:ring-primary outline-none transition-all" 
                    />
                  </motion.label>
                )}
                <label className={`flex flex-col gap-2 ${(formData.format === 'Ensaio' || formData.format === 'Expediente Administrativo') ? 'col-span-2' : ''}`}>
                  <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Início Previsto</span>
                  <input 
                    name="startTime" type="time" value={formData.startTime} onChange={handleChange}
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-3 text-sm focus:ring-2 focus:ring-primary outline-none transition-all" 
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Término Previsto</span>
                  <input 
                    name="endTime" type="time" value={formData.endTime} onChange={handleChange}
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-3 text-sm focus:ring-2 focus:ring-primary outline-none transition-all" 
                  />
                </label>
                {formData.format !== 'Ensaio' && formData.format !== 'Expediente Administrativo' && (
                  <motion.label initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="flex flex-col gap-2">
                    <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Retorno Previsto</span>
                    <input 
                      name="returnTime" type="time" value={formData.returnTime} onChange={handleChange}
                      className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-blue-50 dark:bg-blue-900/10 px-3 py-3 text-sm focus:ring-2 focus:ring-primary outline-none transition-all" 
                    />
                  </motion.label>
                )}
              </div>
            </div>

            {/* Bloco 0: Expediente Administrativo */}
            <div className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-blue-100 dark:border-blue-900/30 flex flex-col gap-4 shadow-sm">

              {/* Referência */}
              <label className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Referência</span>
                  <button 
                    type="button"
                    onClick={() => setExpediente(prev => ({ ...prev, referencia: 'Determinação do Sr. Maestro Chefe da Banda de Música.' }))}
                    className="text-[10px] font-bold text-primary bg-primary/5 hover:bg-primary/10 px-2 py-1 rounded-lg transition-colors"
                  >
                    Usar padrão do Maestro
                  </button>
                </div>
                <input
                  type="text"
                  value={expediente.referencia}
                  onChange={e => setExpediente(prev => ({ ...prev, referencia: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-3 text-sm focus:ring-2 focus:ring-primary outline-none transition-all"
                  placeholder="Ex: Of. nº 123/2026 - CBPMPR"
                />
              </label>

              {/* Regente / Maestro — Comando ou Regente */}
              {(() => {
                const opts = musicians.filter(isAdminFunction);
                return (
                  <label className="flex flex-col gap-2">
                    <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Regente / Maestro</span>
                    <div className="relative">
                      <select
                        value={expediente.regenteMaestro}
                        onChange={e => {
                          const m = musicians.find(x => x.id === e.target.value);
                          if (m && !isMusicianAvailable(m, formData.date)) return;
                          setExpediente(prev => ({ ...prev, regenteMaestro: e.target.value }));
                        }}
                        className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-3 text-sm focus:ring-2 focus:ring-primary outline-none appearance-none transition-all"
                      >
                        <option value="">— Selecione —</option>
                        {opts.map(m => {
                          const available = isMusicianAvailable(m, formData.date);
                          const label = m.war_name ? `${m.rank || ''} ${m.war_name}`.trim() : m.name;
                          return (
                            <option key={m.id} value={m.id} disabled={!available}>
                              {available ? label : `🔒 ${label} [${m.militaryStatus}]`}
                            </option>
                          );
                        })}
                      </select>
                      <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-400">
                        <span className="material-symbols-outlined">expand_more</span>
                      </div>
                    </div>
                  </label>
                );
              })()}

              {/* Arquivo — Administrativo */}
              {(() => {
                const opts = musicians.filter(isAdminFunction);
                return (
                  <label className="flex flex-col gap-2">
                    <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Arquivo</span>
                    <div className="relative">
                      <select
                        value={expediente.arquivo}
                        onChange={e => {
                          const m = musicians.find(x => x.id === e.target.value);
                          if (m && !isMusicianAvailable(m, formData.date)) return;
                          setExpediente(prev => ({ ...prev, arquivo: e.target.value }));
                        }}
                        className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-3 text-sm focus:ring-2 focus:ring-primary outline-none appearance-none transition-all"
                      >
                        <option value="">— Selecione —</option>
                        {opts.map(m => {
                          const available = isMusicianAvailable(m, formData.date);
                          const label = m.war_name ? `${m.rank || ''} ${m.war_name}`.trim() : m.name;
                          return (
                            <option key={m.id} value={m.id} disabled={!available}>
                              {available ? label : `🔒 ${label} [${m.militaryStatus}]`}
                            </option>
                          );
                        })}
                      </select>
                      <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-400">
                        <span className="material-symbols-outlined">expand_more</span>
                      </div>
                    </div>
                  </label>
                );
              })()}

              {/* Sargenteação — Administrativo */}
              {(() => {
                const opts = musicians.filter(isAdminFunction);
                return (
                  <label className="flex flex-col gap-2">
                    <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Sargenteação</span>
                    <div className="relative">
                      <select
                        value={expediente.sargenteacao}
                        onChange={e => {
                          const m = musicians.find(x => x.id === e.target.value);
                          if (m && !isMusicianAvailable(m, formData.date)) return;
                          setExpediente(prev => ({ ...prev, sargenteacao: e.target.value }));
                        }}
                        className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-3 text-sm focus:ring-2 focus:ring-primary outline-none appearance-none transition-all"
                      >
                        <option value="">— Selecione —</option>
                        {opts.map(m => {
                          const available = isMusicianAvailable(m, formData.date);
                          const label = m.war_name ? `${m.rank || ''} ${m.war_name}`.trim() : m.name;
                          return (
                            <option key={m.id} value={m.id} disabled={!available}>
                              {available ? label : `🔒 ${label} [${m.militaryStatus}]`}
                            </option>
                          );
                        })}
                      </select>
                      <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-400">
                        <span className="material-symbols-outlined">expand_more</span>
                      </div>
                    </div>
                  </label>
                );
              })()}

              {/* P4 / Finanças / Transporte — Administrativo */}
              {(() => {
                const opts = musicians.filter(isAdminFunction);
                return (
                  <label className="flex flex-col gap-2">
                    <span className="text-sm font-bold text-gray-700 dark:text-gray-300">P4 / Finanças / Transporte</span>
                    <div className="relative">
                      <select
                        value={expediente.p4FinancasTransporte}
                        onChange={e => {
                          const m = musicians.find(x => x.id === e.target.value);
                          if (m && !isMusicianAvailable(m, formData.date)) return;
                          setExpediente(prev => ({ ...prev, p4FinancasTransporte: e.target.value }));
                        }}
                        className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-3 text-sm focus:ring-2 focus:ring-primary outline-none appearance-none transition-all"
                      >
                        <option value="">— Selecione —</option>
                        {opts.map(m => {
                          const available = isMusicianAvailable(m, formData.date);
                          const label = m.war_name ? `${m.rank || ''} ${m.war_name}`.trim() : m.name;
                          return (
                            <option key={m.id} value={m.id} disabled={!available}>
                              {available ? label : `🔒 ${label} [${m.militaryStatus}]`}
                            </option>
                          );
                        })}
                      </select>
                      <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-400">
                        <span className="material-symbols-outlined">expand_more</span>
                      </div>
                    </div>
                  </label>
                );
              })()}

              {/* Administrativo — Todos, múltipla seleção */}
              <div className="flex flex-col gap-2">
                <span className="text-sm font-bold text-gray-700 dark:text-gray-300">
                  Administrativo
                  {expediente.administrativo.length > 0 && (
                    <span className="ml-2 text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">{expediente.administrativo.length} sel.</span>
                  )}
                </span>
                {expediente.administrativo.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-1">
                    {expediente.administrativo.map(id => (
                      <span key={id} className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary border border-primary/20 rounded-full px-2.5 py-0.5 font-medium">
                        {getMusicianLabel(id)}
                        <button type="button" onClick={() => toggleMulti('administrativo', id)} className="ml-0.5 hover:text-red-500 transition-colors">
                          <span className="material-symbols-outlined text-[12px]">close</span>
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 max-h-[160px] overflow-y-auto no-scrollbar divide-y divide-gray-100 dark:divide-gray-700">
                  {musicians.map(m => {
                    const available = isMusicianAvailable(m, formData.date);
                    const label = m.war_name ? `${m.rank || ''} ${m.war_name}`.trim() : m.name;
                    const checked = expediente.administrativo.includes(m.id);
                    return (
                      <label key={m.id} className={`flex items-center gap-3 px-3 py-2.5 transition-colors ${
                        !available ? 'opacity-50 cursor-not-allowed bg-gray-100 dark:bg-gray-800/40' :
                        checked ? 'bg-primary/5 cursor-pointer' : 'hover:bg-gray-100 dark:hover:bg-gray-700/50 cursor-pointer'
                      }`}>
                        <input type="checkbox" checked={checked} disabled={!available} onChange={() => { if (available) toggleMulti('administrativo', m.id); }} className="size-4 rounded border-gray-300 text-primary focus:ring-primary disabled:opacity-50" />
                        <span className={`text-sm font-medium ${checked ? 'text-primary' : 'text-gray-900 dark:text-white'}`}>{label}</span>
                        {!available && (
                          <span className="text-[8px] font-black bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400 px-1.5 py-0.5 rounded uppercase tracking-tighter">
                            {m.militaryStatus}
                          </span>
                        )}
                        <span className="ml-auto text-[10px] text-gray-400 uppercase">{m.instrument}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Obra — Todos, múltipla seleção */}
              <div className="flex flex-col gap-2">
                <span className="text-sm font-bold text-gray-700 dark:text-gray-300">
                  Obra
                  {expediente.obra.length > 0 && (
                    <span className="ml-2 text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">{expediente.obra.length} sel.</span>
                  )}
                </span>
                {expediente.obra.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-1">
                    {expediente.obra.map(id => (
                      <span key={id} className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary border border-primary/20 rounded-full px-2.5 py-0.5 font-medium">
                        {getMusicianLabel(id)}
                        <button type="button" onClick={() => toggleMulti('obra', id)} className="ml-0.5 hover:text-red-500 transition-colors">
                          <span className="material-symbols-outlined text-[12px]">close</span>
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 max-h-[160px] overflow-y-auto no-scrollbar divide-y divide-gray-100 dark:divide-gray-700">
                  {musicians.map(m => {
                    const available = isMusicianAvailable(m, formData.date);
                    const label = m.war_name ? `${m.rank || ''} ${m.war_name}`.trim() : m.name;
                    const checked = expediente.obra.includes(m.id);
                    return (
                      <label key={m.id} className={`flex items-center gap-3 px-3 py-2.5 transition-colors ${
                        !available ? 'opacity-50 cursor-not-allowed bg-gray-100 dark:bg-gray-800/40' :
                        checked ? 'bg-primary/5 cursor-pointer' : 'hover:bg-gray-100 dark:hover:bg-gray-700/50 cursor-pointer'
                      }`}>
                        <input type="checkbox" checked={checked} disabled={!available} onChange={() => { if (available) toggleMulti('obra', m.id); }} className="size-4 rounded border-gray-300 text-primary focus:ring-primary disabled:opacity-50" />
                        <span className={`text-sm font-medium ${checked ? 'text-primary' : 'text-gray-900 dark:text-white'}`}>{label}</span>
                        {!available && (
                          <span className="text-[8px] font-black bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400 px-1.5 py-0.5 rounded uppercase tracking-tighter">
                            {m.militaryStatus}
                          </span>
                        )}
                        <span className="ml-auto text-[10px] text-gray-400 uppercase">{m.instrument}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Permanência — Todos, múltipla seleção */}
              <div className="flex flex-col gap-2">
                <span className="text-sm font-bold text-gray-700 dark:text-gray-300">
                  Permanência
                  {expediente.permanencia.length > 0 && (
                    <span className="ml-2 text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">{expediente.permanencia.length} sel.</span>
                  )}
                </span>
                {expediente.permanencia.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-1">
                    {expediente.permanencia.map(id => (
                      <span key={id} className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary border border-primary/20 rounded-full px-2.5 py-0.5 font-medium">
                        {getMusicianLabel(id)}
                        <button type="button" onClick={() => toggleMulti('permanencia', id)} className="ml-0.5 hover:text-red-500 transition-colors">
                          <span className="material-symbols-outlined text-[12px]">close</span>
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 max-h-[160px] overflow-y-auto no-scrollbar divide-y divide-gray-100 dark:divide-gray-700">
                  {musicians.map(m => {
                    const available = isMusicianAvailable(m, formData.date);
                    const label = m.war_name ? `${m.rank || ''} ${m.war_name}`.trim() : m.name;
                    const checked = expediente.permanencia.includes(m.id);
                    return (
                      <label key={m.id} className={`flex items-center gap-3 px-3 py-2.5 transition-colors ${
                        !available ? 'opacity-50 cursor-not-allowed bg-gray-100 dark:bg-gray-800/40' :
                        checked ? 'bg-primary/5 cursor-pointer' : 'hover:bg-gray-100 dark:hover:bg-gray-700/50 cursor-pointer'
                      }`}>
                        <input type="checkbox" checked={checked} disabled={!available} onChange={() => { if (available) toggleMulti('permanencia', m.id); }} className="size-4 rounded border-gray-300 text-primary focus:ring-primary disabled:opacity-50" />
                        <span className={`text-sm font-medium ${checked ? 'text-primary' : 'text-gray-900 dark:text-white'}`}>{label}</span>
                        {!available && (
                          <span className="text-[8px] font-black bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400 px-1.5 py-0.5 rounded uppercase tracking-tighter">
                            {m.militaryStatus}
                          </span>
                        )}
                        <span className="ml-auto text-[10px] text-gray-400 uppercase">{m.instrument}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Bloco 1: Informações Gerais */}
            <div className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-100 dark:border-gray-800 flex flex-col gap-4 shadow-sm">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Nome do Evento</span>

                <input 
                  name="title" value={formData.title} onChange={handleChange}
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-3 text-sm focus:ring-2 focus:ring-primary outline-none transition-all" 
                  placeholder="Ex: Formatura de Oficiais"
                />
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Local do Evento</span>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                    <span className="material-symbols-outlined text-[20px]">location_on</span>
                  </div>
                  <input 
                    name="location" value={formData.location} onChange={handleChange}
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 pl-10 pr-4 py-3 text-sm focus:ring-2 focus:ring-primary outline-none transition-all" 
                    placeholder="Ex: Quartel do Comando Geral"
                  />
                </div>
              </label>
              
              <label className="flex flex-col gap-2">
                <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Uniforme Exigido</span>
                <div className="relative">
                  <select 
                    name="uniform" value={formData.uniform} onChange={handleChange}
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-3 text-sm focus:ring-2 focus:ring-primary outline-none appearance-none transition-all"
                  >
                    <option>Especial A1-A / A1-B</option>
                    <option>Outros</option>
                  </select>
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-400">
                    <span className="material-symbols-outlined">expand_more</span>
                  </div>
                </div>
              </label>

              {formData.uniform === 'Outros' && (
                <motion.label initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-2">
                  <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Descreva o Uniforme</span>
                  <input 
                    name="customUniform" value={formData.customUniform} onChange={handleChange}
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-3 text-sm focus:ring-2 focus:ring-primary outline-none transition-all" 
                    placeholder="Ex: Abrigo de representação"
                  />
                </motion.label>
              )}
            </div>


            {/* Bloco 3: Chefe do Serviço */}
            <div className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-100 dark:border-gray-800 flex flex-col gap-3 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-amber-500">military_tech</span>
                <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Chefe do Serviço</span>
              </div>
              <div className="relative">
                <select
                  value={serviceChief}
                  onChange={(e) => {
                    const newChiefId = e.target.value;
                    setServiceChief(newChiefId);
                    // Remove o novo chefe do efetivo se estiver lá
                    if (newChiefId) {
                      setSelectedMusicians(prev => prev.filter(id => id !== newChiefId));
                    }
                  }}
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-3 text-sm focus:ring-2 focus:ring-primary outline-none appearance-none transition-all text-gray-900 dark:text-white"
                >
                  <option value="">— Selecione o Chefe do Serviço —</option>
                  {musicians
                    .filter(m => isMusicianAvailable(m, formData.date))
                    .map((m: any) => {
                      const label = m.war_name
                        ? `${m.rank || ''} ${m.war_name}`.trim()
                        : m.name || 'Sem nome';
                      return (
                        <option key={m.id} value={m.id}>
                          {label}{m.instrument ? ` — ${m.instrument}` : ''}
                        </option>
                      );
                    })
                  }
                </select>
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-400">
                  <span className="material-symbols-outlined">expand_more</span>
                </div>
              </div>
              {serviceChief && (() => {
                const chief = musicians.find(m => m.id === serviceChief);
                if (!chief) return null;
                const chiefName = chief.war_name
                  ? `${chief.rank || ''} ${chief.war_name}`.trim()
                  : chief.name;
                return (
                  <div className="flex items-center gap-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 rounded-xl p-3">
                    <div className="size-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center font-black text-amber-700 dark:text-amber-400 text-sm shrink-0">
                      {(chief.war_name || chief.name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{chiefName}</p>
                      <p className="text-[10px] text-gray-500 uppercase tracking-wide">{chief.instrument || ''}</p>
                    </div>
                    <span className="material-symbols-outlined text-amber-500 text-[20px]">military_tech</span>
                  </div>
                );
              })()}
            </div>

            {/* Bloco 4: Músicos */}
            <div className="flex flex-col gap-3">

              {recentScales.length > 0 && (
                <div className="flex flex-col gap-2 mb-2">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1">Sugestões de Efetivo (Recentes)</span>
                  <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                    {recentScales.map((scale) => (
                      <button 
                        key={scale.id}
                        type="button"
                        onClick={() => applySuggestion(scale.musicians)}
                        className="flex-none bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-3 rounded-xl flex flex-col gap-1 hover:border-primary/40 transition-all text-left shadow-sm min-w-[140px]"
                      >
                        <span className="text-xs font-bold text-gray-900 dark:text-white line-clamp-1">{scale.title}</span>
                        <div className="flex items-center gap-1 text-[10px] text-gray-500 font-medium lowercase">
                          <span className="material-symbols-outlined text-[12px]">group</span>
                          {scale.musicians?.length || 0} músicos
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between px-1">
                <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Efetivo Escalado ({selectedMusicians.length})</span>
                <button 
                  type="button" 
                  onClick={() => setSelectedMusicians([])}
                  className="text-xs font-bold text-primary hover:underline"
                >
                  Limpar lista
                </button>
              </div>
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 divide-y divide-gray-50 dark:divide-gray-800 shadow-sm max-h-[250px] overflow-y-auto no-scrollbar">
                {musicians.map((musician: any) => {
                  // Não exibe o chefe do serviço na lista de efetivo
                  if (musician.id === serviceChief) return null;

                  const isAvailable = isMusicianAvailable(musician, formData.date);
                  const isChecked = selectedMusicians.includes(musician.id);
                  const warName = musician.war_name || musician.name || '';
                  const displayName = musician.war_name
                    ? `${musician.rank || ''} ${musician.war_name}`.trim()
                    : musician.name || 'Sem nome';
                  const avatarInitial = warName.charAt(0).toUpperCase() || '?';
                  return (
                    <label 
                      key={musician.id} 
                      className={`p-4 flex items-center gap-3 transition-colors ${
                        !isAvailable ? 'opacity-50 cursor-not-allowed bg-gray-50 dark:bg-gray-800/20' : 
                        isChecked ? 'bg-primary/5 cursor-pointer' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer'
                      }`}
                    >
                      <input 
                        type="checkbox" 
                        checked={isChecked}
                        disabled={!isAvailable}
                        onChange={() => handleMusicianToggle(musician.id)}
                        className="size-5 rounded border-gray-300 text-primary focus:ring-primary disabled:opacity-50"
                      />
                      <div className="flex-none size-10 rounded-full bg-primary/10 flex items-center justify-center font-black text-sm text-primary dark:bg-primary/20">
                        {avatarInitial}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={`text-sm font-bold truncate ${isChecked ? 'text-primary' : 'text-gray-900 dark:text-white'}`}>{displayName}</p>
                          {!isAvailable && (
                            <span className="flex-none text-[8px] font-black bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400 px-1.5 py-0.5 rounded uppercase tracking-tighter">
                              {musician.militaryStatus}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">{musician.instrument}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

          </div>
        </main>

        <footer className="sticky bottom-0 p-4 bg-white dark:bg-background-dark border-t border-gray-100 dark:border-gray-800 z-10">
          <button 
            disabled={loading}
            onClick={handleCreateScale}
            className="w-full h-14 rounded-xl bg-primary text-white font-bold shadow-lg shadow-primary/20 hover:bg-blue-700 transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-70 disabled:active:scale-100"
          >
            {loading ? (
              <span className="material-symbols-outlined animate-spin text-[24px]">progress_activity</span>
            ) : (
              <>
                Publicar Escala
                <span className="material-symbols-outlined text-[20px]">event_available</span>
              </>
            )}
          </button>
        </footer>
      </div>
    </div>
  );
}
