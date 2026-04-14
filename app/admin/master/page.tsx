'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, onSnapshot, query, orderBy, deleteDoc, doc, updateDoc, getDoc, limit } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { sortByRankThenName } from '@/lib/sort-military';
import { useRouter } from 'next/navigation';

export default function MasterPanelPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'pending' | 'all' | 'logs'>('pending');
  const [logs, setLogs] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<any[]>([]);
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
          return;
        }

        const q = query(collection(db, 'profiles'), orderBy('name', 'asc'));
        const unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
          const docs = snapshot.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .sort(sortByRankThenName);
          setUsers(docs);
          setLoading(false);
        });

        const qLogs = query(collection(db, 'audit_logs'), orderBy('timestamp', 'desc'), limit(100));
        const unsubscribeLogs = onSnapshot(qLogs, (snapshot) => {
          const docs = snapshot.docs.map(d => ({ 
            id: d.id, 
            ...d.data(),
            dateObj: d.data().timestamp?.toDate() || new Date()
          }));
          setLogs(docs);
        });

        return () => {
          unsubscribeSnapshot();
          unsubscribeLogs();
        };
      } else {
        router.push('/admin/login');
      }
    });

    return () => unsubscribeAuth();
  }, [router]);

  const handleApprove = async (id: string, name: string) => {
    if (!id) return;
    if (window.confirm(`Tem certeza que deseja aprovar o acesso de ${name}?`)) {
      try {
        await updateDoc(doc(db, 'profiles', id), { status: 'active' });
        alert(`Acesso de ${name} aprovado!`);
      } catch (error: any) {
        alert('Erro ao aprovar: ' + error.message);
      }
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!id) return;
    if (window.confirm(`Excluir definitivamente ${name}?`)) {
      try {
        await deleteDoc(doc(db, 'profiles', id));
        alert('Perfil removido.');
      } catch (error: any) {
        alert('Erro ao excluir: ' + error.message);
      }
    }
  };

  if (loading || !isMaster) {
    return (
      <div className="bg-background-light dark:bg-background-dark min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-amber-500"></div>
      </div>
    );
  }

  const pendingUsers = users.filter(u => u.status === 'pending');
  const allExceptMaster = users.filter(u => u.role !== 'master');
  const filteredUsers = (activeTab === 'pending' ? pendingUsers : allExceptMaster).filter(m =>
    (m.name?.toLowerCase() || '').includes(search.toLowerCase()) ||
    (m.email?.toLowerCase() || '').includes(search.toLowerCase())
  );

  return (
    <div className="bg-background-light dark:bg-background-dark font-sans min-h-screen flex flex-col items-center">
      <div className="relative w-full max-w-md bg-background-light dark:bg-background-dark flex flex-col h-full min-h-screen shadow-2xl">
        <header className="sticky top-0 z-10 bg-amber-600 dark:bg-amber-800 text-white px-4 py-3 flex items-center justify-between border-b border-amber-700 shadow-md">
          <Link href="/admin/swaps">
            <button className="flex items-center justify-center p-2 rounded-full hover:bg-black/20 transition-colors">
              <span className="material-symbols-outlined">arrow_back_ios_new</span>
            </button>
          </Link>
          <div className="flex flex-col items-center flex-1">
            <h1 className="text-lg font-bold">Painel Master</h1>
            <span className="text-[10px] uppercase font-black tracking-widest opacity-80 decoration-amber-400">Verificação de Segurança v2</span>
          </div>
          <div className="size-10"></div>
        </header>

        <main className="flex-1 p-4 flex flex-col gap-5 pb-24">
          
          <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
            <button 
              onClick={() => setActiveTab('pending')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${activeTab === 'pending' ? 'bg-white dark:bg-gray-700 text-amber-600 dark:text-amber-400 shadow-sm' : 'text-gray-500'}`}
            >
              Pendentes ({pendingUsers.length})
            </button>
            <button 
              onClick={() => setActiveTab('all')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${activeTab === 'all' ? 'bg-white dark:bg-gray-700 text-amber-600 dark:text-amber-400 shadow-sm' : 'text-gray-500'}`}
            >
              Todos ({allExceptMaster.length})
            </button>
            <button 
              onClick={() => setActiveTab('logs')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${activeTab === 'logs' ? 'bg-white dark:bg-gray-700 text-amber-600 dark:text-amber-400 shadow-sm' : 'text-gray-500'}`}
            >
              Auditoria
            </button>
          </div>

          {activeTab !== 'logs' && (
            <div className="relative">
              <input 
                className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 pl-4 pr-10 py-3 text-sm outline-none" 
                placeholder="Pesquisar..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          )}

          <div className="flex flex-col gap-3">
            {activeTab === 'logs' ? (
              <div className="flex flex-col gap-3">
                {logs.map((log) => (
                  <div key={log.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4 shadow-sm flex flex-col gap-1">
                    <div className="flex justify-between items-center mb-1">
                      <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${
                        log.action === 'create' ? 'bg-green-100 text-green-700' : 
                        log.action === 'delete' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {log.action}
                      </span>
                      <span className="text-[9px] text-gray-400">{log.dateObj.toLocaleString('pt-BR')}</span>
                    </div>
                    <p className="text-xs font-bold uppercase">{log.userName}</p>
                    <p className="text-xs text-blue-500 font-bold">{log.entityTitle}</p>
                  </div>
                ))}
              </div>
            ) : (
              filteredUsers.map((user) => (
                <div key={user.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4 flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <div className="size-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center font-bold text-sm">
                      {user.war_name?.substring(0,2) || '??'}
                    </div>
                    <div className="flex-1">
                      <h3 className="text-sm font-bold truncate">{user.name}</h3>
                      <p className="text-[10px] text-gray-500">{user.email}</p>
                    </div>
                    {user.status === 'pending' && (
                      <button onClick={() => handleApprove(user.id, user.name)} className="bg-green-600 text-white p-2 rounded-lg"><span className="material-symbols-outlined text-sm">check</span></button>
                    )}
                    <button onClick={() => handleDelete(user.id, user.name)} className="text-red-500 p-2"><span className="material-symbols-outlined text-sm">delete</span></button>
                  </div>
                </div>
              ))
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
