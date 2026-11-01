'use client';

import Link from 'next/link';
import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { collection, addDoc, serverTimestamp, getDocs, query, orderBy, doc, getDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, getStorage } from 'firebase/storage';
import { db, app, auth } from '@/lib/firebase';
import { handleFirestoreError, OperationType } from '@/lib/firestore-errors';
import { sortByRankThenName } from '@/lib/sort-military';
import { 
  buildNoticeWhatsAppMessage, 
  getWhatsAppBroadcastUrl, 
  getWhatsAppDirectUrl, 
  cleanPhoneNumber 
} from '@/lib/whatsapp';

export default function AdminNewNoticePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(-1);

  const [formData, setFormData] = useState({
    title: '',
    type: 'geral',
    message: '',
    requireConfirmation: true
  });

  // Lista de militares para seleção de destinatários WhatsApp
  const [musicians, setMusicians] = useState<any[]>([]);
  const [loadingMusicians, setLoadingMusicians] = useState(true);
  const [searchMusician, setSearchMusician] = useState('');
  const [selectedMusicianIds, setSelectedMusicianIds] = useState<string[]>([]);
  const [targetMode, setTargetMode] = useState<'todos' | 'especificos'>('todos');
  const [showRosterQueue, setShowRosterQueue] = useState(false);
  const [currentAuthor, setCurrentAuthor] = useState('Gestor');

  // Buscar autor e lista do efetivo
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const currentUser = auth.currentUser;
        if (currentUser) {
          const snap = await getDoc(doc(db, 'profiles', currentUser.uid));
          if (snap.exists()) {
            const data = snap.data();
            setCurrentAuthor(`${data.rank || ''} ${data.war_name || data.name || ''}`.trim() || 'Gestor');
          }
        }

        const q = query(collection(db, 'profiles'), orderBy('name', 'asc'));
        const snap = await getDocs(q);
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort(sortByRankThenName);
        setMusicians(docs);
      } catch (err) {
        console.error("Erro ao carregar dados do efetivo para aviso:", err);
      } finally {
        setLoadingMusicians(false);
      }
    };

    fetchInitialData();
  }, []);

  // Mensagem formatada para o WhatsApp em tempo real
  const whatsAppMessage = useMemo(() => {
    return buildNoticeWhatsAppMessage({
      title: formData.title || 'Comunicado Oficial',
      message: formData.message || 'Sem mensagem',
      type: formData.type,
      file: file ? { name: file.name, url: '[Anexo incluído no App]' } : null,
      requireConfirmation: formData.requireConfirmation
    });
  }, [formData, file]);

  const handleSelectAll = () => {
    setSelectedMusicianIds(musicians.map(m => m.id));
  };

  const handleClearSelection = () => {
    setSelectedMusicianIds([]);
  };

  const toggleSelectMusician = (id: string) => {
    setSelectedMusicianIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const filteredMusicians = useMemo(() => {
    if (!searchMusician.trim()) return musicians;
    const s = searchMusician.toLowerCase();
    return musicians.filter(m => 
      (m.war_name || '').toLowerCase().includes(s) ||
      (m.name || '').toLowerCase().includes(s) ||
      (m.rank || '').toLowerCase().includes(s) ||
      (m.instrument || '').toLowerCase().includes(s)
    );
  }, [musicians, searchMusician]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const f = e.target.files[0];
      if (f.size > 5 * 1024 * 1024) {
        alert('O arquivo selecionado é maior que 5MB. Escolha um arquivo menor.');
        return;
      }
      setFile(f);
    }
  };

  const handleSaveAndBroadcast = async (openWhatsAppNow = false) => {
    if (!formData.title.trim() || !formData.message.trim()) {
      alert('Por favor, preencha o título e a mensagem do aviso.');
      return;
    }

    setLoading(true);
    try {
      let fileData = null;
      if (file) {
        setUploadProgress(0);
        const storage = getStorage(app);
        const fileRef = ref(storage, `notices_files/${Date.now()}_${file.name}`);
        const uploadTask = uploadBytesResumable(fileRef, file);
        
        await new Promise((resolve, reject) => {
          uploadTask.on('state_changed', 
            (snapshot) => {
              const prog = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
              setUploadProgress(Math.round(prog));
            }, 
            reject, 
            () => resolve(uploadTask.snapshot.ref)
          );
        });
        const downloadUrl = await getDownloadURL(fileRef);
        fileData = {
          name: file.name,
          size: (file.size / 1024 / 1024).toFixed(2) + ' MB',
          url: downloadUrl
        };
      }

      await addDoc(collection(db, 'notices'), {
        ...formData,
        file: fileData || null,
        createdAt: serverTimestamp(),
        author: currentAuthor,
        targetMode,
        targetMusicianIds: targetMode === 'especificos' ? selectedMusicianIds : []
      });

      if (openWhatsAppNow) {
        const url = getWhatsAppBroadcastUrl(whatsAppMessage);
        window.open(url, '_blank');
      }

      router.push('/notices');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'notices');
    } finally {
      setLoading(false);
      setUploadProgress(-1);
    }
  };

  return (
    <div className="bg-transparent font-sans flex flex-col items-center lg:items-stretch w-full">
      <div className="relative w-full max-w-md lg:max-w-none bg-background-light dark:bg-[#121620]/90 backdrop-blur-xl lg:rounded-3xl lg:border lg:border-white/10 flex flex-col h-full min-h-screen lg:min-h-0 shadow-2xl">
        <header className="sticky top-0 z-10 bg-background-light/95 dark:bg-[#121620]/95 backdrop-blur-md px-4 lg:px-6 py-3.5 flex items-center justify-between border-b border-gray-200 dark:border-white/10 lg:rounded-t-3xl">
          <Link href="/notices">
            <button className="flex items-center justify-center p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors text-gray-900 dark:text-white" title="Voltar para Avisos">
              <span className="material-symbols-outlined">close</span>
            </button>
          </Link>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white flex-1 text-center pr-10">Novo Aviso</h1>
        </header>

        <main className="flex-1 p-4 lg:p-6 flex flex-col lg:grid lg:grid-cols-12 gap-6 pb-28">
          
          {/* Coluna 1: Formulário do Aviso (7 cols desktop) */}
          <div className="lg:col-span-7 flex flex-col gap-5">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Criar Comunicado Oficial</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Publique o aviso no aplicativo e envie diretamente para o WhatsApp do efetivo.
              </p>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 flex flex-col gap-4 shadow-sm">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Título do Aviso *</span>
                <input 
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-3 text-sm focus:ring-2 focus:ring-primary outline-none text-gray-900 dark:text-white" 
                  placeholder="Ex: Instrução de Serviço, Uniforme, etc."
                  value={formData.title}
                  onChange={(e) => setFormData({...formData, title: e.target.value})}
                />
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Tipo de Aviso</span>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex items-center justify-center gap-2 p-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 cursor-pointer has-[:checked]:bg-primary/10 has-[:checked]:border-primary has-[:checked]:text-primary text-gray-500 font-bold text-xs transition-all">
                    <input 
                      className="sr-only" 
                      name="notice-type" 
                      type="radio" 
                      value="geral" 
                      checked={formData.type === 'geral'}
                      onChange={() => setFormData({...formData, type: 'geral'})}
                    />
                    <span className="material-symbols-outlined text-[18px]">info</span>
                    Geral
                  </label>
                  <label className="flex items-center justify-center gap-2 p-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 cursor-pointer has-[:checked]:bg-red-500/10 has-[:checked]:border-red-500 has-[:checked]:text-red-500 text-gray-500 font-bold text-xs transition-all">
                    <input 
                      className="sr-only" 
                      name="notice-type" 
                      type="radio" 
                      value="urgente"
                      checked={formData.type === 'urgente'}
                      onChange={() => setFormData({...formData, type: 'urgente'})}
                    />
                    <span className="material-symbols-outlined text-[18px]">warning</span>
                    Urgente
                  </label>
                </div>
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Mensagem *</span>
                <textarea 
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 text-sm focus:ring-2 focus:ring-primary outline-none min-h-[160px] text-gray-900 dark:text-white" 
                  placeholder="Escreva o conteúdo do comunicado para o efetivo..."
                  value={formData.message}
                  onChange={(e) => setFormData({...formData, message: e.target.value})}
                ></textarea>
              </label>

              {/* Anexos */}
              <div className="flex flex-col gap-2">
                <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Anexo (Opcional)</span>
                <label className="relative border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-xl p-5 flex flex-col items-center justify-center gap-2 bg-gray-50 dark:bg-gray-900/50 hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors cursor-pointer overflow-hidden">
                  <input 
                    type="file" 
                    className="hidden" 
                    onChange={handleFileChange}
                    accept=".pdf,image/jpeg,image/png"
                    disabled={loading}
                  />
                  <span className={`material-symbols-outlined text-[30px] ${file ? 'text-primary' : 'text-gray-400'}`}>
                    {file ? 'task' : 'upload_file'}
                  </span>
                  <p className={`text-xs font-bold text-center ${file ? 'text-primary' : 'text-gray-500'}`}>
                    {file ? file.name : 'Clique para anexar arquivo (PDF, JPG, PNG)'}
                  </p>
                  <p className="text-[10px] text-gray-400">Tamanho máximo: 5MB</p>
                  
                  {uploadProgress >= 0 && (
                    <div className="absolute bottom-0 left-0 w-full h-1.5 bg-gray-200">
                      <div className="bg-primary h-full transition-all duration-300" style={{ width: `${uploadProgress}%` }}></div>
                    </div>
                  )}
                </label>
                {file && !loading && (
                  <button type="button" onClick={() => setFile(null)} className="text-xs font-bold text-red-500 hover:text-red-700 self-end">
                    Remover anexo
                  </button>
                )}
              </div>

              {/* Confirmação */}
              <div className="flex items-center gap-3 p-3.5 bg-primary/5 rounded-xl border border-primary/10">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="sr-only peer" 
                    checked={formData.requireConfirmation}
                    onChange={(e) => setFormData({...formData, requireConfirmation: e.target.checked})}
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary"></div>
                </label>
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-gray-900 dark:text-white">Exigir Confirmação</span>
                  <span className="text-[11px] text-gray-500">O militar deverá clicar em &quot;Ciente&quot; no aplicativo</span>
                </div>
              </div>
            </div>
          </div>

          {/* Coluna 2: Disparo via WhatsApp (5 cols desktop) */}
          <div className="lg:col-span-5 flex flex-col gap-5">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-emerald-500 text-[26px]">chat</span>
                Disparo no WhatsApp
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Escolha enviar para todos ou selecionar destinatários específicos do efetivo.
              </p>
            </div>

            {/* Alternador de Destinatários */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 flex flex-col gap-4 shadow-sm">
              <div className="grid grid-cols-2 gap-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setTargetMode('todos')}
                  className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    targetMode === 'todos' 
                      ? 'bg-white dark:bg-slate-900 text-primary shadow-sm' 
                      : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px]">groups</span>
                  Enviar a Todos
                </button>
                <button
                  type="button"
                  onClick={() => setTargetMode('especificos')}
                  className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    targetMode === 'especificos' 
                      ? 'bg-white dark:bg-slate-900 text-primary shadow-sm' 
                      : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px]">person_search</span>
                  Selecionar Específicos
                </button>
              </div>

              {/* Modo 1: Enviar a Todos */}
              {targetMode === 'todos' && (
                <div className="flex flex-col gap-3">
                  <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 rounded-xl flex items-start gap-3">
                    <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400 text-[22px] shrink-0 mt-0.5">campaign</span>
                    <div className="flex flex-col text-xs text-emerald-900 dark:text-emerald-200">
                      <strong className="font-bold">Disparo Coletivo</strong>
                      <span>Abre o WhatsApp com a mensagem formatada para você enviar ao grupo oficial da Banda ou lista de transmissão com 1 clique.</span>
                    </div>
                  </div>

                  <a
                    href={getWhatsAppBroadcastUrl(whatsAppMessage)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-3.5 px-4 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-white font-extrabold text-sm shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 transition-all active:scale-95 text-center"
                  >
                    <span className="material-symbols-outlined text-[22px]">share</span>
                    <span>Enviar para Todos no WhatsApp</span>
                  </a>

                  {/* Toggle para ver fila individual de todo o efetivo */}
                  <div className="border-t border-gray-100 dark:border-gray-800 pt-3">
                    <button
                      type="button"
                      onClick={() => setShowRosterQueue(!showRosterQueue)}
                      className="text-xs font-bold text-gray-500 dark:text-gray-400 hover:text-primary flex items-center justify-between w-full"
                    >
                      <span>Ver envio individual para cada militar ({musicians.length})</span>
                      <span className={`material-symbols-outlined text-[18px] transition-transform ${showRosterQueue ? 'rotate-180' : ''}`}>
                        expand_more
                      </span>
                    </button>

                    {showRosterQueue && (
                      <div className="mt-3 flex flex-col gap-2 max-h-60 overflow-y-auto pr-1">
                        {musicians.map((m) => {
                          const directUrl = getWhatsAppDirectUrl(m.phone, whatsAppMessage);
                          return (
                            <div key={m.id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-xs">
                              <div className="flex flex-col truncate">
                                <span className="font-bold text-gray-900 dark:text-white truncate">
                                  {m.rank} {m.war_name || m.name}
                                </span>
                                <span className="text-[10px] text-gray-400 truncate">
                                  {m.phone || 'Sem telefone'} • {m.instrument}
                                </span>
                              </div>
                              {directUrl ? (
                                <a
                                  href={directUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-2.5 py-1 bg-[#25D366] text-white text-[11px] font-bold rounded-lg hover:bg-[#20bd5a] transition-all shrink-0 flex items-center gap-1"
                                >
                                  <span>WhatsApp</span>
                                  <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                                </a>
                              ) : (
                                <span className="text-[10px] text-gray-400 italic">Sem WhatsApp</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Modo 2: Selecionar Militares Específicos */}
              {targetMode === 'especificos' && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {selectedMusicianIds.length} selecionado(s)
                    </span>
                    <div className="flex items-center gap-2">
                      <button 
                        type="button" 
                        onClick={handleSelectAll}
                        className="text-xs font-bold text-primary hover:underline"
                      >
                        Marcar Todos
                      </button>
                      <span className="text-gray-300">•</span>
                      <button 
                        type="button" 
                        onClick={handleClearSelection}
                        className="text-xs font-bold text-gray-400 hover:text-red-500"
                      >
                        Limpar
                      </button>
                    </div>
                  </div>

                  <div className="relative">
                    <span className="material-symbols-outlined text-[18px] text-gray-400 absolute left-3 top-2.5">search</span>
                    <input 
                      type="text" 
                      placeholder="Buscar militar por nome ou instrumento..."
                      value={searchMusician}
                      onChange={(e) => setSearchMusician(e.target.value)}
                      className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 pl-9 pr-3 py-2 text-xs focus:ring-2 focus:ring-primary outline-none"
                    />
                  </div>

                  {/* Lista de Seleção do Efetivo */}
                  <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto pr-1">
                    {loadingMusicians ? (
                      <div className="py-8 flex justify-center">
                        <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-primary"></div>
                      </div>
                    ) : filteredMusicians.length === 0 ? (
                      <p className="text-xs text-center text-gray-400 py-6">Nenhum militar encontrado</p>
                    ) : (
                      filteredMusicians.map((m) => {
                        const isSelected = selectedMusicianIds.includes(m.id);
                        const directUrl = getWhatsAppDirectUrl(m.phone, whatsAppMessage);

                        return (
                          <div 
                            key={m.id}
                            className={`flex items-center justify-between gap-2 p-2 rounded-xl border transition-all ${
                              isSelected 
                                ? 'bg-primary/5 border-primary/40 dark:bg-primary/10' 
                                : 'bg-slate-50 dark:bg-slate-800/40 border-slate-100 dark:border-slate-800'
                            }`}
                          >
                            <label className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer">
                              <input 
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelectMusician(m.id)}
                                className="size-4 rounded text-primary focus:ring-primary border-gray-300"
                              />
                              <div className="flex flex-col truncate">
                                <span className="font-bold text-xs text-gray-900 dark:text-white truncate">
                                  {m.rank} {m.war_name || m.name}
                                </span>
                                <span className="text-[10px] text-gray-400 truncate">
                                  {m.phone || 'Sem telefone'} • {m.instrument}
                                </span>
                              </div>
                            </label>

                            {directUrl && (
                              <a
                                href={directUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={`Enviar para ${m.war_name || m.name}`}
                                className="p-1.5 rounded-lg bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366] hover:text-white transition-all shrink-0"
                              >
                                <span className="material-symbols-outlined text-[18px]">chat</span>
                              </a>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Pré-visualização da Mensagem */}
            <div className="bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-gray-100 dark:border-gray-800 p-4 flex flex-col gap-2">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px]">visibility</span>
                Prévia da Mensagem no WhatsApp
              </span>
              <pre className="text-xs font-sans whitespace-pre-wrap text-gray-700 dark:text-gray-300 bg-white dark:bg-slate-950 p-3 rounded-xl border border-gray-200/60 dark:border-gray-800/60 max-h-48 overflow-y-auto leading-relaxed">
                {whatsAppMessage}
              </pre>
            </div>
          </div>
        </main>

        {/* Rodapé com Ações de Publicação e Disparo */}
        <footer className="sticky bottom-0 p-4 lg:p-6 bg-white/95 dark:bg-[#121620]/95 backdrop-blur-md border-t border-gray-100 dark:border-white/10 z-20 lg:rounded-b-3xl">
          <div className="flex flex-col sm:flex-row gap-3">
            <button 
              type="button"
              onClick={() => handleSaveAndBroadcast(false)}
              disabled={loading}
              className="flex-1 h-12 rounded-xl bg-primary hover:bg-blue-700 text-white font-bold text-sm shadow-lg shadow-primary/25 transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
            >
              {loading ? 'Publicando...' : 'Publicar no Aplicativo'}
              <span className="material-symbols-outlined text-[20px]">send</span>
            </button>

            <button 
              type="button"
              onClick={() => handleSaveAndBroadcast(true)}
              disabled={loading}
              className="flex-1 h-12 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold text-sm shadow-lg shadow-emerald-500/25 transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[20px]">chat</span>
              {loading ? 'Publicando...' : 'Publicar e Disparar WhatsApp'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
