'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, deleteDoc, doc, addDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { handleFirestoreError, OperationType } from '@/lib/firestore-errors';
import { getFormatColors } from '@/lib/scale-formats';
import { generateScalePDF } from '@/lib/pdf-generator';
import { fmtDate } from '@/lib/format-date';

export default function AdminScalesListPage() {
  const [scales, setScales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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
      const hasEvent = dayEvents.length > 0;
      paddedDays.push(
        <button key={i} onClick={() => setSelectedDate(day)} className="h-10 w-full flex items-center justify-center relative group">
          <div className="flex flex-col items-center">
            <span className={`flex size-8 items-center justify-center rounded-full text-sm font-medium transition-all ${isSelected ? 'text-white bg-primary shadow-lg shadow-primary/30 font-bold' : (isToday ? 'border-2 border-primary text-primary font-bold' : 'text-slate-700 dark:text-slate-300 group-hover:bg-slate-100 dark:group-hover:bg-slate-800')}`}>
              {day}
            </span>
            <span className={`size-1 rounded-full mt-[-2px] ${hasEvent ? (isSelected ? 'bg-primary' : 'bg-slate-400 dark:bg-slate-500') : 'opacity-0'}`}></span>
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
      const hasEvent = dayEvents.length > 0;
      return (
        <button key={i} onClick={() => setSelectedDate(day)} className="h-10 w-full flex items-center justify-center relative group">
          <div className="flex flex-col items-center">
            <span className={`flex size-8 items-center justify-center rounded-full text-sm font-medium transition-all ${isSelected ? 'text-white bg-primary shadow-lg shadow-primary/30 font-bold' : (isToday ? 'border-2 border-primary text-primary font-bold' : 'text-slate-700 dark:text-slate-300 group-hover:bg-slate-100 dark:group-hover:bg-slate-800')}`}>
              {day}
            </span>
            <span className={`size-1 rounded-full mt-[-2px] ${hasEvent ? (isSelected ? 'bg-primary' : 'bg-slate-400 dark:bg-slate-500') : 'opacity-0'}`}></span>
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

  return (
    <div className="bg-background-light dark:bg-background-dark font-sans min-h-screen flex flex-col items-center">
      <div className="relative w-full max-w-md bg-background-light dark:bg-background-dark flex flex-col h-full min-h-screen shadow-2xl">
        <header className="sticky top-0 z-10 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md px-4 py-3 flex items-center justify-between border-b border-gray-200 dark:border-gray-800">
          <Link href="/admin/swaps">
            <button className="flex items-center justify-center p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors text-gray-900 dark:text-white">
              <span className="material-symbols-outlined">arrow_back_ios_new</span>
            </button>
          </Link>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white flex-1 text-center">Escalas Publicadas</h1>
          <Link href="/admin/scales/new">
            <button className="flex items-center justify-center p-2 rounded-full text-primary hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
              <span className="material-symbols-outlined">add</span>
            </button>
          </Link>
        </header>

        <main className="flex-1 flex flex-col pb-24 overflow-x-hidden">
          <div className="px-4 py-2 mt-2">
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
          </div>

          <div className="flex flex-col gap-4 px-4 pt-2 pb-6 border-b border-slate-100 dark:border-slate-800/50">
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

          <div className="flex flex-col px-4 pt-4 pb-2">
            <h3 className="text-slate-900 dark:text-white text-lg font-bold leading-tight">{capitalizedWeekDayName}, {selectedDate} de {monthName.split(' ')[0]}</h3>
          </div>

          <div className="flex flex-col gap-4 px-4 pb-8 mt-2">
            {selectedEvents.length === 0 ? (
               <div className="flex flex-col items-center justify-center py-12 text-gray-400 text-center">
                   <span className="material-symbols-outlined text-[48px] mb-2">event_busy</span>
                   <p className="text-sm font-medium">Nenhuma escala neste dia.</p>
               </div>
            ) : selectedEvents.map((scale: any) => (
              <div key={scale.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4 flex flex-col gap-3 shadow-sm hover:shadow-md transition-all">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-gray-900 dark:text-white">{scale.title}</h3>
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
                
                <div className="flex items-center gap-1 mt-1 justify-between bg-slate-50 dark:bg-slate-800/50 p-2 rounded-xl">
                  <div className="flex items-center gap-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest pl-2">
                    <span className="material-symbols-outlined text-[16px]">group</span>
                    {scale.musicians?.length || 0} Efetivo
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
                  </div>
                </div>

                <div className="flex flex-wrap gap-1 mt-1">
                  {scale.musicians?.slice(0, 3).map((m: any, i: number) => (
                    <span key={i} className="text-[10px] font-medium bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded text-gray-600 dark:text-gray-400">
                      {m.rank} {m.war_name || m.name}
                    </span>
                  ))}
                  {(scale.musicians?.length > 3) && (
                    <span className="text-[10px] text-gray-400 px-1 py-0.5 font-bold">+{scale.musicians.length - 3}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
