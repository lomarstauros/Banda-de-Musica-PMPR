'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, onSnapshot, query, orderBy, deleteDoc, doc, updateDoc, getDoc } from 'firebase/firestore';
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
        
        const qLogs = query(collection(db, 'audit_logs'), orderBy('timestamp', 'desc'), limit(50));
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
    if (!id) {
      alert("Erro do sistema: ID do usuário inválido.");
      return;
    }
    if (window.confirm(`Tem certeza que deseja aprovar o acesso de ${name}?`)) {
      try {
        await updateDoc(doc(db, 'profiles', id), {
          status: 'active'
        });
        alert(`Acesso de ${name} aprovado com sucesso!`);
      } catch (error: any) {
        console.error("Erro ao aprovar:", error);
        alert('Falha ao aprovar: Ocorreu um erro de permissão ou conexão. Detalhes: ' + error.message);
      }
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!id) {
      alert("Erro do sistema: ID do usuário inválido.");
      return;
    }
    if (window.confirm(`ATENÇÃO: Deseja EXCLUIR DEFINITIVAMENTE o perfil de ${name}? Esta ação bloqueará o usuário permanentemente no aplicativo.`)) {
      try {
        await deleteDoc(doc(db, 'profiles', id));
        alert(`Perfil de ${name} excluído com sucesso.`);
      } catch (error: any) {
        console.error("Erro ao excluir:", error);
        alert('Falha ao excluir: Detalhes: ' + error.message);
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

  // Pending users = missing email (partially registered) OR explicit status === 'pending'
  const pendingUsers = users.filter(u => u.status === 'pending');
  const allExceptMaster = users.filter(u => u.role !== 'master');

  const listToDisplay = activeTab === 'pending' ? pendingUsers : allExceptMaster;

  const filteredUsers = listToDisplay.filter(m =>
    (m.name?.toLowerCase() || '').includes(search.toLowerCase()) ||
    (m.email?.toLowerCase() || '').includes(search.toLowerCase()) ||
    (m.war_name?.toLowerCase() || '').includes(search.toLowerCase())
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
            <h1 className="text-lg font-bold">Painel Master Admin</h1>
            <span className="text-[10px] uppercase font-black tracking-widest opacity-80">Segurança de Acessos</span>
          </div>
          <div className="size-10"></div>
        </header>

        <main className="flex-1 p-4 flex flex-col gap-6 pb-24">
          <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
            <button 
              onClick={() => setActiveTab('pending')}
              className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'pending' ? 'bg-white dark:bg-gray-700 text-amber-600 dark:text-amber-400 shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
            >
              Pendentes ({pendingUsers.length})
            </button>
            <button 
              onClick={() => setActiveTab('all')}
              className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'all' ? 'bg-white dark:bg-gray-700 text-amber-600 dark:text-amber-400 shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
            >
              Todos ({allExceptMaster.length})
            </button>
            <button 
              onClick={() => setActiveTab('logs')}
              className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'logs' ? 'bg-white dark:bg-gray-700 text-amber-600 dark:text-amber-400 shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
            >
              Auditoria
            </button>
          </div>

          {activeTab !== 'logs' && (
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                <span className="material-symbols-outlined">search</span>
              </div>
              <input 
                className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 pl-10 pr-4 py-3 text-sm focus:ring-2 focus:ring-amber-500 outline-none" 
                placeholder="Buscar por nome ou email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          )}

          <div className="flex flex-col gap-3">
            {activeTab === 'logs' ? (
              <div className="flex flex-col gap-3">
                {logs.map((log) => (
                  <div key={log.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4 shadow-sm flex flex-col gap-2">
                    <div className="flex justify-between items-center mb-1">
                      {log.action === 'create' && <span className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider">Criação</span>}
                      {log.action === 'update' && <span className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider">Edição</span>}
                      {log.action === 'delete' && <span className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider">Exclusão</span>}
                      <span className="text-[9px] font-bold text-gray-400">
                        {log.dateObj.toLocaleDateString('pt-BR')} • {log.dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="size-6 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-[10px] font-black text-amber-700">
                        {log.userName?.charAt(0) || 'A'}
                      </div>
                      <p className="text-xs font-bold text-gray-900 dark:text-white uppercase truncate">{log.userName}</p>
                    </div>
                    <p className="text-xs text-primary dark:text-blue-400 font-bold break-words mt-1 border-l-2 border-amber-500 pl-2">
                      {log.entityTitle}
                    </p>
                  </div>
                ))}
                {logs.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                    <span className="material-symbols-outlined text-[48px] mb-2">history</span>
                    <p className="text-sm text-center px-4">Nenhum log registrado ainda.</p>
                  </div>
                )}
              </div>
            ) : filteredUsers.map((user) => (
              <div key={user.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4 flex flex-col gap-3 shadow-sm hover:shadow-md transition-all group">
                <div className="flex items-start gap-3">
                  <div className="size-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500 font-bold text-sm uppercase border border-gray-200 dark:border-gray-700 shrink-0">
                    {user.name ? user.name.split(' ').map((n: string) => n[0]).join('').substring(0,2) : '??'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white truncate">
                      {user.name || 'Nome não preenchido'}
                    </h3>
                    <p className="text-xs text-gray-500 truncate mt-0.5">{user.email}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {user.status === 'pending' ? (
                        <span className="text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-1.5 py-0.5 rounded">
                          Aguardando Aprovação
                        </span>
                      ) : (
                        <span className="text-[9px] font-black uppercase tracking-wider bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-1.5 py-0.5 rounded">
                          Ativo
                        </span>
                      )}
                      <span className="text-[9px] font-black uppercase tracking-wider bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300 px-1.5 py-0.5 rounded">
                        {user.rank || 'Sem graduação'}
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center gap-2">
                  {user.status === 'pending' && (
                    <button 
                      onClick={() => handleApprove(user.id, user.name || user.email)}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1"
                    >
                      <span className="material-symbols-outlined text-[16px]">check_circle</span>
                      Aprovar Acesso
                    </button>
                  )}
                  <button 
                    onClick={() => handleDelete(user.id, user.name || user.email)}
                    className="flex-1 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 py-2 rounded-lg text-xs font-bold transition-colors border border-red-200 dark:border-red-900/50 flex items-center justify-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[16px]">delete_forever</span>
                    Excluir Conta
                  </button>
                </div>
              </div>
            ))}
            {activeTab !== 'logs' && filteredUsers.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <span className="material-symbols-outlined text-[48px] mb-2">shield_locked</span>
                <p className="text-sm text-center px-4">Nenhum perfil encontrado nesta categoria.</p>
              </div>
            )}

          </div>
        </main>
      </div>
    </div>
  );
}
