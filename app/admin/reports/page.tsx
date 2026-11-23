'use client';

import Link from 'next/link';
import { motion, AnimatePresence } from 'motion/react';
import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, where, getDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { sortByRankThenName } from '@/lib/sort-military';
import { useFirebase } from '@/components/providers/firebase-provider';
import { useRouter } from 'next/navigation';
import { getFormatColors } from '@/lib/scale-formats';
import { canAccessReports } from '@/lib/permissions';
import { MilitaryStatusBadge } from '@/components/ui/military-status-badge';
import { fmtDate, fmtDateWithWeekday, normalizeDateToYMD, getTodayYMD } from '@/lib/format-date';
import { getCurrentMilitaryStatus } from '@/lib/military-status';

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export default function AdminReportsPage() {
  const router = useRouter();
  const { user, profile, loading: authLoading } = useFirebase();

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

  // Controle de Abas do Relatório: Escalas Musicais vs Relatório Operacional
  const [activeReportType, setActiveReportType] = useState<'musica' | 'operacional'>('musica');
  const [operationalPeriodFilter, setOperationalPeriodFilter] = useState<'mes' | 'semana' | 'todos'>('mes');
  const [operationalSearch, setOperationalSearch] = useState('');
  const [expandedOperationalMusicianId, setExpandedOperationalMusicianId] = useState<string | null>(null);

  // Estados dos Modais de Tabela e Abas Operacionais acionados pelos Cards/Botões
  const [activeTableModal, setActiveTableModal] = useState<
    'op_escalas' | 'op_horas' | 'op_efetivo' | 'op_unidades' | 'mus_servicos' | 'mus_participacoes' | 'mus_ciencia' | null
  >(null);
  const [activeOperationalTab, setActiveOperationalTab] = useState<'todos' | 'efetivo' | 'escalas' | 'horas' | 'unidades'>('todos');
  const [efetivoEmpregadoSubTab, setEfetivoEmpregadoSubTab] = useState<'empregados' | 'nao_empregados'>('empregados');
  const [modalSearch, setModalSearch] = useState('');

  // Músico expandido para ver detalhes
  const [expandedMusicianId, setExpandedMusicianId] = useState<string | null>(null);

  // Verificação de permissões: Exclusivo para Master, Sargenteante, Comandante e Subcomandante
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }

    if (profile && !canAccessReports(profile, user.email)) {
      router.push('/dashboard');
    }
  }, [user, profile, authLoading, router]);

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
      if (s.classification === 'folga' || s.isForecast || s.status === 'forecast') return false; // Folgas e Previsões não contam como escala oficial executada
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

  // ─── CÁLCULOS E DADOS DO RELATÓRIO OPERACIONAL ─────────────────────────────
  
  // Escalas operacionais filtradas pelo período
  const operationalScales = useMemo(() => {
    return scales.filter((s: any) => {
      const isOp = s.classification === 'operacional' || s.isOperational === true || s.type === 'operacional';
      if (!isOp) return false;
      if (!s.date || typeof s.date !== 'string') return false;

      if (operationalPeriodFilter === 'mes') {
        return s.date.startsWith(currentMonthPrefix);
      }
      if (operationalPeriodFilter === 'semana') {
        const today = new Date();
        const firstDayOfWeek = new Date(today);
        const day = today.getDay();
        const diff = today.getDate() - day + (day === 0 ? -6 : 1); // Segunda
        firstDayOfWeek.setDate(diff);
        firstDayOfWeek.setHours(0, 0, 0, 0);

        const lastDayOfWeek = new Date(firstDayOfWeek);
        lastDayOfWeek.setDate(firstDayOfWeek.getDate() + 6);
        lastDayOfWeek.setHours(23, 59, 59, 999);

        const scaleDate = new Date(`${s.date}T12:00:00`);
        return scaleDate >= firstDayOfWeek && scaleDate <= lastDayOfWeek;
      }
      // 'todos' (ano inteiro)
      return s.date.startsWith(String(selectedYear));
    }).sort((a: any, b: any) => (b.date || '').localeCompare(a.date || ''));
  }, [scales, currentMonthPrefix, selectedYear, operationalPeriodFilter]);

  // Indicadores Gerais do Relatório Operacional
  const operationalStats = useMemo(() => {
    const totalEscalas = operationalScales.length;
    let totalHoras = 0;
    const participatingMusicianIds = new Set<string>();
    const opmsSet = new Set<string>();

    operationalScales.forEach((s: any) => {
      const h = Number(s.durationHours) || 8;
      totalHoras += h;
      if (s.opm) opmsSet.add(s.opm.split(' (')[0]);
      if (s.serviceChief?.id) participatingMusicianIds.add(s.serviceChief.id);
      if (s.driver?.id) participatingMusicianIds.add(s.driver.id);
      if (Array.isArray(s.musicians)) {
        s.musicians.forEach((m: any) => participatingMusicianIds.add(m.id));
      }
    });

    return {
      totalEscalas,
      totalHoras: Math.round(totalHoras * 10) / 10,
      totalMilitares: participatingMusicianIds.size,
      totalOpms: opmsSet.size,
      opmsList: Array.from(opmsSet),
    };
  }, [operationalScales]);

  // Dados consolidados por militar no Relatório Operacional
  const operationalReportByMusician = useMemo(() => {
    return musicians.map((musician) => {
      const mid = musician.id;
      const userOperationalScales = operationalScales.filter((s: any) => {
        if (s.serviceChief?.id === mid) return true;
        if (s.driver?.id === mid) return true;
        if (Array.isArray(s.musicians) && s.musicians.some((m: any) => m.id === mid)) return true;
        return false;
      });

      const totalEscalas = userOperationalScales.length;
      const totalHoras = userOperationalScales.reduce((acc: number, s: any) => acc + (Number(s.durationHours) || 8), 0);
      const ultimaEscala = userOperationalScales[0] || null;
      const currentStatus = getCurrentMilitaryStatus(musician) || musician.militaryStatus || 'Ativo';

      return {
        musician,
        totalEscalas,
        totalHoras: Math.round(totalHoras * 10) / 10,
        ultimaEscala,
        currentStatus,
        scales: userOperationalScales,
      };
    });
  }, [musicians, operationalScales]);

  // Lista filtrada e ordenada do Relatório Operacional
  const filteredOperationalReportData = useMemo(() => {
    return operationalReportByMusician
      .filter(({ musician, totalEscalas }) => {
        if (operationalSearch.trim()) {
          const q = operationalSearch.toLowerCase();
          const name = (musician.name || '').toLowerCase();
          const warName = (musician.war_name || '').toLowerCase();
          const re = (musician.re || '').toLowerCase();
          const rank = (musician.rank || '').toLowerCase();
          return name.includes(q) || warName.includes(q) || re.includes(q) || rank.includes(q);
        }
        return true;
      })
      .sort((a, b) => {
        // Primeiro quem mais participou de escalas operacionais
        if (b.totalEscalas !== a.totalEscalas) return b.totalEscalas - a.totalEscalas;
        if (b.totalHoras !== a.totalHoras) return b.totalHoras - a.totalHoras;
        return sortByRankThenName(a.musician, b.musician);
      });
  }, [operationalReportByMusician, operationalSearch]);

  const maxOperationalHours = useMemo(() => {
    return Math.max(...operationalReportByMusician.map(d => d.totalHoras), 1);
  }, [operationalReportByMusician]);

  // Agrupamento detalhado por Unidade Apoiada (OPM)
  const opmBreakdown = useMemo(() => {
    const map = new Map<string, {
      opm: string;
      totalScales: number;
      totalHours: number;
      viaturas: Set<string>;
      musicians: Map<string, { id: string; name: string; rank: string; war_name: string; count: number; hours: number }>;
      scales: any[];
      lastDate: string;
    }>();

    operationalScales.forEach((s: any) => {
      const rawOpm = (s.opm || s.location || 'Outra Unidade').split(' (')[0].trim();
      if (!map.has(rawOpm)) {
        map.set(rawOpm, {
          opm: rawOpm,
          totalScales: 0,
          totalHours: 0,
          viaturas: new Set(),
          musicians: new Map(),
          scales: [],
          lastDate: s.date || '',
        });
      }

      const entry = map.get(rawOpm)!;
      const hours = (Number(s.durationHours) || 8);
      entry.totalScales += 1;
      entry.totalHours += hours;
      if (s.viatura) entry.viaturas.add(s.viatura);
      if (s.date && (!entry.lastDate || s.date > entry.lastDate)) entry.lastDate = s.date;
      entry.scales.push(s);

      const addPerson = (p: any) => {
        if (!p || !p.id) return;
        const cur = entry.musicians.get(p.id) || {
          id: p.id,
          name: p.name || '',
          war_name: p.war_name || '',
          rank: p.rank || '',
          count: 0,
          hours: 0,
        };
        cur.count += 1;
        cur.hours += hours;
        entry.musicians.set(p.id, cur);
      };

      if (s.serviceChief) addPerson(s.serviceChief);
      if (s.driver) addPerson(s.driver);
      if (Array.isArray(s.musicians)) {
        s.musicians.forEach(addPerson);
      }
    });

    return Array.from(map.values()).sort((a, b) => b.totalScales - a.totalScales);
  }, [operationalScales]);

  // Listas de Efetivo Empregado vs Não Empregado no período
  const { empregadosList, naoEmpregadosList } = useMemo(() => {
    const emp = operationalReportByMusician.filter(d => d.totalEscalas > 0);
    const naoEmp = operationalReportByMusician.filter(d => d.totalEscalas === 0);
    return { empregadosList: emp, naoEmpregadosList: naoEmp };
  }, [operationalReportByMusician]);

  // Ranking de Militares por Carga Horária Operacional
  const horasRankingList = useMemo(() => {
    return [...operationalReportByMusician].sort((a, b) => {
      if (b.totalHoras !== a.totalHoras) return b.totalHoras - a.totalHoras;
      if (b.totalEscalas !== a.totalEscalas) return b.totalEscalas - a.totalEscalas;
      return sortByRankThenName(a.musician, b.musician);
    });
  }, [operationalReportByMusician]);

  // Exportação CSV do Relatório Operacional
  const handleExportOperationalCSV = () => {
    const headers = [
      'Posto/Graduação',
      'Nome de Guerra',
      'Nome Completo',
      'RE',
      'Total Escalas Operacionais',
      'Carga Horária (Horas)',
      'Última Escala (Data)',
      'Última Escala (OPM)',
      'Situação Atual'
    ];

    const rows = filteredOperationalReportData.map(d => [
      `"${d.musician.rank || ''}"`,
      `"${d.musician.war_name || ''}"`,
      `"${d.musician.name || ''}"`,
      `"${d.musician.re || ''}"`,
      d.totalEscalas,
      `${d.totalHoras}h`,
      d.ultimaEscala ? `"${fmtDate(d.ultimaEscala.date)}"` : '"—"',
      d.ultimaEscala ? `"${(d.ultimaEscala.opm || '').split(' (')[0]}"` : '"—"',
      `"${d.currentStatus}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `relatorio_operacional_pmpr_${selectedYear}_${selectedMonth + 1}.csv`);
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
            onClick={activeReportType === 'operacional' ? handleExportOperationalCSV : handleExportCSV}
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

        {/* Seletor de Tipo de Relatório: Musical vs Operacional */}
        <div className="flex items-center gap-2 border-b border-white/10 pb-3 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveReportType('musica')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-bold transition-all ${
              activeReportType === 'musica'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 border border-white/5'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">music_note</span>
            <span>Escalas Musicais & Expediente</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveReportType('operacional')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-bold transition-all ${
              activeReportType === 'operacional'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 border border-white/5'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">local_police</span>
            <span>Relatório Operacional</span>
            {operationalStats.totalEscalas > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-[10px] font-black border border-blue-400/30">
                {operationalStats.totalEscalas}
              </span>
            )}
          </button>
        </div>

        {/* ============================================================== */}
        {/* ABA: RELATÓRIO OPERACIONAL                                     */}
        {/* ============================================================== */}
        {activeReportType === 'operacional' ? (
          <div className="flex flex-col gap-6">

            {/* Barra de Período Operacional */}
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

              {/* Filtros Rápidos de Período */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setOperationalPeriodFilter('semana')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                    operationalPeriodFilter === 'semana'
                      ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                      : 'bg-white/5 text-gray-400 border-white/5 hover:bg-white/10'
                  }`}
                >
                  Semana Atual
                </button>

                <button
                  type="button"
                  onClick={() => setOperationalPeriodFilter('mes')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                    operationalPeriodFilter === 'mes'
                      ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                      : 'bg-white/5 text-gray-400 border-white/5 hover:bg-white/10'
                  }`}
                >
                  Mês Inteiro
                </button>

                <button
                  type="button"
                  onClick={() => setOperationalPeriodFilter('todos')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                    operationalPeriodFilter === 'todos'
                      ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                      : 'bg-white/5 text-gray-400 border-white/5 hover:bg-white/10'
                  }`}
                >
                  Ano {selectedYear}
                </button>
              </div>
            </section>

            {/* 4 Cards de Indicadores Operacionais Clicáveis como Botões de Tabela */}
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              
              {/* Botão Card 1: Escalas Operacionais */}
              <button
                type="button"
                onClick={() => {
                  setActiveTableModal('op_escalas');
                  setActiveOperationalTab('escalas');
                  setModalSearch('');
                }}
                className={`text-left bg-[#121620] border rounded-2xl p-4 flex flex-col gap-1 shadow-lg transition-all cursor-pointer active:scale-95 group hover:border-blue-500/60 hover:shadow-blue-500/10 ${
                  activeOperationalTab === 'escalas' ? 'border-blue-500 ring-2 ring-blue-500/30' : 'border-blue-500/20'
                }`}
                title="Clique para abrir tabela detalhada com todas as Escalas Operacionais"
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5 group-hover:text-blue-400 transition-colors">
                    <span className="material-symbols-outlined text-[18px] text-blue-400">local_police</span>
                    Escalas Operacionais
                  </span>
                  <span className="material-symbols-outlined text-gray-500 text-[16px] group-hover:text-blue-400 transition-colors">
                    open_in_new
                  </span>
                </div>
                <span className="text-2xl sm:text-3xl font-black text-white tracking-tight mt-1 group-hover:text-blue-300 transition-colors">
                  {operationalStats.totalEscalas}
                </span>
                <div className="text-[11px] text-gray-400 flex items-center justify-between mt-0.5">
                  <span className="truncate">Serviços externos</span>
                  <span className="text-[10px] text-blue-400 font-bold group-hover:underline shrink-0">Abrir Tabela</span>
                </div>
              </button>

              {/* Botão Card 2: Horas Operacionais */}
              <button
                type="button"
                onClick={() => {
                  setActiveTableModal('op_horas');
                  setActiveOperationalTab('horas');
                  setModalSearch('');
                }}
                className={`text-left bg-[#121620] border rounded-2xl p-4 flex flex-col gap-1 shadow-lg transition-all cursor-pointer active:scale-95 group hover:border-indigo-500/60 hover:shadow-indigo-500/10 ${
                  activeOperationalTab === 'horas' ? 'border-indigo-500 ring-2 ring-indigo-500/30' : 'border-indigo-500/20'
                }`}
                title="Clique para abrir tabela de Equalização e Ranking de Carga Horária"
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5 group-hover:text-indigo-400 transition-colors">
                    <span className="material-symbols-outlined text-[18px] text-indigo-400">schedule</span>
                    Horas Operacionais
                  </span>
                  <span className="material-symbols-outlined text-gray-500 text-[16px] group-hover:text-indigo-400 transition-colors">
                    open_in_new
                  </span>
                </div>
                <span className="text-2xl sm:text-3xl font-black text-indigo-400 tracking-tight mt-1 group-hover:text-indigo-300 transition-colors">
                  {operationalStats.totalHoras}h
                </span>
                <div className="text-[11px] text-gray-400 flex items-center justify-between mt-0.5">
                  <span className="truncate">Carga horária total</span>
                  <span className="text-[10px] text-indigo-400 font-bold group-hover:underline shrink-0">Ver Ranking</span>
                </div>
              </button>

              {/* Botão Card 3: Efetivo Empregado */}
              <button
                type="button"
                onClick={() => {
                  setActiveTableModal('op_efetivo');
                  setActiveOperationalTab('efetivo');
                  setModalSearch('');
                }}
                className={`text-left bg-[#121620] border rounded-2xl p-4 flex flex-col gap-1 shadow-lg transition-all cursor-pointer active:scale-95 group hover:border-emerald-500/60 hover:shadow-emerald-500/10 ${
                  activeOperationalTab === 'efetivo' ? 'border-emerald-500 ring-2 ring-emerald-500/30' : 'border-emerald-500/20'
                }`}
                title="Clique para abrir tabela do Efetivo Empregado e Não Empregado"
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5 group-hover:text-emerald-400 transition-colors">
                    <span className="material-symbols-outlined text-[18px] text-emerald-400">groups</span>
                    Efetivo Empregado
                  </span>
                  <span className="material-symbols-outlined text-gray-500 text-[16px] group-hover:text-emerald-400 transition-colors">
                    open_in_new
                  </span>
                </div>
                <span className="text-2xl sm:text-3xl font-black text-emerald-400 tracking-tight mt-1 group-hover:text-emerald-300 transition-colors">
                  {operationalStats.totalMilitares}
                </span>
                <div className="text-[11px] text-gray-400 flex items-center justify-between mt-0.5">
                  <span className="truncate">Militares ativos</span>
                  <span className="text-[10px] text-emerald-400 font-bold group-hover:underline shrink-0">Ver Efetivo</span>
                </div>
              </button>

              {/* Botão Card 4: Unidades Apoiadas */}
              <button
                type="button"
                onClick={() => {
                  setActiveTableModal('op_unidades');
                  setActiveOperationalTab('unidades');
                  setModalSearch('');
                }}
                className={`text-left bg-[#121620] border rounded-2xl p-4 flex flex-col gap-1 shadow-lg transition-all cursor-pointer active:scale-95 group hover:border-amber-500/60 hover:shadow-amber-500/10 ${
                  activeOperationalTab === 'unidades' ? 'border-amber-500 ring-2 ring-amber-500/30' : 'border-amber-500/20'
                }`}
                title="Clique para abrir tabela detalhada por Unidade Apoiada (OPM)"
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5 group-hover:text-amber-400 transition-colors">
                    <span className="material-symbols-outlined text-[18px] text-amber-400">domain</span>
                    Unidades Apoiadas
                  </span>
                  <span className="material-symbols-outlined text-gray-500 text-[16px] group-hover:text-amber-400 transition-colors">
                    open_in_new
                  </span>
                </div>
                <span className="text-2xl sm:text-3xl font-black text-amber-400 tracking-tight mt-1 group-hover:text-amber-300 transition-colors">
                  {operationalStats.totalOpms}
                </span>
                <div className="text-[11px] text-gray-400 flex items-center justify-between mt-0.5">
                  <span className="truncate">OPMs atendidas</span>
                  <span className="text-[10px] text-amber-400 font-bold group-hover:underline shrink-0">Ver por OPM</span>
                </div>
              </button>
            </section>

            {/* Barra de Filtros Rápidos de Visualização de Tabelas */}
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider shrink-0 mr-1 flex items-center gap-1">
                <span className="material-symbols-outlined text-[16px]">view_list</span>
                Tabela:
              </span>
              <button
                type="button"
                onClick={() => setActiveOperationalTab('todos')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border shrink-0 ${
                  activeOperationalTab === 'todos'
                    ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                    : 'bg-white/5 text-gray-400 border-white/5 hover:bg-white/10'
                }`}
              >
                Visão Geral (Todas)
              </button>
              <button
                type="button"
                onClick={() => setActiveOperationalTab('efetivo')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border shrink-0 ${
                  activeOperationalTab === 'efetivo'
                    ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                    : 'bg-white/5 text-gray-400 border-white/5 hover:bg-white/10'
                }`}
              >
                👮 Efetivo Empregado ({operationalStats.totalMilitares})
              </button>
              <button
                type="button"
                onClick={() => setActiveOperationalTab('escalas')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border shrink-0 ${
                  activeOperationalTab === 'escalas'
                    ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                    : 'bg-white/5 text-gray-400 border-white/5 hover:bg-white/10'
                }`}
              >
                🚓 Escalas Operacionais ({operationalStats.totalEscalas})
              </button>
              <button
                type="button"
                onClick={() => setActiveOperationalTab('horas')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border shrink-0 ${
                  activeOperationalTab === 'horas'
                    ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                    : 'bg-white/5 text-gray-400 border-white/5 hover:bg-white/10'
                }`}
              >
                ⏱️ Carga Horária & Ranking ({operationalStats.totalHoras}h)
              </button>
              <button
                type="button"
                onClick={() => setActiveOperationalTab('unidades')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border shrink-0 ${
                  activeOperationalTab === 'unidades'
                    ? 'bg-amber-600 text-white border-amber-500 shadow-sm'
                    : 'bg-white/5 text-gray-400 border-white/5 hover:bg-white/10'
                }`}
              >
                🏛️ Unidades Apoiadas ({operationalStats.totalOpms})
              </button>
            </div>

            {/* Busca Rápida no Relatório Operacional */}
            <section className="bg-[#121620] border border-white/10 rounded-2xl p-4 shadow-lg flex items-center justify-between gap-4">
              <div className="relative flex-1 max-w-md">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-[18px]">
                  search
                </span>
                <input
                  type="text"
                  placeholder="Filtrar militar por nome de guerra ou RE..."
                  value={operationalSearch}
                  onChange={(e) => setOperationalSearch(e.target.value)}
                  className="w-full bg-[#161a24] border border-white/10 text-white rounded-xl pl-9 pr-4 py-2 text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              <Link href="/admin/scales/operational">
                <button
                  type="button"
                  className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-md flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[18px]">add_circle</span>
                  <span className="hidden sm:inline">Nova Escala Operacional</span>
                </button>
              </Link>
            </section>

            {/* TABELAS OPERACIONAIS SELECIONADAS PELAS ABAS OU CARDS */}

            {/* 1. VISÃO: UNIDADES APOIADAS (OPMs) */}
            {(activeOperationalTab === 'unidades') && (
              <section className="bg-[#121620] border border-amber-500/30 rounded-3xl p-4 sm:p-6 shadow-xl flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-4">
                  <div>
                    <h3 className="text-base font-black text-white flex items-center gap-2">
                      <span className="material-symbols-outlined text-amber-400 text-[22px]">domain</span>
                      Controle por Unidade Apoiada (OPM)
                    </h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Detalhamento de escalas, carga horária e viaturas empregadas por Batalhão/Unidade
                    </p>
                  </div>
                  <span className="text-xs text-amber-400 font-bold self-start sm:self-auto bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20">
                    {opmBreakdown.length} unidade(s) atendida(s)
                  </span>
                </div>

                {opmBreakdown.length === 0 ? (
                  <div className="py-10 text-center text-gray-500 text-xs">
                    Nenhuma unidade apoiada registrada no período.
                  </div>
                ) : (
                  <div className="overflow-x-auto no-scrollbar">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-white/10 text-gray-400 uppercase tracking-wider text-[11px]">
                          <th className="py-3 px-3 font-extrabold">Unidade / OPM</th>
                          <th className="py-3 px-3 font-extrabold text-center">Escalas</th>
                          <th className="py-3 px-3 font-extrabold text-center">Carga Horária</th>
                          <th className="py-3 px-3 font-extrabold">Viaturas Empregadas</th>
                          <th className="py-3 px-3 font-extrabold">Efetivo Alocado</th>
                          <th className="py-3 px-3 font-extrabold text-right">Último Apoio</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {opmBreakdown.map((item) => (
                          <tr key={item.opm} className="hover:bg-white/[0.03] transition-colors">
                            <td className="py-3 px-3 font-black text-white text-sm">
                              {item.opm}
                            </td>
                            <td className="py-3 px-3 text-center">
                              <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                                {item.totalScales}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-center font-bold text-indigo-300">
                              {item.totalHours}h
                            </td>
                            <td className="py-3 px-3 text-amber-400 font-semibold">
                              {Array.from(item.viaturas).join(', ') || 'A pé / Não informado'}
                            </td>
                            <td className="py-3 px-3 text-gray-300">
                              <span className="text-[11px]">
                                {Array.from(item.musicians.values()).map(m => `${m.rank} ${m.war_name || m.name}`).join(', ')}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-right text-gray-400 whitespace-nowrap">
                              {item.lastDate ? fmtDate(item.lastDate) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {/* 2. VISÃO: CARGA HORÁRIA & RANKING */}
            {(activeOperationalTab === 'horas') && (
              <section className="bg-[#121620] border border-indigo-500/30 rounded-3xl p-4 sm:p-6 shadow-xl flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-4">
                  <div>
                    <h3 className="text-base font-black text-white flex items-center gap-2">
                      <span className="material-symbols-outlined text-indigo-400 text-[22px]">schedule</span>
                      Controle e Equalização de Carga Horária Operacional
                    </h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Ranking de horas cumpridas pelo efetivo para equilíbrio das futuras escalas
                    </p>
                  </div>
                  <span className="text-xs text-indigo-400 font-bold self-start sm:self-auto bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20">
                    Total: {operationalStats.totalHoras}h cumpridas
                  </span>
                </div>

                <div className="overflow-x-auto no-scrollbar">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-white/10 text-gray-400 uppercase tracking-wider text-[11px]">
                        <th className="py-3 px-3 font-extrabold">Pos.</th>
                        <th className="py-3 px-3 font-extrabold">Militar</th>
                        <th className="py-3 px-3 font-extrabold text-center">Horas Acumuladas</th>
                        <th className="py-3 px-3 font-extrabold text-center">Escalas</th>
                        <th className="py-3 px-3 font-extrabold">Proporção Carga</th>
                        <th className="py-3 px-3 font-extrabold text-center">Situação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {horasRankingList.map((item, index) => {
                        const percent = maxOperationalHours > 0 ? Math.round((item.totalHoras / maxOperationalHours) * 100) : 0;
                        return (
                          <tr key={item.musician.id} className="hover:bg-white/[0.03] transition-colors">
                            <td className="py-3 px-3 font-bold text-gray-500">
                              #{index + 1}
                            </td>
                            <td className="py-3 px-3">
                              <span className="font-bold text-white">
                                {item.musician.rank} {item.musician.war_name || item.musician.name}
                              </span>
                              <span className="text-[10px] text-gray-400 ml-1.5">
                                {item.musician.re ? `(RE ${item.musician.re})` : ''}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-center font-black text-indigo-400 text-sm">
                              {item.totalHoras}h
                            </td>
                            <td className="py-3 px-3 text-center">
                              <span className="px-2 py-0.5 rounded-full bg-white/5 font-bold text-white">
                                {item.totalEscalas}
                              </span>
                            </td>
                            <td className="py-3 px-3 min-w-[140px]">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-gradient-to-r from-indigo-500 to-blue-400 rounded-full"
                                    style={{ width: `${Math.min(percent, 100)}%` }}
                                  />
                                </div>
                                <span className="text-[10px] text-gray-400 font-bold">{percent}%</span>
                              </div>
                            </td>
                            <td className="py-3 px-3 text-center">
                              <MilitaryStatusBadge status={item.currentStatus} size="xs" />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* 3. VISÃO: EFETIVO (EMPREGADOS VS NÃO EMPREGADOS) OU VISÃO GERAL */}
            {(activeOperationalTab === 'efetivo' || activeOperationalTab === 'todos') && (
              <section className="bg-[#121620] border border-white/10 rounded-3xl p-4 sm:p-6 shadow-xl flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
                  <div>
                    <h3 className="text-base font-black text-white flex items-center gap-2">
                      <span className="material-symbols-outlined text-emerald-400 text-[22px]">badge</span>
                      Controle de Efetivo em Escalas Operacionais
                    </h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Total de escalas operacionais e horas acumuladas no período por militar
                    </p>
                  </div>

                  {/* Sub-abas: Empregados vs Não Empregados */}
                  <div className="flex items-center gap-1.5 self-start sm:self-auto bg-black/40 p-1 rounded-xl border border-white/5">
                    <button
                      type="button"
                      onClick={() => setEfetivoEmpregadoSubTab('empregados')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                        efetivoEmpregadoSubTab === 'empregados'
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      Empregados ({empregadosList.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setEfetivoEmpregadoSubTab('nao_empregados')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                        efetivoEmpregadoSubTab === 'nao_empregados'
                          ? 'bg-amber-600 text-white shadow-sm'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      Sem Escala ({naoEmpregadosList.length})
                    </button>
                  </div>
                </div>

                {/* Tabela do Efetivo */}
                <div className="overflow-x-auto no-scrollbar">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-white/10 text-gray-400 uppercase tracking-wider text-[11px]">
                        <th className="py-3 px-3 font-extrabold">Militar</th>
                        <th className="py-3 px-3 font-extrabold text-center">Escalas</th>
                        <th className="py-3 px-3 font-extrabold text-center">Horas Acumuladas</th>
                        <th className="py-3 px-3 font-extrabold hidden md:table-cell">Última Escala Operacional</th>
                        <th className="py-3 px-3 font-extrabold text-center">Situação</th>
                        <th className="py-3 px-3 font-extrabold text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {(efetivoEmpregadoSubTab === 'empregados' ? empregadosList : naoEmpregadosList)
                        .filter(({ musician }) => {
                          if (operationalSearch.trim()) {
                            const q = operationalSearch.toLowerCase();
                            const name = (musician.name || '').toLowerCase();
                            const warName = (musician.war_name || '').toLowerCase();
                            const re = (musician.re || '').toLowerCase();
                            return name.includes(q) || warName.includes(q) || re.includes(q);
                          }
                          return true;
                        })
                        .map(({ musician, totalEscalas, totalHoras, ultimaEscala, currentStatus, scales: userOpScales }) => {
                          const isExpanded = expandedOperationalMusicianId === musician.id;
                          const hasScales = totalEscalas > 0;
                          const percentHours = Math.round((totalHoras / maxOperationalHours) * 100);

                          return (
                            <React.Fragment key={musician.id}>
                              <tr className={`hover:bg-white/[0.03] transition-colors ${hasScales ? 'bg-blue-500/[0.02]' : ''}`}>
                                <td className="py-3 px-3">
                                  <div className="flex items-center gap-2.5">
                                    {musician.photo_url ? (
                                      <div
                                        className="size-8 rounded-full bg-cover bg-center border border-white/10 shrink-0"
                                        style={{ backgroundImage: `url(${musician.photo_url})` }}
                                      />
                                    ) : (
                                      <div className="size-8 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center justify-center font-bold text-[11px] uppercase shrink-0">
                                        {(musician.war_name || musician.name || 'M')[0]}
                                      </div>
                                    )}
                                    <div className="flex flex-col min-w-0">
                                      <span className="font-bold text-white truncate">
                                        {musician.rank || ''} {musician.war_name || musician.name || ''}
                                      </span>
                                      <span className="text-[10px] text-gray-400 truncate">
                                        {musician.re ? `RE ${musician.re}` : 'Efetivo'} • {musician.instrument || 'Banda'}
                                      </span>
                                    </div>
                                  </div>
                                </td>

                                {/* Quantidade de Escalas */}
                                <td className="py-3 px-3 text-center">
                                  <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-black ${
                                    totalEscalas > 0
                                      ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                      : 'bg-white/5 text-gray-500'
                                  }`}>
                                    {totalEscalas}
                                  </span>
                                </td>

                                {/* Horas Acumuladas */}
                                <td className="py-3 px-3 text-center">
                                  <div className="flex flex-col items-center gap-1">
                                    <span className="font-extrabold text-white text-xs">
                                      {totalHoras}h
                                    </span>
                                    {totalHoras > 0 && (
                                      <div className="w-16 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                        <div
                                          className="h-full bg-blue-500 rounded-full"
                                          style={{ width: `${Math.min(percentHours, 100)}%` }}
                                        />
                                      </div>
                                    )}
                                  </div>
                                </td>

                                {/* Última Escala */}
                                <td className="py-3 px-3 hidden md:table-cell text-gray-300">
                                  {ultimaEscala ? (
                                    <div className="flex flex-col">
                                      <span className="font-semibold text-white">
                                        {fmtDate(ultimaEscala.date)} ({ultimaEscala.time || '07:00'})
                                      </span>
                                      <span className="text-[10px] text-gray-400 truncate">
                                        {(ultimaEscala.opm || ultimaEscala.location || '').split(' (')[0]} • {ultimaEscala.format || 'RPA'}
                                      </span>
                                    </div>
                                  ) : (
                                    <span className="text-gray-500 italic">Sem escalas no período</span>
                                  )}
                                </td>

                                {/* Situação Militar */}
                                <td className="py-3 px-3 text-center">
                                  <MilitaryStatusBadge 
                                    status={currentStatus} 
                                    size="xs"
                                  />
                                </td>

                                {/* Ação: Expandir detalhes */}
                                <td className="py-3 px-3 text-right">
                                  {hasScales ? (
                                    <button
                                      type="button"
                                      onClick={() => setExpandedOperationalMusicianId(isExpanded ? null : musician.id)}
                                      className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-blue-400 font-bold text-[11px] transition-colors inline-flex items-center gap-1"
                                    >
                                      <span>{isExpanded ? 'Recolher' : 'Detalhar'}</span>
                                      <span className="material-symbols-outlined text-[14px]">
                                        {isExpanded ? 'expand_less' : 'expand_more'}
                                      </span>
                                    </button>
                                  ) : (
                                    <span className="text-[11px] text-gray-600">—</span>
                                  )}
                                </td>
                              </tr>

                              {/* Linha de Detalhamento das Escalas do Militar */}
                              {isExpanded && hasScales && (
                                <tr className="bg-blue-950/20 border-b border-blue-500/20">
                                  <td colSpan={6} className="p-4">
                                    <div className="flex flex-col gap-2.5">
                                      <span className="text-xs font-bold text-blue-300 flex items-center gap-1.5">
                                        <span className="material-symbols-outlined text-[16px]">list_alt</span>
                                        Detalhamento dos Serviços Operacionais de {musician.rank} {musician.war_name || musician.name}:
                                      </span>
                                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                                        {userOpScales.map((s: any) => {
                                          const isChief = s.serviceChief?.id === musician.id;
                                          const isDriver = s.driver?.id === musician.id;
                                          const funcao = isChief ? 'Comandante da Equipe' : isDriver ? 'Motorista / Condutor' : 'Patrulheiro / Componente';

                                          return (
                                            <div key={s.id} className="bg-[#121620] border border-white/10 rounded-xl p-3 flex flex-col gap-1.5 shadow-sm">
                                              <div className="flex items-center justify-between">
                                                <span className="font-extrabold text-white text-xs">
                                                  {fmtDate(s.date)}
                                                </span>
                                                <span className="text-[10px] font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full">
                                                  {s.durationHours || 8}h ({s.time} - {s.endTime || '19:00'})
                                                </span>
                                              </div>
                                              <div className="text-xs text-gray-300">
                                                <span className="font-semibold text-white">OPM:</span> {(s.opm || s.location || '').split(' (')[0]}
                                              </div>
                                              <div className="text-[11px] text-gray-400 flex items-center justify-between">
                                                <span>{s.format || 'Viatura (RPA)'}</span>
                                                {s.viatura && <span className="font-bold text-amber-400">{s.viatura}</span>}
                                              </div>
                                              <div className="text-[10px] text-indigo-400 font-bold border-t border-white/5 pt-1 mt-0.5">
                                                Função: {funcao}
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* 4. VISÃO: HISTÓRICO DE ESCALAS OPERACIONAIS OU VISÃO GERAL */}
            {(activeOperationalTab === 'escalas' || activeOperationalTab === 'todos') && (
              <section className="bg-[#121620] border border-blue-500/30 rounded-3xl p-4 sm:p-6 shadow-xl flex flex-col gap-4">
                <div className="border-b border-white/10 pb-3 flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-black text-white flex items-center gap-2">
                      <span className="material-symbols-outlined text-blue-400 text-[22px]">history</span>
                      Histórico Geral de Escalas Operacionais
                    </h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Todas as guarnições e viaturas escaladas para policiamento no período
                    </p>
                  </div>
                  <span className="text-xs text-blue-400 font-bold bg-blue-500/10 px-3 py-1 rounded-full border border-blue-500/20">
                    {operationalScales.length} escala(s)
                  </span>
                </div>

                {operationalScales.length === 0 ? (
                  <div className="py-12 flex flex-col items-center justify-center text-center gap-2 text-gray-500">
                    <span className="material-symbols-outlined text-4xl text-gray-600">local_police</span>
                    <p className="text-sm font-semibold">Nenhuma escala operacional cadastrada neste período.</p>
                    <Link href="/admin/scales/operational">
                      <button type="button" className="mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition-all">
                        Cadastrar Primeira Escala Operacional
                      </button>
                    </Link>
                  </div>
                ) : (
                  <div className="overflow-x-auto no-scrollbar">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-white/10 text-gray-400 uppercase tracking-wider text-[11px]">
                          <th className="py-3 px-3 font-extrabold">Data / Horário</th>
                          <th className="py-3 px-3 font-extrabold">Modalidade</th>
                          <th className="py-3 px-3 font-extrabold">OPM Apoiada</th>
                          <th className="py-3 px-3 font-extrabold">Viatura</th>
                          <th className="py-3 px-3 font-extrabold">Guarnição Escalada</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {operationalScales.map((s: any) => {
                          const chiefLabel = s.serviceChief ? `${s.serviceChief.rank || ''} ${s.serviceChief.war_name || s.serviceChief.name || ''}`.trim() : null;
                          const driverLabel = s.driver ? `${s.driver.rank || ''} ${s.driver.war_name || s.driver.name || ''}`.trim() : null;
                          const membersLabels = Array.isArray(s.musicians)
                            ? s.musicians
                                .filter((m: any) => m.id !== s.serviceChief?.id && m.id !== s.driver?.id)
                                .map((m: any) => `${m.rank || ''} ${m.war_name || m.name || ''}`.trim())
                            : [];

                          return (
                            <tr key={s.id} className="hover:bg-white/[0.03] transition-colors">
                              <td className="py-3 px-3 font-bold text-white whitespace-nowrap">
                                <div>{fmtDate(s.date)}</div>
                                <span className="text-[10px] text-gray-400 font-normal">
                                  {s.time} às {s.endTime || '19:00'} ({s.durationHours || 8}h)
                                </span>
                              </td>
                              <td className="py-3 px-3 text-blue-300 font-semibold">
                                {s.format || 'Viatura (RPA)'}
                              </td>
                              <td className="py-3 px-3 text-white font-bold">
                                {(s.opm || s.location || '').split(' (')[0]}
                              </td>
                              <td className="py-3 px-3 text-amber-400 font-bold whitespace-nowrap">
                                {s.viatura || '—'}
                              </td>
                              <td className="py-3 px-3">
                                <div className="flex flex-col gap-0.5">
                                  {chiefLabel && (
                                    <span className="text-white font-bold">
                                      ⭐ <span className="text-amber-300">{chiefLabel}</span> (Cmt)
                                    </span>
                                  )}
                                  {driverLabel && (
                                    <span className="text-indigo-300 font-medium">
                                      🚘 {driverLabel} (Mot)
                                    </span>
                                  )}
                                  {membersLabels.length > 0 && (
                                    <span className="text-gray-300">
                                      👮 {membersLabels.join(', ')}
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

          </div>
        ) : (
          /* ============================================================== */
          /* ABA: ESCALAS MUSICAIS & EXPEDIENTE (EXISTENTE)                */
          /* ============================================================== */
          <div className="flex flex-col gap-6">

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

        {/* 4 Cards de Estatísticas / Visão Geral (KPIs) Clicáveis como Botões de Tabela */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          
          {/* Card 1: Serviços no Mês */}
          <button
            type="button"
            onClick={() => {
              setActiveTableModal('mus_servicos');
              setModalSearch('');
            }}
            className="text-left bg-[#121620] border border-blue-500/20 hover:border-blue-500/60 rounded-2xl p-4 flex flex-col gap-1 shadow-lg transition-all cursor-pointer active:scale-95 group"
            title="Clique para abrir tabela detalhada com todos os Serviços Musicais do Mês"
          >
            <div className="flex items-center justify-between w-full">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5 group-hover:text-blue-400 transition-colors">
                <span className="material-symbols-outlined text-[16px] text-blue-400">event</span>
                Serviços no Mês
              </span>
              <span className="material-symbols-outlined text-gray-500 text-[16px] group-hover:text-blue-400 transition-colors">
                open_in_new
              </span>
            </div>
            <span className="text-2xl sm:text-3xl font-black text-white tracking-tight mt-1 group-hover:text-blue-300 transition-colors">
              {stats.totalServicos}
            </span>
            <div className="text-[11px] text-gray-400 flex items-center justify-between mt-0.5">
              <span className="truncate">Escalas publicadas</span>
              <span className="text-[10px] text-blue-400 font-bold group-hover:underline shrink-0">Abrir Tabela</span>
            </div>
          </button>

          {/* Card 2: Participações */}
          <button
            type="button"
            onClick={() => {
              setActiveTableModal('mus_participacoes');
              setModalSearch('');
            }}
            className="text-left bg-[#121620] border border-purple-500/20 hover:border-purple-500/60 rounded-2xl p-4 flex flex-col gap-1 shadow-lg transition-all cursor-pointer active:scale-95 group"
            title="Clique para abrir tabela detalhada de Participações do Efetivo"
          >
            <div className="flex items-center justify-between w-full">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5 group-hover:text-purple-400 transition-colors">
                <span className="material-symbols-outlined text-[16px] text-purple-400">group_work</span>
                Participações
              </span>
              <span className="material-symbols-outlined text-gray-500 text-[16px] group-hover:text-purple-400 transition-colors">
                open_in_new
              </span>
            </div>
            <span className="text-2xl sm:text-3xl font-black text-white tracking-tight mt-1 group-hover:text-purple-300 transition-colors">
              {stats.totalEscalacoes}
            </span>
            <div className="text-[11px] text-gray-400 flex items-center justify-between mt-0.5">
              <span className="truncate">Homens-serviço</span>
              <span className="text-[10px] text-purple-400 font-bold group-hover:underline shrink-0">Abrir Tabela</span>
            </div>
          </button>

          {/* Card 3: Média / Músico */}
          <button
            type="button"
            onClick={() => {
              setSortBy(sortBy === 'mais_escalados' ? 'menos_escalados' : 'mais_escalados');
            }}
            className="text-left bg-[#121620] border border-amber-500/20 hover:border-amber-500/60 rounded-2xl p-4 flex flex-col gap-1 shadow-lg transition-all cursor-pointer active:scale-95 group"
            title="Clique para ordenar entre Mais e Menos Escalados"
          >
            <div className="flex items-center justify-between w-full">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5 group-hover:text-amber-400 transition-colors">
                <span className="material-symbols-outlined text-[16px] text-amber-400">calculate</span>
                Média / Músico
              </span>
              <span className="material-symbols-outlined text-gray-500 text-[16px] group-hover:text-amber-400 transition-colors">
                sort
              </span>
            </div>
            <span className="text-2xl sm:text-3xl font-black text-white tracking-tight mt-1 group-hover:text-amber-300 transition-colors">
              {stats.mediaPorMusico}
            </span>
            <div className="text-[11px] text-gray-400 flex items-center justify-between mt-0.5">
              <span className="truncate">Escalas por integrante</span>
              <span className="text-[10px] text-amber-400 font-bold group-hover:underline shrink-0">Alternar Ordem</span>
            </div>
          </button>

          {/* Card 4: Taxa de Ciência */}
          <button
            type="button"
            onClick={() => {
              setActiveTableModal('mus_ciencia');
              setModalSearch('');
            }}
            className="text-left bg-[#121620] border border-emerald-500/20 hover:border-emerald-500/60 rounded-2xl p-4 flex flex-col gap-1 shadow-lg transition-all cursor-pointer active:scale-95 group"
            title="Clique para abrir tabela de Controle de Confirmação e Ciência das Escalas"
          >
            <div className="flex items-center justify-between w-full">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5 group-hover:text-emerald-400 transition-colors">
                <span className="material-symbols-outlined text-[16px] text-emerald-400">verified</span>
                Taxa de Ciência
              </span>
              <span className="material-symbols-outlined text-gray-500 text-[16px] group-hover:text-emerald-400 transition-colors">
                open_in_new
              </span>
            </div>
            <span className="text-2xl sm:text-3xl font-black text-emerald-400 tracking-tight mt-1 group-hover:text-emerald-300 transition-colors">
              {stats.taxaConfirmacaoGeral}%
            </span>
            <div className="text-[11px] text-gray-400 flex items-center justify-between mt-0.5">
              <span className="truncate">Escalas visualizadas</span>
              <span className="text-[10px] text-emerald-400 font-bold group-hover:underline shrink-0">Ver Pendências</span>
            </div>
          </button>
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
                              <MilitaryStatusBadge 
                                status={musician.militaryStatus} 
                                size="xs"
                              />
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
        </div>
      )}

        <div className="h-6"></div>
      </main>

      {/* ============================================================== */}
      {/* MODAL DE CONTROLE EM FORMA DE TABELA (ACIONADO PELOS BOTÕES)   */}
      {/* ============================================================== */}
      <AnimatePresence>
        {activeTableModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-[#121620] border border-white/10 rounded-3xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
            >
              {/* Header do Modal */}
              <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between gap-4 bg-[#161a24]">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[22px]">
                      {activeTableModal === 'op_escalas' ? 'local_police' :
                       activeTableModal === 'op_horas' ? 'schedule' :
                       activeTableModal === 'op_efetivo' ? 'groups' :
                       activeTableModal === 'op_unidades' ? 'domain' :
                       activeTableModal === 'mus_servicos' ? 'event' :
                       activeTableModal === 'mus_participacoes' ? 'group_work' : 'verified'}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-base font-black text-white leading-tight">
                      {activeTableModal === 'op_escalas' && 'Tabela de Escalas Operacionais'}
                      {activeTableModal === 'op_horas' && 'Tabela de Carga Horária & Ranking Operacional'}
                      {activeTableModal === 'op_efetivo' && 'Tabela de Efetivo em Escalas Operacionais'}
                      {activeTableModal === 'op_unidades' && 'Tabela de Apoio por Unidade (OPM)'}
                      {activeTableModal === 'mus_servicos' && 'Tabela de Serviços Musicais do Mês'}
                      {activeTableModal === 'mus_participacoes' && 'Tabela de Participações do Efetivo Musical'}
                      {activeTableModal === 'mus_ciencia' && 'Tabela de Confirmações & Ciência das Escalas'}
                    </h3>
                    <p className="text-xs text-gray-400">
                      Visualização analítica para controle e gestão do comando
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-colors border border-white/5"
                    title="Imprimir esta tabela"
                  >
                    <span className="material-symbols-outlined text-[20px]">print</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTableModal(null)}
                    className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-colors border border-white/5"
                    title="Fechar janela"
                  >
                    <span className="material-symbols-outlined text-[20px]">close</span>
                  </button>
                </div>
              </div>

              {/* Barra de Filtros Internos do Modal */}
              <div className="px-5 py-3 border-b border-white/5 bg-[#121620] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="relative flex-1 max-w-sm">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-[18px]">
                    search
                  </span>
                  <input
                    type="text"
                    placeholder="Buscar registro nesta tabela..."
                    value={modalSearch}
                    onChange={(e) => setModalSearch(e.target.value)}
                    className="w-full bg-[#161a24] border border-white/10 text-white rounded-xl pl-9 pr-3 py-1.5 text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>

                {activeTableModal === 'op_efetivo' && (
                  <div className="flex items-center gap-1.5 bg-black/40 p-1 rounded-xl border border-white/5 text-xs">
                    <button
                      type="button"
                      onClick={() => setEfetivoEmpregadoSubTab('empregados')}
                      className={`px-3 py-1 rounded-lg font-bold transition-all ${
                        efetivoEmpregadoSubTab === 'empregados'
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      Empregados ({empregadosList.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setEfetivoEmpregadoSubTab('nao_empregados')}
                      className={`px-3 py-1 rounded-lg font-bold transition-all ${
                        efetivoEmpregadoSubTab === 'nao_empregados'
                          ? 'bg-amber-600 text-white shadow-sm'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      Sem Escala ({naoEmpregadosList.length})
                    </button>
                  </div>
                )}
              </div>

              {/* Conteúdo da Tabela do Modal */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-5 no-scrollbar">

                {/* 1. MODAL: ESCALAS OPERACIONAIS */}
                {activeTableModal === 'op_escalas' && (
                  <div className="overflow-x-auto no-scrollbar">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-white/10 text-gray-400 uppercase tracking-wider text-[11px]">
                          <th className="py-2.5 px-3 font-extrabold">Data / Horário</th>
                          <th className="py-2.5 px-3 font-extrabold">Modalidade</th>
                          <th className="py-2.5 px-3 font-extrabold">OPM Apoiada</th>
                          <th className="py-2.5 px-3 font-extrabold">Viatura</th>
                          <th className="py-2.5 px-3 font-extrabold">Guarnição / Efetivo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {operationalScales
                          .filter((s: any) => {
                            if (!modalSearch.trim()) return true;
                            const q = modalSearch.toLowerCase();
                            const opm = (s.opm || s.location || '').toLowerCase();
                            const vtr = (s.viatura || '').toLowerCase();
                            const fmt = (s.format || '').toLowerCase();
                            return opm.includes(q) || vtr.includes(q) || fmt.includes(q);
                          })
                          .map((s: any) => {
                            const chiefLabel = s.serviceChief ? `${s.serviceChief.rank || ''} ${s.serviceChief.war_name || s.serviceChief.name || ''}`.trim() : null;
                            const driverLabel = s.driver ? `${s.driver.rank || ''} ${s.driver.war_name || s.driver.name || ''}`.trim() : null;
                            const members = Array.isArray(s.musicians)
                              ? s.musicians.map((m: any) => `${m.rank || ''} ${m.war_name || m.name || ''}`.trim())
                              : [];

                            return (
                              <tr key={s.id} className="hover:bg-white/[0.03]">
                                <td className="py-2.5 px-3 font-bold text-white whitespace-nowrap">
                                  {fmtDate(s.date)} • {s.time} às {s.endTime || '19:00'} ({s.durationHours || 8}h)
                                </td>
                                <td className="py-2.5 px-3 text-blue-300 font-semibold">{s.format || 'RPA'}</td>
                                <td className="py-2.5 px-3 font-bold text-white">{(s.opm || s.location || '').split(' (')[0]}</td>
                                <td className="py-2.5 px-3 text-amber-400 font-bold">{s.viatura || '—'}</td>
                                <td className="py-2.5 px-3 text-gray-300">
                                  <div className="flex flex-col gap-0.5">
                                    {chiefLabel && <span className="text-white font-bold">⭐ {chiefLabel} (Cmt)</span>}
                                    {driverLabel && <span className="text-indigo-300">🚘 {driverLabel} (Mot)</span>}
                                    <span className="text-gray-400 text-[11px]">{members.join(', ')}</span>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* 2. MODAL: CARGA HORÁRIA & RANKING */}
                {activeTableModal === 'op_horas' && (
                  <div className="overflow-x-auto no-scrollbar">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-white/10 text-gray-400 uppercase tracking-wider text-[11px]">
                          <th className="py-2.5 px-3 font-extrabold">Posição</th>
                          <th className="py-2.5 px-3 font-extrabold">Militar</th>
                          <th className="py-2.5 px-3 font-extrabold text-center">Horas Cumpridas</th>
                          <th className="py-2.5 px-3 font-extrabold text-center">Escalas</th>
                          <th className="py-2.5 px-3 font-extrabold">Proporção Carga</th>
                          <th className="py-2.5 px-3 font-extrabold text-center">Situação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {horasRankingList
                          .filter(({ musician }) => {
                            if (!modalSearch.trim()) return true;
                            const q = modalSearch.toLowerCase();
                            return (musician.name || '').toLowerCase().includes(q) || (musician.war_name || '').toLowerCase().includes(q);
                          })
                          .map((item, idx) => {
                            const percent = maxOperationalHours > 0 ? Math.round((item.totalHoras / maxOperationalHours) * 100) : 0;
                            return (
                              <tr key={item.musician.id} className="hover:bg-white/[0.03]">
                                <td className="py-2.5 px-3 font-bold text-gray-400">#{idx + 1}</td>
                                <td className="py-2.5 px-3 font-bold text-white">
                                  {item.musician.rank} {item.musician.war_name || item.musician.name}
                                </td>
                                <td className="py-2.5 px-3 text-center font-black text-indigo-400 text-sm">{item.totalHoras}h</td>
                                <td className="py-2.5 px-3 text-center font-bold">{item.totalEscalas}</td>
                                <td className="py-2.5 px-3 min-w-[150px]">
                                  <div className="flex items-center gap-2">
                                    <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                                      <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.min(percent, 100)}%` }} />
                                    </div>
                                    <span className="text-[10px] text-gray-400">{percent}%</span>
                                  </div>
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  <MilitaryStatusBadge status={item.currentStatus} size="xs" />
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* 3. MODAL: EFETIVO EMPREGADO */}
                {activeTableModal === 'op_efetivo' && (
                  <div className="overflow-x-auto no-scrollbar">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-white/10 text-gray-400 uppercase tracking-wider text-[11px]">
                          <th className="py-2.5 px-3 font-extrabold">Militar</th>
                          <th className="py-2.5 px-3 font-extrabold text-center">Escalas</th>
                          <th className="py-2.5 px-3 font-extrabold text-center">Horas</th>
                          <th className="py-2.5 px-3 font-extrabold">Último Serviço</th>
                          <th className="py-2.5 px-3 font-extrabold text-center">Situação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {(efetivoEmpregadoSubTab === 'empregados' ? empregadosList : naoEmpregadosList)
                          .filter(({ musician }) => {
                            if (!modalSearch.trim()) return true;
                            const q = modalSearch.toLowerCase();
                            return (musician.name || '').toLowerCase().includes(q) || (musician.war_name || '').toLowerCase().includes(q);
                          })
                          .map((item) => (
                            <tr key={item.musician.id} className="hover:bg-white/[0.03]">
                              <td className="py-2.5 px-3 font-bold text-white">
                                {item.musician.rank} {item.musician.war_name || item.musician.name}
                                <span className="text-[10px] text-gray-400 block font-normal">{item.musician.re ? `RE ${item.musician.re}` : 'Efetivo'}</span>
                              </td>
                              <td className="py-2.5 px-3 text-center font-bold">{item.totalEscalas}</td>
                              <td className="py-2.5 px-3 text-center font-bold text-indigo-400">{item.totalHoras}h</td>
                              <td className="py-2.5 px-3 text-gray-300">
                                {item.ultimaEscala ? `${fmtDate(item.ultimaEscala.date)} • ${(item.ultimaEscala.opm || '').split(' (')[0]}` : '—'}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <MilitaryStatusBadge status={item.currentStatus} size="xs" />
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* 4. MODAL: UNIDADES APOIADAS (OPMs) */}
                {activeTableModal === 'op_unidades' && (
                  <div className="overflow-x-auto no-scrollbar">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-white/10 text-gray-400 uppercase tracking-wider text-[11px]">
                          <th className="py-2.5 px-3 font-extrabold">Unidade / OPM</th>
                          <th className="py-2.5 px-3 font-extrabold text-center">Escalas</th>
                          <th className="py-2.5 px-3 font-extrabold text-center">Horas Prestadas</th>
                          <th className="py-2.5 px-3 font-extrabold">Viaturas Empregadas</th>
                          <th className="py-2.5 px-3 font-extrabold">Efetivo Alocado</th>
                          <th className="py-2.5 px-3 font-extrabold text-right">Último Apoio</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {opmBreakdown
                          .filter(item => {
                            if (!modalSearch.trim()) return true;
                            return item.opm.toLowerCase().includes(modalSearch.toLowerCase());
                          })
                          .map((item) => (
                            <tr key={item.opm} className="hover:bg-white/[0.03]">
                              <td className="py-2.5 px-3 font-black text-white text-sm">{item.opm}</td>
                              <td className="py-2.5 px-3 text-center font-bold text-amber-400">{item.totalScales}</td>
                              <td className="py-2.5 px-3 text-center font-bold text-indigo-400">{item.totalHours}h</td>
                              <td className="py-2.5 px-3 text-amber-300">{Array.from(item.viaturas).join(', ') || 'A pé'}</td>
                              <td className="py-2.5 px-3 text-gray-300">
                                {Array.from(item.musicians.values()).map(m => `${m.rank} ${m.war_name || m.name}`).join(', ')}
                              </td>
                              <td className="py-2.5 px-3 text-right text-gray-400">{item.lastDate ? fmtDate(item.lastDate) : '—'}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* 5. MODAL: SERVIÇOS MUSICAIS */}
                {activeTableModal === 'mus_servicos' && (
                  <div className="overflow-x-auto no-scrollbar">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-white/10 text-gray-400 uppercase tracking-wider text-[11px]">
                          <th className="py-2.5 px-3 font-extrabold">Data</th>
                          <th className="py-2.5 px-3 font-extrabold">Horário</th>
                          <th className="py-2.5 px-3 font-extrabold">Formato / Título</th>
                          <th className="py-2.5 px-3 font-extrabold">Local</th>
                          <th className="py-2.5 px-3 font-extrabold">Chefe do Serviço</th>
                          <th className="py-2.5 px-3 font-extrabold text-center">Efetivo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {monthScales
                          .filter((s: any) => {
                            if (!modalSearch.trim()) return true;
                            const q = modalSearch.toLowerCase();
                            return (s.title || '').toLowerCase().includes(q) || (s.format || '').toLowerCase().includes(q) || (s.location || '').toLowerCase().includes(q);
                          })
                          .map((s: any) => (
                            <tr key={s.id} className="hover:bg-white/[0.03]">
                              <td className="py-2.5 px-3 font-bold text-white">{fmtDate(s.date)}</td>
                              <td className="py-2.5 px-3 text-gray-300">{s.time || s.departureTime || '—'}</td>
                              <td className="py-2.5 px-3 font-semibold text-blue-300">{s.title || s.format || 'Escala'}</td>
                              <td className="py-2.5 px-3 text-gray-300">{s.location || 'Sede'}</td>
                              <td className="py-2.5 px-3 text-amber-300">{s.serviceChief ? `${s.serviceChief.rank || ''} ${s.serviceChief.war_name || s.serviceChief.name || ''}` : '—'}</td>
                              <td className="py-2.5 px-3 text-center font-bold text-white">{Array.isArray(s.musicians) ? s.musicians.length : 0}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* 6. MODAL: PARTICIPAÇÕES */}
                {activeTableModal === 'mus_participacoes' && (
                  <div className="overflow-x-auto no-scrollbar">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-white/10 text-gray-400 uppercase tracking-wider text-[11px]">
                          <th className="py-2.5 px-3 font-extrabold">Militar</th>
                          <th className="py-2.5 px-3 font-extrabold">Instrumento</th>
                          <th className="py-2.5 px-3 font-extrabold text-center">Total Escalas</th>
                          <th className="py-2.5 px-3 font-extrabold text-center">Apresentações</th>
                          <th className="py-2.5 px-3 font-extrabold text-center">Ensaios</th>
                          <th className="py-2.5 px-3 font-extrabold text-center">Expediente</th>
                          <th className="py-2.5 px-3 font-extrabold text-center">Ciência</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {reportData
                          .filter(({ musician }) => {
                            if (!modalSearch.trim()) return true;
                            const q = modalSearch.toLowerCase();
                            return (musician.name || '').toLowerCase().includes(q) || (musician.war_name || '').toLowerCase().includes(q);
                          })
                          .map((item) => (
                            <tr key={item.musician.id} className="hover:bg-white/[0.03]">
                              <td className="py-2.5 px-3 font-bold text-white">
                                {item.musician.rank} {item.musician.war_name || item.musician.name}
                              </td>
                              <td className="py-2.5 px-3 text-gray-300">{item.musician.instrument || 'Banda'}</td>
                              <td className="py-2.5 px-3 text-center font-black text-blue-400 text-sm">{item.totalScales}</td>
                              <td className="py-2.5 px-3 text-center">{item.countApresentacoes}</td>
                              <td className="py-2.5 px-3 text-center">{item.countEnsaios}</td>
                              <td className="py-2.5 px-3 text-center">{item.countExpediente}</td>
                              <td className="py-2.5 px-3 text-center font-bold text-emerald-400">{item.confirmationRate}%</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* 7. MODAL: CIÊNCIA / CONFIRMAÇÃO */}
                {activeTableModal === 'mus_ciencia' && (
                  <div className="overflow-x-auto no-scrollbar">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-white/10 text-gray-400 uppercase tracking-wider text-[11px]">
                          <th className="py-2.5 px-3 font-extrabold">Militar</th>
                          <th className="py-2.5 px-3 font-extrabold text-center">Escalas</th>
                          <th className="py-2.5 px-3 font-extrabold text-center">Cientes</th>
                          <th className="py-2.5 px-3 font-extrabold text-center">Pendentes</th>
                          <th className="py-2.5 px-3 font-extrabold text-center">Taxa</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {reportData
                          .filter(({ musician }) => {
                            if (!modalSearch.trim()) return true;
                            const q = modalSearch.toLowerCase();
                            return (musician.name || '').toLowerCase().includes(q) || (musician.war_name || '').toLowerCase().includes(q);
                          })
                          .map((item) => (
                            <tr key={item.musician.id} className="hover:bg-white/[0.03]">
                              <td className="py-2.5 px-3 font-bold text-white">
                                {item.musician.rank} {item.musician.war_name || item.musician.name}
                              </td>
                              <td className="py-2.5 px-3 text-center font-bold">{item.totalScales}</td>
                              <td className="py-2.5 px-3 text-center text-emerald-400 font-bold">{item.confirmedCount}</td>
                              <td className="py-2.5 px-3 text-center text-amber-400 font-bold">{item.pendingCount}</td>
                              <td className="py-2.5 px-3 text-center">
                                <span className={`px-2 py-0.5 rounded-full font-black text-xs ${
                                  item.confirmationRate === 100
                                    ? 'bg-emerald-500/20 text-emerald-300'
                                    : 'bg-amber-500/20 text-amber-300'
                                }`}>
                                  {item.confirmationRate}%
                                </span>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}

              </div>

              {/* Rodapé do Modal */}
              <div className="px-5 py-3 border-t border-white/10 bg-[#161a24] flex items-center justify-between text-xs text-gray-400">
                <span>PMPR • Banda de Música • Relatório Gerencial</span>
                <button
                  type="button"
                  onClick={() => setActiveTableModal(null)}
                  className="px-4 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold transition-colors"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
