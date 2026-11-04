'use client';

import Link from 'next/link';
import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, where, getDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { sortByRankThenName } from '@/lib/sort-military';
import { useFirebase } from '@/components/providers/firebase-provider';
import { useRouter } from 'next/navigation';
import { BottomNav } from '@/components/ui/bottom-nav';
import { getFormatColors } from '@/lib/scale-formats';
import { canAccessReports } from '@/lib/permissions';

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export default function AdminReportsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useFirebase();

  // Estados principais
  const [musicians, setMusicians] = useState<any[]>([]);
  const [scales, setScales] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros de data
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth()); // 0-11

  // Filtros de busca e visualização
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedInstrument, setSelectedInstrument] = useState<string>('todos');
  const [selectedFormat, setSelectedFormat] = useState<string>('todos');
  const [filterPresence, setFilterPresence] = useState<'todos' | 'com_escala' | 'sem_escala'>('todos');
  const [sortBy, setSortBy] = useState<'mais_escalados' | 'menos_escalados' | 'posto' | 'nome'>('mais_escalados');

  // Músico expandido para ver detalhes
  const [expandedMusicianId, setExpandedMusicianId] = useState<string | null>(null);

  // Verificação de permissões: Exclusivo para Master, Sargenteante, Comandante e Subcomandante
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }

    const checkAccess = async () => {
      try {
        const snap = await getDoc(doc(db, 'profiles', user.uid));
        const profileData = snap.data();
        if (!canAccessReports(profileData, user.email)) {
          router.push('/dashboard');
        }
      } catch (err) {
        console.error('Erro ao verificar permissão de relatórios:', err);
        router.push('/dashboard');
      }
    };
    checkAccess();
  }, [user, authLoading, router]);

  // Carregar Músicos (Efetivo)
  useEffect(() => {
    const unsubMusicians = onSnapshot(collection(db, 'profiles'), (snap) => {
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort(sortByRankThenName);
      setMusicians(list);
    }, (err) => console.error("Erro ao buscar efetivo:", err));

    return () => unsubMusicians();
  }, []);

  // Carregar Escalas em tempo real
  useEffect(() => {
    const unsubScales = onSnapshot(collection(db, 'scales'), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setScales(list);
    }, (err) => console.error("Erro ao carregar escalas:", err));

    return () => unsubScales();
  }, []);

  // Carregar Confirmações (Notificações)
  useEffect(() => {
    const unsubNotifs = onSnapshot(collection(db, 'notifications'), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setNotifications(list);
      setLoading(false);
    }, (err) => {
      console.error("Erro ao carregar confirmações:", err);
      setLoading(false);
    });

    return () => unsubNotifs();
  }, []);

  // Navegação de mês
  const handlePrevMonth = () => {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear(prev => prev - 1);
    } else {
      setSelectedMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear(prev => prev + 1);
    } else {
      setSelectedMonth(prev => prev + 1);
    }
  };

  const handleResetToCurrentMonth = () => {
    setSelectedYear(now.getFullYear());
    setSelectedMonth(now.getMonth());
  };

  // Prefixo de data do mês selecionado: "YYYY-MM"
  const currentMonthPrefix = useMemo(() => {
    const m = String(selectedMonth + 1).padStart(2, '0');
    return `${selectedYear}-${m}`;
  }, [selectedYear, selectedMonth]);

  // Escalas do mês selecionado
  const monthScales = useMemo(() => {
    return scales.filter((s: any) => {
      if (!s.date || typeof s.date !== 'string') return false;
      if (!s.date.startsWith(currentMonthPrefix)) return false;
      if (s.classification === 'folga') return false; // Folgas não contam como escala de serviço
      if (selectedFormat !== 'todos') {
        const fmt = (s.format || '').toLowerCase();
        if (selectedFormat === 'apresentacoes' && !fmt.includes('apresentação') && !fmt.includes('concerto') && !fmt.includes('formatura')) return false;
        if (selectedFormat === 'ensaios' && !fmt.includes('ensaio')) return false;
        if (selectedFormat === 'expediente' && !fmt.includes('expediente')) return false;
      }
      return true;
    });
  }, [scales, currentMonthPrefix, selectedFormat]);

  // Extrai lista única de instrumentos
  const availableInstruments = useMemo(() => {
    const setInst = new Set<string>();
    musicians.forEach(m => {
      if (m.instrument) setInst.add(m.instrument);
    });
    return Array.from(setInst).sort((a, b) => a.localeCompare(b));
  }, [musicians]);

  // Mapeamento de confirmações (ciência) por [scaleId_userId]
  const confirmationMap = useMemo(() => {
    const map = new Map<string, { read: boolean; confirmedAt: any; viewedAt: any }>();
    notifications.forEach((n: any) => {
      if (n.scaleId && n.userId) {
        const key = `${n.scaleId}_${n.userId}`;
        if (n.read) {
          map.set(key, { read: true, confirmedAt: n.confirmedAt, viewedAt: n.viewedAt });
        } else if (!map.has(key)) {
          map.set(key, { read: false, confirmedAt: null, viewedAt: null });
        }
      }
    });
    return map;
  }, [notifications]);

  // Processa dados de cada músico para o mês selecionado
  const reportData = useMemo(() => {
    return musicians.map((musician) => {
      const mid = musician.id;

      // Localiza todas as escalas que este músico fez no mês
      const userScales = monthScales.filter((s: any) => {
        // 1. Chefe do serviço
        if (s.serviceChief?.id === mid) return true;
        // 2. Lista de músicos
        if (s.musicians && s.musicians.some((m: any) => m.id === mid)) return true;
        // 3. Expediente Administrativo
        if (s.expediente) {
          const exp = s.expediente;
          if (exp.regenteMaestroId === mid) return true;
          if (exp.regenteId === mid) return true;
          if (exp.arquivoId === mid) return true;
          if (exp.sargenteacaoId === mid) return true;
          if (exp.p4FinancasTransporteId === mid) return true;
          if (exp.administrativo && exp.administrativo.some((m: any) => m.id === mid)) return true;
          if (exp.obra && exp.obra.some((m: any) => m.id === mid)) return true;
          if (exp.permanencia && exp.permanencia.some((m: any) => m.id === mid)) return true;
        }
        return false;
      });

      // Detalhes das escalas com status de confirmação
      const detailedScales = userScales.map((s: any) => {
        const conf = confirmationMap.get(`${s.id}_${mid}`);
        const isConfirmed = !!conf?.read;
        const confirmTime = conf?.confirmedAt || conf?.viewedAt;

        // Determina a função nesta escala
        let roleInScale = 'Músico';
        if (s.serviceChief?.id === mid) roleInScale = 'Chefe do Serviço';
        else if (s.expediente) {
          const exp = s.expediente;
          if (exp.regenteMaestroId === mid || exp.regenteId === mid) roleInScale = 'Regente';
          else if (exp.sargenteacaoId === mid) roleInScale = 'Sargenteação';
          else if (exp.p4FinancasTransporteId === mid) roleInScale = 'P/4 Finanças';
          else if (exp.arquivoId === mid) roleInScale = 'Arquivo Musical';
          else if (exp.permanencia && exp.permanencia.some((m: any) => m.id === mid)) roleInScale = 'Permanência';
          else if (exp.obra && exp.obra.some((m: any) => m.id === mid)) roleInScale = 'Obra / Reforma';
        }

        return {
          id: s.id,
          title: s.title || s.format || 'Serviço',
          date: s.date,
          format: s.format || 'Evento',
          startTime: s.startTime || s.departureTime || '',
          location: s.location || 'Sede da BM',
          role: roleInScale,
          isConfirmed,
          confirmedAt: confirmTime
        };
      }).sort((a, b) => a.date.localeCompare(b.date));

      const totalScales = detailedScales.length;
      const confirmedCount = detailedScales.filter(s => s.isConfirmed).length;
      const pendingCount = totalScales - confirmedCount;

      // Categorias de escalas
      let countApresentacoes = 0;
      let countEnsaios = 0;
      let countExpediente = 0;
      let countOutros = 0;

      detailedScales.forEach(s => {
        const fmt = (s.format || '').toLowerCase();
        if (fmt.includes('apresentação') || fmt.includes('concerto') || fmt.includes('formatura')) {
          countApresentacoes++;
        } else if (fmt.includes('ensaio')) {
          countEnsaios++;
        } else if (fmt.includes('expediente')) {
          countExpediente++;
        } else {
          countOutros++;
        }
      });

      return {
        musician,
        totalScales,
        confirmedCount,
        pendingCount,
        confirmationRate: totalScales > 0 ? Math.round((confirmedCount / totalScales) * 100) : 100,
        countApresentacoes,
        countEnsaios,
        countExpediente,
        countOutros,
        detailedScales
      };
    });
  }, [musicians, monthScales, confirmationMap]);

  // Estatísticas Gerais (KPIs)
  const stats = useMemo(() => {
    const totalServicos = monthScales.length;
    let totalEscalacoes = 0;
    let totalConfirmadas = 0;

    reportData.forEach(d => {
      totalEscalacoes += d.totalScales;
      totalConfirmadas += d.confirmedCount;
    });

    const activeMusiciansCount = musicians.length || 1;
    const mediaPorMusico = (totalEscalacoes / activeMusiciansCount).toFixed(1);
    const taxaConfirmacaoGeral = totalEscalacoes > 0 ? Math.round((totalConfirmadas / totalEscalacoes) * 100) : 100;
    const maxScalesInMonth = Math.max(...reportData.map(d => d.totalScales), 1);

    return {
      totalServicos,
      totalEscalacoes,
      mediaPorMusico,
      taxaConfirmacaoGeral,
      maxScalesInMonth
    };
  }, [monthScales, reportData, musicians]);

  // Filtragem e Ordenação da lista de militares
  const filteredReportData = useMemo(() => {
    return reportData
      .filter(({ musician, totalScales }) => {
        // Filtro por presença de escala
        if (filterPresence === 'com_escala' && totalScales === 0) return false;
        if (filterPresence === 'sem_escala' && totalScales > 0) return false;

        // Filtro por instrumento
        if (selectedInstrument !== 'todos' && musician.instrument !== selectedInstrument) return false;

        // Filtro por termo de busca
        if (searchTerm.trim()) {
          const term = searchTerm.toLowerCase();
          const name = (musician.name || '').toLowerCase();
          const warName = (musician.war_name || '').toLowerCase();
          const rank = (musician.rank || '').toLowerCase();
          const instrument = (musician.instrument || '').toLowerCase();
          return name.includes(term) || warName.includes(term) || rank.includes(term) || instrument.includes(term);
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'mais_escalados') {
          if (b.totalScales !== a.totalScales) return b.totalScales - a.totalScales;
          return sortByRankThenName(a.musician, b.musician);
        }
        if (sortBy === 'menos_escalados') {
          if (a.totalScales !== b.totalScales) return a.totalScales - b.totalScales;
          return sortByRankThenName(a.musician, b.musician);
        }
        if (sortBy === 'posto') {
          return sortByRankThenName(a.musician, b.musician);
        }
        if (sortBy === 'nome') {
          const nameA = a.musician.war_name || a.musician.name || '';
          const nameB = b.musician.war_name || b.musician.name || '';
          return nameA.localeCompare(nameB);
        }
        return 0;
      });
  }, [reportData, filterPresence, selectedInstrument, searchTerm, sortBy]);

  // Exportação CSV
  const handleExportCSV = () => {
    const headers = [
      'Posto/Graduação',
      'Nome de Guerra',
      'Nome Completo',
      'Instrumento',
      'Total de Escalas',
      'Apresentações',
      'Ensaios',
      'Expediente',
      'Ciências Confirmadas',
      'Ciências Pendentes',
      'Taxa de Ciência (%)'
    ];

    const rows = filteredReportData.map(({ musician, totalScales, countApresentacoes, countEnsaios, countExpediente, confirmedCount, pendingCount, confirmationRate }) => [
      `"${musician.rank || ''}"`,
      `"${musician.war_name || ''}"`,
      `"${musician.name || ''}"`,
      `"${musician.instrument || ''}"`,
      totalScales,
      countApresentacoes,
      countEnsaios,
      countExpediente,
      confirmedCount,
      pendingCount,
      `${confirmationRate}%`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `relatorio_escalas_${selectedYear}_${selectedMonth + 1}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatDateTime = (ts: any) => {
    if (!ts) return '';
    try {
      const d = ts.toDate ? ts.toDate() : new Date(ts);
      return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const formatDateDisplay = (dateStr: string) => {
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}`;
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="bg-[#0b0e14] text-slate-100 font-sans min-h-screen flex flex-col antialiased selection:bg-blue-500/30">
      
      {/* Top Header */}
      <header className="bg-[#121620]/95 backdrop-blur-md px-4 sm:px-6 py-4 sticky top-0 z-40 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="lg:hidden p-1.5 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white">
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </Link>
          <div className="size-10 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[24px]">analytics</span>
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-black text-white tracking-tight">Relatório de Escalas</h1>
            <p className="text-xs text-gray-400">Controle de escalação, volume de serviço e confirmações do efetivo</p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-gray-300 hover:text-white transition-all shadow-sm"
            title="Exportar dados para planilha Excel / CSV"
          >
            <span className="material-symbols-outlined text-[18px] text-emerald-400">download</span>
            <span>Exportar CSV</span>
          </button>

          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-xs font-bold text-blue-400 transition-all shadow-sm"
            title="Imprimir relatório"
          >
            <span className="material-symbols-outlined text-[18px]">print</span>
            <span>Imprimir</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex flex-col gap-6 w-full max-w-7xl mx-auto px-4 sm:px-6 py-6">

        {/* Barra de Seleção de Mês e Ano */}
        <section className="bg-[#121620] border border-white/10 rounded-3xl p-4 sm:p-5 shadow-xl flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 w-full md:w-auto justify-between md:justify-start">
            <button
              onClick={handlePrevMonth}
              className="size-10 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-gray-300 hover:text-white transition-colors"
              title="Mês anterior"
            >
              <span className="material-symbols-outlined text-[20px]">chevron_left</span>
            </button>

            <div className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-[#161a24] border border-white/10">
              <span className="material-symbols-outlined text-blue-400 text-[20px]">calendar_month</span>
              <span className="text-base sm:text-lg font-black text-white">
                {MONTH_NAMES[selectedMonth]} de {selectedYear}
              </span>
            </div>

            <button
              onClick={handleNextMonth}
              className="size-10 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-gray-300 hover:text-white transition-colors"
              title="Próximo mês"
            >
              <span className="material-symbols-outlined text-[20px]">chevron_right</span>
            </button>
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto justify-end">
            {(selectedMonth !== now.getMonth() || selectedYear !== now.getFullYear()) && (
              <button
                onClick={handleResetToCurrentMonth}
                className="px-3 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white border border-blue-500/30 text-xs font-bold transition-all"
              >
                Mês Atual
              </button>
            )}

            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="bg-[#161a24] border border-white/10 text-white rounded-xl px-3 py-1.5 text-xs font-bold focus:outline-none focus:border-blue-500"
            >
              {[2024, 2025, 2026, 2027].map(yr => (
                <option key={yr} value={yr}>{yr}</option>
              ))}
            </select>
          </div>
        </section>

        {/* 4 Cards de Estatísticas / Visão Geral (KPIs) */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-[#121620] border border-white/10 rounded-2xl p-4 flex flex-col gap-1 shadow-lg">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-blue-400">event</span>
              Serviços no Mês
            </span>
            <span className="text-2xl sm:text-3xl font-black text-white tracking-tight mt-1">
              {stats.totalServicos}
            </span>
            <span className="text-[11px] text-gray-400">Escalas distintas publicadas</span>
          </div>

          <div className="bg-[#121620] border border-white/10 rounded-2xl p-4 flex flex-col gap-1 shadow-lg">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-purple-400">group_work</span>
              Participações
            </span>
            <span className="text-2xl sm:text-3xl font-black text-white tracking-tight mt-1">
              {stats.totalEscalacoes}
            </span>
            <span className="text-[11px] text-gray-400">Homens-serviço escalados</span>
          </div>

          <div className="bg-[#121620] border border-white/10 rounded-2xl p-4 flex flex-col gap-1 shadow-lg">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-amber-400">calculate</span>
              Média / Músico
            </span>
            <span className="text-2xl sm:text-3xl font-black text-white tracking-tight mt-1">
              {stats.mediaPorMusico}
            </span>
            <span className="text-[11px] text-gray-400">Escalas por integrante</span>
          </div>

          <div className="bg-[#121620] border border-white/10 rounded-2xl p-4 flex flex-col gap-1 shadow-lg">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-emerald-400">verified</span>
              Taxa de Ciência
            </span>
            <span className="text-2xl sm:text-3xl font-black text-emerald-400 tracking-tight mt-1">
              {stats.taxaConfirmacaoGeral}%
            </span>
            <span className="text-[11px] text-gray-400">Escalas visualizadas</span>
          </div>
        </section>

        {/* Barra de Filtros e Busca */}
        <section className="bg-[#121620] border border-white/10 rounded-2xl p-4 flex flex-col gap-3 shadow-lg">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            
            {/* Campo de Busca */}
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-[18px]">
                search
              </span>
              <input
                type="text"
                placeholder="Buscar por nome, guerra ou posto..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-[#161a24] border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                >
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              )}
            </div>

            {/* Filtro de Naipe / Instrumento */}
            <div>
              <select
                value={selectedInstrument}
                onChange={(e) => setSelectedInstrument(e.target.value)}
                className="w-full bg-[#161a24] border border-white/10 rounded-xl px-3 py-2 text-xs font-semibold text-gray-200 focus:outline-none focus:border-blue-500 transition-colors"
              >
                <option value="todos">Todos os Naipes / Instrumentos</option>
                {availableInstruments.map(inst => (
                  <option key={inst} value={inst}>{inst}</option>
                ))}
              </select>
            </div>

            {/* Filtro por Formato */}
            <div>
              <select
                value={selectedFormat}
                onChange={(e) => setSelectedFormat(e.target.value)}
                className="w-full bg-[#161a24] border border-white/10 rounded-xl px-3 py-2 text-xs font-semibold text-gray-200 focus:outline-none focus:border-blue-500 transition-colors"
              >
                <option value="todos">Todos os Formatos</option>
                <option value="apresentacoes">Apresentações / Concertos</option>
                <option value="ensaios">Ensaios Gerais</option>
                <option value="expediente">Expediente Administrativo</option>
              </select>
            </div>

            {/* Ordenação */}
            <div>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="w-full bg-[#161a24] border border-white/10 rounded-xl px-3 py-2 text-xs font-semibold text-gray-200 focus:outline-none focus:border-blue-500 transition-colors"
              >
                <option value="mais_escalados">Ordenar: Mais escalados</option>
                <option value="menos_escalados">Ordenar: Menos escalados</option>
                <option value="posto">Ordenar: Posto / Graduação</option>
                <option value="nome">Ordenar: Nome (A-Z)</option>
              </select>
            </div>

          </div>

          {/* Filtros em pílulas (Pílulas de situação) */}
          <div className="flex items-center gap-2 pt-2 border-t border-white/5 overflow-x-auto no-scrollbar">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 shrink-0">Situação:</span>
            <button
              onClick={() => setFilterPresence('todos')}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all shrink-0 ${
                filterPresence === 'todos'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white/5 text-gray-400 hover:text-white'
              }`}
            >
              Todos ({reportData.length})
            </button>
            <button
              onClick={() => setFilterPresence('com_escala')}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all shrink-0 ${
                filterPresence === 'com_escala'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white/5 text-gray-400 hover:text-white'
              }`}
            >
              Escalados no mês ({reportData.filter(d => d.totalScales > 0).length})
            </button>
            <button
              onClick={() => setFilterPresence('sem_escala')}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all shrink-0 ${
                filterPresence === 'sem_escala'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white/5 text-gray-400 hover:text-white'
              }`}
            >
              Sem escala no mês ({reportData.filter(d => d.totalScales === 0).length})
            </button>
          </div>
        </section>

        {/* Tabela / Lista de Músicos e Carga de Trabalho */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold uppercase tracking-widest text-gray-400">
              EFETIVO ({filteredReportData.length} MILITARES)
            </span>
            <span className="text-xs text-gray-500">
              Clique em um militar para ver as escalas individuais
            </span>
          </div>

          {loading ? (
            <div className="bg-[#121620] rounded-2xl p-12 flex items-center justify-center border border-white/10">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
            </div>
          ) : filteredReportData.length === 0 ? (
            <div className="bg-[#121620] rounded-2xl p-10 text-center flex flex-col items-center justify-center gap-3 border border-dashed border-white/10">
              <span className="material-symbols-outlined text-gray-600 text-5xl">person_search</span>
              <p className="text-sm font-semibold text-gray-400">Nenhum militar encontrado com os filtros selecionados.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {filteredReportData.map(({ musician, totalScales, confirmedCount, pendingCount, countApresentacoes, countEnsaios, countExpediente, countOutros, detailedScales }) => {
                const isExpanded = expandedMusicianId === musician.id;
                const warName = musician.war_name || musician.name || 'Militar';
                const rank = musician.rank || '';
                const instrument = musician.instrument || 'Banda PMPR';
                const barPercent = Math.min(100, Math.round((totalScales / stats.maxScalesInMonth) * 100));

                return (
                  <div
                    key={musician.id}
                    className="bg-[#121620] border border-white/10 rounded-2xl overflow-hidden transition-all shadow-md hover:border-white/20"
                  >
                    {/* Linha principal do militar */}
                    <div
                      onClick={() => setExpandedMusicianId(isExpanded ? null : musician.id)}
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
                    >
                      {/* Info do Militar */}
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="relative shrink-0">
                          {musician.photo_url ? (
                            <div
                              className="size-11 rounded-xl bg-center bg-cover border border-white/10"
                              style={{ backgroundImage: `url(${musician.photo_url})` }}
                            />
                          ) : (
                            <div className="size-11 rounded-xl bg-blue-600/20 text-blue-400 font-bold border border-blue-500/30 flex items-center justify-center text-sm uppercase">
                              {warName[0] || '?'}
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-white truncate">
                              {rank} {warName}
                            </span>
                            {musician.militaryStatus && musician.militaryStatus !== 'Ativo' && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-red-500/20 text-red-400 border border-red-500/30 uppercase">
                                {musician.militaryStatus}
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-gray-400 truncate font-medium">
                            {instrument}
                          </span>
                        </div>
                      </div>

                      {/* Barra de distribuição e números */}
                      <div className="flex items-center gap-4 sm:gap-6 justify-between sm:justify-end shrink-0">
                        {/* Breakdown badges */}
                        <div className="hidden md:flex items-center gap-1.5 text-[11px]">
                          {countApresentacoes > 0 && (
                            <span className="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20 font-bold" title="Apresentações">
                              {countApresentacoes} apresentações
                            </span>
                          )}
                          {countEnsaios > 0 && (
                            <span className="px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/20 font-bold" title="Ensaios">
                              {countEnsaios} ensaios
                            </span>
                          )}
                          {countExpediente > 0 && (
                            <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold" title="Expediente">
                              {countExpediente} expediente
                            </span>
                          )}
                        </div>

                        {/* Status de Ciência */}
                        {totalScales > 0 && (
                          <div className="flex flex-col items-end min-w-[70px]">
                            <div className="flex items-center gap-1">
                              <span className="material-symbols-outlined text-[14px] text-emerald-400">verified</span>
                              <span className="text-xs font-bold text-emerald-400">{confirmedCount}</span>
                              {pendingCount > 0 && (
                                <>
                                  <span className="text-gray-600">/</span>
                                  <span className="text-xs font-bold text-amber-400" title="Pendentes de visualização">{pendingCount}</span>
                                </>
                              )}
                            </div>
                            <span className="text-[10px] text-gray-400">
                              {pendingCount === 0 ? '100% ciente' : `${pendingCount} pendente(s)`}
                            </span>
                          </div>
                        )}

                        {/* Total de Escalas no Mês */}
                        <div className="flex items-center gap-3">
                          <div className="flex flex-col items-end">
                            <div className="flex items-baseline gap-1">
                              <span className="text-xl sm:text-2xl font-black text-white">
                                {totalScales}
                              </span>
                              <span className="text-[10px] font-bold uppercase text-gray-400">
                                {totalScales === 1 ? 'escala' : 'escalas'}
                              </span>
                            </div>

                            {/* Mini barra de proporção */}
                            <div className="w-20 h-1.5 bg-white/10 rounded-full overflow-hidden mt-1">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  totalScales === 0 
                                    ? 'bg-transparent'
                                    : barPercent > 70 
                                      ? 'bg-emerald-500' 
                                      : 'bg-blue-500'
                                }`}
                                style={{ width: `${barPercent}%` }}
                              />
                            </div>
                          </div>

                          <button
                            className="size-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-transform"
                            style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                            title="Expandir detalhes"
                          >
                            <span className="material-symbols-outlined text-[18px]">expand_more</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Área Expandida com Lista Detalhada das Escalas */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="border-t border-white/5 bg-[#0f131c] px-4 py-4"
                        >
                          <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/5">
                            <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
                              Escalas de {rank} {warName} em {MONTH_NAMES[selectedMonth]} ({detailedScales.length})
                            </span>
                            <span className="text-[11px] text-gray-400">
                              {confirmedCount} confirmadas automaticamente • {pendingCount} pendentes
                            </span>
                          </div>

                          {detailedScales.length === 0 ? (
                            <div className="py-4 text-center text-xs text-gray-500 font-medium">
                              Nenhuma escala atribuída para este militar neste mês.
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                              {detailedScales.map((scaleItem) => {
                                const colors = getFormatColors(scaleItem.format);

                                return (
                                  <div
                                    key={scaleItem.id}
                                    className="bg-[#141824] border border-white/5 rounded-xl p-3 flex flex-col justify-between gap-2 shadow-sm"
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="flex items-center gap-2">
                                        <div className="px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-400 font-black text-xs">
                                          {formatDateDisplay(scaleItem.date)}
                                        </div>
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${colors.bg} ${colors.text} ${colors.border}`}>
                                          {scaleItem.format}
                                        </span>
                                      </div>

                                      <Link href={`/scales/${scaleItem.id}`}>
                                        <button className="text-[11px] font-bold text-blue-400 hover:text-blue-300 flex items-center gap-0.5">
                                          <span>Abrir</span>
                                          <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                                        </button>
                                      </Link>
                                    </div>

                                    <div>
                                      <h5 className="text-xs font-bold text-white truncate">
                                        {scaleItem.title}
                                      </h5>
                                      <div className="flex items-center gap-2 text-[11px] text-gray-400 mt-0.5">
                                        {scaleItem.startTime && (
                                          <span className="text-gray-300 font-medium">
                                            {scaleItem.startTime}
                                          </span>
                                        )}
                                        <span>•</span>
                                        <span className="text-gray-400 truncate">
                                          {scaleItem.role}
                                        </span>
                                      </div>
                                    </div>

                                    {/* Indicador de Ciência / Visualização Automática */}
                                    <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px]">
                                      {scaleItem.isConfirmed ? (
                                        <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
                                          <span className="material-symbols-outlined text-[15px]">verified</span>
                                          <span>Ciente confirmado</span>
                                          {scaleItem.confirmedAt && (
                                            <span className="text-gray-500 text-[10px]">
                                              ({formatDateTime(scaleItem.confirmedAt)})
                                            </span>
                                          )}
                                        </div>
                                      ) : (
                                        <div className="flex items-center gap-1.5 text-amber-400 font-medium">
                                          <span className="material-symbols-outlined text-[15px]">pending</span>
                                          <span>Aguardando abertura</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <div className="h-16 lg:h-8"></div>
      </main>

      {/* BottomNav persists on mobile and is hidden on desktop */}
      <BottomNav />
    </div>
  );
}
