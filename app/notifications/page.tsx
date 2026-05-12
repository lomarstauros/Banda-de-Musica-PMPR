'use client';

import Link from 'next/link';
import { motion, AnimatePresence } from 'motion/react';
import { useEffect, useState } from 'react';
import { useFirebase } from '@/components/providers/firebase-provider';
import { collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import { BottomNav } from '@/components/ui/bottom-nav';
import { fmtDate } from '@/lib/format-date';

export default function NotificationsPage() {
  const { user, loading: authLoading } = useFirebase();
  const router = useRouter();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [activeNotif, setActiveNotif] = useState<any | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push('/login'); return; }

    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      setNotifications(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (err) => {
      console.error("Erro no listener de notificações (Page):", err);
      setLoading(false);
    });
    return () => unsub();
  }, [user, authLoading, router]);

  const handleConfirm = async (notif: any) => {
    setConfirming(notif.id);
    try {
      await updateDoc(doc(db, 'notifications', notif.id), {
        read: true,
        confirmedAt: serverTimestamp()
      });
      setActiveNotif(null);
      router.push(`/scales/${notif.scaleId}`);
    } catch (e) {
      console.error('Erro ao confirmar:', e);
    } finally {
      setConfirming(null);
    }
  };

  const formatDate = fmtDate;

  const unread = notifications.filter(n => !n.read);
  const read = notifications.filter(n => n.read);

  return (
    <div className="bg-background-light dark:bg-background-dark font-sans min-h-screen flex flex-col items-center">
      <div className="relative w-full max-w-md bg-background-light dark:bg-background-dark flex flex-col min-h-screen shadow-2xl">
        <header className="sticky top-0 z-10 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md px-4 py-3 flex items-center justify-between border-b border-gray-200 dark:border-gray-800">
          <Link href="/dashboard">
            <button className="flex items-center justify-center p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors text-gray-900 dark:text-white">
              <span className="material-symbols-outlined">arrow_back_ios_new</span>
            </button>
          </Link>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white flex-1 text-center pr-10">Notificações</h1>
        </header>

        <main className="flex-1 p-4 flex flex-col gap-4 pb-28">
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-3">
              <span className="material-symbols-outlined text-[56px]">notifications_off</span>
              <p className="text-sm font-medium">Nenhuma notificação por enquanto.</p>
            </div>
          ) : (
            <>
              {unread.length > 0 && (
                <div className="flex flex-col gap-3">
                  <span className="text-[11px] font-black text-gray-400 uppercase tracking-widest px-1">
                    Novas — {unread.length} não lida{unread.length > 1 ? 's' : ''}
                  </span>
                  {unread.map((notif) => (
                    <motion.div
                      key={notif.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-white dark:bg-gray-900 rounded-2xl border border-primary/30 shadow-md p-4 flex gap-3 cursor-pointer active:scale-[0.99] transition-transform"
                      onClick={() => setActiveNotif(notif)}
                    >
                      <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-primary text-[22px]">campaign</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-bold text-gray-900 dark:text-white leading-snug">Você foi convocado!</p>
                          <span className="size-2 rounded-full bg-primary shrink-0 mt-1.5"></span>
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5 font-medium line-clamp-2">{notif.scaleTitle}</p>
                        <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[12px]">calendar_month</span>
                          {formatDate(notif.scaleDate)}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}

              {read.length > 0 && (
                <div className="flex flex-col gap-3 mt-2">
                  <span className="text-[11px] font-black text-gray-400 uppercase tracking-widest px-1">Confirmadas</span>
                  {read.map((notif) => (
                    <div key={notif.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4 flex gap-3 opacity-60">
                      <div className="size-10 rounded-full bg-green-50 dark:bg-green-900/20 flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-green-500 text-[22px]">check_circle</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-900 dark:text-white leading-snug">{notif.scaleTitle}</p>
                        <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[12px]">calendar_month</span>
                          {formatDate(notif.scaleDate)}
                        </p>
                        <p className="text-[10px] text-green-500 font-medium mt-0.5">Visualização confirmada</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </main>

        <BottomNav />
      </div>

      {/* Modal de confirmação */}
      <AnimatePresence>
        {activeNotif && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end justify-center p-4"
            onClick={(e) => e.target === e.currentTarget && setActiveNotif(null)}
          >
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="w-full max-w-md bg-white dark:bg-gray-900 rounded-3xl p-6 flex flex-col gap-5 shadow-2xl"
            >
              <div className="flex flex-col items-center text-center gap-3">
                <div className="size-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-primary text-[36px]">campaign</span>
                </div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Você foi convocado!</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                  Sua presença foi solicitada na escala abaixo. Por favor, confirme a visualização desta convocação.
                </p>
              </div>

              <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-4 flex flex-col gap-2">
                <p className="text-base font-bold text-gray-900 dark:text-white">{activeNotif.scaleTitle}</p>
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                  <span className="material-symbols-outlined text-[18px]">calendar_month</span>
                  <span>{formatDate(activeNotif.scaleDate)}</span>
                </div>
                <Link href={`/scales/${activeNotif.scaleId}`} className="mt-1">
                  <span className="text-xs font-bold text-primary hover:underline flex items-center gap-1">
                    Ver detalhes da escala
                    <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                  </span>
                </Link>
              </div>

              <button
                onClick={() => handleConfirm(activeNotif)}
                disabled={confirming === activeNotif.id}
                className="w-full h-14 rounded-2xl bg-primary text-white font-bold shadow-lg shadow-primary/20 hover:bg-blue-700 transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-70"
              >
                {confirming === activeNotif.id ? (
                  <span className="material-symbols-outlined animate-spin text-[22px]">progress_activity</span>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[20px]">check_circle</span>
                    Confirmar Visualização
                  </>
                )}
              </button>

              <button
                onClick={() => setActiveNotif(null)}
                className="text-sm text-gray-400 hover:text-gray-600 transition-colors font-medium -mt-2"
              >
                Fechar (confirmar depois)
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
