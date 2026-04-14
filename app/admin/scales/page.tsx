'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, deleteDoc, doc, addDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { handleFirestoreError, OperationType } from '@/lib/firestore-errors';
import { generateScalePDF } from '@/lib/pdf-generator';
import { fmtDate } from '@/lib/format-date';

export default function AdminScalesListPage() {
  const [scales, setScales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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

  if (loading) {
    return (
      <div className="bg-background-light dark:bg-background-dark min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="bg-background-light dark:bg-background-dark font-sans min-h-screen flex flex-col items-center">
      <div className="relative w-full max-w-md bg-background-light dark:bg-background-dark flex flex-col h-full min-h-screen shadow-2xl">
        <header className="sticky top-0 z-10 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md px-4 py-3 flex items-center justify-between border-b border-gray-200 dark:border-gray-800">
          <Link href="/admin/swaps">
            <button className="flex items-center justify-center p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors text-gray-900 dark:text-white">
              <span className="material-symbols-outlined">arrow_back_ios_new</span>
            </button>
          </Link>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white flex-1 text-center pr-10">Escalas Publicadas</h1>
        </header>

        <main className="flex-1 p-4 flex flex-col gap-6 pb-24">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Histórico de Escalas</h2>
            <Link href="/admin/scales/new">
              <button className="bg-primary text-white p-2 rounded-full shadow-lg hover:bg-blue-700 transition-all active:scale-95">
                <span className="material-symbols-outlined">add</span>
              </button>
            </Link>
          </div>

          <div className="flex flex-col gap-4">
            {scales.map((scale) => (
              <div key={scale.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4 flex flex-col gap-3 shadow-sm hover:shadow-md transition-all">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white">{scale.title}</h3>
                    <p className="text-xs text-gray-500">{fmtDate(scale.date)} • {scale.format}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={() => generateScalePDF(scale)}
                      className="p-2 text-gray-400 hover:text-red-600 transition-all active:scale-90"
                      title="Baixar PDF da Escala"
                    >
                      <span className="material-symbols-outlined text-[18px]">download</span>
                    </button>
                    <Link href={`/admin/scales/${scale.id}/confirmations`}>
                      <button 
                        className="p-2 text-gray-400 hover:text-green-600 transition-colors"
                        title="Ver Confirmações"
                      >
                        <span className="material-symbols-outlined text-[18px]">fact_check</span>
                      </button>
                    </Link>
                    <Link href={`/admin/scales/${scale.id}/edit`}>
                      <button 
                        className="p-2 text-gray-400 hover:text-amber-500 transition-colors"
                        title="Editar Escala"
                      >
                        <span className="material-symbols-outlined text-[18px]">edit</span>
                      </button>
                    </Link>
                    <button 
                      onClick={() => handleDelete(scale.id, scale.title)}
                      className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                      title="Excluir Escala"
                    >
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  <span className="material-symbols-outlined text-[14px]">group</span>
                  {scale.musicians?.length || 0} Integrantes no Efetivo
                </div>

                <div className="flex flex-wrap gap-1">
                  {scale.musicians?.slice(0, 3).map((m: any, i: number) => (
                    <span key={i} className="text-[10px] bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded text-gray-600 dark:text-gray-400">
                      {m.rank} {m.war_name || m.name}
                    </span>
                  ))}
                  {(scale.musicians?.length > 3) && (
                    <span className="text-[10px] text-gray-400 px-1">+{scale.musicians.length - 3}</span>
                  )}
                </div>
              </div>
            ))}

            {scales.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400 text-center">
                <span className="material-symbols-outlined text-[48px] mb-2">event_busy</span>
                <p className="text-sm">Nenhuma escala cadastrada.</p>
                <Link href="/admin/scales/new">
                  <button className="mt-4 text-primary font-bold text-xs hover:underline">Criar primeira escala</button>
                </Link>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
