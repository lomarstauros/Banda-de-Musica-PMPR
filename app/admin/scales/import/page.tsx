'use client';

import Link from 'next/link';
import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, addDoc, serverTimestamp, getDoc, doc, writeBatch } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { useFirebase } from '@/components/providers/firebase-provider';
import { useRouter } from 'next/navigation';
import { sortByRankThenName } from '@/lib/sort-military';
import { canAccessReports } from '@/lib/permissions';
import {
  extractTextFromPdfBuffer,
  scanScaleMetadata,
  scanMusiciansFromText,
  MatchedMusician,
  ScannedScaleMetadata
} from '@/lib/scale-scanner';

export default function ImportScalePage() {
  const router = useRouter();
  const { user, loading: authLoading } = useFirebase();

  // Efetivo cadastrado
  const [musicians, setMusicians] = useState<any[]>([]);

  // Estados de arquivo e texto
  const [file, setFile] = useState<File | null>(null);
  const [readingFile, setReadingFile] = useState(false);
  const [documentText, setDocumentText] = useState<string>('');
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [attachedDocData, setAttachedDocData] = useState<{ name: string; url: string; size: string; type: string } | null>(null);

  // Estados de escaneamento e processamento
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Metadados extraídos da escala
  const [scaleData, setScaleData] = useState<ScannedScaleMetadata>({
    title: '',
    date: '',
    startTime: '',
    endTime: '',
    departureTime: '',
    location: '',
    uniform: ''
  });

  // Militares encontrados e selecionados
  const [matchedMusicians, setMatchedMusicians] = useState<MatchedMusician[]>([]);

  // Dropdown para adicionar militar manualmente
  const [showAddMusician, setShowAddMusician] = useState(false);
  const [selectedToAddId, setSelectedToAddId] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Verificação de permissões (Apenas gestores/master/comandante/sub/sargenteante/admin)
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }

    const checkPerm = async () => {
      try {
        const snap = await getDoc(doc(db, 'profiles', user.uid));
        const data = snap.data();
        const role = (data?.role || '').toLowerCase();
        const isAdm = role === 'admin' || role === 'master' || role === 'manager' || canAccessReports(data, user.email);
        if (!isAdm) {
          router.push('/dashboard');
        }
      } catch (e) {
        console.error("Erro ao checar permissões:", e);
      }
    };
    checkPerm();
  }, [user, authLoading, router]);

  // Carrega efetivo cadastrado
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'profiles'), (snap) => {
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort(sortByRankThenName);
      setMusicians(list);
    });
    return () => unsub();
  }, []);

  // Processa texto extraído ou colado, preenchendo metadados e localizando militares
  const processTextAndScan = (textToProcess: string, fileName?: string) => {
    if (!textToProcess || !textToProcess.trim()) {
      setErrorMsg('Insira ou cole o texto do documento da escala para realizar a varredura do efetivo.');
      return;
    }

    setScanning(true);
    setErrorMsg(null);

    try {
      // 1. Extrai metadados (Data, Horário, Local, Uniforme, Título)
      const meta = scanScaleMetadata(textToProcess);
      setScaleData(prev => ({
        ...prev,
        title: meta.title || prev.title || (fileName ? fileName.replace(/\.[^/.]+$/, "") : 'Escala de Serviço Externa'),
        date: meta.date || prev.date || new Date().toISOString().split('T')[0],
        startTime: meta.startTime || prev.startTime || '08:00',
        endTime: meta.endTime || prev.endTime || '',
        departureTime: meta.departureTime || prev.departureTime || '',
        location: meta.location || prev.location || 'Local a Definir',
        uniform: meta.uniform || prev.uniform || 'Operacional'
      }));

      // 2. Localiza todos os militares cadastrados no texto e suas funções
      const found = scanMusiciansFromText(textToProcess, musicians);
      setMatchedMusicians(found);
      setScanned(true);

      if (found.length === 0) {
        setErrorMsg('Varredura concluída: Nenhum militar cadastrado no app foi identificado automaticamente no texto. Verifique se os nomes coincidem com o cadastro ou adicione-os manualmente abaixo.');
      } else {
        setErrorMsg(null);
      }
    } catch (err: any) {
      console.error("Erro na varredura:", err);
      setErrorMsg('Erro ao processar o documento: ' + err.message);
    } finally {
      setScanning(false);
    }
  };

  // Manipulador de seleção de arquivo
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setErrorMsg(null);
    setScanned(false);
    setReadingFile(true);

    try {
      let extracted = '';
      if (selected.type === 'application/pdf' || selected.name.toLowerCase().endsWith('.pdf')) {
        const buffer = await selected.arrayBuffer();
        extracted = await extractTextFromPdfBuffer(buffer);
      } else if (selected.type.startsWith('text/') || selected.name.endsWith('.txt') || selected.name.endsWith('.csv')) {
        extracted = await selected.text();
      }

      if (extracted && extracted.trim().length > 10) {
        setDocumentText(extracted);
        // Executa a varredura automática imediatamente com o efetivo
        processTextAndScan(extracted, selected.name);
      } else {
        setDocumentText('');
        setErrorMsg('O PDF parece não conter camada de texto pesquisável (pode ser um documento digitalizado como imagem/foto). Você pode copiar e colar o texto ou relação de militares no campo abaixo.');
      }
    } catch (err: any) {
      console.error('Erro ao ler arquivo:', err);
      setErrorMsg('Não foi possível extrair o texto automaticamente do arquivo. Você pode colar o conteúdo no campo abaixo.');
    } finally {
      setReadingFile(false);
    }
  };

  // Executa a varredura e cruzamento do efetivo a partir do texto do campo
  const handleScanDocument = () => {
    processTextAndScan(documentText, file?.name);
  };

  // Alterna seleção de um militar
  const toggleMusicianSelection = (id: string) => {
    setMatchedMusicians(prev => prev.map(m => m.id === id ? { ...m, selected: !m.selected } : m));
  };

  // Atualiza a função exercida por um militar
  const updateMusicianRole = (id: string, role: string) => {
    setMatchedMusicians(prev => prev.map(m => m.id === id ? { ...m, roleInScale: role } : m));
  };

  // Remove um militar da lista
  const removeMusician = (id: string) => {
    setMatchedMusicians(prev => prev.filter(m => m.id !== id));
  };

  // Adiciona um militar manualmente
  const handleAddManualMusician = () => {
    if (!selectedToAddId) return;
    const found = musicians.find(m => m.id === selectedToAddId);
    if (!found) return;

    if (matchedMusicians.some(m => m.id === found.id)) {
      alert('Este militar já está na lista.');
      return;
    }

    setMatchedMusicians(prev => [
      ...prev,
      {
        id: found.id,
        name: found.name || found.war_name,
        war_name: found.war_name || found.name,
        rank: found.rank || '',
        instrument: found.instrument || 'Banda PMPR',
        photo_url: found.photo_url || '',
        roleInScale: 'Serviço Externo',
        matchedLine: 'Adicionado manualmente pelo gestor',
        selected: true
      }
    ]);

    setSelectedToAddId('');
    setShowAddMusician(false);
  };

  // Publica a escala externa e notifica os integrantes
  const handlePublishExternalScale = async () => {
    if (!scaleData.title.trim()) {
      alert('Preencha o título da escala.');
      return;
    }
    if (!scaleData.date) {
      alert('Preencha a data da escala.');
      return;
    }

    const selectedList = matchedMusicians.filter(m => m.selected);
    if (selectedList.length === 0) {
      alert('Selecione pelo menos um militar para publicar a escala.');
      return;
    }

    setPublishing(true);
    setErrorMsg(null);

    try {
      // 1. Upload do documento anexo para o Firebase Storage se houver arquivo
      let uploadedDoc = attachedDocData;
      if (file && !uploadedDoc) {
        setUploadProgress(10);
        const fileRef = ref(storage, `external_scales/${Date.now()}_${file.name.replace(/\s+/g, '_')}`);
        const uploadTask = uploadBytesResumable(fileRef, file);

        await new Promise((resolve, reject) => {
          uploadTask.on(
            'state_changed',
            (snap) => {
              const p = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
              setUploadProgress(p);
            },
            reject,
            () => resolve(uploadTask.snapshot.ref)
          );
        });

        const downloadUrl = await getDownloadURL(fileRef);
        uploadedDoc = {
          name: file.name,
          url: downloadUrl,
          size: (file.size / 1024 / 1024).toFixed(2) + ' MB',
          type: file.type || 'application/pdf'
        };
        setAttachedDocData(uploadedDoc);
      }

      // 2. Prepara lista de músicos com a função/posto atribuído
      const musiciansPayload = selectedList.map(m => ({
        id: m.id,
        name: m.name,
        war_name: m.war_name,
        rank: m.rank,
        instrument: m.instrument,
        roleInScale: m.roleInScale || 'Serviço Externo',
        function: m.roleInScale || 'Serviço Externo'
      }));

      // 3. Salva a Escala no Firestore
      const scaleDocRef = await addDoc(collection(db, 'scales'), {
        title: scaleData.title,
        date: scaleData.date,
        startTime: scaleData.startTime,
        endTime: scaleData.endTime || '',
        departureTime: scaleData.departureTime || '',
        location: scaleData.location || 'Local a definir',
        uniform: scaleData.uniform || 'Operacional',
        format: 'Escala Externa',
        classification: 'externa',
        status: 'published',
        attachedDocument: uploadedDoc || null,
        documentOriginalText: documentText.slice(0, 5000), // Armazena trecho para histórico
        musicians: musiciansPayload,
        createdAt: serverTimestamp(),
        createdBy: user?.uid || null
      });

      // 4. Cria notificações internas para cada militar convocado com sua respectiva função
      const batch = writeBatch(db);
      const uniqueUids: string[] = [];

      selectedList.forEach(m => {
        uniqueUids.push(m.id);
        const notifRef = doc(collection(db, 'notifications'));
        batch.set(notifRef, {
          userId: m.id,
          scaleId: scaleDocRef.id,
          scaleTitle: `Escala Externa: ${scaleData.title} (${m.roleInScale || 'Serviço'})`,
          scaleDate: scaleData.date,
          userRoleInScale: m.roleInScale || 'Serviço Externo',
          read: false,
          createdAt: serverTimestamp()
        });
      });
      await batch.commit();

      // 5. Dispara Push Notification único para os integrantes
      if (uniqueUids.length > 0) {
        fetch('/api/notifications/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userIds: uniqueUids,
            title: 'Banda de Música PMPR - Nova Escala Externa',
            scaleId: scaleDocRef.id
          })
        }).catch(err => console.warn('Erro ao disparar push:', err));
      }

      setSuccessMsg('Escala externa publicada com sucesso! Os militares convocados foram notificados.');
      setTimeout(() => {
        router.push(`/scales/${scaleDocRef.id}`);
      }, 1500);

    } catch (err: any) {
      console.error("Erro ao publicar escala externa:", err);
      setErrorMsg('Falha ao publicar escala: ' + (err.message || 'Erro desconhecido'));
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="bg-[#0b0e14] text-slate-100 font-sans min-h-screen flex flex-col antialiased selection:bg-blue-500/30">
      
      {/* Header */}
      <header className="bg-[#121620]/95 backdrop-blur-md px-4 sm:px-6 py-4 sticky top-0 z-40 border-b border-white/5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/admin/scales" className="p-2 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-colors">
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </Link>
          <div className="size-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[24px]">document_scanner</span>
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-black text-white tracking-tight">Importar Escala de Documento</h1>
            <p className="text-xs text-gray-400">Varredura inteligente de ordens de serviço e escalas externas</p>
          </div>
        </div>

        <Link href="/admin/scales/new">
          <button className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-gray-300 hover:text-white transition-all">
            <span className="material-symbols-outlined text-[16px]">edit</span>
            <span>Criar Manualmente</span>
          </button>
        </Link>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex flex-col gap-6 w-full max-w-5xl mx-auto px-4 sm:px-6 py-6">

        {/* Alertas */}
        {errorMsg && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex items-start gap-3">
            <span className="material-symbols-outlined text-red-400 text-[22px] shrink-0">error</span>
            <p className="text-xs sm:text-sm text-red-300">{errorMsg}</p>
          </div>
        )}

        {successMsg && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 flex items-start gap-3">
            <span className="material-symbols-outlined text-emerald-400 text-[22px] shrink-0">check_circle</span>
            <p className="text-xs sm:text-sm text-emerald-300 font-bold">{successMsg}</p>
          </div>
        )}

        {/* ETAPA 1: Upload ou Colar Texto do Documento */}
        <section className="bg-[#121620] border border-white/10 rounded-3xl p-5 sm:p-6 shadow-xl flex flex-col gap-5">
          <div className="flex items-center justify-between pb-3 border-b border-white/5">
            <div className="flex items-center gap-2">
              <span className="size-6 rounded-full bg-blue-500/20 text-blue-400 font-black text-xs flex items-center justify-center">1</span>
              <h2 className="text-sm sm:text-base font-bold text-white uppercase tracking-wider">Documento da Escala</h2>
            </div>
            <span className="text-xs text-gray-400 font-medium">PDF, Imagem ou Texto</span>
          </div>

          {/* Área de Seleção de Arquivo */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-white/15 hover:border-blue-500/50 bg-[#161a24]/60 hover:bg-[#161a24] rounded-2xl p-6 sm:p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all group"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.txt,.csv"
              onChange={handleFileChange}
              className="hidden"
            />
            <div className="size-14 rounded-2xl bg-blue-600/10 text-blue-400 border border-blue-500/20 flex items-center justify-center mb-3 group-hover:scale-110 group-hover:bg-blue-600/20 transition-all">
              <span className="material-symbols-outlined text-[32px]">upload_file</span>
            </div>
            {readingFile ? (
              <div className="flex flex-col items-center gap-2 py-2">
                <div className="size-8 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin"></div>
                <span className="text-sm font-bold text-indigo-400">Extraindo texto do documento...</span>
                <span className="text-xs text-gray-500">Decodificando camadas e localizando militares</span>
              </div>
            ) : file ? (
              <div className="flex flex-col items-center gap-1">
                <span className="text-sm font-bold text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-emerald-400 text-[18px]">check_circle</span>
                  {file.name}
                </span>
                <span className="text-xs text-gray-400">{(file.size / 1024 / 1024).toFixed(2)} MB • Clique para trocar</span>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <p className="text-sm font-bold text-gray-200">Clique para selecionar o PDF ou imagem da escala</p>
                <p className="text-xs text-gray-400">Suporta escalas externas em PDF, fotos de boletins ou documentos de texto</p>
              </div>
            )}
          </div>

          {/* Campo de Texto Extraído / Colado */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-blue-400">subject</span>
                Conteúdo / Texto da Escala
              </label>
              <button
                type="button"
                onClick={() => setDocumentText('')}
                className="text-[11px] text-gray-500 hover:text-gray-300 font-semibold"
              >
                Limpar texto
              </button>
            </div>
            <textarea
              rows={8}
              value={documentText}
              onChange={(e) => setDocumentText(e.target.value)}
              placeholder={'Cole ou digite aqui o texto da escala externa, ordem de serviço ou boletim militar...\n\nExemplo:\nORDEM DE SERVIÇO Nº 142/2026 - POLICIAMENTO EXT\nDATA: 15/11/2026\nHORÁRIO: 08:00 às 14:00\nLOCAL: Estádio Couto Pereira\nUNIFORME: 4º RUPM Operacional\n\nEFETIVO:\n- Portão Principal: 3º Sgt Heliomar\n- Sentinela da Guarda: Cb Silva\n- Motorista da Viatura: Sd Santos'}
              className="w-full bg-[#161a24] border border-white/10 rounded-2xl p-4 text-xs font-mono text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors leading-relaxed"
            />
          </div>

          {/* Botão para Realizar a Varredura */}
          <button
            type="button"
            onClick={handleScanDocument}
            disabled={scanning || !documentText.trim()}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 transition-all active:scale-[0.99] disabled:opacity-50"
          >
            {scanning ? (
              <>
                <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
                <span>Varrendo documento e localizando músicos...</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[20px]">search_check</span>
                <span>Realizar Varredura & Localizar Efetivo da Banda</span>
              </>
            )}
          </button>
        </section>

        {/* ETAPA 2: Resultados da Varredura e Ajustes */}
        {scanned && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-6"
          >
            {/* Informações Gerais da Escala */}
            <section className="bg-[#121620] border border-white/10 rounded-3xl p-5 sm:p-6 shadow-xl flex flex-col gap-5">
              <div className="flex items-center justify-between pb-3 border-b border-white/5">
                <div className="flex items-center gap-2">
                  <span className="size-6 rounded-full bg-emerald-500/20 text-emerald-400 font-black text-xs flex items-center justify-center">2</span>
                  <h2 className="text-sm sm:text-base font-bold text-white uppercase tracking-wider">Dados Detectados da Escala</h2>
                </div>
                <span className="text-[11px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                  Escala Externa
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="sm:col-span-2 lg:col-span-3 flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-400">Título / Operação</label>
                  <input
                    type="text"
                    value={scaleData.title}
                    onChange={(e) => setScaleData({ ...scaleData, title: e.target.value })}
                    className="bg-[#161a24] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white font-semibold focus:outline-none focus:border-blue-500"
                    placeholder="Ex: Ordem de Serviço Nº 123 - Reforço Policial"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-400">Data do Serviço</label>
                  <input
                    type="date"
                    value={scaleData.date}
                    onChange={(e) => setScaleData({ ...scaleData, date: e.target.value })}
                    className="bg-[#161a24] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white font-semibold focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-400">Horário de Início</label>
                  <input
                    type="text"
                    value={scaleData.startTime}
                    onChange={(e) => setScaleData({ ...scaleData, startTime: e.target.value })}
                    className="bg-[#161a24] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white font-semibold focus:outline-none focus:border-blue-500"
                    placeholder="Ex: 08:00"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-400">Horário de Término</label>
                  <input
                    type="text"
                    value={scaleData.endTime}
                    onChange={(e) => setScaleData({ ...scaleData, endTime: e.target.value })}
                    className="bg-[#161a24] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white font-semibold focus:outline-none focus:border-blue-500"
                    placeholder="Ex: 14:00"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-400">Apresentação / Saída</label>
                  <input
                    type="text"
                    value={scaleData.departureTime}
                    onChange={(e) => setScaleData({ ...scaleData, departureTime: e.target.value })}
                    className="bg-[#161a24] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white font-semibold focus:outline-none focus:border-blue-500"
                    placeholder="Ex: 07:30"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-400">Local</label>
                  <input
                    type="text"
                    value={scaleData.location}
                    onChange={(e) => setScaleData({ ...scaleData, location: e.target.value })}
                    className="bg-[#161a24] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white font-semibold focus:outline-none focus:border-blue-500"
                    placeholder="Ex: Quartel do Comando Geral"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-400">Uniforme / Traje</label>
                  <input
                    type="text"
                    value={scaleData.uniform}
                    onChange={(e) => setScaleData({ ...scaleData, uniform: e.target.value })}
                    className="bg-[#161a24] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white font-semibold focus:outline-none focus:border-blue-500"
                    placeholder="Ex: 4º RUPM Operacional"
                  />
                </div>
              </div>
            </section>

            {/* Lista do Efetivo Encontrado */}
            <section className="bg-[#121620] border border-white/10 rounded-3xl p-5 sm:p-6 shadow-xl flex flex-col gap-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/5">
                <div className="flex items-center gap-2">
                  <span className="size-6 rounded-full bg-purple-500/20 text-purple-400 font-black text-xs flex items-center justify-center">3</span>
                  <div>
                    <h2 className="text-sm sm:text-base font-bold text-white uppercase tracking-wider">
                      Integrantes da Banda Localizados ({matchedMusicians.filter(m => m.selected).length}/{matchedMusicians.length})
                    </h2>
                    <p className="text-xs text-gray-400">Confirme quem está escalado e a função/posto que deve exercer</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowAddMusician(!showAddMusician)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-400 text-xs font-bold transition-all self-start sm:self-auto"
                >
                  <span className="material-symbols-outlined text-[16px]">person_add</span>
                  <span>Adicionar Integrante</span>
                </button>
              </div>

              {/* Modal / Linha para Adicionar Militar Manualmente */}
              {showAddMusician && (
                <div className="bg-[#161a24] border border-blue-500/30 rounded-2xl p-4 flex flex-col sm:flex-row items-center gap-3">
                  <select
                    value={selectedToAddId}
                    onChange={(e) => setSelectedToAddId(e.target.value)}
                    className="w-full sm:flex-1 bg-[#121620] border border-white/10 rounded-xl px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="">Selecione um militar da Banda PMPR...</option>
                    {musicians.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.rank} {m.war_name || m.name} — {m.instrument || 'Banda PMPR'}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleAddManualMusician}
                    className="w-full sm:w-auto px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md transition-all shrink-0"
                  >
                    Inserir na Escala
                  </button>
                </div>
              )}

              {/* Tabela de Militares Identificados */}
              {matchedMusicians.length === 0 ? (
                <div className="p-8 text-center text-xs text-gray-400 border border-dashed border-white/10 rounded-2xl flex flex-col items-center gap-2">
                  <span className="material-symbols-outlined text-gray-500 text-4xl">group_off</span>
                  <p>Nenhum militar selecionado ainda. Clique em "Adicionar Integrante" acima se desejar incluir militares manualmente.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {matchedMusicians.map((m) => (
                    <div
                      key={m.id}
                      className={`border rounded-2xl p-4 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                        m.selected
                          ? 'bg-[#161a24] border-white/15'
                          : 'bg-[#121620]/60 border-white/5 opacity-50'
                      }`}
                    >
                      {/* Checkbox e Identificação do Militar */}
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <input
                          type="checkbox"
                          checked={m.selected}
                          onChange={() => toggleMusicianSelection(m.id)}
                          className="size-5 rounded border-white/20 text-blue-600 focus:ring-0 cursor-pointer shrink-0"
                        />

                        <div className="relative shrink-0">
                          {m.photo_url ? (
                            <div
                              className="size-11 rounded-xl bg-center bg-cover border border-white/10"
                              style={{ backgroundImage: `url(${m.photo_url})` }}
                            />
                          ) : (
                            <div className="size-11 rounded-xl bg-blue-600/20 text-blue-400 font-bold border border-blue-500/30 flex items-center justify-center text-sm uppercase">
                              {m.war_name?.[0] || '?'}
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col min-w-0">
                          <span className="text-sm font-bold text-white truncate">
                            {m.rank} {m.war_name}
                          </span>
                          <span className="text-[11px] text-gray-400 truncate">
                            {m.instrument}
                          </span>
                          {m.matchedLine && (
                            <span className="text-[10px] text-gray-500 truncate mt-0.5" title={m.matchedLine}>
                              Detectado em: &ldquo;{m.matchedLine}&rdquo;
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Função / Posto Designado (Editável pelo Gestor) */}
                      <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                        <div className="flex flex-col gap-1 w-full sm:w-64">
                          <label className="text-[10px] font-black uppercase tracking-wider text-gray-400 flex items-center gap-1">
                            <span className="material-symbols-outlined text-[13px] text-indigo-400">badge</span>
                            Função / Posto do Militar
                          </label>
                          <input
                            type="text"
                            value={m.roleInScale}
                            onChange={(e) => updateMusicianRole(m.id, e.target.value)}
                            disabled={!m.selected}
                            placeholder="Ex: Sentinela do Portão, Motorista, etc."
                            className="bg-[#121620] border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white font-semibold focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-50"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => removeMusician(m.id)}
                          className="size-9 rounded-xl hover:bg-red-500/20 text-gray-400 hover:text-red-400 flex items-center justify-center transition-colors shrink-0 mt-3 sm:mt-0"
                          title="Remover militar"
                        >
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Documento Original Anexo */}
            {file && (
              <section className="bg-[#121620] border border-white/10 rounded-2xl p-4 flex items-center justify-between gap-3 shadow-md">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="size-10 rounded-xl bg-red-500/10 text-red-400 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[24px]">description</span>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-bold text-white truncate">{file.name}</span>
                    <span className="text-[11px] text-gray-400">
                      O arquivo original será anexado à escala para consulta dos integrantes
                    </span>
                  </div>
                </div>
                {uploadProgress !== null && (
                  <span className="text-xs font-bold text-blue-400 shrink-0">
                    {uploadProgress}%
                  </span>
                )}
              </section>
            )}

            {/* Botão Final de Publicação */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handlePublishExternalScale}
                disabled={publishing || matchedMusicians.filter(m => m.selected).length === 0}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-sm sm:text-base flex items-center justify-center gap-2 shadow-xl shadow-emerald-600/30 transition-all active:scale-[0.99] disabled:opacity-50"
              >
                {publishing ? (
                  <>
                    <span className="material-symbols-outlined animate-spin text-[22px]">progress_activity</span>
                    <span>Publicando escala externa e notificando integrantes...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[22px]">publish</span>
                    <span>Publicar Escala Externa no App ({matchedMusicians.filter(m => m.selected).length} integrantes)</span>
                  </>
                )}
              </button>
            </div>
          </motion.div>
        )}

        <div className="h-6"></div>
      </main>
    </div>
  );
}
