'use client';

import Link from 'next/link';
import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect } from 'react';
import { BottomNav } from '@/components/ui/bottom-nav';
import { useFirebase } from '@/components/providers/firebase-provider';
import { doc, getDoc, collection, query, onSnapshot, updateDoc, orderBy, writeBatch, arrayRemove, arrayUnion, serverTimestamp, addDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { LogoutButton } from '@/components/ui/logout-button';
import { fmtDate } from '@/lib/format-date';
import { isMusicianAvailable } from '@/lib/military-status';

export default function AdminSwapsPage() {
  const { user } = useFirebase();
  const [profile, setProfile] = useState<{ war_name?: string; rank?: string; photo_url?: string; role?: string } | null>(null);
  const [swaps, setSwaps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const fetchProfile = async () => {
      try {
        const docRef = doc(db, 'profiles', user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) setProfile(docSnap.data());
      } catch (e) {
        console.error("Erro ao carregar perfil do gestor:", e);
      }
    };
    fetchProfile();

    const q = query(collection(db, 'swaps'), orderBy('createdAt', 'desc'));
    const unsubscribeSwaps = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSwaps(docs);
      setLoading(false);
    }, (error) => {
      console.error("Erro ao carregar permutas:", error);
      setLoading(false);
    });

    return () => unsubscribeSwaps();
  }, [user]);

  const displayName = profile ? `${profile.rank || ''} ${profile.war_name || ''}`.trim() || 'Gestor' : 'Carregando...';
  const displayPhoto = profile?.photo_url || null;

  // Permutas aguardando ação do gestor
  const pendingSwaps = swaps.filter(s =>
    s.status === 'Aguardando Gestor' ||
    s.status === 'pending_approval' ||
    (typeof s.status === 'string' && s.status.includes('Comando'))
  );
  // Histórico: tudo que não está pendente
  const historySwaps = swaps.filter(s => !pendingSwaps.find(p => p.id === s.id));

  const handleApprove = async (swap: any) => {
    setActionLoadingId(swap.id);
    try {
      const batch = writeBatch(db);

      // 1. Buscar a escala atual
      const scaleRef = doc(db, 'scales', swap.scale_id);
      const scaleSnap = await getDoc(scaleRef);
      if (!scaleSnap.exists()) {
        alert('Escala não encontrada.');
        return;
      }
      const scaleData = scaleSnap.data();
      const musicians: any[] = scaleData.musicians || [];

      // 2. Buscar dados do substituto e validar disponibilidade
      const substituteProfileSnap = await getDoc(doc(db, 'profiles', swap.substitute_id));
      if (!substituteProfileSnap.exists()) {
        alert('Perfil do substituto não encontrado.');
        return;
      }
      const substituteData = substituteProfileSnap.data();

      // Validação de disponibilidade
      if (!isMusicianAvailable(substituteData, swap.date)) {
        const confirmMsg = `AVISO: O substituto (${substituteData.rank} ${substituteData.war_name}) consta como AFASTADO (${substituteData.militaryStatus}) nesta data. Deseja forçar a aprovação assim mesmo?`;
        if (!confirm(confirmMsg)) {
          setActionLoadingId(null);
          return;
        }
      }

      // 3. Preparar entrada do substituto
      const requesterInList = musicians.find((m: any) => m.id === swap.requester_id);
      const substituteEntry = {
        id: swap.substitute_id,
        name: substituteData.name || swap.substitute_name,
        war_name: substituteData.war_name || '',
        rank: substituteData.rank || '',
        instrument: substituteData.instrument || requesterInList?.instrument || '',
        role: substituteData.role || 'musician',
        email: substituteData.email || '',
      };

      const substituteLabel = `${substituteData.rank || ''} ${substituteData.war_name || ''}`.trim();

      // 4. Substituição Profunda (Deep Substitution)

      // 4.1. Lista de Músicos
      const updatedMusicians = musicians.map((m: any) =>
        m.id === swap.requester_id ? substituteEntry : m
      );

      // 4.2. Chefe do Serviço
      let updatedServiceChief = scaleData.serviceChief || null;
      if (updatedServiceChief && updatedServiceChief.id === swap.requester_id) {
        updatedServiceChief = {
          ...substituteEntry,
          name: substituteData.name || swap.substitute_name,
        };
      }

      // 4.3. Expediente Administrativo
      const updatedExpediente = { ...(scaleData.expediente || {}) };
      
      // IDs e Labels simples
      const expedFields = [
        { id: 'regenteMaestroId', label: 'regenteMaestro' },
        { id: 'arquivoId', label: 'arquivo' },
        { id: 'sargenteacaoId', label: 'sargenteacao' },
        { id: 'p4FinancasTransporteId', label: 'p4FinancasTransporte' }
      ];

      expedFields.forEach(field => {
        if (updatedExpediente[field.id] === swap.requester_id) {
          updatedExpediente[field.id] = swap.substitute_id;
          updatedExpediente[field.label] = substituteLabel;
        }
      });

      // Arrays de multi-seleção
      const multiFields = ['administrativo', 'obra', 'permanencia'];
      multiFields.forEach(field => {
        if (Array.isArray(updatedExpediente[field])) {
          updatedExpediente[field] = updatedExpediente[field].map((item: any) => {
            if (item && (item.id === swap.requester_id || item === swap.requester_id)) {
              return typeof item === 'object' 
                ? { id: swap.substitute_id, label: substituteLabel } 
                : swap.substitute_id;
            }
            return item;
          });
        }
      });

      // 5. Aplicar atualizações na escala
      batch.update(scaleRef, {
        musicians: updatedMusicians,
        serviceChief: updatedServiceChief,
        expediente: updatedExpediente,
        updatedAt: serverTimestamp(),
      });

      // 6. Atualizar status da permuta
      batch.update(doc(db, 'swaps', swap.id), {
        status: 'approved',
        approvedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // 7. Notificações
      const notifRequester = doc(collection(db, 'notifications'));
      batch.set(notifRequester, {
        userId: swap.requester_id,
        type: 'swap_approved',
        swapId: swap.id,
        scaleId: swap.scale_id,
        scaleTitle: swap.scale_title,
        scaleDate: swap.date,
        message: `Sua permuta para "${swap.scale_title}" foi APROVADA pelo Gestor. ${substituteLabel} irá te substituir.`,
        read: false,
        confirmedAt: null,
        createdAt: serverTimestamp(),
      });

      const notifSubstitute = doc(collection(db, 'notifications'));
      batch.set(notifSubstitute, {
        userId: swap.substitute_id,
        type: 'swap_approved',
        swapId: swap.id,
        scaleId: swap.scale_id,
        scaleTitle: swap.scale_title,
        scaleDate: swap.date,
        message: `Você foi confirmado como substituto de ${swap.requester_name} em "${swap.scale_title}". Sua convocação foi atualizada.`,
        read: false,
        confirmedAt: null,
        createdAt: serverTimestamp(),
      });

      // 8. Log de Auditoria
      try {
        const currentUser = auth.currentUser;
        if (currentUser) {
          const adminSnap = await getDoc(doc(db, 'profiles', currentUser.uid));
          const adminData = adminSnap.data();
          const adminName = adminData?.war_name || adminData?.name || currentUser.email || 'Admin';

          const auditRef = doc(collection(db, 'audit_logs'));
          batch.set(auditRef, {
            userId: currentUser.uid,
            userName: adminName,
            action: 'swap_approved',
            entityId: swap.id,
            entityTitle: swap.scale_title,
            details: `Permuta aprovada: ${swap.requester_name} substituído por ${substituteLabel} na escala "${swap.scale_title}".`,
            timestamp: serverTimestamp()
          });
        }
      } catch (auditErr) {
        console.error("Erro ao registrar log de auditoria da permuta:", auditErr);
      }

      await batch.commit();
    } catch (e) {
      console.error("Erro ao aprovar permuta:", e);
      alert("Erro ao processar aprovação. Tente novamente.");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleReject = async (swap: any) => {
    setActionLoadingId(swap.id);
    try {
      const batch = writeBatch(db);

      // 1. Atualiza status da permuta
      batch.update(doc(db, 'swaps', swap.id), {
        status: 'rejected',
        rejectedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // 2. Notificação para o SOLICITANTE
      const notifRequester = doc(collection(db, 'notifications'));
      batch.set(notifRequester, {
        userId: swap.requester_id,
        type: 'swap_rejected',
        swapId: swap.id,
        scaleId: swap.scale_id,
        scaleTitle: swap.scale_title,
        scaleDate: swap.date,
        message: `Sua permuta para "${swap.scale_title}" foi NEGADA pelo Gestor.`,
        read: false,
        confirmedAt: null,
        createdAt: serverTimestamp(),
      });

      // 3. Notificação para o SUBSTITUTO
      const notifSubstitute = doc(collection(db, 'notifications'));
      batch.set(notifSubstitute, {
        userId: swap.substitute_id,
        type: 'swap_rejected',
        swapId: swap.id,
        scaleTitle: swap.scale_title,
        scaleDate: swap.date,
        message: `A permuta de ${swap.requester_name} para "${swap.scale_title}" foi negada pelo Gestor.`,
        read: false,
        confirmedAt: null,
        createdAt: serverTimestamp(),
      });

      await batch.commit();
    } catch (e) {
      console.error("Erro ao negar permuta:", e);
      alert("Erro ao processar ação. Tente novamente.");
    } finally {
      setActionLoadingId(null);
    }
  };

  const statusInfo = (status: string) => {
    if (status === 'approved') return { label: 'Aprovada', cls: 'bg-green-100 text-green-700' };
    if (status === 'rejected') return { label: 'Negada', cls: 'bg-red-100 text-red-700' };
    if (status === 'Recusado pelo Parceiro') return { label: 'Parceiro Recusou', cls: 'bg-red-100 text-red-700' };
    if (status === 'Aguardando Parceiro') return { label: 'Aguardando Parceiro', cls: 'bg-gray-100 text-gray-600' };
    if (status === 'Aguardando Gestor' || status === 'pending_approval' || status?.includes('Comando')) return { label: 'Aguardando Gestor', cls: 'bg-amber-100 text-amber-700' };
    return { label: status, cls: 'bg-gray-100 text-gray-600' };
  };

  return (
    <div className="bg-background-light dark:bg-background-dark font-sans min-h-screen flex flex-col items-center">
      <div className="relative w-full max-w-md bg-background-light dark:bg-background-dark flex flex-col h-full min-h-screen shadow-2xl overflow-x-hidden">
        <header className="sticky top-0 z-20 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md px-4 py-3 flex items-center justify-between border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center text-primary overflow-hidden border border-primary/20 shadow-sm">
              {displayPhoto
                ? <img src={displayPhoto} alt="Profile" className="size-full object-cover" />
                : <span className="font-bold text-sm uppercase">{profile?.war_name?.[0] || 'G'}</span>
              }
            </div>
            <div>
              <h1 className="text-base font-bold text-gray-900 dark:text-white leading-tight">{displayName}</h1>
              <p className="text-[10px] font-bold text-primary uppercase tracking-wider">Painel Gestor • PMPR</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="size-10 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center text-gray-500">
              <span className="material-symbols-outlined text-[20px]">settings</span>
            </button>
            <LogoutButton />
          </div>
        </header>

        {/* Quick nav */}
        <div className="px-4 py-4 flex gap-2 overflow-x-auto no-scrollbar bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
          <Link href="/admin/scales/new"><button className="flex h-9 shrink-0 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30 px-5 text-sm font-bold text-green-700 dark:text-green-400 hover:bg-green-200 transition-colors border border-green-200 dark:border-green-800 shadow-sm">Nova Escala</button></Link>
          <button className="flex h-9 shrink-0 items-center justify-center rounded-full bg-primary px-5 text-sm font-bold text-white shadow-lg shadow-primary/20">Permutas</button>
          <Link href="/admin/scales"><button className="flex h-9 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 px-5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-200 transition-colors">Histórico Escalas</button></Link>
          <Link href="/admin/notices/new"><button className="flex h-9 shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30 px-5 text-sm font-bold text-blue-700 dark:text-blue-400 hover:bg-blue-200 transition-colors border border-blue-200 dark:border-blue-800 shadow-sm">Novo Aviso</button></Link>
          <Link href="/admin/musicians"><button className="flex h-9 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 px-5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-200 transition-colors">Efetivo</button></Link>
        </div>

        <main className="flex-1 p-4 flex flex-col gap-6 pb-24">
          {/* Seção pendentes */}
          <div className="flex items-center justify-between px-1">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Aguardando Autorização</h2>
            {pendingSwaps.length > 0 && (
              <span className="size-6 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                {pendingSwaps.length}
              </span>
            )}
          </div>

          {loading ? (
            <div className="flex justify-center py-10">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-4">
                <AnimatePresence>
                  {pendingSwaps.length === 0 && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-10 opacity-60">
                      <span className="material-symbols-outlined text-5xl mb-2">done_all</span>
                      <p className="text-sm font-medium">Nenhuma solicitação aguardando</p>
                    </motion.div>
                  )}
                  {pendingSwaps.map((swap) => (
                    <motion.div
                      key={swap.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -50, scale: 0.95 }}
                      className="bg-white dark:bg-gray-900 rounded-2xl border border-primary/30 ring-2 ring-primary/10 overflow-hidden shadow-sm"
                    >
                      <div className="p-4 flex flex-col gap-4">
                        {/* Solicitante ↔ Substituto */}
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <div className="size-10 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-xs">
                              {swap.requester_name?.split(' ').map((n: string) => n[0]).join('').slice(0,2) || '??'}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-gray-900 dark:text-white truncate max-w-[90px]">{swap.requester_name}</p>
                              <p className="text-[10px] text-gray-400 uppercase font-bold">Solicitante</p>
                            </div>
                          </div>
                          <div className="flex flex-col items-center gap-1">
                            <span className="material-symbols-outlined text-gray-300 text-[28px]">swap_horiz</span>
                            <span className="text-[9px] text-amber-600 font-black uppercase tracking-wide bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-full">Aguard. Gestor</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div>
                              <p className="text-sm font-bold text-gray-900 dark:text-white truncate max-w-[90px] text-right">{swap.substitute_name}</p>
                              <p className="text-[10px] text-gray-400 uppercase font-bold text-right">Substituto</p>
                            </div>
                            <div className="size-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                              {swap.substitute_name?.split(' ').map((n: any) => n[0]).join('').slice(0,2)}
                            </div>
                          </div>
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
                          <p className="text-xs text-gray-500 italic px-1">"{swap.reason}"</p>
                        )}

                        {/* Ações */}
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleReject(swap)}
                            disabled={actionLoadingId === swap.id}
                            className="flex-1 h-11 rounded-xl border border-red-200 text-red-600 dark:border-red-900/30 dark:text-red-400 text-sm font-bold hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors disabled:opacity-50"
                          >
                            Negar
                          </button>
                          <button
                            onClick={() => handleApprove(swap)}
                            disabled={actionLoadingId === swap.id}
                            className="flex-[2] h-11 rounded-xl bg-primary text-white text-sm font-bold hover:bg-blue-700 transition-colors shadow-lg shadow-primary/20 flex items-center justify-center gap-2 disabled:opacity-70"
                          >
                            {actionLoadingId === swap.id
                              ? <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                              : <><span className="material-symbols-outlined text-[18px]">verified</span> Aprovar Permuta</>
                            }
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              {/* Histórico */}
              {historySwaps.length > 0 && (
                <div className="flex flex-col gap-3">
                  <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider px-1">Histórico</h3>
                  <div className="flex flex-col gap-3">
                    {historySwaps.map((swap) => {
                      const st = statusInfo(swap.status);
                      return (
                        <div key={swap.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4 flex items-center gap-3 shadow-sm opacity-70">
                          <div className="size-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center font-bold text-xs text-gray-500 shrink-0">
                            {swap.requester_name?.split(' ').map((n: string) => n[0]).join('').slice(0,2)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{swap.requester_name} → {swap.substitute_name}</p>
                            <p className="text-xs text-gray-500 truncate">{swap.scale_title}</p>
                          </div>
                          <span className={`text-[9px] font-black px-2 py-1 rounded-full shrink-0 ${st.cls}`}>{st.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </main>
        <BottomNav />
      </div>
    </div>
  );
}
