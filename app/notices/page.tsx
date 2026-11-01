'use client';

import Link from 'next/link';
import { useState, useEffect, useMemo } from 'react';
import { BottomNav } from '@/components/ui/bottom-nav';
import { LogoutButton } from '@/components/ui/logout-button';
import { collection, query, orderBy, onSnapshot, getDocs, doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { handleFirestoreError, OperationType } from '@/lib/firestore-errors';
import { sortByRankThenName } from '@/lib/sort-military';
import { 
  buildNoticeWhatsAppMessage, 
  getWhatsAppBroadcastUrl, 
  getWhatsAppDirectUrl 
} from '@/lib/whatsapp';

export default function NoticesPage() {
  const [notices, setNotices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('Todos');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Interactive UI states
  const [expandedTextIds, setExpandedTextIds] = useState<string[]>([]);
  const [downloadingIds, setDownloadingIds] = useState<string[]>([]);
  const [downloadedIds, setDownloadedIds] = useState<string[]>([]);
  const [showUniformDetailsId, setShowUniformDetailsId] = useState<string | null>(null);
  const [swapStatus, setSwapStatus] = useState<'pending' | 'accepted' | 'rejected'>('pending');

  // Papel do usuário logado
  const [userRole, setUserRole] = useState<'user' | 'admin' | 'master'>('user');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Modal de compartilhamento no WhatsApp
  const [whatsAppModalNotice, setWhatsAppModalNotice] = useState<any | null>(null);
  const [musicians, setMusicians] = useState<any[]>([]);
  const [searchModalMusician, setSearchModalMusician] = useState('');

  const toggleExpandText = (id: string) => {
    setExpandedTextIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleDownloadFile = (notice: any) => {
    if (!notice.file || !notice.file.url) return;
    if (downloadingIds.includes(notice.id)) return;
    
    setDownloadingIds(prev => [...prev, notice.id]);
    
    setTimeout(() => {
      window.open(notice.file.url, '_blank');
      setDownloadingIds(prev => prev.filter(x => x !== notice.id));
      setDownloadedIds(prev => [...prev, notice.id]);
    }, 600);
  };

  const toggleUniformDetails = (id: string) => {
    setShowUniformDetailsId(prev => prev === id ? null : id);
  };

  // Confirmar ciência
  const handleConfirmNotice = async (noticeId: string) => {
    if (!currentUserId) return;
    try {
      const noticeRef = doc(db, 'notices', noticeId);
      await updateDoc(noticeRef, {
        confirmedBy: arrayUnion(currentUserId)
      });
    } catch (e) {
      console.error("Erro ao confirmar aviso:", e);
    }
  };

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) return;
      setCurrentUserId(user.uid);

      // Checar papel do usuário
      try {
        const snap = await getDoc(doc(db, 'profiles', user.uid));
        if (snap.exists()) {
          const role = snap.data().role?.toLowerCase();
          if (role === 'master') setUserRole('master');
          else if (role === 'admin' || role === 'manager') setUserRole('admin');
        }
      } catch (e) {
        console.error("Erro ao verificar papel do usuário:", e);
      }

      // Buscar avisos
      const q = query(collection(db, 'notices'), orderBy('createdAt', 'desc'));
      const unsubscribeNotices = onSnapshot(q, (snapshot) => {
        const docs = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            filterCategory: data.type === 'urgente' ? 'Urgente' : 'Geral',
            time: data.createdAt?.toDate?.()?.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) || 'Recente'
          };
        });
        setNotices(docs);
        setLoading(false);
      }, (error) => {
        console.error("Erro no listener do mural:", error);
        handleFirestoreError(error, OperationType.LIST, 'notices');
        setLoading(false);
      });

      // Carregar lista de militares para o modal de WhatsApp
      try {
        const qMusicians = query(collection(db, 'profiles'), orderBy('name', 'asc'));
        const snapM = await getDocs(qMusicians);
        const docsM = snapM.docs.map(d => ({ id: d.id, ...d.data() })).sort(sortByRankThenName);
        setMusicians(docsM);
      } catch (err) {
        console.error("Erro ao carregar efetivo:", err);
      }

      return () => unsubscribeNotices();
    });

    return () => unsubscribeAuth();
  }, []);

  const isManager = userRole === 'admin' || userRole === 'master';

  // Mensagem do aviso selecionado para WhatsApp
  const selectedWhatsAppMsg = useMemo(() => {
    if (!whatsAppModalNotice) return '';
    return buildNoticeWhatsAppMessage({
      title: whatsAppModalNotice.title || 'Aviso',
      message: whatsAppModalNotice.message || whatsAppModalNotice.content || '',
      type: whatsAppModalNotice.type,
      file: whatsAppModalNotice.file,
      requireConfirmation: whatsAppModalNotice.requireConfirmation
    });
  }, [whatsAppModalNotice]);

  const filteredModalMusicians = useMemo(() => {
    if (!searchModalMusician.trim()) return musicians;
    const s = searchModalMusician.toLowerCase();
    return musicians.filter(m => 
      (m.war_name || '').toLowerCase().includes(s) ||
      (m.name || '').toLowerCase().includes(s) ||
      (m.rank || '').toLowerCase().includes(s) ||
      (m.instrument || '').toLowerCase().includes(s)
    );
  }, [musicians, searchModalMusician]);

  // Filtro de avisos
  const filteredNotices = notices.filter(notice => {
    const matchesTab = activeTab === 'Todos' || notice.filterCategory === activeTab;
    const matchesSearch = (notice.title || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (notice.message || notice.content || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTab && matchesSearch;
  });

  return (
    <div className="bg-transparent font-sans text-slate-900 dark:text-white antialiased transition-colors duration-200 w-full">
      <div className="relative flex min-h-screen lg:min-h-0 w-full flex-col max-w-md lg:max-w-none mx-auto overflow-x-hidden pb-24 lg:pb-8 bg-background-light dark:bg-[#121620]/90 backdrop-blur-xl lg:rounded-3xl lg:border lg:border-white/10 shadow-2xl">
        
        {/* Header com botão de Criar Aviso para o Gestor */}
        <header className="sticky top-0 z-20 flex items-center justify-between bg-background-light/95 dark:bg-[#121620]/95 backdrop-blur-md p-4 lg:px-6 py-3.5 transition-colors lg:rounded-t-3xl border-b border-gray-100 dark:border-white/10">
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Avisos</h1>
            {isManager && (
              <span className="text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                Gestão
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isManager && (
              <Link href="/admin/notices/new">
                <button 
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-primary/25 transition-all active:scale-95"
                  title="Criar novo aviso e enviar via WhatsApp"
                >
                  <span className="material-symbols-outlined text-[18px]">add</span>
                  <span className="hidden sm:inline">Criar Aviso</span>
                </button>
              </Link>
            )}
            <LogoutButton />
          </div>
        </header>

        {/* Barra de Busca */}
        <div className="px-4 py-2">
          <div className="group flex w-full items-center rounded-2xl bg-white dark:bg-surface-dark px-3 py-3 shadow-sm ring-1 ring-black/5 dark:ring-white/10 focus-within:ring-2 focus-within:ring-primary transition-all">
            <span className="material-symbols-outlined text-slate-400 mr-2 text-[24px]">search</span>
            <input 
              className="flex-1 bg-transparent border-none p-0 text-base text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-0" 
              placeholder="Buscar avisos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="flex items-center justify-center p-1 rounded-full text-slate-400 hover:text-slate-700 bg-slate-100 dark:bg-slate-800 ml-1">
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            )}
          </div>
        </div>

        {/* Filtros por Categoria */}
        <div className="flex gap-2 px-4 py-2 overflow-x-auto no-scrollbar">
          {['Todos', 'Geral', 'Urgente'].map((tab) => (
            <button 
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex h-9 shrink-0 items-center justify-center rounded-full px-5 text-sm font-medium transition-transform active:scale-95 ${
                activeTab === tab 
                  ? 'bg-primary text-white shadow-sm shadow-primary/30 font-semibold' 
                  : 'bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Lista de Avisos */}
        <main className="flex flex-col gap-4 p-4">
          {loading ? (
            <div className="flex justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
            </div>
          ) : filteredNotices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 opacity-50 text-center">
               <span className="material-symbols-outlined text-5xl mb-3 text-gray-400">campaign</span>
               <p className="text-sm font-medium">Nenhum comunicado encontrado</p>
               {isManager && (
                 <Link href="/admin/notices/new" className="mt-4">
                   <button className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold shadow-md hover:bg-blue-700 transition-all">
                     Criar primeiro aviso
                   </button>
                 </Link>
               )}
            </div>
          ) : (
            filteredNotices.map((notice) => {
              const isUrgente = notice.type === 'urgente' || notice.filterCategory === 'Urgente';
              const isExpanded = expandedTextIds.includes(notice.id);
              const messageText = notice.message || notice.content || '';
              const hasConfirmed = currentUserId && (notice.confirmedBy || []).includes(currentUserId);

              return (
                <article 
                  key={notice.id} 
                  className={`relative flex flex-col gap-3 rounded-2xl bg-white dark:bg-surface-dark p-5 shadow-sm ring-1 ring-black/5 dark:ring-white/5 transition-all border-l-4 ${
                    isUrgente ? 'border-l-red-500' : 'border-l-blue-500'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold ${
                        isUrgente 
                          ? 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400 border border-red-200 dark:border-red-800' 
                          : 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800'
                      }`}>
                        <span className="material-symbols-outlined text-[14px]">
                          {isUrgente ? 'warning' : 'info'}
                        </span>
                        {isUrgente ? 'URGENTE' : 'GERAL'}
                      </span>
                      {notice.author && (
                        <span className="text-[11px] text-gray-400">
                          por <strong>{notice.author}</strong>
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-medium text-slate-400 shrink-0">{notice.time}</span>
                  </div>
                  
                  <div>
                    <h3 className="text-lg font-bold leading-snug text-slate-900 dark:text-white mb-1.5">
                      {notice.title}
                    </h3>
                    <p className={`text-sm leading-relaxed text-slate-600 dark:text-slate-300 whitespace-pre-line ${isExpanded ? '' : 'line-clamp-3'}`}>
                      {messageText}
                    </p>
                    {messageText.length > 180 && (
                      <button 
                        onClick={() => toggleExpandText(notice.id)}
                        className="text-xs font-bold text-primary hover:underline mt-1 block"
                      >
                        {isExpanded ? 'Ver menos' : 'Ler mensagem completa'}
                      </button>
                    )}
                  </div>

                  {/* Anexo de Arquivo */}
                  {notice.file && notice.file.url && (
                    <div 
                      onClick={() => handleDownloadFile(notice)}
                      className={`group flex items-center gap-3 rounded-xl p-3 ring-1 transition-all cursor-pointer select-none active:scale-95 ${
                        downloadedIds.includes(notice.id) 
                          ? 'bg-green-50 dark:bg-green-900/10 ring-green-200 dark:ring-green-900/50' 
                          : 'bg-slate-50 dark:bg-[#151e2c] ring-slate-200 dark:ring-slate-700/50 hover:bg-slate-100 dark:hover:bg-[#1a2436]'
                      }`}
                    >
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${downloadedIds.includes(notice.id) ? 'bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'}`}>
                        <span className="material-symbols-outlined">{downloadedIds.includes(notice.id) ? 'check' : 'picture_as_pdf'}</span>
                      </div>
                      <div className="flex flex-1 flex-col overflow-hidden">
                        <span className="truncate text-sm font-semibold text-slate-900 dark:text-white">{notice.file.name}</span>
                        <span className="text-xs text-slate-500">{downloadedIds.includes(notice.id) ? 'Download completo' : notice.file.size}</span>
                      </div>
                      {downloadingIds.includes(notice.id) ? (
                        <span className="material-symbols-outlined text-primary animate-spin">progress_activity</span>
                      ) : (
                        <span className={`material-symbols-outlined transition-colors ${downloadedIds.includes(notice.id) ? 'text-green-500' : 'text-slate-400 group-hover:text-primary'}`}>
                          {downloadedIds.includes(notice.id) ? 'done_all' : 'download'}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Barra de Ações: Ciência e Envio no WhatsApp */}
                  <div className="flex items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-800 pt-3 mt-1 flex-wrap">
                    <div className="flex items-center gap-2">
                      {notice.requireConfirmation && (
                        hasConfirmed ? (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-2.5 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800">
                            <span className="material-symbols-outlined text-[16px]">check_circle</span>
                            Ciente
                          </span>
                        ) : (
                          <button
                            onClick={() => handleConfirmNotice(notice.id)}
                            className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:bg-primary/10 border border-primary/30 px-2.5 py-1 rounded-lg transition-all active:scale-95"
                          >
                            <span className="material-symbols-outlined text-[16px]">check</span>
                            Dar Ciência
                          </button>
                        )
                      )}
                    </div>

                    {/* Botão Gestor: Disparar no WhatsApp */}
                    {isManager && (
                      <button
                        type="button"
                        onClick={() => setWhatsAppModalNotice(notice)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366] hover:text-white transition-all text-xs font-extrabold border border-[#25D366]/30 active:scale-95 ml-auto"
                        title="Enviar este comunicado via WhatsApp"
                      >
                        <span className="material-symbols-outlined text-[16px]">chat</span>
                        <span>Disparar no WhatsApp</span>
                      </button>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </main>
        
        {/* Modal de Disparo no WhatsApp */}
        {whatsAppModalNotice && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
              
              {/* Modal Header */}
              <div className="p-4 sm:p-5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="size-9 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                    <span className="material-symbols-outlined text-[20px]">chat</span>
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-gray-900 dark:text-white leading-tight">Enviar no WhatsApp</h3>
                    <p className="text-[11px] text-gray-400 truncate max-w-[240px] sm:max-w-xs">{whatsAppModalNotice.title}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setWhatsAppModalNotice(null)}
                  className="size-8 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center text-gray-400"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-4 sm:p-5 flex flex-col gap-4 overflow-y-auto">
                {/* Botão Enviar a Todos */}
                <div className="flex flex-col gap-2 p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40">
                  <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-bold text-xs">
                    <span className="material-symbols-outlined text-[18px]">campaign</span>
                    <span>Disparo Coletivo (Grupo ou Todos)</span>
                  </div>
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-300/80 leading-relaxed">
                    Abre o WhatsApp com o comunicado formatado pronto para envio no grupo oficial da Banda ou lista de transmissão.
                  </p>
                  <a
                    href={getWhatsAppBroadcastUrl(selectedWhatsAppMsg)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-2.5 px-4 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-white font-extrabold text-xs shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2 transition-all active:scale-95 text-center mt-1"
                  >
                    <span className="material-symbols-outlined text-[18px]">share</span>
                    <span>Enviar para Todos no WhatsApp</span>
                  </a>
                </div>

                {/* Envio Individual por Militar */}
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                      Enviar para Militar Específico
                    </span>
                    <span className="text-[11px] text-gray-400">{musicians.length} integrantes</span>
                  </div>

                  <div className="relative">
                    <span className="material-symbols-outlined text-[18px] text-gray-400 absolute left-3 top-2.5">search</span>
                    <input 
                      type="text" 
                      placeholder="Buscar por nome, posto ou instrumento..."
                      value={searchModalMusician}
                      onChange={(e) => setSearchModalMusician(e.target.value)}
                      className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-slate-50 dark:bg-slate-800 pl-9 pr-3 py-2 text-xs focus:ring-2 focus:ring-primary outline-none text-gray-900 dark:text-white"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto pr-1">
                    {filteredModalMusicians.map((m) => {
                      const directUrl = getWhatsAppDirectUrl(m.phone, selectedWhatsAppMsg);
                      return (
                        <div 
                          key={m.id}
                          className="flex items-center justify-between gap-2 p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-xs"
                        >
                          <div className="flex flex-col truncate">
                            <span className="font-bold text-gray-900 dark:text-white truncate">
                              {m.rank} {m.war_name || m.name}
                            </span>
                            <span className="text-[10px] text-gray-400 truncate">
                              {m.phone || 'Sem telefone cadastrado'} • {m.instrument}
                            </span>
                          </div>

                          {directUrl ? (
                            <a
                              href={directUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2.5 py-1.5 bg-[#25D366] hover:bg-[#20bd5a] text-white text-[11px] font-bold rounded-lg transition-all shrink-0 flex items-center gap-1 shadow-sm active:scale-95"
                            >
                              <span>Conversar</span>
                              <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                            </a>
                          ) : (
                            <span className="text-[10px] text-gray-400 italic">Sem número</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Prévia do Texto */}
                <div className="flex flex-col gap-1.5 bg-slate-100 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700/50">
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Texto Formatado</span>
                  <pre className="text-[11px] whitespace-pre-wrap font-sans text-gray-700 dark:text-gray-300 max-h-28 overflow-y-auto leading-relaxed">
                    {selectedWhatsAppMsg}
                  </pre>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-3 sm:p-4 border-t border-gray-100 dark:border-gray-800 flex justify-end">
                <button
                  type="button"
                  onClick={() => setWhatsAppModalNotice(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}

        <BottomNav />
      </div>
    </div>
  );
}
