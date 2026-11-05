'use client';

import Link from 'next/link';
import { useState, useEffect, useMemo } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  deleteDoc, 
  doc, 
  updateDoc, 
  getDoc, 
  limit, 
  writeBatch 
} from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { sortByRankThenName } from '@/lib/sort-military';
import { useRouter } from 'next/navigation';
import { normalizeSpaces } from '@/lib/utils';
import { fmtDate } from '@/lib/format-date';

export default function MasterPanelPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'access' | 'pending' | 'all' | 'logs'>('access');
  const [accessFilter, setAccessFilter] = useState<'todos' | 'ativos' | 'inativos' | 'pendentes'>('todos');
  const [logs, setLogs] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMaster, setIsMaster] = useState(false);
  const [isSanitizing, setIsSanitizing] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
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
        }, (err) => {
          console.error("Erro no listener de usuários (Master):", err);
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
        }, (err) => {
          console.error("Erro no listener de auditoria (Master):", err);
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

  // Helpers para determinação do status de acesso ao app
  const isUserActive = (u: any) => {
    if (u.status === 'inactive' || u.active === false) return false;
    if (u.status === 'pending') return false;
    return u.status === 'active' || u.active === true || (!u.status && u.active !== false);
  };

  const isUserInactive = (u: any) => {
    return u.status === 'inactive' || u.active === false;
  };

  const isUserPending = (u: any) => {
    return u.status === 'pending';
  };

  // Alternar Status de Acesso (Ativar / Desativar Acesso ao App)
  const handleToggleStatus = async (user: any) => {
    const currentlyActive = isUserActive(user);
    const newStatus = currentlyActive ? 'inactive' : 'active';
    const newActive = !currentlyActive;
    const actionLabel = currentlyActive ? 'DESATIVAR o acesso ao app' : 'ATIVAR o acesso ao app';

    const displayName = `${user.rank || ''} ${user.war_name || user.name}`.trim();

    if (!window.confirm(`Tem certeza que deseja ${actionLabel} de ${displayName}?`)) {
      return;
    }

    try {
      await updateDoc(doc(db, 'profiles', user.id), {
        status: newStatus,
        active: newActive
      });
      alert(`O acesso de ${displayName} foi ${newActive ? 'ATIVADO' : 'DESATIVADO'} com sucesso.`);
    } catch (error: any) {
      alert('Erro ao atualizar status de acesso: ' + error.message);
    }
  };

  // Aprovar usuário pendente
  const handleApprove = async (id: string, name: string) => {
    if (!id) return;
    if (window.confirm(`Tem certeza que deseja aprovar o acesso de ${name}?`)) {
      try {
        await updateDoc(doc(db, 'profiles', id), { 
          status: 'active',
          active: true 
        });
        alert(`Acesso de ${name} aprovado com sucesso!`);
      } catch (error: any) {
        alert('Erro ao aprovar: ' + error.message);
      }
    }
  };

  // Exigir redefinição de senha no próximo login
  const handleToggleForcePasswordReset = async (user: any) => {
    const currentlyForced = user.forcePasswordReset === true;
    const actionText = currentlyForced 
      ? 'remover a exigência de troca de senha no próximo login' 
      : 'exigir que o militar defina uma nova senha pessoal no próximo login';

    const displayName = `${user.rank || ''} ${user.war_name || user.name}`.trim();

    if (!window.confirm(`Deseja ${actionText} para ${displayName}?`)) {
      return;
    }

    try {
      await updateDoc(doc(db, 'profiles', user.id), {
        forcePasswordReset: !currentlyForced
      });
      alert(`Configuração de senha atualizada para ${displayName}.`);
    } catch (err: any) {
      alert('Erro ao atualizar configuração de senha: ' + err.message);
    }
  };

  // Excluir usuário definitivamente
  const handleDelete = async (id: string, name: string) => {
    if (!id) return;
    if (window.confirm(`Excluir definitivamente o cadastro de ${name}? Esta ação não pode ser desfeita.`)) {
      try {
        await deleteDoc(doc(db, 'profiles', id));
        alert('Perfil removido da base de dados.');
      } catch (error: any) {
        alert('Erro ao excluir: ' + error.message);
      }
    }
  };

  // Copiar e-mail de login
  const handleCopyEmail = (userId: string, email: string) => {
    if (!email) return;
    navigator.clipboard.writeText(email);
    setCopiedId(userId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSanitizeNames = async () => {
    if (!window.confirm('Deseja padronizar o espaçamento de todos os nomes e postos/graduações no banco de dados? Isso corrigirá erros de negrito no PDF.')) {
      return;
    }
    
    setIsSanitizing(true);
    try {
      const batch = writeBatch(db);
      let count = 0;
      
      users.forEach(user => {
        const cleanName = normalizeSpaces(user.name || '');
        const cleanWarName = normalizeSpaces(user.war_name || '');
        const cleanRank = normalizeSpaces(user.rank || '');
        
        if (cleanName !== user.name || cleanWarName !== user.war_name || cleanRank !== user.rank) {
          batch.update(doc(db, 'profiles', user.id), {
            name: cleanName,
            war_name: cleanWarName,
            rank: cleanRank
          });
          count++;
        }
      });
      
      if (count > 0) {
        await batch.commit();
        alert(`${count} perfis foram saneados com sucesso!`);
      } else {
        alert('Todos os perfis já estão com espaçamento padronizado.');
      }
    } catch (error: any) {
      console.error(error);
      alert('Erro ao sanear nomes: ' + error.message);
    } finally {
      setIsSanitizing(false);
    }
  };

  // Listas segmentadas
  const allExceptMaster = useMemo(() => users.filter(u => u.role !== 'master'), [users]);
  const activeUsers = useMemo(() => allExceptMaster.filter(isUserActive), [allExceptMaster]);
  const inactiveUsers = useMemo(() => allExceptMaster.filter(isUserInactive), [allExceptMaster]);
  const pendingUsers = useMemo(() => allExceptMaster.filter(isUserPending), [allExceptMaster]);

  // Lista filtrada para a aba Acessos
  const filteredAccessUsers = useMemo(() => {
    let list = allExceptMaster;
    if (accessFilter === 'ativos') list = activeUsers;
    else if (accessFilter === 'inativos') list = inactiveUsers;
    else if (accessFilter === 'pendentes') list = pendingUsers;

    const term = search.trim().toLowerCase();
    if (!term) return list;

    return list.filter(u => 
      (u.name?.toLowerCase() || '').includes(term) ||
      (u.war_name?.toLowerCase() || '').includes(term) ||
      (u.email?.toLowerCase() || '').includes(term) ||
      (u.rank?.toLowerCase() || '').includes(term) ||
      (u.instrument?.toLowerCase() || '').includes(term) ||
      (u.re?.toLowerCase() || '').includes(term)
    );
  }, [allExceptMaster, activeUsers, inactiveUsers, pendingUsers, accessFilter, search]);

  // Lista para a aba "Efetivo Geral" ou "Pendentes"
  const filteredUsers = useMemo(() => {
    const list = activeTab === 'pending' ? pendingUsers : allExceptMaster;
    const term = search.trim().toLowerCase();
    if (!term) return list;
    return list.filter(m =>
      (m.name?.toLowerCase() || '').includes(term) ||
      (m.war_name?.toLowerCase() || '').includes(term) ||
      (m.email?.toLowerCase() || '').includes(term) ||
      (m.rank?.toLowerCase() || '').includes(term)
    );
  }, [activeTab, pendingUsers, allExceptMaster, search]);

  if (loading || !isMaster) {
    return (
      <div className="bg-background-light dark:bg-background-dark min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-amber-500"></div>
      </div>
    );
  }

  return (
    <div className="bg-transparent font-sans flex flex-col items-center lg:items-stretch w-full">
      <div className="relative w-full max-w-md lg:max-w-none bg-background-light dark:bg-[#121620]/90 backdrop-blur-xl lg:rounded-3xl lg:border lg:border-white/10 flex flex-col h-full min-h-screen lg:min-h-0 shadow-2xl">
        
        {/* Header Master */}
        <header className="sticky top-0 z-20 bg-amber-600 dark:bg-amber-800 text-white px-4 lg:px-6 py-3.5 flex items-center justify-between border-b border-amber-700 shadow-md lg:rounded-t-3xl">
          <Link href="/admin/scales">
            <button className="flex items-center justify-center p-2 rounded-full hover:bg-black/20 transition-colors" title="Voltar">
              <span className="material-symbols-outlined">arrow_back_ios_new</span>
            </button>
          </Link>
          <div className="flex flex-col items-center flex-1">
            <h1 className="text-lg font-bold flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[20px]">admin_panel_settings</span>
              Painel Master
            </h1>
            <span className="text-[10px] uppercase font-black tracking-widest opacity-80 decoration-amber-400">
              Controle Geral de Acessos & Auditoria
            </span>
          </div>
          <div className="size-10"></div>
        </header>

        <main className="flex-1 p-4 lg:p-6 flex flex-col gap-5 pb-24">
          
          {/* Botão de Saneamento */}
          <button 
            onClick={handleSanitizeNames}
            disabled={isSanitizing}
            className="w-full bg-blue-600 hover:bg-blue-700 dark:bg-blue-800 dark:hover:bg-blue-900 text-white py-3 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 active:scale-95 transition-all disabled:opacity-50"
          >
            <span className={`material-symbols-outlined text-[18px] ${isSanitizing ? 'animate-spin' : ''}`}>sync_alt</span>
            {isSanitizing ? 'SANEANDO BANCO DE DADOS...' : 'PADRONIZAR ESPAÇAMENTO DE NOMES (BANCO)'}
          </button>

          {/* Abas Principais do Painel Master */}
          <div className="flex bg-gray-100 dark:bg-gray-800/80 p-1.5 rounded-2xl gap-1 overflow-x-auto scrollbar-none border border-gray-200 dark:border-white/5">
            <button 
              onClick={() => setActiveTab('access')}
              className={`flex-1 min-w-[130px] py-2.5 px-3 text-xs font-bold rounded-xl transition-all whitespace-nowrap flex items-center justify-center gap-1.5 ${
                activeTab === 'access' 
                  ? 'bg-white dark:bg-gray-700 text-amber-600 dark:text-amber-400 shadow-sm' 
                  : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">manage_accounts</span>
              Acessos ao App ({allExceptMaster.length})
            </button>

            <button 
              onClick={() => setActiveTab('pending')}
              className={`flex-1 min-w-[110px] py-2.5 px-3 text-xs font-bold rounded-xl transition-all whitespace-nowrap flex items-center justify-center gap-1.5 ${
                activeTab === 'pending' 
                  ? 'bg-white dark:bg-gray-700 text-amber-600 dark:text-amber-400 shadow-sm' 
                  : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">hourglass_empty</span>
              Pendentes ({pendingUsers.length})
            </button>

            <button 
              onClick={() => setActiveTab('all')}
              className={`flex-1 min-w-[110px] py-2.5 px-3 text-xs font-bold rounded-xl transition-all whitespace-nowrap flex items-center justify-center gap-1.5 ${
                activeTab === 'all' 
                  ? 'bg-white dark:bg-gray-700 text-amber-600 dark:text-amber-400 shadow-sm' 
                  : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">group</span>
              Efetivo Geral ({allExceptMaster.length})
            </button>

            <button 
              onClick={() => setActiveTab('logs')}
              className={`flex-1 min-w-[100px] py-2.5 px-3 text-xs font-bold rounded-xl transition-all whitespace-nowrap flex items-center justify-center gap-1.5 ${
                activeTab === 'logs' 
                  ? 'bg-white dark:bg-gray-700 text-amber-600 dark:text-amber-400 shadow-sm' 
                  : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">history</span>
              Auditoria
            </button>
          </div>

          {/* ═════════════════════════════════════════════════════════════════ */}
          {/* ABA 1: ACESSOS AO APP (INFORMAÇÕES DE ATIVOS / INATIVOS)        */}
          {/* ═════════════════════════════════════════════════════════════════ */}
          {activeTab === 'access' && (
            <div className="flex flex-col gap-4">
              
              {/* Cards de Métricas de Acesso */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-white dark:bg-gray-900 p-3.5 rounded-2xl border border-gray-100 dark:border-gray-800 flex flex-col gap-1 shadow-sm">
                  <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400">Total Cadastros</span>
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-black text-gray-900 dark:text-white">{allExceptMaster.length}</span>
                    <span className="material-symbols-outlined text-gray-400 text-[22px]">badge</span>
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-900 p-3.5 rounded-2xl border border-green-500/20 bg-green-50/30 dark:bg-green-950/10 flex flex-col gap-1 shadow-sm">
                  <span className="text-[11px] font-bold text-green-700 dark:text-green-400 flex items-center gap-1">
                    <span className="size-2 rounded-full bg-green-500 animate-pulse"></span>
                    Ativos no App
                  </span>
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-black text-green-600 dark:text-green-400">{activeUsers.length}</span>
                    <span className="material-symbols-outlined text-green-500 text-[22px]">check_circle</span>
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-900 p-3.5 rounded-2xl border border-red-500/20 bg-red-50/30 dark:bg-red-950/10 flex flex-col gap-1 shadow-sm">
                  <span className="text-[11px] font-bold text-red-700 dark:text-red-400 flex items-center gap-1">
                    <span className="size-2 rounded-full bg-red-500"></span>
                    Inativos
                  </span>
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-black text-red-600 dark:text-red-400">{inactiveUsers.length}</span>
                    <span className="material-symbols-outlined text-red-500 text-[22px]">person_off</span>
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-900 p-3.5 rounded-2xl border border-amber-500/20 bg-amber-50/30 dark:bg-amber-950/10 flex flex-col gap-1 shadow-sm">
                  <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                    <span className="size-2 rounded-full bg-amber-500"></span>
                    Pendentes
                  </span>
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-black text-amber-600 dark:text-amber-400">{pendingUsers.length}</span>
                    <span className="material-symbols-outlined text-amber-500 text-[22px]">hourglass_empty</span>
                  </div>
                </div>
              </div>

              {/* Barra de Busca */}
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-[20px]">
                  search
                </span>
                <input 
                  className="w-full rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 pl-10 pr-10 py-3 text-xs sm:text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:border-amber-500 transition-colors shadow-sm" 
                  placeholder="Pesquisar por nome, nome de guerra, e-mail, posto ou instrumento..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                  <button 
                    onClick={() => setSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-white"
                  >
                    <span className="material-symbols-outlined text-[18px]">close</span>
                  </button>
                )}
              </div>

              {/* Sub-filtros de status de acesso */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                <button
                  onClick={() => setAccessFilter('todos')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                    accessFilter === 'todos'
                      ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900 shadow-sm'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  Todos ({allExceptMaster.length})
                </button>
                <button
                  onClick={() => setAccessFilter('ativos')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                    accessFilter === 'ativos'
                      ? 'bg-green-600 text-white shadow-sm shadow-green-600/20'
                      : 'bg-green-500/10 text-green-700 dark:text-green-400 hover:bg-green-500/20'
                  }`}
                >
                  <span className="size-2 rounded-full bg-green-500"></span>
                  Ativos ({activeUsers.length})
                </button>
                <button
                  onClick={() => setAccessFilter('inativos')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                    accessFilter === 'inativos'
                      ? 'bg-red-600 text-white shadow-sm shadow-red-600/20'
                      : 'bg-red-500/10 text-red-700 dark:text-red-400 hover:bg-red-500/20'
                  }`}
                >
                  <span className="size-2 rounded-full bg-red-500"></span>
                  Inativos ({inactiveUsers.length})
                </button>
                <button
                  onClick={() => setAccessFilter('pendentes')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                    accessFilter === 'pendentes'
                      ? 'bg-amber-600 text-white shadow-sm shadow-amber-600/20'
                      : 'bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20'
                  }`}
                >
                  <span className="size-2 rounded-full bg-amber-500"></span>
                  Pendentes ({pendingUsers.length})
                </button>
              </div>

              {/* Lista de Usuários com Informações de Acesso */}
              <div className="flex flex-col gap-3">
                {filteredAccessUsers.length === 0 ? (
                  <div className="py-12 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6 flex flex-col items-center justify-center text-center">
                    <span className="material-symbols-outlined text-[48px] text-gray-300 dark:text-gray-700 mb-2">person_search</span>
                    <p className="text-sm font-bold text-gray-700 dark:text-gray-300">Nenhum militar encontrado</p>
                    <p className="text-xs text-gray-500 mt-1">Tente ajustar os filtros ou termo de busca acima.</p>
                  </div>
                ) : (
                  filteredAccessUsers.map((user) => {
                    const active = isUserActive(user);
                    const inactive = isUserInactive(user);
                    const pending = isUserPending(user);

                    return (
                      <div 
                        key={user.id} 
                        className={`bg-white dark:bg-gray-900 rounded-2xl border p-4 shadow-sm flex flex-col gap-3 transition-all ${
                          inactive 
                            ? 'border-red-500/30 bg-red-50/10 dark:bg-red-950/5' 
                            : pending 
                            ? 'border-amber-500/30 bg-amber-50/10 dark:bg-amber-950/5'
                            : 'border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700'
                        }`}
                      >
                        {/* Topo do Card */}
                        <div className="flex items-start gap-3">
                          
                          {/* Avatar com status indicator */}
                          <div className="relative shrink-0">
                            <div className="size-12 rounded-2xl bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center font-bold text-sm text-gray-700 dark:text-gray-300 overflow-hidden shadow-inner">
                              {user.photo_url ? (
                                <img src={user.photo_url} alt={user.name} className="size-full object-cover" />
                              ) : (
                                <span>{user.war_name?.substring(0, 2).toUpperCase() || '??'}</span>
                              )}
                            </div>
                            <span 
                              className={`absolute -bottom-1 -right-1 size-3.5 rounded-full border-2 border-white dark:border-gray-900 ${
                                active ? 'bg-green-500' : inactive ? 'bg-red-500' : 'bg-amber-500'
                              }`} 
                              title={active ? 'Ativo' : inactive ? 'Inativo' : 'Pendente'}
                            />
                          </div>

                          {/* Dados Pessoais / Militares */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[11px] font-black uppercase text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md">
                                {user.rank || 'Militar'}
                              </span>
                              <h3 className="text-sm font-bold text-gray-900 dark:text-white truncate">
                                {user.name}
                              </h3>
                            </div>

                            <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-gray-500 dark:text-gray-400">
                              {user.war_name && (
                                <span className="font-bold text-gray-800 dark:text-gray-200">
                                  Nome de Guerra: {user.war_name}
                                </span>
                              )}
                              {user.instrument && (
                                <>
                                  <span>•</span>
                                  <span>{user.instrument}</span>
                                </>
                              )}
                              {user.re && (
                                <>
                                  <span>•</span>
                                  <span className="font-mono">RE: {user.re}</span>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Badge de Status de Acesso */}
                          <div className="shrink-0">
                            {active && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20">
                                <span className="size-2 rounded-full bg-green-500 animate-pulse"></span>
                                Ativo • Acesso Liberado
                              </span>
                            )}
                            {inactive && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/20">
                                <span className="size-2 rounded-full bg-red-500"></span>
                                Inativo • Acesso Bloqueado
                              </span>
                            )}
                            {pending && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                                <span className="size-2 rounded-full bg-amber-500"></span>
                                Pendente • Aguardando Aprovação
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Bloco de Detalhes de Acesso */}
                        <div className="bg-gray-50 dark:bg-black/30 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs border border-gray-100 dark:border-white/5">
                          
                          {/* E-mail de Login */}
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="material-symbols-outlined text-gray-400 text-[18px] shrink-0">mail</span>
                            <span className="text-gray-500 dark:text-gray-400 shrink-0">E-mail:</span>
                            <span className="font-mono font-medium text-gray-800 dark:text-gray-200 truncate">
                              {user.email || 'Sem e-mail cadastrado'}
                            </span>
                            {user.email && (
                              <button
                                onClick={() => handleCopyEmail(user.id, user.email)}
                                className="p-1 hover:bg-gray-200 dark:hover:bg-gray-800 rounded text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors"
                                title="Copiar e-mail"
                              >
                                <span className="material-symbols-outlined text-[14px]">
                                  {copiedId === user.id ? 'check' : 'content_copy'}
                                </span>
                              </button>
                            )}
                          </div>

                          {/* Segurança & Papel */}
                          <div className="flex items-center gap-2 flex-wrap shrink-0">
                            {/* Função */}
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-gray-200/80 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                              {user.role === 'admin' ? 'Gestor' : user.role === 'manager' ? 'Sargenteação' : 'Músico'}
                            </span>

                            {/* Status de Senha */}
                            {user.forcePasswordReset ? (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20" title="O usuário será obrigado a cadastrar nova senha pessoal no próximo login">
                                Senha Provisória
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                                Senha Cadastrada
                              </span>
                            )}

                            {/* Situação Funcional Militar */}
                            {user.militaryStatus && user.militaryStatus !== 'Ativo' && (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/20">
                                {user.militaryStatus} {user.statusEndDate ? `até ${fmtDate(user.statusEndDate)}` : ''}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Barra de Ações Rápidas do Master */}
                        <div className="flex items-center justify-between gap-2 pt-1 border-t border-gray-100 dark:border-gray-800">
                          
                          <div className="flex items-center gap-1.5">
                            {/* Alternar Status (Ativar / Desativar Acesso) */}
                            {pending ? (
                              <button
                                onClick={() => handleApprove(user.id, user.name)}
                                className="px-3 py-1.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm shadow-green-600/20 active:scale-95 transition-all"
                              >
                                <span className="material-symbols-outlined text-[16px]">check_circle</span>
                                Aprovar Acesso
                              </button>
                            ) : active ? (
                              <button
                                onClick={() => handleToggleStatus(user)}
                                className="px-3 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 text-xs font-bold flex items-center gap-1.5 border border-red-500/20 active:scale-95 transition-all"
                                title="Bloquear acesso deste usuário ao aplicativo"
                              >
                                <span className="material-symbols-outlined text-[16px]">person_off</span>
                                Inativar Acesso
                              </button>
                            ) : (
                              <button
                                onClick={() => handleToggleStatus(user)}
                                className="px-3 py-1.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm shadow-green-600/20 active:scale-95 transition-all"
                                title="Reativar acesso deste usuário ao aplicativo"
                              >
                                <span className="material-symbols-outlined text-[16px]">check_circle</span>
                                Ativar Acesso
                              </button>
                            )}

                            {/* Exigir Troca de Senha */}
                            <button
                              onClick={() => handleToggleForcePasswordReset(user)}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 ${
                                user.forcePasswordReset
                                  ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20'
                                  : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                              }`}
                              title={user.forcePasswordReset ? "Cancelar exigência de redefinição de senha" : "Exigir nova senha no próximo login"}
                            >
                              <span className="material-symbols-outlined text-[16px]">lock_reset</span>
                              {user.forcePasswordReset ? 'Troca Ativa' : 'Resetar Senha'}
                            </button>
                          </div>

                          <div className="flex items-center gap-1">
                            {/* Editar */}
                            <Link href={`/admin/musicians/${user.id}/edit`}>
                              <button
                                className="size-8 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 hover:text-gray-900 dark:hover:text-white flex items-center justify-center transition-colors"
                                title="Editar dados completos do militar"
                              >
                                <span className="material-symbols-outlined text-[18px]">edit</span>
                              </button>
                            </Link>

                            {/* Excluir Definitivo */}
                            <button
                              onClick={() => handleDelete(user.id, user.name)}
                              className="size-8 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 flex items-center justify-center transition-colors"
                              title="Excluir cadastro definitivamente"
                            >
                              <span className="material-symbols-outlined text-[18px]">delete</span>
                            </button>
                          </div>

                        </div>

                      </div>
                    );
                  })
                )}
              </div>

            </div>
          )}

          {/* ═════════════════════════════════════════════════════════════════ */}
          {/* ABA 2: PENDENTES (FILA DE APROVAÇÃO)                           */}
          {/* ═════════════════════════════════════════════════════════════════ */}
          {activeTab === 'pending' && (
            <div className="flex flex-col gap-4">
              <div className="relative">
                <input 
                  className="w-full rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 pl-4 pr-10 py-3 text-sm outline-none" 
                  placeholder="Pesquisar militares pendentes..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-3">
                {filteredUsers.length === 0 ? (
                  <div className="py-12 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6 flex flex-col items-center justify-center text-center">
                    <span className="material-symbols-outlined text-[48px] text-green-500 mb-2">task_alt</span>
                    <p className="text-sm font-bold text-gray-700 dark:text-gray-300">Nenhum cadastro pendente</p>
                    <p className="text-xs text-gray-500 mt-1">Todos os militares solicitantes foram avaliados.</p>
                  </div>
                ) : (
                  filteredUsers.map((user) => (
                    <div key={user.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-amber-500/20 p-4 flex flex-col gap-3 shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="size-11 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold text-sm">
                          {user.war_name?.substring(0, 2).toUpperCase() || '??'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-bold text-gray-900 dark:text-white truncate">
                            {user.rank} {user.name}
                          </h3>
                          <p className="text-xs text-gray-500 truncate">{user.email}</p>
                        </div>
                        <button 
                          onClick={() => handleApprove(user.id, user.name)} 
                          className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-md shadow-green-600/20 transition-all active:scale-95"
                          title="Aprovar Acesso"
                        >
                          <span className="material-symbols-outlined text-[16px]">check</span>
                          Aprovar
                        </button>
                        <button 
                          onClick={() => handleDelete(user.id, user.name)} 
                          className="p-2 text-gray-400 hover:text-red-500 rounded-lg transition-colors"
                          title="Rejeitar / Excluir"
                        >
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ═════════════════════════════════════════════════════════════════ */}
          {/* ABA 3: EFETIVO GERAL (LISTAGEM COMPLETA)                        */}
          {/* ═════════════════════════════════════════════════════════════════ */}
          {activeTab === 'all' && (
            <div className="flex flex-col gap-4">
              <div className="relative">
                <input 
                  className="w-full rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 pl-4 pr-10 py-3 text-sm outline-none" 
                  placeholder="Pesquisar no efetivo geral..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-3">
                {filteredUsers.map((user) => (
                  <div key={user.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4 flex flex-col gap-3 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="size-11 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center font-bold text-sm text-gray-700 dark:text-gray-300">
                        {user.war_name?.substring(0, 2).toUpperCase() || '??'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-bold text-gray-900 dark:text-white truncate">
                          {user.rank} {user.name}
                        </h3>
                        <p className="text-xs text-gray-500 truncate">{user.email}</p>
                      </div>

                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        isUserActive(user)
                          ? 'bg-green-500/10 text-green-700 dark:text-green-400'
                          : isUserInactive(user)
                          ? 'bg-red-500/10 text-red-700 dark:text-red-400'
                          : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                      }`}>
                        {isUserActive(user) ? 'Ativo' : isUserInactive(user) ? 'Inativo' : 'Pendente'}
                      </span>

                      <button 
                        onClick={() => handleDelete(user.id, user.name)} 
                        className="p-2 text-gray-400 hover:text-red-500 rounded-lg transition-colors"
                        title="Excluir Perfil"
                      >
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ═════════════════════════════════════════════════════════════════ */}
          {/* ABA 4: AUDITORIA DO SISTEMA                                    */}
          {/* ═════════════════════════════════════════════════════════════════ */}
          {activeTab === 'logs' && (
            <div className="flex flex-col gap-3">
              {logs.length === 0 ? (
                <div className="py-12 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6 flex flex-col items-center justify-center text-center">
                  <span className="material-symbols-outlined text-[48px] text-gray-300 dark:text-gray-700 mb-2">history_toggle_off</span>
                  <p className="text-sm font-bold text-gray-700 dark:text-gray-300">Nenhum registro de auditoria</p>
                </div>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4 shadow-sm flex flex-col gap-1">
                    <div className="flex justify-between items-center mb-1">
                      <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${
                        log.action === 'create' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 
                        log.action === 'delete' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 
                        'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                      }`}>
                        {log.action}
                      </span>
                      <span className="text-[10px] text-gray-400">{log.dateObj.toLocaleString('pt-BR')}</span>
                    </div>
                    <p className="text-xs font-bold uppercase text-gray-800 dark:text-gray-200">{log.userName}</p>
                    <p className="text-xs text-blue-600 dark:text-blue-400 font-bold">{log.entityTitle}</p>
                  </div>
                ))
              )}
            </div>
          )}

        </main>
      </div>
    </div>
  );
}
