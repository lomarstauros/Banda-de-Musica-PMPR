'use client';

import Link from 'next/link';
import { motion, AnimatePresence } from 'motion/react';
import { useEffect, useState } from 'react';
import { useFirebase } from '@/components/providers/firebase-provider';
import { collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp, getDoc, writeBatch, addDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import { BottomNav } from '@/components/ui/bottom-nav';
import { LogoutButton } from '@/components/ui/logout-button';
import { fmtDate } from '@/lib/format-date';

export default function SwapsPage() {
  const { user, loading: authLoading } = useFirebase();
  const router = useRouter();
  const [profile, setProfile] = useState<any>(null);
  const [receivedSwaps, setReceivedSwaps] = useState<any[]>([]);
  const [sentSwaps, setSentSwaps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [tab, setTab] = useState<'received' | 'sent'>('received');

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push('/login'); return; }

    // Perfil
    getDoc(doc(db, 'profiles', user.uid)).then(snap => {
      if (snap.exists()) setProfile(snap.data());
    });

    // Permutas onde sou o SUBSTITUTO
    const qReceived = query(
      collection(db, 'swaps'),
      where('substitute_id', '==', user.uid)
    );
    const unsubReceived = onSnapshot(qReceived, snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
      docs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setReceivedSwaps(docs);
      setLoading(false);
    }, (err) => {
      console.error("Erro no listener de permutas recebidas:", err);
      setLoading(false);
    });

    // Permutas onde sou o SOLICITANTE
    const qSent = query(
      collection(db, 'swaps'),
      where('requester_id', '==', user.uid)
    );
    const unsubSent = onSnapshot(qSent, snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
      docs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setSentSwaps(docs);
    }, (err) => {
      console.error("Erro no listener de permutas enviadas:", err);
    });

    return () => { unsubReceived(); unsubSent(); };
  }, [user, authLoading, router]);

  const handleAccept = async (swap: any) => {
    setActionId(swap.id);
    try {
      const batch = writeBatch(db);

      // 1. Atualiza status da permuta
      batch.update(doc(db, 'swaps', swap.id), {
        status: 'Aguardando Gestor',
        substituteAcceptedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // 2. Notificação para o gestor (via coleção de notificações legível por admin)
      // Vamos criar na coleção 'notifications' com tipo 'swap_pending_approval'
      // O gestor verá em tempo real via onSnapshot
      const notifRef = doc(collection(db, 'notifications'));
      batch.set(notifRef, {
        type: 'swap_pending_approval',
        swapId: swap.id,
        scaleTitle: swap.scale_title,
        requesterName: swap.requester_name,
        substituteName: swap.substitute_name,
        read: false,
        createdAt: serverTimestamp(),
      });

      await batch.commit();
    } catch (e) {
      console.error('Erro ao aceitar permuta:', e);
      alert('Erro ao aceitar. Tente novamente.');
    } finally {
      setActionId(null);
    }
  };

  const handleDecline = async (swap: any) => {
    setActionId(swap.id);
    try {
      const batch = writeBatch(db);

      // 1. Atualiza status
      batch.update(doc(db, 'swaps', swap.id), {
        status: 'Recusado pelo Parceiro',
        updatedAt: serverTimestamp(),
      });

      // 2. Notifica o solicitante
      const notifRef = doc(collection(db, 'notifications'));
      batch.set(notifRef, {
        userId: swap.requester_id,
        type: 'swap_declined',
        swapId: swap.id,
        message: `Sua solicitação de permuta para "${swap.scale_title}" foi recusada por ${swap.substitute_name}.`,
        read: false,
        createdAt: serverTimestamp(),
      });

      await batch.commit();
    } catch (e) {
      console.error('Erro ao recusar permuta:', e);
      alert('Erro ao recusar. Tente novamente.');
    } finally {
      setActionId(null);
    }
  };

  const statusLabel = (status: string) => {
    const map: Record<string, { label: string; color: string }> = {
      'Aguardando Parceiro': { label: 'Aguardando sua resposta', color: 'bg-amber-100 text-amber-700' },
      'Aguardando Gestor':   { label: 'Aguardando Gestor', color: 'bg-blue-100 text-blue-700' },
      'approved':            { label: 'Aprovada ✓', color: 'bg-green-100 text-green-700' },
      'rejected':            { label: 'Negada', color: 'bg-red-100 text-red-700' },
      'Recusado pelo Parceiro': { label: 'Parceiro Recusou', color: 'bg-red-100 text-red-700' },
    };
    return map[status] || { label: status, color: 'bg-gray-100 text-gray-600' };
  };

  const displayPhoto = profile?.photo_url || null;
  const displayName = profile ? `${profile.rank || ''} ${profile.war_name || ''}`.trim() || 'Músico' : 'Carregando...';

  const pendingReceived = receivedSwaps.filter(s => s.status === 'Aguardando Parceiro').length;

  return (
    <div className="bg-background-light dark:bg-background-dark font-sans min-h-screen flex flex-col items-center">
      <div className="relative w-full max-w-md bg-background-light dark:bg-background-dark flex flex-col min-h-screen shadow-2xl">

        {/* Header */}
        <header className="sticky top-0 z-20 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md px-4 py-3 flex items-center justify-between border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-3">
            {displayPhoto ? (
              <div className="size-10 rounded-full bg-cover bg-center border-2 border-primary/20" style={{ backgroundImage: `url(${displayPhoto})` }} />
            ) : (
              <div className="size-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm uppercase border-2 border-primary/20">
                {profile?.war_name?.[0] || '?'}
              </div>
            )}
            <div>
              <h1 className="text-base font-bold text-gray-900 dark:text-white leading-tight">{displayName}</h1>
              <p className="text-[10px] font-bold text-primary uppercase tracking-wider">Minhas Permutas</p>
            </div>
          </div>
          <LogoutButton />
        </header>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
          <button
            onClick={() => setTab('received')}
            className={`flex-1 py-3 text-sm font-bold transition-colors relative ${tab === 'received' ? 'text-primary' : 'text-gray-400'}`}
          >
            Recebidas
            {pendingReceived > 0 && (
              <span className="ml-1.5 inline-flex size-5 items-center justify-center rounded-full bg-red-500 text-[9px] font-black text-white">
                {pendingReceived}
              </span>
            )}
            {tab === 'received' && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-primary rounded-full" />}
          </button>
          <button
            onClick={() => setTab('sent')}
            className={`flex-1 py-3 text-sm font-bold transition-colors relative ${tab === 'sent' ? 'text-primary' : 'text-gray-400'}`}
          >
            Enviadas
            {tab === 'sent' && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-primary rounded-full" />}
          </button>
        </div>

        <main className="flex-1 p-4 flex flex-col gap-4 pb-28">
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              {tab === 'received' && (
                <motion.div key="received" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-3">
                  {receivedSwaps.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-3">
                      <span className="material-symbols-outlined text-[56px]">swap_horiz</span>
                      <p className="text-sm font-medium text-center">Nenhuma permuta recebida.</p>
                    </div>
                  ) : receivedSwaps.map((swap) => {
                    const st = statusLabel(swap.status);
                    const isPending = swap.status === 'Aguardando Parceiro';
                    return (
                      <motion.div
                        key={swap.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`bg-white dark:bg-gray-900 rounded-2xl border shadow-sm overflow-hidden ${isPending ? 'border-primary/40 ring-2 ring-primary/10' : 'border-gray-100 dark:border-gray-800'}`}
                      >
                        <div className="p-4 flex flex-col gap-3">
                          {/* Cabeçalho */}
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{isPending ? '🔔 Novo pedido' : 'Pedido de permuta'}</p>
                              <p className="text-sm font-bold text-gray-900 dark:text-white mt-0.5">
                                <span className="text-primary">{swap.requester_name}</span> quer que você o substitua
                              </p>
                            </div>
                            <span className={`text-[9px] font-black px-2 py-1 rounded-full shrink-0 ${st.color}`}>{st.label}</span>
                          </div>

                          {/* Escala */}
                          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3 flex items-center gap-3">
                            <span className="material-symbols-outlined text-primary text-[20px]">event</span>
                            <div>
                              <p className="text-sm font-bold text-gray-900 dark:text-white">{swap.scale_title}</p>
                              <p className="text-xs text-gray-500">{fmtDate(swap.date)}</p>
                            </div>
                          </div>

                          {swap.reason && (
                            <p className="text-xs text-gray-500 italic px-1">Motivo: "{swap.reason}"</p>
                          )}

                          {/* Botões de ação */}
                          {isPending && (
                            <div className="flex gap-2 pt-1">
                              <button
                                onClick={() => handleDecline(swap)}
                                disabled={actionId === swap.id}
                                className="flex-1 h-11 rounded-xl border border-red-200 dark:border-red-900/30 text-red-600 dark:text-red-400 text-sm font-bold hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors disabled:opacity-50"
                              >
                                Recusar
                              </button>
                              <button
                                onClick={() => handleAccept(swap)}
                                disabled={actionId === swap.id}
                                className="flex-[2] h-11 rounded-xl bg-primary text-white text-sm font-bold shadow-lg shadow-primary/20 hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-70"
                              >
                                {actionId === swap.id
                                  ? <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                                  : <><span className="material-symbols-outlined text-[18px]">check_circle</span> Aceitar Permuta</>
                                }
                              </button>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </motion.div>
              )}

              {tab === 'sent' && (
                <motion.div key="sent" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-3">
                  {sentSwaps.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-3">
                      <span className="material-symbols-outlined text-[56px]">send</span>
                      <p className="text-sm font-medium text-center">Nenhuma permuta solicitada.</p>
                      <Link href="/dashboard">
                        <button className="text-primary text-sm font-bold hover:underline">Ir para minhas escalas</button>
                      </Link>
                    </div>
                  ) : sentSwaps.map((swap) => {
                    const st = statusLabel(swap.status);
                    return (
                      <motion.div
                        key={swap.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden"
                      >
                        <div className="p-4 flex flex-col gap-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Sua solicitação</p>
                              <p className="text-sm font-bold text-gray-900 dark:text-white mt-0.5">
                                Substituto: <span className="text-primary">{swap.substitute_name}</span>
                              </p>
                            </div>
                            <span className={`text-[9px] font-black px-2 py-1 rounded-full shrink-0 ${st.color}`}>{st.label}</span>
                          </div>

                          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3 flex items-center gap-3">
                            <span className="material-symbols-outlined text-primary text-[20px]">event</span>
                            <div>
                              <p className="text-sm font-bold text-gray-900 dark:text-white">{swap.scale_title}</p>
                              <p className="text-xs text-gray-500">{fmtDate(swap.date)}</p>
                            </div>
                          </div>

                          {/* Linha do tempo do status */}
                          <div className="flex items-center gap-1 pt-1">
                            {[
                              { key: 'parceiro', label: 'Parceiro', done: swap.status !== 'Aguardando Parceiro' && swap.status !== 'Recusado pelo Parceiro' },
                              { key: 'gestor', label: 'Gestor', done: swap.status === 'approved' || swap.status === 'rejected' },
                            ].map((step, i) => (
                              <div key={step.key} className="flex items-center gap-1 text-[10px] font-bold">
                                {i > 0 && <div className={`h-0.5 w-6 ${step.done ? 'bg-green-400' : 'bg-gray-200 dark:bg-gray-700'}`} />}
                                <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full ${step.done ? 'bg-green-100 text-green-700' : 'bg-gray-100 dark:bg-gray-800 text-gray-500'}`}>
                                  <span className="material-symbols-outlined text-[12px]">{step.done ? 'check_circle' : 'radio_button_unchecked'}</span>
                                  {step.label}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </main>

        <BottomNav />
      </div>
    </div>
  );
}
