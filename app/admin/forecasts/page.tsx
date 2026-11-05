'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect } from 'react';
import { useFirebase } from '@/components/providers/firebase-provider';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  getDoc, 
  serverTimestamp,
  where 
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { LogoutButton } from '@/components/ui/logout-button';
import { fmtDate } from '@/lib/format-date';
import { generateForecastsPDF, viewForecastsPDF } from '@/lib/pdf-generator';
import { buildForecastsWhatsAppMessage, getWhatsAppBroadcastUrl } from '@/lib/whatsapp';

const FORMATIONS = [
  'Banda Completa',
  'Big Band',
  'Banda Show',
  'Sessão A',
  'Sessão B',
  'Quarteto de Sax',
  'Outros'
];

const FORMATS = [
  'Formatura Militar',
  'Apresentação local aberto',
  'Apresentação local fechado',
  'Ensaio',
  'Outros'
];

const UNIFORMS = [
  'Especial A1-A / A1-B',
  '4º RUPM (Túnica Cinza)',
  '5º RUPM (Camisa Manga Curta)',
  'Civil / Passeio Completo',
  'Outros'
];

export default function AdminForecastsPage() {
  const router = useRouter();
  const { user } = useFirebase();
  const [profile, setProfile] = useState<{ war_name?: string; rank?: string; photo_url?: string; role?: string; name?: string } | null>(null);
  const [forecasts, setForecasts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form states
  const [date, setDate] = useState('');
  const [title, setTitle] = useState('');
  const [protocolNumber, setProtocolNumber] = useState('');
  const [location, setLocation] = useState('');
  const [formation, setFormation] = useState(FORMATIONS[0]);
  const [customFormation, setCustomFormation] = useState('');
  const [format, setFormat] = useState(FORMATS[0]);
  const [customFormat, setCustomFormat] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [departureTime, setDepartureTime] = useState('');
  const [uniform, setUniform] = useState(UNIFORMS[0]);
  const [customUniform, setCustomUniform] = useState('');
  const [notes, setNotes] = useState('');

  // Tab filter (Futuras x Passadas)
  const [filterTab, setFilterTab] = useState<'future' | 'past'>('future');

  // Estados para Ações de Exportação e Comunicação
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [showNoticeModal, setShowNoticeModal] = useState(false);
  const [noticePublishing, setNoticePublishing] = useState(false);
  const [noticeSuccess, setNoticeSuccess] = useState(false);
  const [copiedWhatsApp, setCopiedWhatsApp] = useState(false);

  useEffect(() => {
    if (!user) return;
    const fetchProfile = async () => {
      try {
        const docRef = doc(db, 'profiles', user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          const role = data.role?.toLowerCase();
          const isAllowed = role === 'admin' || role === 'master' || role === 'manager' || user.email === 'heliomardejesus87@gmail.com';
          if (!isAllowed) {
            router.replace('/admin/scales');
            return;
          }
          setProfile(data as any);
        } else {
          router.replace('/admin/scales');
          return;
        }
      } catch (e) {
        console.error("Erro ao carregar perfil do gestor:", e);
      }
    };
    fetchProfile();

    // Buscar escalas marcadas como previsão
    const q = query(
      collection(db, 'scales'), 
      where('isForecast', '==', true),
      orderBy('date', 'asc')
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setForecasts(docs);
      setLoading(false);
    }, (error) => {
      console.error("Erro ao carregar previsões de serviço:", error);
      // Fallback sem index composto caso necessário
      const qFallback = query(collection(db, 'scales'), orderBy('date', 'asc'));
      const unsubFallback = onSnapshot(qFallback, (snap) => {
        const docs = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter((d: any) => d.isForecast === true);
        setForecasts(docs);
        setLoading(false);
      });
      return () => unsubFallback();
    });

    return () => unsub();
  }, [user]);

  const resetForm = () => {
    setEditingId(null);
    setDate('');
    setTitle('');
    setProtocolNumber('');
    setLocation('');
    setFormation(FORMATIONS[0]);
    setCustomFormation('');
    setFormat(FORMATS[0]);
    setCustomFormat('');
    setStartTime('');
    setEndTime('');
    setDepartureTime('');
    setUniform(UNIFORMS[0]);
    setCustomUniform('');
    setNotes('');
  };

  const handleEdit = (f: any) => {
    setEditingId(f.id);
    setDate(f.date || '');
    setTitle(f.title || '');
    setProtocolNumber(f.protocolNumber || '');
    setLocation(f.location || '');
    if (FORMATIONS.includes(f.musicalFormation)) {
      setFormation(f.musicalFormation);
      setCustomFormation('');
    } else {
      setFormation('Outros');
      setCustomFormation(f.musicalFormation || '');
    }

    if (FORMATS.includes(f.format)) {
      setFormat(f.format);
      setCustomFormat('');
    } else {
      setFormat('Outros');
      setCustomFormat(f.format || '');
    }

    setStartTime(f.startTime || '');
    setEndTime(f.endTime || '');
    setDepartureTime(f.departureTime || '');

    if (UNIFORMS.includes(f.uniform)) {
      setUniform(f.uniform);
      setCustomUniform('');
    } else {
      setUniform('Outros');
      setCustomUniform(f.uniform || '');
    }

    setNotes(f.notes || '');

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !title) {
      alert('Por favor, informe ao menos a Data e o Título do evento.');
      return;
    }

    setSaving(true);
    try {
      const selectedFormation = formation === 'Outros' ? customFormation : formation;
      const selectedFormat = format === 'Outros' ? customFormat : format;
      const selectedUniform = uniform === 'Outros' ? customUniform : uniform;

      const payload = {
        isForecast: true,
        status: 'forecast',
        date,
        title: title.trim(),
        protocolNumber: protocolNumber.trim(),
        location: location.trim(),
        musicalFormation: selectedFormation.trim(),
        format: selectedFormat.trim(),
        uniform: selectedUniform.trim(),
        startTime,
        endTime,
        departureTime,
        notes: notes.trim(),
        musicians: [], // Previsão inicial não tem lista individual de músicos fechada
        updatedAt: serverTimestamp(),
      };

      if (editingId) {
        await updateDoc(doc(db, 'scales', editingId), payload);
        alert('Previsão de serviço atualizada com sucesso!');
      } else {
        await addDoc(collection(db, 'scales'), {
          ...payload,
          createdAt: serverTimestamp(),
          createdBy: user?.uid || null,
        });
        alert('Previsão de serviço cadastrada! Já está visível na aba Escalas para todo o efetivo.');
      }

      resetForm();
    } catch (err) {
      console.error('Erro ao salvar previsão:', err);
      alert('Erro ao salvar a previsão. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, itemTitle: string) => {
    if (!confirm(`Deseja realmente excluir a previsão "${itemTitle}"?`)) return;
    try {
      await deleteDoc(doc(db, 'scales', id));
    } catch (err) {
      console.error('Erro ao excluir previsão:', err);
      alert('Erro ao excluir a previsão.');
    }
  };

  const todayStr = (new Date()).toISOString().split('T')[0];
  const futureForecasts = forecasts.filter(f => f.date >= todayStr);
  const pastForecasts = forecasts.filter(f => f.date < todayStr).reverse();
  const displayedForecasts = filterTab === 'future' ? futureForecasts : pastForecasts;

  const handleGeneratePDF = async (action: 'download' | 'view') => {
    const targetForecasts = displayedForecasts.length > 0 ? displayedForecasts : futureForecasts;
    if (targetForecasts.length === 0) {
      alert('Não há previsões de serviços cadastradas para gerar o PDF.');
      return;
    }
    setPdfGenerating(true);
    try {
      const signerName = profile ? `${profile.rank || ''} ${profile.war_name || profile.name || ''}`.trim() : 'Comando da Banda de Música';
      const signerRole = 'Sargenteação / Maestro Chefe da Banda de Música da PMPR';
      await generateForecastsPDF(targetForecasts, { action, signerName, signerRole });
    } finally {
      setPdfGenerating(false);
    }
  };

  const currentWhatsAppMessage = buildForecastsWhatsAppMessage(displayedForecasts.length > 0 ? displayedForecasts : futureForecasts);

  const handleCopyWhatsApp = () => {
    navigator.clipboard.writeText(currentWhatsAppMessage);
    setCopiedWhatsApp(true);
    setTimeout(() => setCopiedWhatsApp(false), 2000);
  };

  const handleSendWhatsApp = () => {
    const url = getWhatsAppBroadcastUrl(currentWhatsAppMessage);
    window.open(url, '_blank');
  };

  const handlePublishNotice = async () => {
    const targetForecasts = displayedForecasts.length > 0 ? displayedForecasts : futureForecasts;
    if (targetForecasts.length === 0) {
      alert('Não há previsões para publicar como aviso.');
      return;
    }
    setNoticePublishing(true);
    try {
      const authorName = profile ? `${profile.rank || ''} ${profile.war_name || profile.name || 'Sargenteante'}`.trim() : 'Sargenteação da Banda PMPR';
      const noticeTitle = `Previsão de Serviços da Banda de Música (${targetForecasts.length} serviço${targetForecasts.length > 1 ? 's' : ''} previsto${targetForecasts.length > 1 ? 's' : ''})`;
      
      let noticeBody = `Quadro atualizado com as previsões de serviços e solenidades da Banda de Música da PMPR:\n\n`;
      targetForecasts.forEach((f, idx) => {
        let dateFormatted = f.date;
        if (f.date && f.date.includes('-')) {
          const parts = f.date.split('-');
          if (parts.length === 3) dateFormatted = `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
        noticeBody += `📌 ${idx + 1}. ${(f.title || 'Previsão de Serviço').toUpperCase()}\n`;
        noticeBody += `• Data: ${dateFormatted}\n`;
        if (f.startTime) noticeBody += `• Horário: ${f.startTime}${f.endTime ? ` às ${f.endTime}` : ''}${f.departureTime ? ` (Saída BM: ${f.departureTime})` : ''}\n`;
        if (f.location) noticeBody += `• Local: ${f.location}\n`;
        noticeBody += `• Formação Musical: ${f.musicalFormation || f.formation || 'Banda Completa'}\n`;
        if (f.protocolNumber) noticeBody += `• Número de Protocolo: ${f.protocolNumber}\n`;
        if (f.uniform) noticeBody += `• Fardamento: ${f.uniform}\n`;
        if (f.notes) noticeBody += `• Observações: ${f.notes}\n`;
        noticeBody += `\n`;
      });
      noticeBody += `⚠️ Atenção: As previsões acima possuem caráter de planejamento e estão sujeitas a confirmação na publicação da escala definitiva.`;

      await addDoc(collection(db, 'notices'), {
        title: noticeTitle,
        type: 'escala',
        message: noticeBody,
        author: authorName,
        createdAt: serverTimestamp(),
        requireConfirmation: false,
        targetMode: 'todos',
        targetMusicianIds: [],
        file: null
      });

      setNoticeSuccess(true);
      setTimeout(() => {
        setNoticeSuccess(false);
        setShowNoticeModal(false);
      }, 2000);
    } catch (err) {
      console.error('Erro ao publicar aviso:', err);
      alert('Erro ao publicar o aviso no mural. Tente novamente.');
    } finally {
      setNoticePublishing(false);
    }
  };

  const displayName = profile ? `${profile.rank || ''} ${profile.war_name || ''}`.trim() || 'Gestor' : 'Carregando...';
  const displayPhoto = profile?.photo_url || null;

  return (
    <div className="bg-transparent font-sans flex flex-col items-center lg:items-stretch w-full">
      <div className="relative w-full max-w-md lg:max-w-none bg-background-light dark:bg-[#121620]/90 backdrop-blur-xl lg:rounded-3xl lg:border lg:border-white/10 flex flex-col h-full min-h-screen lg:min-h-0 shadow-2xl overflow-x-hidden">
        
        {/* Header Gestor */}
        <header className="sticky top-0 z-20 bg-background-light/95 dark:bg-[#121620]/95 backdrop-blur-md px-4 lg:px-6 py-3.5 flex items-center justify-between border-b border-gray-200 dark:border-white/10 lg:rounded-t-3xl">
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
            <LogoutButton />
          </div>
        </header>

        {/* Quick nav Gestor - Somente as 3 abas oficiais do Painel Gestor */}
        <div className="px-4 lg:px-6 py-4 flex gap-2 overflow-x-auto no-scrollbar bg-white dark:bg-gray-900/60 border-b border-gray-100 dark:border-white/10">
          <Link href="/admin/scales/new">
            <button className="flex h-9 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 px-5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-200 transition-colors">
              Nova Escala
            </button>
          </Link>
          <button className="flex h-9 shrink-0 items-center justify-center rounded-full bg-primary px-5 text-sm font-bold text-white shadow-lg shadow-primary/20">
            Previsão de Serviço
          </button>
          <Link href="/admin/swaps">
            <button className="flex h-9 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 px-5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-200 transition-colors">
              Permuta
            </button>
          </Link>
        </div>

        <main className="flex-1 p-4 lg:p-6 flex flex-col gap-6 pb-24">
          
          {/* Card de Cadastro / Edição da Previsão */}
          <section className="bg-white dark:bg-gray-900 rounded-3xl border border-amber-500/20 shadow-md p-5 lg:p-6 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-400 via-orange-500 to-amber-600" />
            
            <div className="flex flex-col gap-1 mb-5">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-500 text-[24px]">calendar_clock</span>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                  {editingId ? 'Editar Previsão de Serviço' : 'Cadastrar Previsão de Serviço'}
                </h2>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                Cadastre informações prévias de compromissos futuros. Essas previsões ficam destacadas na aba Escalas de todo o efetivo para planejamento, sem gerar a escala final.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                
                {/* Data */}
                <div>
                  <label className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider block mb-1">
                    Data Prevista *
                  </label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full h-11 px-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/60 text-sm font-semibold text-gray-900 dark:text-white focus:ring-2 focus:ring-primary/20 outline-none"
                  />
                </div>

                {/* Título / Evento */}
                <div className="md:col-span-2">
                  <label className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider block mb-1">
                    Evento / Compromisso *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Solenidade de Passagem de Comando, Concerto no Guaíra..."
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full h-11 px-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/60 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary/20 outline-none"
                  />
                </div>

                {/* Local do Evento */}
                <div className="md:col-span-2">
                  <label className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider block mb-1">
                    Local do Evento
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Pátio do QCG - Curitiba / PR"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="w-full h-11 px-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/60 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary/20 outline-none"
                  />
                </div>

                {/* Número do Protocolo */}
                <div>
                  <label className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider block mb-1">
                    Número do Protocolo
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: 21.456.789-0 ou SID"
                    value={protocolNumber}
                    onChange={(e) => setProtocolNumber(e.target.value)}
                    className="w-full h-11 px-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/60 text-sm font-medium text-gray-900 dark:text-white focus:ring-2 focus:ring-primary/20 outline-none"
                  />
                </div>

                {/* Tipo de Formação Musical */}
                <div>
                  <label className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider block mb-1">
                    Formação Musical
                  </label>
                  <select
                    value={formation}
                    onChange={(e) => setFormation(e.target.value)}
                    className="w-full h-11 px-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/60 text-sm font-medium text-gray-900 dark:text-white focus:ring-2 focus:ring-primary/20 outline-none"
                  >
                    {FORMATIONS.map(f => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>

                {/* Formação customizada */}
                {formation === 'Outros' && (
                  <div>
                    <label className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider block mb-1">
                      Especifique a Formação
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Septeto, Trio de Metais, etc."
                      value={customFormation}
                      onChange={(e) => setCustomFormation(e.target.value)}
                      className="w-full h-11 px-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/60 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                  </div>
                )}

                {/* Formato */}
                <div>
                  <label className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider block mb-1">
                    Tipo de Apresentação
                  </label>
                  <select
                    value={format}
                    onChange={(e) => setFormat(e.target.value)}
                    className="w-full h-11 px-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/60 text-sm font-medium text-gray-900 dark:text-white focus:ring-2 focus:ring-primary/20 outline-none"
                  >
                    {FORMATS.map(f => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>

                {/* Formato customizado */}
                {format === 'Outros' && (
                  <div>
                    <label className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider block mb-1">
                      Especifique o Tipo
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Workshop, Gravação, etc."
                      value={customFormat}
                      onChange={(e) => setCustomFormat(e.target.value)}
                      className="w-full h-11 px-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/60 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                  </div>
                )}

                {/* Horários */}
                <div>
                  <label className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider block mb-1">
                    Início
                  </label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full h-11 px-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/60 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary/20 outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider block mb-1">
                    Término
                  </label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full h-11 px-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/60 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary/20 outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider block mb-1">
                    Saída da BM (Opcional)
                  </label>
                  <input
                    type="time"
                    value={departureTime}
                    onChange={(e) => setDepartureTime(e.target.value)}
                    className="w-full h-11 px-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/60 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary/20 outline-none"
                  />
                </div>

                {/* Uniforme */}
                <div>
                  <label className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider block mb-1">
                    Uniforme Previsto
                  </label>
                  <select
                    value={uniform}
                    onChange={(e) => setUniform(e.target.value)}
                    className="w-full h-11 px-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/60 text-sm font-medium text-gray-900 dark:text-white focus:ring-2 focus:ring-primary/20 outline-none"
                  >
                    {UNIFORMS.map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>

                {uniform === 'Outros' && (
                  <div>
                    <label className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider block mb-1">
                      Descreva o Uniforme
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Agasalho de Educação Física..."
                      value={customUniform}
                      onChange={(e) => setCustomUniform(e.target.value)}
                      className="w-full h-11 px-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/60 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                  </div>
                )}
              </div>

              {/* Observações */}
              <div>
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider block mb-1">
                  Observações / Instruções Preliminares
                </label>
                <textarea
                  rows={2}
                  placeholder="Informações adicionais sobre repertório, transporte, solicitações de autoridades ou necessidade de instrumentos..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/60 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary/20 outline-none resize-none"
                />
              </div>

              {/* Botões do formulário */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                {editingId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-4 h-11 rounded-xl border border-gray-300 dark:border-gray-700 text-sm font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  >
                    Cancelar Edição
                  </button>
                )}
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 h-11 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold text-sm shadow-lg shadow-amber-500/20 hover:brightness-105 transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  {saving ? (
                    <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                  ) : (
                    <span className="material-symbols-outlined text-[18px]">
                      {editingId ? 'check_circle' : 'add_task'}
                    </span>
                  )}
                  {editingId ? 'Salvar Alterações' : 'Publicar Previsão de Serviço'}
                </button>
              </div>
            </form>
          </section>

          {/* Barra de Ações: PDF em Tabela, WhatsApp e Avisos no App */}
          <div className="bg-gradient-to-r from-amber-500/10 via-blue-600/10 to-amber-500/10 border border-amber-500/20 dark:border-amber-500/30 rounded-3xl p-4 lg:p-5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="size-11 rounded-2xl bg-amber-500/20 text-amber-500 dark:text-amber-400 flex items-center justify-center shrink-0 shadow-inner">
                <span className="material-symbols-outlined text-[24px]">send_time_extension</span>
              </div>
              <div>
                <h4 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  Relatório & Comunicação das Previsões
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400">
                    Sargenteação
                  </span>
                </h4>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Gere o PDF em tabela com o quadro de previsões ou envie comunicados por WhatsApp e pelo Mural do App.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Botão Baixar PDF */}
              <button
                onClick={() => handleGeneratePDF('download')}
                disabled={pdfGenerating || displayedForecasts.length === 0}
                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-md shadow-red-600/20 transition-all active:scale-95 disabled:opacity-50"
                title="Baixar PDF com as previsões em tabela com data, título, horário, formação e protocolo"
              >
                <span className="material-symbols-outlined text-[18px]">
                  {pdfGenerating ? 'progress_activity' : 'picture_as_pdf'}
                </span>
                <span>Baixar PDF</span>
              </button>

              {/* Botão Visualizar PDF */}
              <button
                onClick={() => handleGeneratePDF('view')}
                disabled={pdfGenerating || displayedForecasts.length === 0}
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs font-bold transition-all active:scale-95 disabled:opacity-50"
                title="Visualizar PDF em nova aba"
              >
                <span className="material-symbols-outlined text-[18px]">visibility</span>
                <span>Visualizar</span>
              </button>

              {/* Botão WhatsApp */}
              <button
                onClick={() => setShowWhatsAppModal(true)}
                disabled={displayedForecasts.length === 0}
                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-[#25D366] hover:bg-[#20ba5a] text-white text-xs font-bold shadow-md shadow-[#25D366]/20 transition-all active:scale-95 disabled:opacity-50"
                title="Compartilhar lista de previsões via WhatsApp"
              >
                <span className="material-symbols-outlined text-[18px]">chat</span>
                <span>WhatsApp</span>
              </button>

              {/* Botão Publicar em Avisos no App */}
              <button
                onClick={() => setShowNoticeModal(true)}
                disabled={displayedForecasts.length === 0}
                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-primary hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-primary/20 transition-all active:scale-95 disabled:opacity-50"
                title="Publicar estas previsões no mural de avisos do aplicativo"
              >
                <span className="material-symbols-outlined text-[18px]">campaign</span>
                <span>Avisos no App</span>
              </button>
            </div>
          </div>

          {/* Listagem de Previsões */}
          <section className="flex flex-col gap-4">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-gray-900 dark:text-white">
                  Previsões Cadastradas
                </h3>
                <span className="text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">
                  {forecasts.length} total
                </span>
              </div>

              {/* Toggle Futuras / Passadas */}
              <div className="flex items-center bg-gray-100 dark:bg-gray-800 p-1 rounded-xl text-xs font-bold">
                <button
                  onClick={() => setFilterTab('future')}
                  className={`px-3 py-1 rounded-lg transition-all ${filterTab === 'future' ? 'bg-white dark:bg-gray-700 text-amber-600 dark:text-amber-400 shadow-sm' : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'}`}
                >
                  Futuras ({futureForecasts.length})
                </button>
                <button
                  onClick={() => setFilterTab('past')}
                  className={`px-3 py-1 rounded-lg transition-all ${filterTab === 'past' ? 'bg-white dark:bg-gray-700 text-amber-600 dark:text-amber-400 shadow-sm' : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'}`}
                >
                  Anteriores ({pastForecasts.length})
                </button>
              </div>
            </div>

            {loading ? (
              <div className="py-12 flex justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500" />
              </div>
            ) : displayedForecasts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400 text-center bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-6">
                <span className="material-symbols-outlined text-[48px] text-amber-500/40 mb-2">event_available</span>
                <p className="text-sm font-bold text-gray-700 dark:text-gray-300">Nenhuma previsão de serviço {filterTab === 'future' ? 'futura' : 'anterior'}.</p>
                <p className="text-xs text-gray-500 mt-1 max-w-sm">Use o formulário acima para registrar eventos previstos e avisar o efetivo.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {displayedForecasts.map((f) => (
                  <motion.div
                    key={f.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white dark:bg-gray-900 rounded-3xl border-2 border-amber-400/40 dark:border-amber-500/30 p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between gap-4 relative overflow-hidden"
                  >
                    <div className="flex flex-col gap-3">
                      
                      {/* Top Header do Card */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500 text-white shadow-sm">
                          <span className="material-symbols-outlined text-[13px]">calendar_clock</span>
                          Previsão de Serviço
                        </span>

                        <span className="text-xs font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2.5 py-1 rounded-full border border-amber-200 dark:border-amber-800/40">
                          {fmtDate(f.date)}
                        </span>
                      </div>

                      {/* Título & Formação */}
                      <div>
                        <h4 className="text-base font-bold text-gray-900 dark:text-white leading-snug">
                          {f.title}
                        </h4>
                        {f.musicalFormation && (
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <span className="material-symbols-outlined text-amber-500 text-[16px]">music_note</span>
                            <span className="text-xs font-bold text-primary dark:text-blue-400 bg-primary/10 px-2.5 py-0.5 rounded-lg">
                              {f.musicalFormation}
                            </span>
                            {f.format && (
                              <span className="text-[11px] text-gray-500 dark:text-gray-400">
                                • {f.format}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Informações de Local e Horário */}
                      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-3 flex flex-col gap-1.5 text-xs text-gray-600 dark:text-gray-300">
                        {f.location && (
                          <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-amber-500 text-[18px] shrink-0">location_on</span>
                            <span className="truncate font-medium">{f.location}</span>
                          </div>
                        )}

                        {f.protocolNumber && (
                          <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-amber-500 text-[18px] shrink-0">tag</span>
                            <span className="font-semibold text-gray-900 dark:text-white">
                              Protocolo: <span className="font-mono text-primary dark:text-blue-400 font-bold">{f.protocolNumber}</span>
                            </span>
                          </div>
                        )}

                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-amber-500 text-[18px] shrink-0">schedule</span>
                          <span className="font-semibold text-gray-900 dark:text-white">
                            {f.startTime || '--:--'} às {f.endTime || '--:--'}
                            {f.departureTime && <span className="text-gray-500 font-normal ml-1.5">(Saída BM: {f.departureTime})</span>}
                          </span>
                        </div>

                        {f.uniform && (
                          <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-amber-500 text-[18px] shrink-0">checkroom</span>
                            <span className="font-medium">Uniforme: {f.uniform}</span>
                          </div>
                        )}
                      </div>

                      {/* Observações */}
                      {f.notes && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 italic line-clamp-2 px-1">
                          "{f.notes}"
                        </p>
                      )}
                    </div>

                    {/* Barra de Ações do Card */}
                    <div className="pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleEdit(f)}
                          className="size-9 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"
                          title="Editar previsão"
                        >
                          <span className="material-symbols-outlined text-[18px]">edit</span>
                        </button>
                        <button
                          onClick={() => handleDelete(f.id, f.title)}
                          className="size-9 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors"
                          title="Excluir previsão"
                        >
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      </div>

                      {/* Botão Principal: Gerar Escala a partir desta previsão */}
                      <Link href={`/admin/scales/new?forecastId=${f.id}`}>
                        <button 
                          className="flex items-center gap-1.5 px-4 h-9 rounded-xl bg-primary text-white text-xs font-bold shadow-md shadow-primary/20 hover:bg-blue-700 transition-all active:scale-95"
                          title="Aproveitar as informações desta previsão para gerar a escala oficial de serviço com os músicos"
                        >
                          <span className="material-symbols-outlined text-[16px]">post_add</span>
                          Gerar Escala
                        </button>
                      </Link>
                    </div>

                  </motion.div>
                ))}
              </div>
            )}
          </section>

          {/* Modal Compartilhar WhatsApp */}
          <AnimatePresence>
            {showWhatsAppModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-white dark:bg-[#1a202c] border border-gray-200 dark:border-white/10 rounded-3xl p-5 w-full max-w-lg shadow-2xl flex flex-col gap-4"
                >
                  <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
                    <div className="flex items-center gap-2 text-[#25D366]">
                      <span className="material-symbols-outlined text-[24px]">chat</span>
                      <h3 className="font-bold text-gray-900 dark:text-white text-sm">
                        Compartilhar Previsões no WhatsApp
                      </h3>
                    </div>
                    <button
                      onClick={() => setShowWhatsAppModal(false)}
                      className="size-8 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-white"
                    >
                      <span className="material-symbols-outlined text-[18px]">close</span>
                    </button>
                  </div>

                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Confira a mensagem formatada que será enviada para o grupo do WhatsApp da Banda PMPR:
                  </p>

                  <div className="bg-gray-50 dark:bg-black/30 border border-gray-200 dark:border-white/5 rounded-2xl p-3 max-h-60 overflow-y-auto font-mono text-[11px] whitespace-pre-wrap text-gray-700 dark:text-gray-300 leading-relaxed">
                    {currentWhatsAppMessage}
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      onClick={handleCopyWhatsApp}
                      className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs font-bold flex items-center gap-1.5 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        {copiedWhatsApp ? 'check' : 'content_copy'}
                      </span>
                      {copiedWhatsApp ? 'Copiado!' : 'Copiar Texto'}
                    </button>

                    <button
                      onClick={handleSendWhatsApp}
                      className="px-5 py-2 rounded-xl bg-[#25D366] hover:bg-[#20ba5a] text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-[#25D366]/20 transition-all active:scale-95"
                    >
                      <span className="material-symbols-outlined text-[16px]">send</span>
                      Abrir no WhatsApp
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {/* Modal Publicar em Avisos no App */}
          <AnimatePresence>
            {showNoticeModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-white dark:bg-[#1a202c] border border-gray-200 dark:border-white/10 rounded-3xl p-5 w-full max-w-lg shadow-2xl flex flex-col gap-4"
                >
                  <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
                    <div className="flex items-center gap-2 text-primary">
                      <span className="material-symbols-outlined text-[24px]">campaign</span>
                      <h3 className="font-bold text-gray-900 dark:text-white text-sm">
                        Publicar Previsões no Mural de Avisos
                      </h3>
                    </div>
                    <button
                      onClick={() => !noticePublishing && setShowNoticeModal(false)}
                      className="size-8 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-white"
                    >
                      <span className="material-symbols-outlined text-[18px]">close</span>
                    </button>
                  </div>

                  {noticeSuccess ? (
                    <div className="py-8 flex flex-col items-center justify-center text-center gap-2">
                      <div className="size-12 rounded-full bg-green-500/20 text-green-500 flex items-center justify-center mb-1">
                        <span className="material-symbols-outlined text-[28px]">check_circle</span>
                      </div>
                      <h4 className="font-bold text-sm text-gray-900 dark:text-white">Aviso Publicado com Sucesso!</h4>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Os músicos já podem visualizar o quadro de previsões no Mural de Avisos do aplicativo.
                      </p>
                    </div>
                  ) : (
                    <>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Esta ação irá publicar um comunicado no Mural de Avisos do App informando a todos os músicos sobre o quadro atualizado com as <strong className="text-gray-700 dark:text-gray-200">{displayedForecasts.length} previsões de serviços</strong>.
                      </p>

                      <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-2xl p-3 flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-300">
                        <span className="material-symbols-outlined text-[18px] text-amber-500 shrink-0 mt-0.5">info</span>
                        <div>
                          <strong>Nota de Planejamento:</strong>
                          <p className="text-[11px] opacity-90 mt-0.5">
                            O aviso incluirá as datas, títulos, horários, formações musicais e números de protocolos para conhecimento prévio do efetivo.
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-2">
                        <button
                          type="button"
                          disabled={noticePublishing}
                          onClick={() => setShowNoticeModal(false)}
                          className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs font-bold transition-colors disabled:opacity-50"
                        >
                          Cancelar
                        </button>

                        <button
                          type="button"
                          disabled={noticePublishing}
                          onClick={handlePublishNotice}
                          className="px-5 py-2 rounded-xl bg-primary hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-primary/20 transition-all active:scale-95 disabled:opacity-50"
                        >
                          {noticePublishing ? (
                            <>
                              <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
                              Publicando...
                            </>
                          ) : (
                            <>
                              <span className="material-symbols-outlined text-[16px]">publish</span>
                              Publicar no Mural Agora
                            </>
                          )}
                        </button>
                      </div>
                    </>
                  )}
                </motion.div>
              </div>
            )}
          </AnimatePresence>

        </main>
      </div>
    </div>
  );
}

