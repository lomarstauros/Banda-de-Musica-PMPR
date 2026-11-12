'use client';

import Link from 'next/link';
import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect, useMemo } from 'react';
import { collection, query, orderBy, onSnapshot, deleteDoc, doc, addDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { handleFirestoreError, OperationType } from '@/lib/firestore-errors';
import { getFormatColors } from '@/lib/scale-formats';
import { generateScalePDF, generateDailyScalesPDF, generateForecastsPDF, viewForecastsPDF } from '@/lib/pdf-generator';
import { fmtDate, fmtDateWithWeekday, normalizeDateToYMD, getTodayYMD } from '@/lib/format-date';
import { sortByRankThenName } from '@/lib/sort-military';
import { useFirebase } from '@/components/providers/firebase-provider';

export default function AdminScalesListPage() {
  const { user } = useFirebase();
  const [userRole, setUserRole] = useState<'user' | 'admin' | 'master'>('user');
  const [scales, setScales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedScaleIds, setExpandedScaleIds] = useState<string[]>([]);

  // Estados para o Modal de Lista com Todas as Previsões
  const [showForecastsModal, setShowForecastsModal] = useState(false);
  const [forecastSearch, setForecastSearch] = useState('');
  const [forecastTab, setForecastTab] = useState<'future' | 'all' | 'past'>('future');
  const [pdfGenerating, setPdfGenerating] = useState(false);

  const now = new Date();
  const [currentDateObj, setCurrentDateObj] = useState(new Date());
  const currentMonth = currentDateObj.getMonth();
  const currentYear = currentDateObj.getFullYear();
  const currentDay = now.getDate();
  
  const [view, setView] = useState<'month'|'week'>('month');
  const [selectedDate, setSelectedDate] = useState(currentDay);

  // Reset to today when the component mounts
  useEffect(() => {
    setSelectedDate(new Date().getDate());
  }, []);

  // Verificar papel do usuário logado (gestor / master / militar)
  useEffect(() => {
    const checkRole = async () => {
      if (user) {
        try {
          const snap = await getDoc(doc(db, 'profiles', user.uid));
          if (snap.exists()) {
            const role = snap.data().role?.toLowerCase();
            if (role === 'master') {
              setUserRole('master');
            } else if (role === 'admin' || role === 'manager') {
              setUserRole('admin');
            }
          }
        } catch (error) {
          console.error("Erro ao verificar papel:", error);
        }
      }
    };
    checkRole();
  }, [user]);

  useEffect(() => {
    const q = query(collection(db, 'scales'), orderBy('date', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setScales(docs);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'scales');
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Todas as previsões cadastradas no sistema (declaradas no topo para cumprir as regras dos hooks do React)
  const allForecasts = useMemo(() => {
    return scales
      .filter((s: any) => !!s.isForecast)
      .sort((a: any, b: any) => {
        const da = normalizeDateToYMD(a.date);
        const db = normalizeDateToYMD(b.date);
        return da.localeCompare(db);
      });
  }, [scales]);

  const todayYMD = getTodayYMD();

  const futureForecasts = useMemo(() => {
    return allForecasts.filter((f: any) => normalizeDateToYMD(f.date) >= todayYMD);
  }, [allForecasts, todayYMD]);

  const pastForecasts = useMemo(() => {
    return allForecasts.filter((f: any) => normalizeDateToYMD(f.date) < todayYMD);
  }, [allForecasts, todayYMD]);

  const filteredForecasts = useMemo(() => {
    let list = allForecasts;
    if (forecastTab === 'future') list = futureForecasts;
    else if (forecastTab === 'past') list = pastForecasts;

    if (!forecastSearch.trim()) return list;

    const term = String(forecastSearch || '').toLowerCase().trim();
    return list.filter((f: any) => 
      String(f?.title || '').toLowerCase().includes(term) ||
      String(f?.location || '').toLowerCase().includes(term) ||
      String(f?.protocolNumber || '').toLowerCase().includes(term) ||
      String(f?.formation || f?.musicalFormation || f?.customFormation || '').toLowerCase().includes(term) ||
      String(f?.format || f?.customFormat || '').toLowerCase().includes(term) ||
      String(f?.uniform || f?.customUniform || '').toLowerCase().includes(term) ||
      String(f?.notes || '').toLowerCase().includes(term) ||
      String(fmtDate(f?.date) || '').toLowerCase().includes(term)
    );
  }, [allForecasts, futureForecasts, pastForecasts, forecastTab, forecastSearch]);

  const toggleScaleRoster = (id: string) => {
    setExpandedScaleIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleDelete = async (id: string, title: string) => {
    if (window.confirm(`Tem certeza que deseja excluir a escala "${title}"?`)) {
      try {
        await deleteDoc(doc(db, 'scales', id));

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
              action: 'delete',
              entityId: id,
              entityTitle: title,
              timestamp: serverTimestamp()
            });
          }
        } catch (auditErr) {
          console.error("Erro ao registrar log de auditoria:", auditErr);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `scales/${id}`);
      }
    }
  };

  const getEventsForDay = (day: number) => {
    return scales.filter(e => {
      if (!e.date) return false;
      const eventDate = new Date(`${e.date}T12:00:00`);
      return eventDate.getDate() === day && 
             eventDate.getMonth() === currentMonth && 
             eventDate.getFullYear() === currentYear;
    });
  };

  const firstDay = new Date(currentYear, currentMonth, 1);
  const totalDays = new Date(currentYear, currentMonth + 1, 0).getDate();
  const monthDays = Array.from({ length: totalDays }, (_, i) => i + 1);

  const getWeekDays = (day: number) => {
    const d = new Date(currentYear, currentMonth, day);
    const dayOfWeek = d.getDay();
    const startNum = day - dayOfWeek;
    const week = [];
    for(let i=0; i<7; i++) {
      const current = new Date(currentYear, currentMonth, startNum + i);
      week.push(current.getDate());
    }
    return week;
  };

  const renderMonthGrid = () => {
    const paddedDays = [];
    for(let i=0; i<firstDay.getDay(); i++) {
        paddedDays.push(<div key={`pad-${i}`} className="h-10 w-full"></div>);
    }
    
    monthDays.forEach((day, i) => {
      const isSelected = day === selectedDate;
      const isToday = day === currentDay && currentMonth === now.getMonth() && currentYear === now.getFullYear();
      const dayEvents = getEventsForDay(day);
      const hasConfirmedScale = dayEvents.some(e => !e.isForecast);
      const hasForecast = dayEvents.some(e => e.isForecast);
      paddedDays.push(
        <button key={i} onClick={() => setSelectedDate(day)} className="h-10 w-full flex items-center justify-center relative group">
          <div className="flex flex-col items-center">
            <span className={`flex size-8 items-center justify-center rounded-full text-sm font-medium transition-all ${isSelected ? 'text-white bg-primary shadow-lg shadow-primary/30 font-bold' : (isToday ? 'border-2 border-primary text-primary font-bold' : 'text-slate-700 dark:text-slate-300 group-hover:bg-slate-100 dark:group-hover:bg-slate-800')}`}>
              {day}
            </span>
            <div className="flex items-center gap-0.5 mt-[-2px] h-1.5">
              {hasConfirmedScale && (
                <span className={`size-1 rounded-full ${isSelected ? 'bg-white' : 'bg-primary'}`} />
              )}
              {hasForecast && (
                <span className="size-1.5 rounded-full bg-amber-500 ring-1 ring-amber-400/60" title="Previsão de Serviço" />
              )}
            </div>
          </div>
        </button>
      );
    });
    return paddedDays;
  };

  const renderWeekGrid = () => {
    const week = getWeekDays(selectedDate);
    return week.map((day, i) => {
      const isSelected = day === selectedDate;
      const isToday = day === currentDay && currentMonth === now.getMonth() && currentYear === now.getFullYear();
      const dayEvents = getEventsForDay(day);
      const hasConfirmedScale = dayEvents.some(e => !e.isForecast);
      const hasForecast = dayEvents.some(e => e.isForecast);
      return (
        <button key={i} onClick={() => setSelectedDate(day)} className="h-10 w-full flex items-center justify-center relative group">
          <div className="flex flex-col items-center">
            <span className={`flex size-8 items-center justify-center rounded-full text-sm font-medium transition-all ${isSelected ? 'text-white bg-primary shadow-lg shadow-primary/30 font-bold' : (isToday ? 'border-2 border-primary text-primary font-bold' : 'text-slate-700 dark:text-slate-300 group-hover:bg-slate-100 dark:group-hover:bg-slate-800')}`}>
              {day}
            </span>
            <div className="flex items-center gap-0.5 mt-[-2px] h-1.5">
              {hasConfirmedScale && (
                <span className={`size-1 rounded-full ${isSelected ? 'bg-white' : 'bg-primary'}`} />
              )}
              {hasForecast && (
                <span className="size-1.5 rounded-full bg-amber-500 ring-1 ring-amber-400/60" title="Previsão de Serviço" />
              )}
            </div>
          </div>
        </button>
      );
    });
  };

  if (loading) {
    return (
      <div className="bg-background-light dark:bg-background-dark min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  const selectedEvents = getEventsForDay(selectedDate);
  const monthName = currentDateObj.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const capitalizedMonthName = monthName.charAt(0).toUpperCase() + monthName.slice(1);

  const selectedDayDate = new Date(currentYear, currentMonth, selectedDate);
  const weekDayName = selectedDayDate.toLocaleDateString('pt-BR', { weekday: 'long' });
  const capitalizedWeekDayName = weekDayName.charAt(0).toUpperCase() + weekDayName.slice(1);

  const isManager = userRole === 'admin' || userRole === 'master' || user?.email === 'heliomardejesus87@gmail.com';

  // Todas as previsões cadastradas no sistema
  const allForecasts = useMemo(() => {
    return scales
      .filter((s: any) => !!s.isForecast)
      .sort((a: any, b: any) => {
        const da = normalizeDateToYMD(a.date);
        const db = normalizeDateToYMD(b.date);
        return da.localeCompare(db);
      });
  }, [scales]);

  const todayYMD = getTodayYMD();

  const futureForecasts = useMemo(() => {
    return allForecasts.filter((f: any) => normalizeDateToYMD(f.date) >= todayYMD);
  }, [allForecasts, todayYMD]);

  const pastForecasts = useMemo(() => {
    return allForecasts.filter((f: any) => normalizeDateToYMD(f.date) < todayYMD);
  }, [allForecasts, todayYMD]);

  const filteredForecasts = useMemo(() => {
    let list = allForecasts;
    if (forecastTab === 'future') list = futureForecasts;
    else if (forecastTab === 'past') list = pastForecasts;

    if (!forecastSearch.trim()) return list;

    const term = String(forecastSearch || '').toLowerCase().trim();
    return list.filter((f: any) => 
      String(f?.title || '').toLowerCase().includes(term) ||
      String(f?.location || '').toLowerCase().includes(term) ||
      String(f?.protocolNumber || '').toLowerCase().includes(term) ||
      String(f?.formation || f?.musicalFormation || f?.customFormation || '').toLowerCase().includes(term) ||
      String(f?.format || f?.customFormat || '').toLowerCase().includes(term) ||
      String(f?.uniform || f?.customUniform || '').toLowerCase().includes(term) ||
      String(f?.notes || '').toLowerCase().includes(term) ||
      String(fmtDate(f?.date) || '').toLowerCase().includes(term)
    );
  }, [allForecasts, futureForecasts, pastForecasts, forecastTab, forecastSearch]);

  const handleJumpToForecastDate = (forecastDate: string) => {
    const ymd = normalizeDateToYMD(forecastDate);
    if (!ymd) return;
    const [year, month, day] = ymd.split('-').map(Number);
    if (!year || !month || !day) return;

    setCurrentDateObj(new Date(year, month - 1, 1));
    setSelectedDate(day);
    setShowForecastsModal(false);
  };

  const getDaysBadge = (dateStr: string) => {
    const ymd = normalizeDateToYMD(dateStr);
    if (!ymd) return null;
    if (ymd === todayYMD) {
      return <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500 text-white shadow-sm">Hoje</span>;
    }
    const dTarget = new Date(ymd + 'T12:00:00');
    const dToday = new Date(todayYMD + 'T12:00:00');
    const diffTime = dTarget.getTime() - dToday.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      return <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-500 text-white shadow-sm">Amanhã</span>;
    }
    if (diffDays === -1) {
      return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold text-gray-500 bg-gray-200 dark:bg-gray-700">Ontem</span>;
    }
    if (diffDays > 1) {
      return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">Em {diffDays} dias</span>;
    }
    return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold text-gray-400 bg-gray-100 dark:bg-gray-800">Passada</span>;
  };

  const handleDownloadForecastsPDF = async () => {
    try {
      setPdfGenerating(true);
      await generateForecastsPDF(filteredForecasts.length > 0 ? filteredForecasts : allForecasts);
    } catch (e) {
      console.error(e);
    } finally {
      setPdfGenerating(false);
    }
  };

  const handleViewForecastsPDF = async () => {
    try {
      setPdfGenerating(true);
      await viewForecastsPDF(filteredForecasts.length > 0 ? filteredForecasts : allForecasts);
    } catch (e) {
      console.error(e);
    } finally {
      setPdfGenerating(false);
    }
  };

  return (
    <div className="bg-transparent font-sans flex flex-col items-center lg:items-stretch w-full">
      <div className="relative w-full max-w-md lg:max-w-none bg-background-light dark:bg-[#121620]/90 backdrop-blur-xl lg:rounded-3xl lg:border lg:border-white/10 flex flex-col h-full min-h-screen lg:min-h-0 shadow-2xl">
        <header className="sticky top-0 z-10 bg-background-light/95 dark:bg-[#121620]/95 backdrop-blur-md px-4 lg:px-6 py-3.5 flex items-center justify-between border-b border-gray-200 dark:border-white/10 lg:rounded-t-3xl">
          <Link href={isManager ? "/admin/swaps" : "/dashboard"}>
            <button className="flex items-center justify-center p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors text-gray-900 dark:text-white">
              <span className="material-symbols-outlined">arrow_back_ios_new</span>
            </button>
          </Link>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white flex-1 text-center">Escalas Publicadas</h1>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => generateForecastsPDF(allForecasts)}
              disabled={pdfGenerating || allForecasts.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow-sm hover:shadow-md transition-all active:scale-95 disabled:opacity-50"
              title="Baixar PDF com todas as previsões cadastradas a qualquer momento"
            >
              <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
              <span className="hidden md:inline">Baixar PDF Previsões</span>
            </button>

            <button
              type="button"
              onClick={() => setShowForecastsModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500 text-amber-700 dark:text-amber-300 hover:text-white border border-amber-500/30 transition-all text-xs font-bold active:scale-95 shadow-sm"
              title="Quadro com todas as Previsões de Serviço"
            >
              <span className="material-symbols-outlined text-[18px]">calendar_clock</span>
              <span className="hidden sm:inline">Previsões</span>
              {futureForecasts.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-white text-[10px] font-black">
                  {futureForecasts.length}
                </span>
              )}
            </button>

            {isManager && (
              <>
                <Link href="/admin/scales/import">
                  <button 
                    className="flex items-center justify-center p-2 rounded-full text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors" 
                    title="Importar / Escanear Documento de Escala"
                  >
                    <span className="material-symbols-outlined text-[22px]">document_scanner</span>
                  </button>
                </Link>
                <Link href="/admin/scales/new">
                  <button 
                    className="flex items-center justify-center p-2 rounded-full text-primary hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" 
                    title="Nova Escala"
                  >
                    <span className="material-symbols-outlined text-[22px]">add</span>
                  </button>
                </Link>
              </>
            )}
          </div>
        </header>

        <main className="flex-1 flex flex-col lg:grid lg:grid-cols-12 gap-6 p-4 lg:p-6 pb-24 overflow-x-hidden">
          {/* Coluna Esquerda: Calendário (5 colunas no desktop) */}
          <div className="lg:col-span-5 flex flex-col gap-4 bg-white dark:bg-gray-900 p-4 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm h-fit">
            <div className="flex h-10 w-full items-center justify-center rounded-lg bg-slate-200 dark:bg-slate-800 p-1">
              <label className="flex cursor-pointer h-full grow items-center justify-center overflow-hidden rounded-[0.3rem] transition-all has-[:checked]:bg-white dark:has-[:checked]:bg-slate-700 has-[:checked]:shadow-sm text-slate-500 dark:text-slate-400 has-[:checked]:text-primary dark:has-[:checked]:text-white text-sm font-medium leading-normal relative group">
                <span className="z-10">Mês</span>
                <input checked={view === 'month'} onChange={() => setView('month')} className="invisible absolute w-0 h-0" name="view-toggle" type="radio" value="Month"/>
              </label>
              <label className="flex cursor-pointer h-full grow items-center justify-center overflow-hidden rounded-[0.3rem] transition-all has-[:checked]:bg-white dark:has-[:checked]:bg-slate-700 has-[:checked]:shadow-sm text-slate-500 dark:text-slate-400 has-[:checked]:text-primary dark:has-[:checked]:text-white text-sm font-medium leading-normal relative group">
                <span className="z-10">Semana</span>
                <input checked={view === 'week'} onChange={() => setView('week')} className="invisible absolute w-0 h-0" name="view-toggle" type="radio" value="Week"/>
              </label>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between px-2">
                <button onClick={() => setCurrentDateObj(new Date(currentYear, currentMonth - 1, 1))} className="size-8 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors">
                  <span className="material-symbols-outlined text-[20px]">chevron_left</span>
                </button>
                <p className="text-slate-900 dark:text-white text-base font-bold">{capitalizedMonthName}</p>
                <button onClick={() => setCurrentDateObj(new Date(currentYear, currentMonth + 1, 1))} className="size-8 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors">
                  <span className="material-symbols-outlined text-[20px]">chevron_right</span>
                </button>
              </div>

              <div className="grid grid-cols-7 gap-y-2">
                {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((day, i) => (
                  <div key={i} className="text-slate-400 dark:text-slate-500 text-xs font-bold uppercase tracking-wider flex items-center justify-center h-8">{day}</div>
                ))}
                {view === 'month' ? renderMonthGrid() : renderWeekGrid()}
              </div>
            </div>

            {/* Acesso rápido às previsões e download imediato de PDF */}
            <div className="mt-1 pt-3 border-t border-gray-100 dark:border-gray-800 flex flex-col gap-2 bg-amber-50/60 dark:bg-amber-950/20 p-3 rounded-xl border border-amber-200/50 dark:border-amber-900/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800 dark:text-amber-300">
                  <span className="material-symbols-outlined text-[17px] text-amber-500">calendar_clock</span>
                  <span>Previsões de Serviço</span>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-black">
                  {allForecasts.length} cadastradas
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowForecastsModal(true)}
                  className="flex-1 py-1.5 px-2 rounded-lg bg-white dark:bg-gray-800 border border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs font-semibold hover:bg-amber-50 text-center transition-colors shadow-xs"
                >
                  Ver Lista
                </button>
                <button
                  type="button"
                  onClick={() => generateForecastsPDF(allForecasts)}
                  disabled={pdfGenerating || allForecasts.length === 0}
                  className="flex-1 py-1.5 px-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold text-center transition-all flex items-center justify-center gap-1 shadow-sm disabled:opacity-50"
                  title="Baixar PDF com todas as previsões cadastradas"
                >
                  <span className="material-symbols-outlined text-[15px]">picture_as_pdf</span>
                  <span>Baixar PDF</span>
                </button>
              </div>
            </div>
          </div>

          {/* Coluna Direita: Escalas do dia selecionado (7 colunas no desktop) */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            <div className="flex items-center justify-between px-1 flex-wrap gap-2">
              <h3 className="text-slate-900 dark:text-white text-lg font-bold leading-tight">
                {capitalizedWeekDayName}, {selectedDate} de {monthName.split(' ')[0]}
              </h3>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => generateForecastsPDF(allForecasts)}
                  disabled={pdfGenerating || allForecasts.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white transition-all shadow-sm active:scale-95 text-xs font-bold disabled:opacity-50"
                  title="Baixar PDF com todas as previsões existentes a qualquer momento"
                >
                  <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
                  <span>Baixar PDF Previsões</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowForecastsModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500 hover:text-white transition-all shadow-sm active:scale-95 text-xs font-bold border border-amber-300/40"
                  title="Ver todas as previsões cadastradas em lista"
                >
                  <span className="material-symbols-outlined text-[18px]">calendar_clock</span>
                  <span>Ver Previsões</span>
                  {futureForecasts.length > 0 && (
                    <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-amber-500 text-white text-[10px] font-black">
                      {futureForecasts.length}
                    </span>
                  )}
                </button>
                {selectedEvents.some(e => e.classification !== 'folga' && !e.isForecast) && (
                  <button 
                    onClick={() => generateDailyScalesPDF(selectedEvents.filter(e => e.classification !== 'folga' && !e.isForecast))}
                    title="Baixar todas as escalas do dia em PDF"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/10 text-primary hover:bg-primary hover:text-white transition-all shadow-sm active:scale-95 text-xs font-bold"
                  >
                    <span className="material-symbols-outlined text-[18px]">download</span>
                    <span className="hidden sm:inline">PDF do Dia</span>
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-4 px-1 pb-8 mt-1">
              {selectedEvents.length === 0 ? (
                 <div className="flex flex-col items-center justify-center py-12 text-gray-400 text-center bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800">
                     <span className="material-symbols-outlined text-[48px] mb-2 opacity-50">event_busy</span>
                     <p className="text-sm font-medium">Nenhuma escala neste dia.</p>
                 </div>
              ) : selectedEvents.map((scale: any) => {
                // Banner especial para dias marcados como "Folga"
                if (scale.classification === 'folga') {
                  return (
                    <div key={scale.id} className="relative overflow-hidden group flex flex-col rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 shadow-md p-6 flex items-center justify-center">
                      <div className="absolute -right-4 -top-4 opacity-20 pointer-events-none">
                        <span className="material-symbols-outlined text-[100px] text-white">weekend</span>
                      </div>
                      <div className="flex flex-col items-center gap-2 z-10 text-white">
                        <span className="material-symbols-outlined text-[32px]">event_available</span>
                        <h3 className="text-xl font-black tracking-[0.2em] uppercase">Folga</h3>
                        <p className="text-xs font-medium text-emerald-100">Não há serviço escalado</p>
                      </div>
                      {isManager && (
                        <div className="absolute top-2 right-2 flex items-center gap-1 z-20">
                          <Link href={`/admin/scales/${scale.id}/edit`} className="p-2 text-white/70 hover:text-white hover:bg-white/20 rounded-lg transition-colors" title="Editar">
                            <span className="material-symbols-outlined text-[18px]">edit</span>
                          </Link>
                          <button onClick={() => handleDelete(scale.id, 'Folga')} className="p-2 text-white/70 hover:text-white hover:bg-white/20 rounded-lg transition-colors" title="Excluir">
                            <span className="material-symbols-outlined text-[18px]">delete</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                }

                // Card diferenciado para "Previsão de Serviço"
                if (scale.isForecast) {
                  return (
                    <div key={scale.id} className="bg-amber-50/70 dark:bg-amber-950/20 rounded-2xl border-2 border-amber-400/60 dark:border-amber-500/40 p-4.5 flex flex-col gap-3 shadow-sm hover:shadow-md transition-all relative overflow-hidden">
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500 text-white shadow-sm">
                              <span className="material-symbols-outlined text-[14px]">calendar_clock</span>
                              Previsão de Serviço
                            </span>
                            <span className="text-xs font-bold text-amber-700 dark:text-amber-400">
                              Em Planejamento
                            </span>
                          </div>
                          <h3 className="text-base font-bold text-gray-900 dark:text-white mt-1.5">{scale.title}</h3>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className="text-xs text-gray-500">{fmtDate(scale.date)}</span>
                            {scale.musicalFormation && (
                              <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
                                <span className="material-symbols-outlined text-[13px]">music_note</span>
                                {scale.musicalFormation}
                              </span>
                            )}
                            {scale.format && (
                              <span className="text-xs text-gray-500">• {scale.format}</span>
                            )}
                          </div>
                        </div>

                        {isManager && (
                          <div className="flex items-center gap-1 shrink-0">
                            <Link href={`/admin/forecasts`}>
                              <button className="p-1.5 text-gray-500 hover:text-gray-900 dark:hover:text-white rounded-lg transition-colors" title="Gerenciar no Painel de Previsões">
                                <span className="material-symbols-outlined text-[18px]">edit</span>
                              </button>
                            </Link>
                            <button onClick={() => handleDelete(scale.id, scale.title)} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg transition-colors" title="Excluir Previsão">
                              <span className="material-symbols-outlined text-[18px]">delete</span>
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="bg-white/80 dark:bg-gray-900/60 rounded-xl p-3 flex flex-col gap-1.5 text-xs text-gray-700 dark:text-gray-300 border border-amber-200/50 dark:border-amber-800/30">
                        {scale.location && (
                          <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-amber-500 text-[18px] shrink-0">location_on</span>
                            <span className="font-medium truncate">{scale.location}</span>
                          </div>
                        )}
                        {scale.protocolNumber && (
                          <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-amber-500 text-[18px] shrink-0">tag</span>
                            <span className="font-semibold text-gray-900 dark:text-white">
                              Protocolo: <span className="font-mono text-primary dark:text-blue-400 font-bold">{scale.protocolNumber}</span>
                            </span>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-amber-500 text-[18px] shrink-0">schedule</span>
                          <span className="font-semibold text-gray-900 dark:text-white">
                            {scale.startTime || '--:--'} às {scale.endTime || '--:--'}
                            {scale.departureTime && <span className="text-gray-500 font-normal ml-1.5">(Saída BM: {scale.departureTime})</span>}
                          </span>
                        </div>
                        {scale.uniform && (
                          <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-amber-500 text-[18px] shrink-0">checkroom</span>
                            <span className="font-medium">Uniforme: {scale.uniform}</span>
                          </div>
                        )}
                      </div>

                      {scale.notes && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 italic px-1">
                          "{scale.notes}"
                        </p>
                      )}

                      {isManager ? (
                        <div className="pt-2 border-t border-amber-200/50 dark:border-amber-800/30 flex items-center justify-between gap-2">
                          <span className="text-[11px] text-amber-800 dark:text-amber-300/90 font-medium">
                            Ainda não escalado
                          </span>
                          <Link href={`/admin/scales/new?forecastId=${scale.id}`}>
                            <button 
                              className="flex items-center gap-1.5 px-4 h-9 rounded-xl bg-primary text-white text-xs font-bold shadow-md shadow-primary/20 hover:bg-blue-700 transition-all active:scale-95"
                              title="Transformar esta previsão em escala oficial"
                            >
                              <span className="material-symbols-outlined text-[16px]">post_add</span>
                              Gerar Escala Desta Previsão
                            </button>
                          </Link>
                        </div>
                      ) : (
                        <div className="text-[11px] text-amber-800 dark:text-amber-300/80 bg-amber-100/50 dark:bg-amber-900/20 px-3 py-1.5 rounded-lg border border-amber-200/40">
                          Previsão de serviço para planejamento prévio. A escala oficial com os músicos será publicada pelo comando.
                        </div>
                      )}
                    </div>
                  );
                }

                const isExpanded = expandedScaleIds.includes(scale.id);
                const sortedMusicians = [...(scale.musicians || [])].filter(Boolean).sort(sortByRankThenName);

                return (
                  <div key={scale.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4 flex flex-col gap-3 shadow-sm hover:shadow-md transition-all">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-base font-bold text-gray-900 dark:text-white">{scale.title}</h3>
                          {scale.classification === 'provisoria' && (
                            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400 uppercase tracking-widest">
                              Provisória
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-gray-500">{fmtDate(scale.date)}</span>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold border ${getFormatColors(scale.format).bg} ${getFormatColors(scale.format).text} ${getFormatColors(scale.format).border}`}>
                            {scale.format}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-2 mt-1 justify-between bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider pl-1">
                          <span className="material-symbols-outlined text-[18px] text-primary">groups</span>
                          <span>{sortedMusicians.length} Efetivo</span>
                        </div>

                        {/* Botão para alternar exibição completa / compacta dos nomes escalados */}
                        {sortedMusicians.length > 0 && (
                          <button
                            type="button"
                            onClick={() => toggleScaleRoster(scale.id)}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all border ${
                              isExpanded 
                                ? 'bg-primary text-white border-primary shadow-sm' 
                                : 'bg-white dark:bg-slate-900 text-primary border-primary/30 hover:bg-primary/10'
                            } active:scale-95`}
                            title={isExpanded ? "Ocultar nomes escalados" : "Mostrar todos os nomes na sequência padrão por graduação"}
                          >
                            <span className="material-symbols-outlined text-[16px]">
                              {isExpanded ? 'visibility_off' : 'visibility'}
                            </span>
                            <span>{isExpanded ? 'Ocultar Efetivo' : 'Ver Efetivo'}</span>
                            <span className={`material-symbols-outlined text-[16px] transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                              expand_more
                            </span>
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <button 
                          onClick={() => generateScalePDF(scale)}
                          className="size-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-primary hover:bg-primary/10 transition-colors"
                          title="Baixar PDF da Escala"
                        >
                          <span className="material-symbols-outlined text-[18px]">download</span>
                        </button>
                        <Link href={`/admin/scales/${scale.id}/confirmations`}>
                          <button 
                            className="size-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
                            title="Ver Confirmações"
                          >
                            <span className="material-symbols-outlined text-[18px]">fact_check</span>
                          </button>
                        </Link>
                        {isManager && (
                          <>
                            <Link href={`/admin/scales/${scale.id}/edit`}>
                              <button 
                                className="size-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                                title="Editar Escala"
                              >
                                <span className="material-symbols-outlined text-[18px]">edit</span>
                              </button>
                            </Link>
                            <button 
                              onClick={() => handleDelete(scale.id, scale.title)}
                              className="size-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                              title="Excluir Escala"
                            >
                              <span className="material-symbols-outlined text-[18px]">delete</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Exibição dos militares escalados: Compacta ou Expandida */}
                    {!isExpanded ? (
                      <div 
                        onClick={() => toggleScaleRoster(scale.id)}
                        className="flex flex-wrap items-center gap-1.5 mt-1 cursor-pointer group/roster p-1 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                        title="Clique para ver todos os nomes escalados"
                      >
                        {sortedMusicians.slice(0, 3).map((m: any, i: number) => (
                          <span key={i} className="text-[10px] font-medium bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded text-gray-700 dark:text-gray-300 border border-gray-200/50 dark:border-gray-700/50">
                            {m.rank} {m.war_name || m.name}
                          </span>
                        ))}
                        {sortedMusicians.length > 3 && (
                          <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded group-hover/roster:bg-primary group-hover/roster:text-white transition-colors">
                            +{sortedMusicians.length - 3}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="mt-2 flex flex-col gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                        <div className="flex items-center justify-between px-1">
                          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px]">military_tech</span>
                            Efetivo Escalado (Sequência Padrão por Graduação)
                          </span>
                          <button 
                            type="button" 
                            onClick={() => toggleScaleRoster(scale.id)}
                            className="text-[11px] font-semibold text-gray-500 hover:text-red-500 flex items-center gap-0.5"
                          >
                            <span className="material-symbols-outlined text-[14px]">close</span>
                            Ocultar
                          </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-80 overflow-y-auto pr-1">
                          {sortedMusicians.map((m: any, idx: number) => (
                            <div 
                              key={m.id || idx}
                              className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-xs"
                            >
                              <div className="flex items-center gap-2 truncate">
                                <span className="size-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">
                                  {idx + 1}
                                </span>
                                <span className="font-semibold text-gray-900 dark:text-white truncate">
                                  {m.rank} {m.war_name || m.name}
                                </span>
                              </div>
                              {m.instrument && (
                                <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 shrink-0 bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded border border-gray-100 dark:border-gray-800">
                                  {m.instrument}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </main>

        {/* MODAL COM TODAS AS ESCALAS PREVISTAS (PREVISÕES DE SERVIÇO) */}
        <AnimatePresence>
          {showForecastsModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 15 }}
                transition={{ duration: 0.2 }}
                className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden"
              >
                {/* Cabeçalho do Modal */}
                <div className="p-4 sm:p-6 border-b border-gray-100 dark:border-gray-800 flex items-start justify-between gap-3 bg-gradient-to-r from-amber-50/70 to-orange-50/40 dark:from-amber-950/20 dark:to-orange-950/10">
                  <div className="flex items-start gap-3">
                    <div className="size-11 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 shadow-inner">
                      <span className="material-symbols-outlined text-[26px]">calendar_clock</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">
                          Quadro de Previsões de Serviço
                        </h2>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-500 text-white shadow-sm">
                          {allForecasts.length} {allForecasts.length === 1 ? 'previsão' : 'previsões'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        Lista com todas as escalas previstas com data, horário, local, grupo e protocolo.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Botões de Exportação PDF */}
                    {allForecasts.length > 0 && (
                      <div className="hidden sm:flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={handleViewForecastsPDF}
                          disabled={pdfGenerating}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 text-xs font-semibold shadow-sm transition-all active:scale-95"
                          title="Visualizar PDF das Previsões"
                        >
                          <span className="material-symbols-outlined text-[16px]">visibility</span>
                          <span>Ver PDF</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleDownloadForecastsPDF}
                          disabled={pdfGenerating}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-500 text-white hover:bg-amber-600 text-xs font-bold shadow-md shadow-amber-500/20 transition-all active:scale-95"
                          title="Baixar Tabela de Previsões em PDF"
                        >
                          <span className="material-symbols-outlined text-[16px]">download</span>
                          <span>Baixar PDF</span>
                        </button>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowForecastsModal(false)}
                      className="size-9 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 flex items-center justify-center transition-colors"
                      title="Fechar"
                    >
                      <span className="material-symbols-outlined text-[20px]">close</span>
                    </button>
                  </div>
                </div>

                {/* Barra de Filtros e Busca */}
                <div className="p-4 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                  {/* Busca */}
                  <div className="relative flex-1">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[20px]">
                      search
                    </span>
                    <input
                      type="text"
                      value={forecastSearch}
                      onChange={(e) => setForecastSearch(e.target.value)}
                      placeholder="Buscar por título, local, protocolo, grupo..."
                      className="w-full pl-10 pr-9 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 text-xs sm:text-sm border-0 focus:ring-2 focus:ring-amber-500"
                    />
                    {forecastSearch && (
                      <button
                        type="button"
                        onClick={() => setForecastSearch('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                      >
                        <span className="material-symbols-outlined text-[18px]">close</span>
                      </button>
                    )}
                  </div>

                  {/* Tabs: Futuras, Todas, Anteriores */}
                  <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl shrink-0 self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={() => setForecastTab('future')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                        forecastTab === 'future'
                          ? 'bg-white dark:bg-gray-700 text-amber-600 dark:text-amber-400 shadow-sm'
                          : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                      }`}
                    >
                      <span>Futuras</span>
                      <span className="px-1.5 py-0.2 rounded-full bg-amber-500/20 text-[10px]">
                        {futureForecasts.length}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setForecastTab('all')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                        forecastTab === 'all'
                          ? 'bg-white dark:bg-gray-700 text-primary dark:text-blue-400 shadow-sm'
                          : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                      }`}
                    >
                      <span>Todas</span>
                      <span className="px-1.5 py-0.2 rounded-full bg-gray-200 dark:bg-gray-600 text-[10px]">
                        {allForecasts.length}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setForecastTab('past')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                        forecastTab === 'past'
                          ? 'bg-white dark:bg-gray-700 text-gray-800 dark:text-white shadow-sm'
                          : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                      }`}
                    >
                      <span>Anteriores</span>
                      <span className="px-1.5 py-0.2 rounded-full bg-gray-200 dark:bg-gray-600 text-[10px]">
                        {pastForecasts.length}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Lista de Previsões Linha a Linha */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3">
                  {filteredForecasts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center text-gray-400">
                      <span className="material-symbols-outlined text-[54px] text-gray-300 dark:text-gray-600 mb-3">
                        event_busy
                      </span>
                      <p className="text-base font-bold text-gray-700 dark:text-gray-300">
                        Nenhuma previsão encontrada
                      </p>
                      <p className="text-xs text-gray-500 mt-1 max-w-sm">
                        {forecastSearch 
                          ? 'Nenhum evento corresponde aos termos pesquisados. Tente outro filtro ou limpe a busca.'
                          : 'Não há previsões cadastradas para o período selecionado.'}
                      </p>
                      {forecastSearch && (
                        <button
                          type="button"
                          onClick={() => setForecastSearch('')}
                          className="mt-3 text-xs font-bold text-amber-600 hover:underline"
                        >
                          Limpar busca
                        </button>
                      )}
                    </div>
                  ) : (
                    filteredForecasts.map((forecast: any) => {
                      const formatInfo = getFormatColors(forecast.format);
                      const formationText = forecast.formation === 'Outros' 
                        ? (forecast.customFormation || 'Outros') 
                        : (forecast.formation || forecast.musicalFormation || 'Banda Completa');

                      return (
                        <div
                          key={forecast.id}
                          className="bg-white dark:bg-gray-800/80 rounded-2xl border border-gray-200 dark:border-gray-700/70 p-4 sm:p-5 hover:border-amber-400 dark:hover:border-amber-500 hover:shadow-md transition-all flex flex-col gap-3 group relative overflow-hidden"
                        >
                          {/* Barra de destaque lateral */}
                          <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-amber-500" />

                          {/* Linha 1: Data, Status, Formato e Protocolo */}
                          <div className="flex items-center justify-between gap-2 flex-wrap pl-1.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              {/* Badge de Data com dia da semana */}
                              <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs font-black">
                                <span className="material-symbols-outlined text-[16px] text-amber-500">calendar_today</span>
                                <span>{fmtDateWithWeekday(forecast.date)}</span>
                              </div>

                              {/* Badge de Dias Restantes (Hoje / Amanhã / Em X dias) */}
                              {getDaysBadge(forecast.date)}

                              {/* Badge de Formato */}
                              {forecast.format && (
                                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${formatInfo.bg} ${formatInfo.text} ${formatInfo.border}`}>
                                  {forecast.format}
                                </span>
                              )}
                            </div>

                            {/* Número do Protocolo destacado */}
                            <div className="flex items-center gap-1.5">
                              {forecast.protocolNumber ? (
                                <div className="inline-flex items-center gap-1 px-3 py-1 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-xs font-bold font-mono shadow-xs" title="Número do Protocolo">
                                  <span className="material-symbols-outlined text-[15px] text-primary dark:text-blue-400">tag</span>
                                  <span>Protocolo: {forecast.protocolNumber}</span>
                                </div>
                              ) : (
                                <span className="text-[11px] text-gray-400 dark:text-gray-500 italic">
                                  Sem protocolo
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Linha 2: Título do Evento */}
                          <div className="pl-1.5">
                            <h4 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white leading-snug">
                              {forecast.title}
                            </h4>
                          </div>

                          {/* Linha 3: Informações em Linha (Horário, Local, Grupo Musical, Uniforme) */}
                          <div className="pl-1.5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800 text-xs text-gray-700 dark:text-gray-300">
                            {/* Horário */}
                            <div className="flex items-center gap-2">
                              <span className="material-symbols-outlined text-amber-500 text-[18px] shrink-0">schedule</span>
                              <div className="truncate">
                                <span className="font-semibold text-gray-900 dark:text-white">
                                  {forecast.startTime || '--:--'} às {forecast.endTime || '--:--'}
                                </span>
                                {forecast.departureTime && (
                                  <span className="text-gray-500 dark:text-gray-400 text-[11px] block">
                                    Saída BM: {forecast.departureTime}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Local */}
                            <div className="flex items-center gap-2">
                              <span className="material-symbols-outlined text-amber-500 text-[18px] shrink-0">location_on</span>
                              <div className="truncate">
                                <span className="font-medium text-gray-900 dark:text-white truncate block" title={forecast.location || 'Local a definir'}>
                                  {forecast.location || 'Local a definir'}
                                </span>
                              </div>
                            </div>

                            {/* Grupo / Formação Musical */}
                            <div className="flex items-center gap-2">
                              <span className="material-symbols-outlined text-primary text-[18px] shrink-0">groups</span>
                              <div className="truncate">
                                <span className="font-bold text-primary dark:text-blue-400 truncate block">
                                  {formationText}
                                </span>
                              </div>
                            </div>

                            {/* Uniforme */}
                            <div className="flex items-center gap-2">
                              <span className="material-symbols-outlined text-amber-500 text-[18px] shrink-0">checkroom</span>
                              <div className="truncate">
                                <span className="font-medium text-gray-800 dark:text-gray-200 truncate block" title={forecast.uniform || 'A definir'}>
                                  {forecast.uniform || 'A definir'}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Linha 4: Observações se houver */}
                          {forecast.notes && (
                            <div className="pl-1.5 flex items-start gap-2 text-xs text-gray-600 dark:text-gray-400 italic bg-amber-50/50 dark:bg-amber-950/10 px-3 py-1.5 rounded-lg border border-amber-200/40 dark:border-amber-800/20">
                              <span className="material-symbols-outlined text-[16px] text-amber-500 shrink-0 mt-0.5">info</span>
                              <span>"{forecast.notes}"</span>
                            </div>
                          )}

                          {/* Linha 5: Ações do Item */}
                          <div className="pl-1.5 pt-2 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between gap-2 flex-wrap">
                            <button
                              type="button"
                              onClick={() => handleJumpToForecastDate(forecast.date)}
                              className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-600 dark:text-gray-300 hover:text-primary dark:hover:text-primary transition-colors"
                              title="Visualizar a data desta previsão no calendário da página"
                            >
                              <span className="material-symbols-outlined text-[17px] text-primary">calendar_month</span>
                              <span>Ver no Calendário</span>
                            </button>

                            <div className="flex items-center gap-2">
                              {isManager ? (
                                <>
                                  <Link href="/admin/forecasts">
                                    <button
                                      type="button"
                                      className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-1"
                                      title="Editar esta previsão no painel de previsões"
                                    >
                                      <span className="material-symbols-outlined text-[16px]">edit</span>
                                      <span className="hidden sm:inline">Editar</span>
                                    </button>
                                  </Link>
                                  <Link href={`/admin/scales/new?forecastId=${forecast.id}`}>
                                    <button
                                      type="button"
                                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-white text-xs font-bold shadow-md shadow-primary/20 hover:bg-blue-700 transition-all active:scale-95"
                                      title="Gerar escala oficial preenchida com esta previsão"
                                    >
                                      <span className="material-symbols-outlined text-[16px]">post_add</span>
                                      <span>Gerar Escala Oficial</span>
                                    </button>
                                  </Link>
                                </>
                              ) : (
                                <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                                  Aguardando publicação oficial
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Rodapé do Modal */}
                <div className="p-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 flex items-center justify-between gap-3 text-xs text-gray-500">
                  <div className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[18px] text-amber-500">info</span>
                    <span>Mostrando {filteredForecasts.length} de {allForecasts.length} previsões cadastradas</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleDownloadForecastsPDF}
                      disabled={pdfGenerating || allForecasts.length === 0}
                      className="sm:hidden flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-500 text-white text-xs font-bold"
                    >
                      <span className="material-symbols-outlined text-[16px]">download</span>
                      <span>PDF</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowForecastsModal(false)}
                      className="px-4 py-1.5 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white text-xs font-bold hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                    >
                      Fechar
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
