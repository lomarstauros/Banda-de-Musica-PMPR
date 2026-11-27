'use client';

import Link from 'next/link';
import { motion, AnimatePresence } from 'motion/react';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { collection, addDoc, serverTimestamp, query, orderBy, getDocs, writeBatch, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { isMusicianAvailable, getCurrentMilitaryStatus, getEffectiveMilitaryLeave } from '@/lib/military-status';
import { sortByRankThenName } from '@/lib/sort-military';
import { fmtDate, getTodayYMD, normalizeDateToYMD } from '@/lib/format-date';
import { useFirebase } from '@/components/providers/firebase-provider';
import { MilitaryStatusBadge } from '@/components/ui/military-status-badge';

const OPM_OPTIONS = [
  '12º BPM',
  '13º BPM',
  '17º BPM',
  '20º BPM',
  '22º BPM',
  '23º BPM',
  '33º BPM',
  'BOPE',
  'BPMOA',
  'BPRv',
  'BPTran',
  'Casa Militar da Governadoria',
  'Quartel do Comando Geral',
  'RPMon',
  'Outra Unidade...'
];

const MODALITY_OPTIONS = [
  { id: 'rpa', label: 'Viatura (RPA - Radiopatrulha Auto)', icon: 'local_police', defaultHours: 12 },
  { id: 'modulo', label: 'Módulo Móvel / Ponto Base (PB)', icon: 'pin_drop', defaultHours: 8 },
  { id: 'pe', label: 'Policiamento Ostensivo a Pé', icon: 'directions_walk', defaultHours: 6 },
  { id: 'transito', label: 'Operação de Trânsito / Fiscalização', icon: 'traffic', defaultHours: 8 },
  { id: 'evento', label: 'Evento de Grande Porte / Praça Esportiva', icon: 'stadium', defaultHours: 8 },
  { id: 'guarda', label: 'Guarda e Segurança de Quartel Externo', icon: 'security', defaultHours: 12 },
  { id: 'apoio', label: 'Apoio Operacional Extraordinário', icon: 'shield', defaultHours: 8 },
];

export default function AdminNewOperationalScalePage() {
  const router = useRouter();
  const { user, profile, loading: authLoading } = useFirebase();

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [musicians, setMusicians] = useState<any[]>([]);
  const [searchMember, setSearchMember] = useState('');

  // Formulário Operacional
  const [date, setDate] = useState(getTodayYMD());
  const [startTime, setStartTime] = useState('07:00');
  const [endTime, setEndTime] = useState('19:00');
  const [selectedOpm, setSelectedOpm] = useState(OPM_OPTIONS[0]);
  const [customOpm, setCustomOpm] = useState('');
  const [modality, setModality] = useState(MODALITY_OPTIONS[0].label);
  const [viaturaPrefix, setViaturaPrefix] = useState('VTR-');
  const [uniform, setUniform] = useState('4º RUPM Operacional (Colete Balístico + Cobertura)');
  const [armament, setArmament] = useState('Pistola Cal. 9mm + Colete Balístico Nível III-A + Espargidor + Algemas');
  const [locationMission, setLocationMission] = useState('');
  const [notes, setNotes] = useState('');

  // Equipe Operacional
  const [serviceChiefId, setServiceChiefId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [selectedPatrolMemberIds, setSelectedPatrolMemberIds] = useState<string[]>([]);

  // Verificação de permissões do Gestor
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }
    const role = (profile?.role || '').toLowerCase();
    if (role !== 'admin' && role !== 'master' && role !== 'manager') {
      router.push('/dashboard');
    }
  }, [user, profile, authLoading, router]);

  // Carregar Efetivo
  useEffect(() => {
    const fetchMusicians = async () => {
      try {
        const q = query(collection(db, 'profiles'), orderBy('name', 'asc'));
        const snap = await getDocs(q);
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort(sortByRankThenName);
        setMusicians(docs);
      } catch (err) {
        console.error('Erro ao buscar efetivo:', err);
      }
    };
    fetchMusicians();
  }, []);

  // Cálculo da Carga Horária estimada
  const durationHours = useMemo(() => {
    try {
      if (!startTime || !endTime) return 0;
      const [startH, startM] = startTime.split(':').map(Number);
      const [endH, endM] = endTime.split(':').map(Number);
      let diff = (endH + endM / 60) - (startH + startM / 60);
      if (diff <= 0) diff += 24; // Turno que cruza a meia-noite (ex: 19:00 as 07:00)
      return Math.round(diff * 10) / 10;
    } catch {
      return 0;
    }
  }, [startTime, endTime]);

  // Label amigável do militar (Posto/Graduação + Nome de Guerra)
  const getMusicianLabel = (m: any) => {
    if (!m) return '';
    return `${m.rank || ''} ${m.war_name || m.name || ''}`.trim();
  };

  // Toggle do militar patrulheiro
  const handleTogglePatrolMember = (id: string) => {
    const musician = musicians.find(m => m.id === id);
    if (!musician || !isMusicianAvailable(musician, date)) return;

    // Se é chefe ou motorista, não pode selecionar como patrulheiro
    if (id === serviceChiefId || id === driverId) return;

    setSelectedPatrolMemberIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // Enviar / Publicar Escala Operacional
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const opmFinal = selectedOpm === 'Outra Unidade...' ? customOpm.trim() : selectedOpm;
    if (!date) {
      setError('Por favor, informe a data da escala operacional.');
      return;
    }
    if (!opmFinal) {
      setError('Por favor, informe a Unidade / OPM apoiada.');
      return;
    }

    // Todos os participantes
    const participantIds = Array.from(new Set([
      ...(serviceChiefId ? [serviceChiefId] : []),
      ...(driverId ? [driverId] : []),
      ...selectedPatrolMemberIds
    ]));

    if (participantIds.length === 0) {
      setError('Por favor, selecione pelo menos um militar para compor a equipe operacional.');
      return;
    }

    // Validar se algum escalado está afastado na data
    for (const pid of participantIds) {
      const m = musicians.find(x => x.id === pid);
      if (m && !isMusicianAvailable(m, date)) {
        const leave = getEffectiveMilitaryLeave(m, date);
        const motivo = leave?.status || 'Afastado';
        setError(`O militar ${getMusicianLabel(m)} está com status "${motivo}" na data ${fmtDate(date)} e não pode ser escalado.`);
        return;
      }
    }

    setLoading(true);

    try {
      const chiefObj = musicians.find(m => m.id === serviceChiefId) || null;
      const driverObj = musicians.find(m => m.id === driverId) || null;
      const allMembersObjs = participantIds.map(id => {
        const m = musicians.find(x => x.id === id);
        return {
          id: m.id,
          name: m.name || '',
          war_name: m.war_name || '',
          rank: m.rank || '',
          instrument: m.instrument || 'Operacional',
          role: m.role || 'musician',
          email: m.email || '',
        };
      });

      const batch = writeBatch(db);

      // 1. Gravar Escala Operacional na coleção `scales`
      const scaleRef = doc(collection(db, 'scales'));
      const scaleData = {
        title: `Escala Operacional - ${opmFinal.split(' (')[0]}`,
        date,
        time: startTime,
        endTime,
        durationHours,
        location: locationMission || `Apoio Operacional: ${opmFinal}`,
        uniform,
        classification: 'operacional',
        isOperational: true,
        type: 'operacional',
        format: modality,
        opm: opmFinal,
        viatura: viaturaPrefix.trim(),
        armament,
        notes,
        serviceChief: chiefObj ? {
          id: chiefObj.id,
          name: chiefObj.name || '',
          war_name: chiefObj.war_name || '',
          rank: chiefObj.rank || '',
        } : null,
        driver: driverObj ? {
          id: driverObj.id,
          name: driverObj.name || '',
          war_name: driverObj.war_name || '',
          rank: driverObj.rank || '',
        } : null,
        musicians: allMembersObjs,
        status: 'published',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      batch.set(scaleRef, scaleData);

      // 2. Disparar notificações exclusivas para o efetivo escalado
      participantIds.forEach(userId => {
        const notifRef = doc(collection(db, 'notifications'));
        batch.set(notifRef, {
          userId,
          scaleId: scaleRef.id,
          scaleTitle: `Escala Operacional - ${opmFinal.split(' (')[0]}`,
          scaleDate: date,
          scaleTime: startTime,
          type: 'new_scale',
          isOperational: true,
          message: `Você foi escalado para Serviço Operacional (${modality}) em ${fmtDate(date)} das ${startTime} às ${endTime} no ${opmFinal.split(' (')[0]}.`,
          read: false,
          confirmedAt: null,
          createdAt: serverTimestamp(),
        });
      });

      await batch.commit();
      setSuccess(true);
    } catch (err: any) {
      console.error('Erro ao salvar escala operacional:', err);
      setError('Ocorreu um erro ao salvar a escala operacional. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  // Efetivo filtrado pela busca
  const filteredMusicians = useMemo(() => {
    return musicians.filter(m => {
      const q = searchMember.toLowerCase();
      const name = (m.name || '').toLowerCase();
      const warName = (m.war_name || '').toLowerCase();
      const re = (m.re || '').toLowerCase();
      return name.includes(q) || warName.includes(q) || re.includes(q);
    });
  }, [musicians, searchMember]);

  return (
    <div className="bg-transparent font-sans flex flex-col items-center lg:items-stretch w-full">
      <div className="relative w-full max-w-md lg:max-w-none bg-background-light dark:bg-[#121620]/90 backdrop-blur-xl lg:rounded-3xl lg:border lg:border-white/10 flex flex-col h-full min-h-screen lg:min-h-0 shadow-2xl">
        
        {/* Header Superior */}
        <header className="sticky top-0 z-20 bg-background-light/95 dark:bg-[#121620]/95 backdrop-blur-md px-4 lg:px-6 py-3.5 flex items-center justify-between border-b border-gray-200 dark:border-white/10 lg:rounded-t-3xl">
          <Link href="/admin/swaps">
            <button className="flex items-center justify-center p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors text-gray-900 dark:text-white">
              <span className="material-symbols-outlined">arrow_back_ios_new</span>
            </button>
          </Link>
          <div className="flex flex-col items-center">
            <h1 className="text-base font-bold text-gray-900 dark:text-white leading-tight">Painel Gestor</h1>
            <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest mt-0.5 bg-blue-500/10 px-2 py-0.5 rounded-full">
              Escala Operacional
            </span>
          </div>
          <div className="size-10" />
        </header>

        {/* Quick Nav Oficial do Gestor */}
        <div className="px-4 lg:px-6 py-3 flex items-center gap-2 overflow-x-auto no-scrollbar bg-white dark:bg-gray-900/60 border-b border-gray-100 dark:border-white/10 shrink-0">
          <Link href="/admin/scales/new" className="shrink-0">
            <button type="button" className="flex h-9 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 px-4 sm:px-5 text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-200 transition-colors whitespace-nowrap">
              Nova Escala
            </button>
          </Link>
          <button type="button" className="flex h-9 shrink-0 items-center justify-center rounded-full bg-blue-600 px-4 sm:px-5 text-xs sm:text-sm font-bold text-white shadow-lg shadow-blue-600/20 whitespace-nowrap">
            Nova Escala Operacional
          </button>
          <Link href="/admin/forecasts" className="shrink-0">
            <button type="button" className="flex h-9 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30 px-4 sm:px-5 text-xs sm:text-sm font-bold text-amber-700 dark:text-amber-400 hover:bg-amber-200 transition-colors border border-amber-200 dark:border-amber-800 shadow-sm whitespace-nowrap">
              Previsão de Serviço
            </button>
          </Link>
          <Link href="/admin/swaps" className="shrink-0">
            <button type="button" className="flex h-9 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 px-4 sm:px-5 text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-200 transition-colors whitespace-nowrap">
              Permuta
            </button>
          </Link>
        </div>

        {/* Conteúdo Principal */}
        <main className="flex-1 p-4 lg:p-6 flex flex-col gap-6 pb-24">
          
          {/* Alerta de Sucesso */}
          {success && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }} 
              animate={{ opacity: 1, y: 0 }} 
              className="bg-emerald-500/15 border border-emerald-500/30 p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 text-emerald-800 dark:text-emerald-300 shadow-md"
            >
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-2xl text-emerald-500">check_circle</span>
                <div>
                  <h3 className="font-bold text-sm">Escala Operacional Publicada com Sucesso!</h3>
                  <p className="text-xs opacity-90">O serviço foi cadastrado no calendário e o efetivo foi notificado.</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link href="/admin/reports">
                  <button type="button" className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-sm">
                    Ver no Relatório
                  </button>
                </Link>
                <button 
                  type="button" 
                  onClick={() => {
                    setSuccess(false);
                    setSelectedPatrolMemberIds([]);
                    setServiceChiefId('');
                    setDriverId('');
                  }} 
                  className="px-3 py-1.5 rounded-xl bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 text-xs font-bold border border-gray-200 dark:border-gray-700 hover:bg-gray-50 transition-all"
                >
                  Cadastrar Outra
                </button>
              </div>
            </motion.div>
          )}

          {/* Alerta de Erro */}
          {error && (
            <div className="bg-red-500/15 border border-red-500/30 p-4 rounded-2xl flex items-center gap-3 text-red-700 dark:text-red-400">
              <span className="material-symbols-outlined text-2xl shrink-0">error</span>
              <p className="text-xs font-semibold">{error}</p>
            </div>
          )}

          {/* Banner Institucional */}
          <div className="bg-gradient-to-r from-blue-900/40 via-indigo-900/20 to-transparent border border-blue-500/20 rounded-2xl p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="size-12 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shadow-inner shrink-0">
                <span className="material-symbols-outlined text-[28px]">local_police</span>
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white leading-tight">
                  Cadastro de Escala Operacional
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Serviços operacionais externos, viaturas (RPA), trânsito e apoio a outras Unidades da PMPR.
                </p>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-6">

            {/* SEÇÃO 1: Dados do Serviço */}
            <div className="bg-white dark:bg-gray-900/80 rounded-2xl border border-gray-200 dark:border-white/10 p-4 sm:p-5 flex flex-col gap-4 shadow-sm">
              <div className="flex items-center gap-2 border-b border-gray-100 dark:border-white/10 pb-3">
                <span className="material-symbols-outlined text-blue-500 text-[20px]">calendar_month</span>
                <h3 className="text-sm font-black uppercase tracking-wider text-gray-900 dark:text-white">
                  1. Dados do Serviço & Horário
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-gray-700 dark:text-gray-300">Data do Serviço:</span>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-gray-700 dark:text-gray-300">Horário de Início:</span>
                  <input
                    type="time"
                    required
                    value={startTime}
                    onChange={e => setStartTime(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-700 dark:text-gray-300">Término Previsto:</span>
                    <span className="text-[10px] font-bold text-blue-500 bg-blue-500/10 px-1.5 py-0.5 rounded">
                      {durationHours} horas
                    </span>
                  </div>
                  <input
                    type="time"
                    required
                    value={endTime}
                    onChange={e => setEndTime(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </label>
              </div>

              {/* Unidade Apoiada e Modalidade */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-gray-700 dark:text-gray-300">Unidade Apoiada (OPM):</span>
                  <select
                    value={selectedOpm}
                    onChange={e => setSelectedOpm(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {OPM_OPTIONS.map(opm => (
                      <option key={opm} value={opm} className="bg-white dark:bg-gray-900">{opm}</option>
                    ))}
                  </select>
                </label>

                {selectedOpm === 'Outra Unidade...' && (
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-bold text-gray-700 dark:text-gray-300">Especifique a Unidade:</span>
                    <input
                      type="text"
                      placeholder="Ex: 1º BPM"
                      value={customOpm}
                      onChange={e => setCustomOpm(e.target.value)}
                      className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </label>
                )}

                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-gray-700 dark:text-gray-300">Modalidade de Serviço:</span>
                  <select
                    value={modality}
                    onChange={e => setModality(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {MODALITY_OPTIONS.map(m => (
                      <option key={m.id} value={m.label} className="bg-white dark:bg-gray-900">{m.label}</option>
                    ))}
                  </select>
                </label>
              </div>

              {/* Prefixo da Viatura e Uniforme */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-gray-700 dark:text-gray-300">Prefixo da Viatura (se aplicável):</span>
                  <input
                    type="text"
                    placeholder="Ex: VTR-14205"
                    value={viaturaPrefix}
                    onChange={e => setViaturaPrefix(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-gray-700 dark:text-gray-300">Uniforme Regulamentar:</span>
                  <input
                    type="text"
                    value={uniform}
                    onChange={e => setUniform(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </label>
              </div>

              {/* Armamento e Missão */}
              <div className="flex flex-col gap-3 mt-1">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-gray-700 dark:text-gray-300">Armamento & Equipamentos:</span>
                  <input
                    type="text"
                    value={armament}
                    onChange={e => setArmament(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-gray-700 dark:text-gray-300">Ponto de Apresentação / Missão:</span>
                  <textarea
                    rows={2}
                    placeholder="Ex: Sede do 12º BPM - Apoio na Operação Presença na região central e patrulhamento de comércio."
                    value={locationMission}
                    onChange={e => setLocationMission(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </label>
              </div>
            </div>

            {/* SEÇÃO 2: Composição da Equipe Operacional */}
            <div className="bg-white dark:bg-gray-900/80 rounded-2xl border border-gray-200 dark:border-white/10 p-4 sm:p-5 flex flex-col gap-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-gray-100 dark:border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-blue-500 text-[20px]">groups</span>
                  <h3 className="text-sm font-black uppercase tracking-wider text-gray-900 dark:text-white">
                    2. Composição da Guarnição
                  </h3>
                </div>
                <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400">
                  Data Alvo: <span className="text-blue-500">{fmtDate(date)}</span>
                </span>
              </div>

              {/* Comandante da Equipe e Motorista */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-gray-700 dark:text-gray-300">
                    Comandante da Equipe / Encarregado:
                  </span>
                  <select
                    value={serviceChiefId}
                    onChange={e => setServiceChiefId(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="" className="bg-white dark:bg-gray-900">— Selecione o Comandante —</option>
                    {musicians.map(m => {
                      const available = isMusicianAvailable(m, date);
                      const leave = !available ? getEffectiveMilitaryLeave(m, date) : null;
                      return (
                        <option 
                          key={m.id} 
                          value={m.id} 
                          disabled={!available}
                          className="bg-white dark:bg-gray-900"
                        >
                          {available ? getMusicianLabel(m) : `🔒 ${getMusicianLabel(m)} (${leave?.status || 'Afastado'})`}
                        </option>
                      );
                    })}
                  </select>
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-gray-700 dark:text-gray-300">
                    Motorista / Condutor de Viatura:
                  </span>
                  <select
                    value={driverId}
                    onChange={e => setDriverId(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="" className="bg-white dark:bg-gray-900">— Selecione o Motorista —</option>
                    {musicians.map(m => {
                      const available = isMusicianAvailable(m, date);
                      const leave = !available ? getEffectiveMilitaryLeave(m, date) : null;
                      return (
                        <option 
                          key={m.id} 
                          value={m.id} 
                          disabled={!available || m.id === serviceChiefId}
                          className="bg-white dark:bg-gray-900"
                        >
                          {available ? getMusicianLabel(m) : `🔒 ${getMusicianLabel(m)} (${leave?.status || 'Afastado'})`}
                        </option>
                      );
                    })}
                  </select>
                </label>
              </div>

              {/* Patrulheiros / Integrantes */}
              <div className="flex flex-col gap-2.5 mt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-700 dark:text-gray-300">
                    Patrulheiros / Componentes da Equipe:
                  </span>
                  <span className="text-[11px] font-bold text-blue-500">
                    {selectedPatrolMemberIds.length} selecionado(s)
                  </span>
                </div>

                {/* Campo de Busca Rápida */}
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-2.5 text-gray-400 text-[18px]">search</span>
                  <input
                    type="text"
                    placeholder="Filtrar militar por nome de guerra ou RE..."
                    value={searchMember}
                    onChange={e => setSearchMember(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 pl-9 pr-3 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Lista de Seleção de Militares */}
                <div className="max-h-72 overflow-y-auto no-scrollbar rounded-xl border border-gray-200 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800/60 bg-gray-50/50 dark:bg-gray-800/40 p-1">
                  {filteredMusicians.map(m => {
                    const isChief = m.id === serviceChiefId;
                    const isDriver = m.id === driverId;
                    const available = isMusicianAvailable(m, date);
                    const leave = !available ? getEffectiveMilitaryLeave(m, date) : null;
                    const isSelected = selectedPatrolMemberIds.includes(m.id);
                    const isDisabled = !available || isChief || isDriver;

                    return (
                      <div
                        key={m.id}
                        onClick={() => !isDisabled && handleTogglePatrolMember(m.id)}
                        className={`flex items-center justify-between p-2.5 rounded-lg transition-all ${
                          isDisabled
                            ? 'opacity-40 cursor-not-allowed bg-gray-100/50 dark:bg-gray-800/20'
                            : isSelected
                            ? 'bg-blue-500/15 border border-blue-500/30 cursor-pointer shadow-sm'
                            : 'hover:bg-white dark:hover:bg-gray-800/80 cursor-pointer'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <input
                            type="checkbox"
                            disabled={isDisabled}
                            checked={isSelected}
                            onChange={() => {}}
                            className="size-4 rounded text-blue-600 border-gray-300 pointer-events-none"
                          />
                          <div className="flex flex-col min-w-0">
                            <span className="text-xs font-bold text-gray-900 dark:text-white truncate">
                              {getMusicianLabel(m)}
                            </span>
                            <span className="text-[10px] text-gray-400 truncate">
                              {m.re ? `RE ${m.re}` : 'Efetivo'} • {m.instrument || 'Banda'}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {isChief ? (
                            <span className="text-[10px] font-bold text-amber-600 bg-amber-500/15 px-2 py-0.5 rounded-full border border-amber-500/30">
                              Comandante
                            </span>
                          ) : isDriver ? (
                            <span className="text-[10px] font-bold text-indigo-600 bg-indigo-500/15 px-2 py-0.5 rounded-full border border-indigo-500/30">
                              Motorista
                            </span>
                          ) : !available ? (
                            <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 bg-rose-500/15 px-2 py-0.5 rounded-full border border-rose-500/30 flex items-center gap-1">
                              <span className="material-symbols-outlined text-[12px]">lock</span>
                              {leave?.status || 'Afastado'}
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded-full border border-emerald-500/30">
                              Disponível
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Botões de Ação */}
            <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2">
              <Link href="/admin/swaps" className="w-full sm:w-auto">
                <button
                  type="button"
                  className="w-full sm:w-auto px-5 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-bold text-sm hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  Cancelar
                </button>
              </Link>

              <button
                type="submit"
                disabled={loading}
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
              >
                {loading ? (
                  <div className="animate-spin rounded-full size-5 border-2 border-white border-t-transparent" />
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[20px]">send</span>
                    <span>Salvar e Publicar Escala Operacional</span>
                  </>
                )}
              </button>
            </div>

          </form>
        </main>
      </div>
    </div>
  );
}
