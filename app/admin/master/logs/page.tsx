'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, orderBy, limit, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import { fmtDate } from '@/lib/format-date';

export default function MasterLogsPage() {
  const router = useRouter();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMaster, setIsMaster] = useState(false);
  
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        try {
          const profileSnap = await getDoc(doc(db, 'profiles', currentUser.uid));
          if (profileSnap.exists() && profileSnap.data().role === 'master') {
            setIsMaster(true);
          } else {
            alert('Acesso Restrito: Apenas a conta Master pode acessar esta tela.');
            router.push('/admin/swaps');
            return;
          }
        } catch (e) {
          console.error(e);
          router.push('/admin/login');
          return;
        }

        // Busca os últimos 100 logs
        const q = query(collection(db, 'audit_logs'), orderBy('timestamp', 'desc'), limit(100));
        
        const unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
          const docs = snapshot.docs.map(d => ({ 
            id: d.id, 
            ...d.data(),
            dateObj: d.data().timestamp?.toDate() || new Error('no date')
          }));
          setLogs(docs);
          setLoading(false);
        });

        return () => unsubscribeSnapshot();
      } else {
        router.push('/admin/login');
      }
    });

    return () => unsubscribeAuth();
  }, [router]);

  if (loading || !isMaster) {
    return (
      <div className="bg-background-light dark:bg-background-dark min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-amber-500"></div>
      </div>
    );
  }

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'create':
        return <span className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">Criação</span>;
      case 'update':
        return <span className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">Edição</span>;
      case 'delete':
        return <span className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">Exclusão</span>;
      default:
        return <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">{action}</span>;
    }
  };

  const formatLogTime = (date: any) => {
    if (!date || date instanceof Error) return '--:--';
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  const formatLogDate = (date: any) => {
    if (!date || date instanceof Error) return 'Data desconhecida';
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  return (
    <div className="bg-background-light dark:bg-background-dark font-sans min-h-screen flex flex-col items-center">
      <div className="relative w-full max-w-md bg-background-light dark:bg-background-dark flex flex-col h-full min-h-screen shadow-2xl">
        <header className="sticky top-0 z-10 bg-amber-600 dark:bg-amber-800 text-white px-4 py-4 flex items-center justify-between border-b border-amber-700 shadow-md">
          <button 
            onClick={() => router.back()}
            className="flex items-center justify-center p-2 rounded-full hover:bg-black/20 transition-colors"
          >
            <span className="material-symbols-outlined">arrow_back_ios_new</span>
          </button>
          <div className="flex flex-col items-center flex-1">
            <h1 className="text-lg font-bold">Logs de Segurança</h1>
            <span className="text-[10px] uppercase font-black tracking-widest opacity-80 underline underline-offset-4 decoration-amber-400">Auditoria de Escalas</span>
          </div>
          <div className="size-10"></div>
        </header>

        <main className="flex-1 p-4 flex flex-col gap-4 pb-20">
          <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 rounded-2xl p-4 flex gap-3 items-start">
            <span className="material-symbols-outlined text-amber-600 dark:text-amber-400">privacy_tip</span>
            <div className="flex flex-col">
              <p className="text-xs font-bold text-amber-900 dark:text-amber-200 uppercase tracking-tight">Monitoramento Ativo</p>
              <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-tight mt-1">
                Todas as alterações em escalas são registradas automaticamente para fins de segurança e transparência.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 mt-2">
            {logs.map((log) => (
              <div key={log.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4 shadow-sm hover:shadow-md transition-all flex flex-col gap-2 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                  <span className="material-symbols-outlined text-[40px]">history</span>
                </div>
                
                <div className="flex justify-between items-center mb-1">
                  {getActionBadge(log.action)}
                  <span className="text-[10px] font-bold text-gray-400">
                    {formatLogDate(log.dateObj)} • {formatLogTime(log.dateObj)}
                  </span>
                </div>

                <div className="flex flex-col gap-1">
                  <p className="text-xs text-gray-500 font-medium">Responsável:</p>
                  <div className="flex items-center gap-2">
                    <div className="size-6 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-[10px] font-black text-amber-700 shrink-0">
                      {log.userName?.charAt(0) || 'A'}
                    </div>
                    <p className="text-sm font-bold text-gray-900 dark:text-white uppercase truncate">{log.userName}</p>
                  </div>
                </div>

                <div className="mt-2 pt-2 border-t border-gray-50 dark:border-gray-800 flex flex-col gap-1">
                  <p className="text-xs text-gray-400">Escala afetada:</p>
                  <p className="text-sm font-bold text-primary dark:text-blue-400 break-words">
                    {log.entityTitle || 'Título não disponível'}
                  </p>
                </div>
              </div>
            ))}

            {logs.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <span className="material-symbols-outlined text-[64px] mb-4 opacity-20">inventory_2</span>
                <p className="text-sm font-medium">Nenhum registro de auditoria encontrado.</p>
                <p className="text-[10px] uppercase tracking-widest mt-2 opacity-60">Os logs começarão a aparecer após a próxima alteração</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
