'use client';

import { useState, useEffect } from 'react';
import { BottomNav } from '@/components/ui/bottom-nav';
import { LogoutButton } from '@/components/ui/logout-button';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { handleFirestoreError, OperationType } from '@/lib/firestore-errors';



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

  useEffect(() => {
    // Only start listener if authenticated to avoid permission errors
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (!user) return;

      const q = query(collection(db, 'notices'), orderBy('createdAt', 'desc'));
      const unsubscribeNotices = onSnapshot(q, (snapshot) => {
        const docs = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            filterCategory: data.type === 'urgente' ? 'Urgente' : 'Geral',
            time: data.createdAt?.toDate().toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) || 'Recent'
          };
        });
        setNotices(docs);
        setLoading(false);
      }, (error) => {
        console.error("Erro no listener do mural:", error);
        handleFirestoreError(error, OperationType.LIST, 'notices');
        setLoading(false);
      });

      return () => unsubscribeNotices();
    });

    return () => unsubscribeAuth();
  }, []);

  // Filter the list dynamically
  const filteredNotices = notices.filter(notice => {
    const matchesTab = activeTab === 'Todos' || notice.filterCategory === activeTab;
    const matchesSearch = notice.title?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          notice.message?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTab && matchesSearch;
  });

  // Render logic continues below
  return (
    <div className="bg-background-light dark:bg-background-dark font-sans text-slate-900 dark:text-white antialiased transition-colors duration-200">
      <div className="relative flex min-h-screen w-full flex-col max-w-md mx-auto overflow-x-hidden pb-24 bg-background-light dark:bg-background-dark shadow-2xl">
        
        {/* Header Fixed Area */}
        <header className="sticky top-0 z-20 flex items-center justify-between bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md p-4 pb-2 transition-colors">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Avisos</h1>
          <div className="flex items-center gap-2">
            <button className="relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-white dark:bg-surface-dark text-slate-600 dark:text-slate-300 shadow-sm ring-1 ring-black/5 dark:ring-white/10 active:scale-95 transition-all">
              <span className="material-symbols-outlined text-[24px]">filter_list</span>
              <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white dark:ring-surface-dark"></span>
            </button>
            <LogoutButton />
          </div>
        </header>

        {/* Search Bar Input Binding */}
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

        {/* Dynamic Category Tabs */}
        <div className="flex gap-2 px-4 py-2 overflow-x-auto no-scrollbar">
          {['Todos', 'Permuta', 'Geral', 'Pessoal', 'Urgente'].map((tab) => (
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

        <main className="flex flex-col gap-4 p-4">
          
          {filteredNotices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 opacity-50">
               <span className="material-symbols-outlined text-5xl mb-3">search_off</span>
               <p className="text-sm font-medium">Nenhum aviso encontrado</p>
            </div>
          ) : (
            filteredNotices.map((notice) => {
              
              // Swap Request Layout
              if (notice.isSwapRequest) {
                return (
                  <article key={notice.id} className="relative flex flex-col gap-3 rounded-2xl bg-white dark:bg-surface-dark p-5 shadow-sm ring-1 ring-black/5 dark:ring-white/5 transition-all border-l-[6px] border-l-amber-500 overflow-hidden">
                    <div className="flex items-start justify-between">
                      <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 dark:bg-amber-900/20 px-2 py-1 text-xs font-bold text-amber-600 dark:text-amber-400 ring-1 ring-inset ring-amber-600/20">
                        <span className="material-symbols-outlined text-[14px]">swap_horiz</span>
                        PERMUTA
                      </span>
                      <span className="text-xs font-medium text-slate-400">{notice.time}</span>
                    </div>

                    <div className="mt-1">
                      <h3 className="text-lg font-bold leading-snug text-slate-900 dark:text-white mb-2">{notice.title}</h3>
                      <div className="bg-slate-50 dark:bg-[#151e2c] p-3 rounded-xl border border-slate-100 dark:border-slate-800 flex items-start gap-4 mb-4">
                        <div className="size-10 rounded-full overflow-hidden flex-shrink-0 ring-2 ring-white dark:ring-slate-800">
                          <img src={notice.avatar} alt="Avatar" className="w-full h-full object-cover" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">{notice.author}</p>
                          <p className="text-xs text-slate-500 whitespace-pre-line">{notice.message}</p>
                        </div>
                      </div>

                      {swapStatus === 'pending' ? (
                        <div className="flex gap-3 mt-2">
                          <button 
                            onClick={() => setSwapStatus('rejected')}
                            className="flex-1 h-11 rounded-xl border-2 border-red-100 dark:border-red-900/30 text-red-600 dark:text-red-400 font-bold hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
                          >
                            Recusar
                          </button>
                          <button 
                            onClick={() => setSwapStatus('accepted')}
                            className="flex-1 h-11 rounded-xl bg-primary text-white font-bold shadow-lg shadow-primary/20 hover:bg-blue-700 transition-colors"
                          >
                            Aceitar Troca
                          </button>
                        </div>
                      ) : (
                        <div className={`flex items-center gap-2 p-3 rounded-xl ${swapStatus === 'accepted' ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'}`}>
                          <span className="material-symbols-outlined">{swapStatus === 'accepted' ? 'check_circle' : 'cancel'}</span>
                          <span className="text-sm font-bold">
                            {swapStatus === 'accepted' ? 'Você aceitou esta permuta. Aguardando comando.' : 'Você recusou esta solicitação.'}
                          </span>
                        </div>
                      )}
                    </div>
                  </article>
                );
              }

              // Standard Notice Layout 
              if (notice.tags && notice.tags.length > 0) {
                const isExpanded = expandedTextIds.includes(notice.id);
                return (
                  <article key={notice.id} className={`relative flex flex-col gap-3 rounded-2xl bg-white dark:bg-surface-dark p-5 shadow-sm ring-1 ring-black/5 dark:ring-white/5 transition-all active:scale-[0.99] ${notice.borderClasses || ''}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex flex-wrap gap-2">
                        {notice.tags?.map((tag: any, idx: number) => (
                          <span key={idx} className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-bold ring-1 ring-inset ${tag.classes}`}>
                            {tag.text}
                          </span>
                        ))}
                      </div>
                      <span className="text-xs font-medium text-slate-400">{notice.time}</span>
                    </div>
                    
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-bold leading-snug text-slate-900 dark:text-white">{notice.title}</h3>
                        {notice.hasPulseAction && <span className="h-2 w-2 rounded-full bg-primary animate-pulse"></span>}
                      </div>

                      <p className={`text-sm leading-relaxed text-slate-500 dark:text-slate-400 transition-all duration-300 ${isExpanded ? '' : 'line-clamp-2'}`}>
                        {notice.message}
                      </p>
                    </div>

                    {/* Has Attachment File */}
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

                    {/* Sender Expansion Bar */}
                    {notice.sender && (
                      <div className="mt-1 flex items-center justify-between border-t border-slate-100 dark:border-slate-700/50 pt-3">
                        <div className="flex -space-x-2 overflow-hidden">
                          {notice.avatar && (
                            <img alt="Avatar remetente" className="inline-block h-6 w-6 rounded-full ring-2 ring-white dark:ring-surface-dark grayscale" src={notice.avatar} />
                          )}
                          <span className="ml-2 pl-6 text-xs text-slate-500 dark:text-slate-500 self-center">{notice.sender}</span>
                        </div>
                        
                        <button 
                          onClick={() => toggleExpandText(notice.id)}
                          className="flex items-center gap-1 text-sm font-semibold text-primary hover:text-blue-700 transition-colors"
                        >
                          {isExpanded ? 'Recolher' : 'Ler tudo'} 
                          <span className={`material-symbols-outlined text-[18px] transition-transform duration-300 ${isExpanded ? '-rotate-90' : 'rotate-0'}`}>
                            {isExpanded ? 'expand_more' : 'arrow_forward'}
                          </span>
                        </button>
                      </div>
                    )}
                  </article>
                );
              }

              // Image Background Layout
              if (notice.image) {
                const showDetails = showUniformDetailsId === notice.id;
                return (
                  <article key={notice.id} className="overflow-hidden rounded-2xl bg-white dark:bg-surface-dark shadow-sm ring-1 ring-black/5 dark:ring-white/5 transition-all">
                    <div 
                      className="flex h-32 w-full bg-cover bg-center" 
                      style={{ backgroundImage: `url('${notice.image}')` }}
                    >
                      <div className="flex h-full w-full items-start justify-between bg-gradient-to-b from-black/60 to-transparent p-4">
                        {notice.badgeOverlay && (
                          <span className="inline-flex items-center rounded-md bg-white/20 backdrop-blur-md px-2 py-1 text-xs font-medium text-white ring-1 ring-white/30">
                            {notice.badgeOverlay}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <h3 className="text-lg font-bold leading-snug text-slate-900 dark:text-white">{notice.title}</h3>
                        <span className="text-xs font-medium text-slate-400">{notice.time}</span>
                      </div>
                      
                      <div className={`transition-all duration-300 overflow-hidden ${showDetails ? 'max-h-96 opacity-100 mb-4' : 'max-h-0 opacity-0 mb-0'}`}>
                         <div className="p-3 bg-slate-50 dark:bg-[#1a2436] rounded-xl border border-slate-100 dark:border-slate-800 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                           {notice.content}
                         </div>
                      </div>

                      {notice.actionBtn && (
                        <button 
                          onClick={() => toggleUniformDetails(notice.id)}
                          className={`w-full rounded-xl py-2.5 text-sm font-semibold transition-all ${
                            showDetails 
                              ? 'bg-primary text-white shadow-md shadow-primary/30 active:scale-95' 
                              : 'bg-slate-50 dark:bg-[#151e2c] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1a2436]'
                          }`}
                        >
                          {showDetails ? 'Ocultar detalhes' : notice.actionBtn}
                        </button>
                      )}
                    </div>
                  </article>
                );
              }

              return null;
            })
          )}
        </main>
        
        <BottomNav />
      </div>
    </div>
  );
}
