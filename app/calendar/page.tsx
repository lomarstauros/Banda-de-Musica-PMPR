'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useFirebase } from '@/components/providers/firebase-provider';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import { BottomNav } from '@/components/ui/bottom-nav';
import { LogoutButton } from '@/components/ui/logout-button';
import { collection, query, where, onSnapshot } from 'firebase/firestore';

export default function CalendarPage() {
  const { user, loading: authLoading } = useFirebase();
  const router = useRouter();
  
  const now = new Date();
  const [currentDateObj, setCurrentDateObj] = useState(new Date());
  const currentMonth = currentDateObj.getMonth();
  const currentYear = currentDateObj.getFullYear();
  const currentDay = now.getDate();
  
  const [profile, setProfile] = useState<{ war_name?: string; rank?: string; photo_url?: string; instrument?: string } | null>(null);
  const [view, setView] = useState<'month'|'week'>('month');
  const [selectedDate, setSelectedDate] = useState(currentDay);
  const [events, setEvents] = useState<any[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);

  // Reset to today when the component mounts (e.g. changing tabs)
  useEffect(() => {
    setSelectedDate(new Date().getDate());
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }

    const fetchProfile = async () => {
      try {
        const docRef = doc(db, 'profiles', user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setProfile(docSnap.data());
        }
      } catch (e) {
        console.error("Erro ao carregar perfil:", e);
      }
    };
    fetchProfile();
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user || !profile) return;
    setLoadingEvents(true);

    const FULL_VISIBILITY_ROLES = ['administrativo', 'regente', 'comando'];
    const userInstrument = (profile.instrument || '').trim().toLowerCase();
    const hasFullVisibility = FULL_VISIBILITY_ROLES.includes(userInstrument);

    const q = query(collection(db, "scales"), where("status", "==", "published"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allScales = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      const visibleScales = allScales.filter((scale: any) => {
        if (hasFullVisibility) return true; // Administrativo/Regente/Comando veem tudo
        const hasMusicians = scale.musicians && scale.musicians.length > 0;
        if (!hasMusicians) return true; // sem efetivo definido → visível para todos
        return scale.musicians.some((m: any) => m.id === user.uid); // apenas se escalado
      });

      setEvents(visibleScales);
      setLoadingEvents(false);
    });

    return () => unsubscribe();
  }, [user, profile]);

  const getEventsForDay = (day: number) => {
    return events.filter(e => {
      const eventDate = new Date(e.date);
      return eventDate.getDate() === day && 
             eventDate.getMonth() === currentMonth && 
             eventDate.getFullYear() === currentYear;
    });
  };

  const displayName = profile ? `${profile.rank || ''} ${profile.war_name || ''}`.trim() || 'Sem nome' : 'Carregando...';
  const displayInstrument = profile?.instrument ? `Banda PMPR - ${profile.instrument}` : 'Banda PMPR';
  const displayPhoto = profile?.photo_url || null;

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

  // We pad the monthly view with empty div elements so dates align correctly with the week header
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
            {hasEvent && !isSelected && <span className="size-1 rounded-full bg-slate-400 dark:bg-slate-500 mt-[-2px]"></span>}
            {isSelected && <span className="size-1 rounded-full bg-primary mt-[-2px] opacity-0"></span>}
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
            {hasEvent && !isSelected && <span className="size-1 rounded-full bg-slate-400 dark:bg-slate-500 mt-[-2px]"></span>}
            {isSelected && <span className="size-1 rounded-full bg-primary mt-[-2px] opacity-0"></span>}
          </div>
        </button>
      );
    });
  };

  const selectedEvents = getEventsForDay(selectedDate);
  const monthName = currentDateObj.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const capitalizedMonthName = monthName.charAt(0).toUpperCase() + monthName.slice(1);

  // Find day of week for title
  const selectedDayDate = new Date(currentYear, currentMonth, selectedDate);
  const weekDayName = selectedDayDate.toLocaleDateString('pt-BR', { weekday: 'long' });
  const capitalizedWeekDayName = weekDayName.charAt(0).toUpperCase() + weekDayName.slice(1);

  return (
    <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-white font-sans antialiased selection:bg-primary/30">
      <div className="relative flex h-full min-h-screen w-full flex-col pb-24 overflow-x-hidden max-w-md mx-auto bg-white dark:bg-background-dark shadow-xl">
        <header className="flex items-center bg-white dark:bg-[#1A202C] px-4 py-3 justify-between sticky top-0 z-20 border-b border-gray-100 dark:border-gray-800 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <Link href="/profile" className="relative group/avatar cursor-pointer">
              {displayPhoto ? (
                <div 
                  className="bg-center bg-no-repeat aspect-square bg-cover rounded-full size-10 border-2 border-primary/20 transition-transform group-hover/avatar:scale-105" 
                  style={{ backgroundImage: `url(${displayPhoto})` }}
                ></div>
              ) : (
                <div className="bg-primary/10 text-primary aspect-square rounded-full size-10 border-2 border-primary/20 flex items-center justify-center font-bold text-sm uppercase transition-transform group-hover/avatar:scale-105">
                  {profile?.war_name?.[0] || '?'}
                </div>
              )}
              <div className="absolute bottom-0 right-0 size-3 bg-green-500 border-2 border-white dark:border-[#1A202C] rounded-full"></div>
            </Link>
            <div className="flex flex-col">
              <h2 className="text-[#111318] dark:text-white text-base font-bold leading-tight">{displayName}</h2>
              <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{displayInstrument}</span>
            </div>
          </div>
          <div className="flex items-center justify-end gap-1">
            <button className="relative flex size-10 items-center justify-center rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <span className="material-symbols-outlined">search</span>
            </button>
            <LogoutButton />
          </div>
        </header>

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

        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h3 className="text-slate-900 dark:text-white text-lg font-bold leading-tight">{capitalizedWeekDayName}, {selectedDate} de {monthName.split(' ')[0]}</h3>
          {selectedEvents.length > 0 && <button className="text-primary text-sm font-semibold hover:underline">Ver tudo</button>}
        </div>

        <div className="flex flex-col gap-3 px-4 pb-8">
          {selectedEvents.length === 0 ? (
             <div className="flex flex-col items-center justify-center py-10 opacity-60">
                 <span className="material-symbols-outlined text-4xl mb-2">event_busy</span>
                 <p className="text-sm font-medium">{loadingEvents ? 'Carregando eventos...' : 'Nenhum evento neste dia'}</p>
             </div>
          ) : selectedEvents.map((evt: any) => (
            <Link key={evt.id} href={`/scales/${evt.id}`} className="group flex flex-col rounded-xl bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-slate-700/50 overflow-hidden active:scale-[0.99] transition-transform duration-100">
              <div className="flex p-3 gap-4">
                <div className="flex flex-col items-center justify-center p-2 bg-primary/10 rounded-lg min-w-[4rem] self-start">
                  <span className="text-xs font-bold text-primary uppercase">{evt.startTime || evt.departureTime}</span>
                  <span className="text-lg font-bold text-primary">{evt.startTime?.split(':')[0] >= 18 ? 'Noi' : (evt.startTime?.split(':')[0] >= 12 ? 'Tar' : 'Man')}</span>
                </div>
                <div className="flex flex-1 flex-col gap-1 justify-center">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${evt.format === 'Ensaio' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>
                      {evt.format}
                    </span>
                  </div>
                  <h4 className="text-slate-900 dark:text-white text-base font-bold leading-snug">{evt.title}</h4>
                  <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                    <span className="material-symbols-outlined text-[16px]">location_on</span>
                    <p className="text-xs font-medium truncate">{evt.location}</p>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>

        <button className="fixed bottom-24 right-4 z-30 flex size-12 items-center justify-center rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-lg shadow-slate-900/20 active:scale-90 transition-transform">
          <span className="material-symbols-outlined">filter_list</span>
        </button>

      <BottomNav />
      </div>
    </div>
  );
}
