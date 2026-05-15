'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, addDoc, serverTimestamp, query, orderBy, limit, getDocs, writeBatch, doc, getDoc, where } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
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
  const [user, setUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // 1. Shared Date & Classification
  const [sharedDate, setSharedDate] = useState('');
  const [sharedClassification, setSharedClassification] = useState('completa');

  // 2. Expediente Administrativo (Block 1)
  const [includeExpediente, setIncludeExpediente] = useState(true);
  const [showExpediente, setShowExpediente] = useState(true);
  const [expediente, setExpediente] = useState({
    title: 'Rotina Administrativa', // Hidden but useful for doc
    referencia: '',
    regenteMaestro: '',
    regente: '',
    arquivo: '',
    sargenteacao: '',
    p4FinancasTransporte: '',
    administrativo: [] as string[],
    obra: [] as string[],
    permanencia: [] as string[],
    startTime: '',
    endTime: '',
    format: 'Expediente Administrativo'
  });

  // 3. Extra Services (Dynamic Blocks)
  const [extraServices, setExtraServices] = useState<any[]>([]);

  const addExtraService = () => {
    setExtraServices(prev => [...prev, {
      id: Math.random().toString(36).substring(2, 9),
      title: '',
      departureTime: '',
      startTime: '',
      endTime: '',
      returnTime: '',
      location: '',
      uniform: 'Especial A1-A / A1-B',
      customUniform: '',
      format: 'Formatura Militar',
      customFormat: '',
      serviceChief: '',
      repertoire: '',
      selectedMusicians: [] as string[]
    }]);
  };

  const removeExtraService = (id: string) => {
    setExtraServices(prev => prev.filter(s => s.id !== id));
  };

  const updateExtraService = (id: string, field: string, value: any) => {
    setExtraServices(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

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
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        // Verificar role do administrador
        try {
          const profileSnap = await getDoc(doc(db, 'profiles', currentUser.uid));
          if (profileSnap.exists()) {
            setUserRole(profileSnap.data().role || 'musician');
          }
        } catch (err) {
          console.error("Erro ao verificar permissões:", err);
        }
      } else {
        router.push('/login');
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    // Apenas busca dados se o usuário estiver autenticado e o papel verificado
    if (!user || !userRole) return;

    const fetchRecentScales = async () => {
      try {
        const q = query(collection(db, "scales"), orderBy("createdAt", "desc"), limit(5));
        const querySnapshot = await getDocs(q);
        const scales = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setRecentScales(scales);
      } catch (err: any) {
        console.error("Erro ao buscar escalas recentes:", err);
        // Não lançamos erro aqui para não quebrar a UI, apenas logamos
      }
    };

    const fetchMusicians = async () => {
      try {
        const q = query(collection(db, "profiles"), orderBy("name", "asc"));
        const querySnapshot = await getDocs(q);
        const docs = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })).sort(sortByRankThenName);
        setMusicians(docs);
      } catch (err: any) {
        console.error("Erro ao buscar músicos:", err);
        setError("Erro ao carregar lista de músicos. Verifique suas permissões.");
      }
    };

    fetchRecentScales();
    fetchMusicians();
  }, [user, userRole]);

  const applySuggestion = (serviceId: string, suggestedMusicians: any[]) => {
    if (!suggestedMusicians) return;
    const ids = suggestedMusicians.map(m => m.id);
    const service = extraServices.find(s => s.id === serviceId);
    if (!service) return;

    const isAlreadyApplied = ids.length === service.selectedMusicians.length && 
                             ids.every(id => service.selectedMusicians.includes(id));

    updateExtraService(serviceId, 'selectedMusicians', isAlreadyApplied ? [] : ids);
  };

  const handleMusicianToggle = (serviceId: string, musicianId: string) => {
    const musician = musicians.find(m => m.id === musicianId);
    if (musician && !isMusicianAvailable(musician, sharedDate)) return;

    const service = extraServices.find(s => s.id === serviceId);
    if (!service) return;

    if (musicianId === service.serviceChief) return;

    const newList = service.selectedMusicians.includes(musicianId)
      ? service.selectedMusicians.filter((id: string) => id !== musicianId)
      : [...service.selectedMusicians, musicianId];

    updateExtraService(serviceId, 'selectedMusicians', newList);
  };

  const handleCreateScale = async (onlyExpediente = false) => {
    if (!sharedDate) {
      setError("Selecione a data da escala.");
      return;
    }
    
    if (!onlyExpediente && !includeExpediente && extraServices.length === 0) {
      setError("Adicione ao menos um Expediente Administrativo ou um Serviço Extra.");
      return;
    }

    // Validação básica do Expediente (apenas se não for provisória)
    if (sharedClassification !== 'provisoria') {
      if (includeExpediente) {
        if (!expediente.startTime || !expediente.endTime) {
          setError("Preencha os horários do Expediente Administrativo.");
          return;
        }
      } else if (onlyExpediente) {
        setError("Você desativou a rotina administrativa.");
        return;
      }
    }

    setLoading(true);
    setError(null);

    try {
      const currentUser = user || auth.currentUser;
      let adminName = 'Admin';
      if (currentUser) {
        // Se o profile já estiver carregado no state, usamos ele pra poupar uma requisição
        const adminSnap = await getDoc(doc(db, 'profiles', currentUser.uid));
        const adminData = adminSnap.data();
        adminName = adminData?.war_name || adminData?.name || currentUser.email || 'Admin';
        
        // Verificação extra de segurança no cliente antes de tentar o write
        const role = adminData?.role || 'musician';
        const allowedRoles = ['admin', 'manager', 'master'];
        const isHeliomar = currentUser.email === 'heliomardejesus87@gmail.com';
        
        if (!isHeliomar && !allowedRoles.includes(role.toLowerCase())) {
          throw new Error("Você não tem permissão para publicar escalas. Contate o administrador master.");
        }
      } else {
        throw new Error("Usuário não autenticado. Faça login novamente.");
      }

      // 1. Montar lista de documentos a serem criados
      const docsToCreate = [];

      // Adicionamos o Expediente apenas se incluído
      if (includeExpediente) {
        docsToCreate.push({
          title: expediente.title,
          date: sharedDate,
          startTime: expediente.startTime,
          endTime: expediente.endTime,
          format: expediente.format,
          referencia: expediente.referencia,
          expediente: {
            referencia: expediente.referencia,
            regenteMaestro: expediente.regenteMaestro ? getMusicianLabel(expediente.regenteMaestro) : '',
            regenteMaestroId: expediente.regenteMaestro || null,
            regente: expediente.regente ? getMusicianLabel(expediente.regente) : '',
            regenteId: expediente.regente || null,
            arquivo: expediente.arquivo ? getMusicianLabel(expediente.arquivo) : '',
            arquivoId: expediente.arquivo || null,
            sargenteacao: expediente.sargenteacao ? getMusicianLabel(expediente.sargenteacao) : '',
            sargenteacaoId: expediente.sargenteacao || null,
            p4FinancasTransporte: expediente.p4FinancasTransporte ? getMusicianLabel(expediente.p4FinancasTransporte) : '',
            p4FinancasTransporteId: expediente.p4FinancasTransporte || null,
            administrativo: expediente.administrativo.map(id => ({ id, label: getMusicianLabel(id) })),
            obra: expediente.obra.map(id => ({ id, label: getMusicianLabel(id) })),
            permanencia: expediente.permanencia.map(id => ({ id, label: getMusicianLabel(id) }))
          },
          musicians: [], // Geralmente expediente não tem lista de músicos fixa aqui, mas as funções
          classification: sharedClassification,
          status: 'published'
        });
      }

      // Se não for "somente expediente", adicionamos os extras
      if (!onlyExpediente) {
        for (const s of extraServices) {
          if (sharedClassification !== 'provisoria') {
            if (!s.title || !s.startTime) {
              throw new Error(`Preencha o título e o início do serviço: ${s.id}`);
            }
          }
          const chiefData = s.serviceChief ? musicians.find(m => m.id === s.serviceChief) : null;
          const musiciansData = musicians.filter(m => s.selectedMusicians.includes(m.id));

          docsToCreate.push({
            title: s.title,
            date: sharedDate,
            departureTime: s.departureTime,
            startTime: s.startTime,
            endTime: s.endTime,
            returnTime: s.returnTime,
            location: s.location,
            uniform: s.uniform === 'Outros' ? s.customUniform : s.uniform,
            format: s.format === 'Outros' ? s.customFormat : s.format,
            serviceChief: chiefData ? { id: chiefData.id, name: chiefData.name, war_name: chiefData.war_name || '', rank: chiefData.rank || '' } : null,
            repertoire: s.repertoire || '',
            musicians: musiciansData,
            classification: sharedClassification,
            status: 'published'
          });
        }
      }

      // 1.5 Verificar conflitos de horário
      const schedules: { uid: string, title: string, startTime: string }[] = [];
      const existingScalesQ = query(collection(db, "scales"), where("date", "==", sharedDate));
      const existingSnap = await getDocs(existingScalesQ);
      existingSnap.forEach(doc => {
        const d = doc.data();
        const sTime = d.startTime;
        if (!sTime) return;
        const addUid = (uid: string | null | undefined) => { if (uid) schedules.push({ uid, title: d.title || d.format || 'Serviço', startTime: sTime }); };
        
        if (d.serviceChief?.id) addUid(d.serviceChief.id);
        if (d.musicians) d.musicians.forEach((m: any) => addUid(m.id));
        if (d.expediente) {
          addUid(d.expediente.regenteMaestroId);
          addUid(d.expediente.regenteId);
          addUid(d.expediente.arquivoId);
          addUid(d.expediente.sargenteacaoId);
          addUid(d.expediente.p4FinancasTransporteId);
          d.expediente.administrativo?.forEach((m: any) => addUid(m.id));
          d.expediente.obra?.forEach((m: any) => addUid(m.id));
          d.expediente.permanencia?.forEach((m: any) => addUid(m.id));
        }
      });

      const newSchedules: { uid: string, title: string, startTime: string }[] = [];
      for (const d of docsToCreate) {
        const sTime = d.startTime;
        if (!sTime) continue;
        const addUid = (uid: string | null | undefined) => { if (uid) newSchedules.push({ uid, title: d.title || d.format || 'Serviço', startTime: sTime }); };
        
        if (d.serviceChief?.id) addUid(d.serviceChief.id);
        if (d.musicians) d.musicians.forEach((m: any) => addUid(m.id));
        if (d.expediente) {
          addUid(d.expediente.regenteMaestroId);
          addUid(d.expediente.regenteId);
          addUid(d.expediente.arquivoId);
          addUid(d.expediente.sargenteacaoId);
          addUid(d.expediente.p4FinancasTransporteId);
          d.expediente.administrativo?.forEach((m: any) => addUid(m.id));
          d.expediente.obra?.forEach((m: any) => addUid(m.id));
          d.expediente.permanencia?.forEach((m: any) => addUid(m.id));
        }
      }

      const conflicts: string[] = [];
      for (const newSched of newSchedules) {
        const existingConflict = schedules.find(s => s.uid === newSched.uid && s.startTime === newSched.startTime);
        if (existingConflict) {
          const m = musicians.find(m => m.id === newSched.uid);
          const name = m ? (m.war_name || m.name) : 'Militar';
          conflicts.push(`- ${name} (em "${existingConflict.title}")`);
        } else {
          const internalConflict = newSchedules.find(s => s !== newSched && s.uid === newSched.uid && s.startTime === newSched.startTime);
          if (internalConflict) {
             const m = musicians.find(m => m.id === newSched.uid);
             const name = m ? (m.war_name || m.name) : 'Militar';
             const conflictStr = `- ${name} (em múltiplas escalas nesta tela)`;
             if (!conflicts.includes(conflictStr)) conflicts.push(conflictStr);
          }
        }
      }

      const uniqueConflicts = [...new Set(conflicts)];
      if (uniqueConflicts.length > 0) {
        const confirmMsg = `Atenção! O(s) usuário(s) já tem uma escala de serviço nessa mesma data e horário:\n\n${uniqueConflicts.join('\n')}\n\nVocê tem certeza que deseja continuar?`;
        if (!window.confirm(confirmMsg)) {
          setLoading(false);
          return;
        }
      }

      // 2. Salvar todos os documentos
      for (const d of docsToCreate) {
        const scaleRef = await addDoc(collection(db, "scales"), {
          ...d,
          createdAt: serverTimestamp()
        });

        // Notificações
        const notifyIds = new Set<string>();
        if (d.serviceChief?.id) notifyIds.add(d.serviceChief.id);
        if (d.musicians) d.musicians.forEach((m: any) => notifyIds.add(m.id));
        if (d.expediente) {
          const e = d.expediente;
          [e.regenteMaestroId, e.regenteId, e.arquivoId, e.sargenteacaoId, e.p4FinancasTransporteId].forEach(id => { if (id) notifyIds.add(id); });
          e.administrativo?.forEach((m: any) => notifyIds.add(m.id));
          e.obra?.forEach((m: any) => notifyIds.add(m.id));
          e.permanencia?.forEach((m: any) => notifyIds.add(m.id));
        }

        const uniqueIds = Array.from(notifyIds).filter(id => !!id);
        if (uniqueIds.length > 0) {
          const batch = writeBatch(db);
          uniqueIds.forEach(uid => {
            const nRef = doc(collection(db, 'notifications'));
            batch.set(nRef, {
              userId: uid,
              scaleId: scaleRef.id,
              scaleTitle: d.format === 'Expediente Administrativo' ? `${d.format}` : d.title,
              scaleDate: d.date,
              read: false,
              createdAt: serverTimestamp()
            });
          });
          await batch.commit();

          // Push Mobile
          fetch('/api/notifications/push', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userIds: uniqueIds, title: 'Banda de Música PMPR', scaleId: scaleRef.id })
          }).catch(e => console.warn("Push error", e));
        }

        // Auditoria
        if (currentUser) {
          await addDoc(collection(db, "audit_logs"), {
            userId: currentUser.uid,
            userName: adminName,
            action: 'create',
            entityId: scaleRef.id,
            entityTitle: d.title,
            timestamp: serverTimestamp()
          });
        }
      }

      setSuccess(true);
      setTimeout(() => router.push('/dashboard'), 2000);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro ao publicar. Tente novamente.");
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
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">Escalas Publicadas!</h2>
          <p className="text-gray-500 dark:text-gray-400 leading-relaxed mb-10">
            A rotina e os serviços para o dia <strong className="text-gray-700 dark:text-gray-300">{sharedDate}</strong> foram salvos com sucesso e os músicos notificados.
          </p>
        </motion.div>
      </div>
    );
  }

  if (authLoading) {
    return (
      <div className="bg-background-light dark:bg-background-dark min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="bg-background-light dark:bg-background-dark font-sans min-h-screen flex flex-col items-center">
      <div className="relative w-full max-w-md bg-background-light dark:bg-background-dark flex flex-col h-full min-h-screen shadow-2xl pb-24">
        <header className="sticky top-0 z-20 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md px-4 py-3 flex items-center justify-between border-b border-gray-200 dark:border-gray-800">
          <Link href="/admin/scales">
            <button className="flex items-center justify-center p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors text-gray-900 dark:text-white">
              <span className="material-symbols-outlined">close</span>
            </button>
          </Link>
          <div className="flex flex-col items-center flex-1">
            <h1 className="text-lg font-bold text-gray-900 dark:text-white leading-none">Nova Escala</h1>
            <span className="text-[9px] font-black text-primary uppercase tracking-widest mt-1 bg-primary/10 px-2 py-0.5 rounded-full">Multi-Escala v2</span>
          </div>
          <div className="size-10" /> {/* Spacer */}
        </header>

        <main className="flex-1 p-4 flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Criar Escala de Serviço</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">Selecione a data e organize a rotina administrativa e eventos.</p>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-xl border border-red-100 text-sm font-semibold">
              {error}
            </div>
          )}

          {/* 1. Seleção da Data e Tipo (Compartilhada) */}
          <div className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-100 dark:border-gray-800 flex flex-col gap-4 shadow-sm">
            <div className="grid grid-cols-2 gap-4">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Data Geral</span>
                <input 
                  type="date" value={sharedDate} onChange={e => setSharedDate(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-3 text-sm focus:ring-2 focus:ring-primary outline-none transition-all" 
                />
              </label>
              
              <label className="flex flex-col gap-2">
                <span className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Tipo</span>
                <div className="relative">
                  <select 
                    value={sharedClassification} 
                    onChange={e => setSharedClassification(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-3 text-sm focus:ring-2 focus:ring-primary outline-none transition-all appearance-none"
                  >
                    <option className="text-gray-900 bg-white dark:bg-gray-800 dark:text-white" value="completa">Escala Completa</option>
                    <option className="text-gray-900 bg-white dark:bg-gray-800 dark:text-white" value="provisoria">Escala Provisória</option>
                  </select>
                  <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-gray-400">
                    <span className="material-symbols-outlined text-[18px]">expand_more</span>
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* 2. Bloco: Expediente Administrativo */}
          <div className={`bg-white dark:bg-gray-900 rounded-xl border flex flex-col shadow-sm overflow-hidden transition-all ${includeExpediente ? 'border-blue-100 dark:border-blue-900/30' : 'border-gray-200 dark:border-gray-800 opacity-70'}`}>
            <div className="px-4 py-4 flex items-center justify-between w-full">
              <label className="flex items-center gap-3 cursor-pointer group">
                <div className="relative inline-flex items-center">
                  <input type="checkbox" className="sr-only peer" checked={includeExpediente} onChange={() => setIncludeExpediente(!includeExpediente)} />
                  <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                </div>
                <h3 className={`text-sm font-black uppercase tracking-widest flex items-center gap-2 ${includeExpediente ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`}>
                  <span className="material-symbols-outlined text-[18px]">rule</span>
                  Expediente Administrativo
                </h3>
              </label>
              
              <button 
                type="button"
                onClick={() => setShowExpediente(!showExpediente)}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                disabled={!includeExpediente}
              >
                <span className={`material-symbols-outlined transition-transform duration-300 ${!includeExpediente ? 'text-gray-300 dark:text-gray-600' : 'text-blue-400'} ${showExpediente && includeExpediente ? 'rotate-180' : ''}`}>expand_more</span>
              </button>
            </div>

            {showExpediente && includeExpediente && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="px-4 pb-5 flex flex-col gap-5 border-t border-blue-50 dark:border-blue-900/20 pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <label className="flex flex-col gap-2">
                    <span className="text-xs font-bold text-gray-500 uppercase">Início</span>
                    <input type="time" value={expediente.startTime} onChange={e => setExpediente(p => ({ ...p, startTime: e.target.value }))} className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2.5 text-sm outline-none" />
                  </label>
                  <label className="flex flex-col gap-2">
                    <span className="text-xs font-bold text-gray-500 uppercase">Término</span>
                    <input type="time" value={expediente.endTime} onChange={e => setExpediente(p => ({ ...p, endTime: e.target.value }))} className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2.5 text-sm outline-none" />
                  </label>
                </div>

                <label className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-gray-500 uppercase">Referência</span>
                    <button type="button" onClick={() => setExpediente(p => ({ ...p, referencia: 'Determinação do Sr. Maestro Chefe da Banda de Música.' }))} className="text-[9px] font-black text-primary uppercase">Padrão Maestro</button>
                  </div>
                  <input type="text" value={expediente.referencia} onChange={e => setExpediente(p => ({ ...p, referencia: e.target.value }))} className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2.5 text-sm outline-none" placeholder="Referência..." />
                </label>

                {/* Roles Selection */}
                {[
                  { label: 'Maestro Chefe', field: 'regenteMaestro', role: 'comandante da banda de música' },
                  { label: 'Regente', field: 'regente', role: 'subcomandante da banda de música' },
                  { label: 'Arquivo', field: 'arquivo', admin: true },
                  { label: 'Sargenteação', field: 'sargenteacao', admin: true },
                  { label: 'P4 / Finanças', field: 'p4FinancasTransporte', admin: true }
                ].map(r => (
                  <label key={r.field} className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-bold text-gray-500 uppercase">{r.label}</span>
                    <div className="relative">
                      <select 
                        value={(expediente as any)[r.field]} 
                        onChange={e => setExpediente(p => ({ ...p, [r.field]: e.target.value }))}
                        className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2.5 text-sm appearance-none outline-none"
                      >
                        <option className="text-gray-900 bg-white dark:bg-gray-800 dark:text-white" value="">— Selecione —</option>
                        {musicians.filter(m => r.role ? (m.instrument || '').toLowerCase() === r.role : isAdminFunction(m)).map(m => {
                          const available = isMusicianAvailable(m, sharedDate);
                          return <option className="text-gray-900 bg-white dark:bg-gray-800 dark:text-white" key={m.id} value={m.id} disabled={!available}>{available ? getMusicianLabel(m.id) : `🔒 ${getMusicianLabel(m.id)}`}</option>;
                        })}
                      </select>
                      <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-gray-400">
                        <span className="material-symbols-outlined text-[18px]">expand_more</span>
                      </div>
                    </div>
                  </label>
                ))}

                {/* List Selection Group */}
                {(['administrativo', 'obra', 'permanencia'] as const).map(group => (
                  <div key={group} className="flex flex-col gap-2">
                    <span className="text-[10px] font-bold text-gray-500 uppercase flex items-center justify-between">
                      {group.charAt(0).toUpperCase() + group.slice(1)}
                      <span className="text-primary">{expediente[group].length} sel.</span>
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {expediente[group].map(id => (
                        <span key={id} onClick={() => toggleMulti(group, id)} className="cursor-pointer inline-flex items-center gap-1 text-[10px] bg-primary/10 text-primary rounded-full px-2 py-0.5 font-bold">
                          {getMusicianLabel(id)}
                        </span>
                      ))}
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 max-h-[120px] overflow-y-auto no-scrollbar py-1">
                      {musicians.map(m => {
                        const available = isMusicianAvailable(m, sharedDate);
                        const checked = expediente[group].includes(m.id);
                        return (
                          <label key={m.id} className={`flex items-center gap-3 px-3 py-1.5 transition-colors cursor-pointer ${!available ? 'opacity-40' : checked ? 'bg-primary/5' : ''}`}>
                            <input type="checkbox" checked={checked} disabled={!available} onChange={() => toggleMulti(group, m.id)} className="size-3.5 rounded border-gray-300 text-primary" />
                            <span className="text-xs font-medium dark:text-white">{getMusicianLabel(m.id)}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </motion.div>
            )}

            {showExpediente && includeExpediente && (
              <div className="px-4 pb-4">
                <button 
                  type="button"
                  onClick={() => handleCreateScale(true)}
                  disabled={loading || !sharedDate}
                  className="w-full py-3 rounded-xl bg-blue-600 text-white text-xs font-black flex items-center justify-center gap-2 hover:bg-blue-700 transition-colors disabled:opacity-50 uppercase tracking-widest"
                >
                  Publicar Somente Rotina
                  <span className="material-symbols-outlined text-[16px]">send</span>
                </button>
              </div>
            )}
          </div>

          <div className="h-px bg-gray-100 dark:bg-gray-800 my-2" />

          {/* 3. Lista de Escalas Extras (Documentos Independentes) */}
          {extraServices.map((service, index) => (
            <motion.div 
              key={service.id} 
              initial={{ opacity: 0, y: 20 }} 
              animate={{ opacity: 1, y: 0 }}
              className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-100 dark:border-gray-800 flex flex-col gap-4 shadow-lg ring-1 ring-black/5"
            >
              <div className="flex items-center justify-between border-b border-gray-50 dark:border-gray-800 pb-3">
                <div className="flex items-center gap-2">
                  <div className="size-6 rounded-full bg-primary text-white flex items-center justify-center text-[10px] font-black">{index + 1}</div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-tighter">Escala de Serviço Extra</h3>
                </div>
                <button type="button" onClick={() => removeExtraService(service.id)} className="text-red-500 p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all">
                  <span className="material-symbols-outlined text-[20px]">delete</span>
                </button>
              </div>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-gray-500 uppercase">Título do Evento</span>
                <input 
                  type="text" value={service.title} onChange={e => updateExtraService(service.id, 'title', e.target.value)}
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2.5 text-sm outline-none" placeholder="Ex: Concerto de Natal" 
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold text-gray-500 uppercase">Formato</span>
                <div className="relative">
                  <select 
                    value={service.format} onChange={e => updateExtraService(service.id, 'format', e.target.value)}
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2.5 text-sm outline-none appearance-none transition-all"
                  >
                    <option>Ensaio</option>
                    <option>Expediente Administrativo</option>
                    <option>Apresentação local fechado</option>
                    <option>Apresentação local aberto</option>
                    <option>Formatura Militar</option>
                    <option>Outros</option>
                  </select>
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-400">
                    <span className="material-symbols-outlined text-[16px]">expand_more</span>
                  </div>
                </div>
              </label>

              {service.format === 'Outros' && (
                <label className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold text-gray-500 uppercase">Descreva o Formato</span>
                  <input 
                    type="text" value={service.customFormat} onChange={e => updateExtraService(service.id, 'customFormat', e.target.value)}
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm outline-none" 
                  />
                </label>
              )}

              <div className="grid grid-cols-2 gap-3">
                {service.format !== 'Ensaio' && service.format !== 'Expediente Administrativo' && (
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-bold text-gray-500 uppercase">Saída da BM</span>
                    <input type="time" value={service.departureTime} onChange={e => updateExtraService(service.id, 'departureTime', e.target.value)} className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-amber-50 dark:bg-amber-900/10 px-3 py-2 text-sm" />
                  </label>
                )}
                <label className={`flex flex-col gap-1.5 ${(service.format === 'Ensaio' || service.format === 'Expediente Administrativo') ? 'col-span-2' : ''}`}>
                  <span className="text-[10px] font-bold text-gray-500 uppercase">Início</span>
                  <input type="time" value={service.startTime} onChange={e => updateExtraService(service.id, 'startTime', e.target.value)} className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm" />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold text-gray-500 uppercase">Término</span>
                  <input type="time" value={service.endTime} onChange={e => updateExtraService(service.id, 'endTime', e.target.value)} className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm" />
                </label>
                {service.format !== 'Ensaio' && service.format !== 'Expediente Administrativo' && (
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-bold text-gray-500 uppercase">Retorno</span>
                    <input type="time" value={service.returnTime} onChange={e => updateExtraService(service.id, 'returnTime', e.target.value)} className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-blue-50 dark:bg-blue-900/10 px-3 py-2 text-sm" />
                  </label>
                )}
              </div>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-gray-500 uppercase">Local</span>
                <input type="text" value={service.location} onChange={e => updateExtraService(service.id, 'location', e.target.value)} className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2.5 text-sm" />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold text-gray-500 uppercase">Uniforme</span>
                <div className="relative">
                  <select 
                    value={service.uniform} onChange={e => updateExtraService(service.id, 'uniform', e.target.value)}
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2.5 text-sm outline-none appearance-none transition-all"
                  >
                    <option>Especial A1-A / A1-B</option>
                    <option>Outros</option>
                  </select>
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-400">
                    <span className="material-symbols-outlined text-[16px]">expand_more</span>
                  </div>
                </div>
              </label>

              {service.uniform === 'Outros' && (
                <label className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold text-gray-500 uppercase">Descreva o Uniforme</span>
                  <input 
                    type="text" value={service.customUniform} onChange={e => updateExtraService(service.id, 'customUniform', e.target.value)}
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm outline-none" 
                  />
                </label>
              )}

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-gray-500 uppercase">Repertório</span>
                <textarea 
                  value={service.repertoire} onChange={e => updateExtraService(service.id, 'repertoire', e.target.value)}
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm outline-none resize-none font-mono" rows={3} placeholder={'01. Hino Nacional\n02. Dobrado'}
                />
              </label>

              {/* Chief Selection */}
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-amber-600 uppercase flex items-center gap-1">
                  <span className="material-symbols-outlined text-[16px]">military_tech</span>
                  Chefe do Serviço
                </span>
                <select 
                  value={service.serviceChief} 
                  onChange={e => updateExtraService(service.id, 'serviceChief', e.target.value)}
                  className="w-full rounded-xl border border-amber-200 dark:border-amber-900/30 bg-amber-50/30 dark:bg-amber-900/5 text-gray-900 dark:text-white px-3 py-2.5 text-sm outline-none"
                >
                  <option className="text-gray-900 bg-white dark:bg-gray-800 dark:text-white" value="">— Selecione o Chefe —</option>
                  {musicians.filter(m => isMusicianAvailable(m, sharedDate)).map(m => (
                    <option className="text-gray-900 bg-white dark:bg-gray-800 dark:text-white" key={m.id} value={m.id}>{getMusicianLabel(m.id)}</option>
                  ))}
                </select>
              </label>

              {/* Musicians Selection */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-primary uppercase">Efetivo Escalado ({service.selectedMusicians.length})</span>
                  <button type="button" onClick={() => updateExtraService(service.id, 'selectedMusicians', [])} className="text-[10px] font-bold text-gray-400 hover:text-red-500 uppercase">Limpar</button>
                </div>
                
                {recentScales.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
                    {recentScales.map(rs => (
                      <button key={rs.id} type="button" onClick={() => applySuggestion(service.id, rs.musicians)} className="flex-none bg-gray-50 dark:bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-100 dark:border-gray-700 text-[10px] font-bold dark:text-gray-300">
                        {rs.title}
                      </button>
                    ))}
                  </div>
                )}

                <div className="bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 max-h-[180px] overflow-y-auto no-scrollbar divide-y divide-gray-100 dark:divide-gray-700">
                  {musicians.filter(m => m.id !== service.serviceChief).map(m => {
                    const available = isMusicianAvailable(m, sharedDate);
                    const checked = service.selectedMusicians.includes(m.id);
                    return (
                      <label key={m.id} className={`flex items-center gap-3 px-3 py-2.5 transition-colors cursor-pointer ${!available ? 'opacity-40 cursor-not-allowed' : checked ? 'bg-primary/5' : ''}`}>
                        <input type="checkbox" checked={checked} disabled={!available} onChange={() => handleMusicianToggle(service.id, m.id)} className="size-4 rounded border-gray-300 text-primary" />
                        <div className="flex flex-col">
                          <span className="text-xs font-bold dark:text-white leading-tight">{getMusicianLabel(m.id)}</span>
                          <span className="text-[8px] text-gray-400 uppercase leading-none mt-0.5">{m.instrument}</span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          ))}

          <button 
            type="button" 
            onClick={addExtraService}
            className="w-full py-5 rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 hover:border-primary transition-all flex flex-col items-center justify-center gap-2 font-black text-xs uppercase tracking-[0.2em] shadow-sm shadow-primary/5"
          >
            <span className="material-symbols-outlined text-[32px]">add_circle</span>
            Acrescentar Mais um Serviço Extra
          </button>

        </main>

        <footer className="fixed bottom-0 left-0 right-0 p-4 bg-white/95 dark:bg-background-dark/95 backdrop-blur-md border-t border-gray-100 dark:border-gray-800 z-30 flex items-center justify-center">
          <div className="w-full max-w-md">
            <button 
              disabled={loading || !sharedDate || (userRole !== 'admin' && userRole !== 'master' && userRole !== 'manager' && user?.email !== 'heliomardejesus87@gmail.com')}
              onClick={() => handleCreateScale(false)}
              className="w-full h-14 rounded-xl bg-primary text-white font-black shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50 disabled:active:scale-100 uppercase tracking-widest"
            >
              {loading ? (
                <span className="material-symbols-outlined animate-spin text-[24px]">progress_activity</span>
              ) : (
                <>
                  Publicar {1 + extraServices.length} {1 + extraServices.length === 1 ? 'Serviço' : 'Serviços'}
                  <span className="material-symbols-outlined text-[20px]">dynamic_form</span>
                </>
              )}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
