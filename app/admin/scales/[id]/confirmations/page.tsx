'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { fmtDate } from '@/lib/format-date';

export default function ScaleConfirmationsPage() {
  const params = useParams();
  const [scale, setScale] = useState<any>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!params.id) return;

    // Buscar dados da escala
    const fetchScale = async () => {
      const snap = await getDoc(doc(db, 'scales', params.id as string));
      if (snap.exists()) setScale({ id: snap.id, ...snap.data() });
    };
    fetchScale();

    // Escutar notificações desta escala em tempo real
    const q = query(
      collection(db, 'notifications'),
      where('scaleId', '==', params.id as string)
    );
    const unsub = onSnapshot(q, (snap) => {
      setNotifications(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, [params.id]);

  const confirmed = notifications.filter(n => n.read);
  const pending = notifications.filter(n => !n.read);

  const formatDateTime = (ts: any) => {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const getMusicianName = (notif: any) => {
    // Primeiro tenta o nome gravado na própria notificação (scale_view)
    if (notif.userName) {
      return notif.userRank ? `${notif.userRank} ${notif.userName}` : notif.userName;
    }
    // Fallback: busca no array musicians da escala
    if (!scale?.musicians) return notif.userId;
    const m = scale.musicians.find((m: any) => m.id === notif.userId);
    return m ? (m.war_name ? `${m.rank || ''} ${m.war_name}` : m.name) : notif.userId;
  };

  const getMusicianInstrument = (notif: any) => {
    if (notif.userInstrument) return notif.userInstrument;
    if (!scale?.musicians) return '';
    const m = scale.musicians.find((m: any) => m.id === notif.userId);
    return m?.instrument || '';
  };

  const getInitials = (notif: any) => {
    const name = getMusicianName(notif);
    return name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
  };

  if (loading) {
    return (
      <div className="bg-background-light dark:bg-background-dark min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="bg-background-light dark:bg-background-dark font-sans min-h-screen flex flex-col items-center">
      <div className="relative w-full max-w-md bg-background-light dark:bg-background-dark flex flex-col min-h-screen shadow-2xl">
        <header className="sticky top-0 z-10 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md px-4 py-3 flex items-center justify-between border-b border-gray-200 dark:border-gray-800">
          <Link href="/admin/scales">
            <button className="flex items-center justify-center p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors text-gray-900 dark:text-white">
              <span className="material-symbols-outlined">arrow_back_ios_new</span>
            </button>
          </Link>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white flex-1 text-center pr-10">Confirmações</h1>
        </header>

        <main className="flex-1 p-4 flex flex-col gap-5 pb-12">
          {/* Info da escala */}
          {scale && (
            <div className="bg-primary/5 border border-primary/10 rounded-2xl p-4 flex flex-col gap-1">
              <p className="text-xs font-black text-primary uppercase tracking-wider">Escala</p>
              <p className="text-base font-bold text-gray-900 dark:text-white">{scale.title}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {fmtDate(scale.date)} • {scale.format}
              </p>
            </div>
          )}

          {/* Resumo */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-3 flex flex-col items-center gap-1 shadow-sm">
              <span className="text-2xl font-black text-gray-900 dark:text-white">{notifications.length}</span>
              <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider text-center">Registros</span>
            </div>
            <div className="bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-100 dark:border-green-800 p-3 flex flex-col items-center gap-1 shadow-sm">
              <span className="text-2xl font-black text-green-600">{confirmed.length}</span>
              <span className="text-[10px] text-green-600 font-bold uppercase tracking-wider text-center">Confirmados</span>
            </div>
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-100 dark:border-amber-800 p-3 flex flex-col items-center gap-1 shadow-sm">
              <span className="text-2xl font-black text-amber-600">{pending.length}</span>
              <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider text-center">Aguardando</span>
            </div>
          </div>

          {notifications.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
              <span className="material-symbols-outlined text-[52px]">group_off</span>
              <p className="text-sm font-medium text-center">Nenhum músico convocado nesta escala ainda.</p>
            </div>
          )}

          {confirmed.length > 0 && (
            <div className="flex flex-col gap-3">
              <span className="text-[11px] font-black text-gray-400 uppercase tracking-widest px-1 flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-green-500 inline-block"></span>
                Confirmaram visualização ({confirmed.length})
              </span>
              {confirmed.map((notif) => (
                <motion.div
                  key={notif.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="bg-white dark:bg-gray-900 rounded-2xl border border-green-100 dark:border-green-900/30 p-4 flex items-center gap-3 shadow-sm"
                >
                  <div className="size-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center font-bold text-green-700 text-xs shrink-0">
                    {getInitials(notif)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{getMusicianName(notif)}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <p className="text-[10px] text-gray-500 truncate">{getMusicianInstrument(notif)}</p>
                      {notif.type === 'scale_view' && (
                        <span className="text-[9px] font-bold bg-blue-50 dark:bg-blue-900/20 text-blue-500 px-1.5 py-0.5 rounded-full shrink-0">Dashboard</span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="flex items-center gap-1 text-[10px] font-bold text-green-600">
                      <span className="material-symbols-outlined text-[14px]">check_circle</span>
                      Confirmado
                    </span>
                    {notif.confirmedAt && (
                      <span className="text-[9px] text-gray-400">{formatDateTime(notif.confirmedAt)}</span>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {pending.length > 0 && (
            <div className="flex flex-col gap-3">
              <span className="text-[11px] font-black text-gray-400 uppercase tracking-widest px-1 flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-amber-400 inline-block"></span>
                Aguardando confirmação ({pending.length})
              </span>
              {pending.map((notif) => (
                <div
                  key={notif.id}
                  className="bg-white dark:bg-gray-900 rounded-2xl border border-amber-100 dark:border-amber-900/20 p-4 flex items-center gap-3 shadow-sm opacity-70"
                >
                  <div className="size-10 rounded-full bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center font-bold text-amber-700 text-xs shrink-0">
                    {getInitials(notif)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{getMusicianName(notif)}</p>
                    <p className="text-[10px] text-gray-500 truncate">{getMusicianInstrument(notif)}</p>
                  </div>
                  <div className="shrink-0">
                    <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600">
                      <span className="material-symbols-outlined text-[14px]">schedule</span>
                      Pendente
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
