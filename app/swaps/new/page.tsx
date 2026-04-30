'use client';

import Link from 'next/link';
import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useFirebase } from '@/components/providers/firebase-provider';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, getDocs, addDoc, serverTimestamp, query, where, writeBatch, limit } from 'firebase/firestore';

function NewSwapForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const scaleId = searchParams?.get('scaleId');
  const { user } = useFirebase();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Data
  const [scale, setScale] = useState<any>(null);
  const [musicians, setMusicians] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Selections
  const [selectedReason, setSelectedReason] = useState('familiar');
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [selectedSubstitute, setSelectedSubstitute] = useState<any>(null);

  useEffect(() => {
    if (!user || !scaleId) {
      if (!scaleId) {
        alert('ID da escala não fornecido.');
        router.push('/dashboard');
      }
      return;
    }

    const fetchData = async () => {
      try {
        // 1. Fetch Scale
        const scaleDoc = await getDoc(doc(db, 'scales', scaleId));
        if (scaleDoc.exists()) {
          setScale({ id: scaleDoc.id, ...scaleDoc.data() });
        } else {
          alert('Escala não encontrada.');
          router.push('/dashboard');
          return;
        }

        // 2. Fetch Musicians (Profiles) - Limitados para segurança conforme firestore.rules
        const musiciansRef = collection(db, 'profiles');
        const profilesSnap = await getDocs(query(musiciansRef, limit(40)));
        const profilesData = profilesSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(p => p.id !== user.uid); // Não pode trocar consigo mesmo
        
        setMusicians(profilesData);
      } catch (error) {
        console.error('Erro ao carregar dados:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, scaleId, router]);

  const handleSubmit = async () => {
    if (!user || !scale || !selectedSubstitute) return;
    
    setIsSubmitting(true);
    try {
      const userProfileSnap = await getDoc(doc(db, 'profiles', user.uid));
      const userProfile = userProfileSnap.exists() ? userProfileSnap.data() : {};
      const requesterName = userProfile.war_name || userProfile.name || 'Músico';

      const batch = writeBatch(db);

      // 1. Cria o documento da permuta
      const swapRef = doc(collection(db, 'swaps'));
      batch.set(swapRef, {
        requester_id: user.uid,
        requester_name: requesterName,
        substitute_id: selectedSubstitute.id,
        substitute_name: selectedSubstitute.war_name || selectedSubstitute.name,
        scale_id: scale.id,
        scale_title: scale.title,
        date: scale.date,
        reason: selectedReason === 'outros' ? additionalNotes : selectedReason,
        notes: additionalNotes,
        status: 'Aguardando Parceiro',
        createdAt: serverTimestamp(),
      });

      // 2. Cria notificação para o substituto
      const notifRef = doc(collection(db, 'notifications'));
      batch.set(notifRef, {
        userId: selectedSubstitute.id,
        type: 'swap_request',
        swapId: swapRef.id,
        scaleTitle: scale.title,
        scaleDate: scale.date,
        requesterName,
        message: `${requesterName} solicitou que você o substitua em "${scale.title}"`,
        read: false,
        confirmedAt: null,
        createdAt: serverTimestamp(),
      });

      await batch.commit();
      setStep(4);
    } catch (error) {
      console.error('Erro ao salvar permuta:', error);
      alert('Erro ao enviar solicitação. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredMusicians = musicians.filter(m => {
    const search = searchTerm.toLowerCase();
    return (
      (m.name || '').toLowerCase().includes(search) ||
      (m.war_name || '').toLowerCase().includes(search) ||
      (m.instrument || '').toLowerCase().includes(search)
    );
  });

  if (loading) {
    return (
      <div className="bg-background-light dark:bg-background-dark min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  const reasons = [
    { id: 'saude', label: 'Problemas de Saúde', icon: 'medical_services' },
    { id: 'familiar', label: 'Assunto Familiar', icon: 'family_restroom' },
    { id: 'estudo', label: 'Estudo / Prova', icon: 'school' },
    { id: 'outros', label: 'Outros Motivos', icon: 'more_horiz' }
  ];

  const getReasonLabel = (id: string) => reasons.find(r => r.id === id)?.label || id;

  return (
    <div className="bg-background-light dark:bg-background-dark font-sans min-h-screen flex flex-col items-center">
      <div className="relative w-full max-w-md bg-background-light dark:bg-background-dark flex flex-col h-full min-h-screen shadow-2xl">
        
        {step < 4 && (
          <header className="sticky top-0 z-10 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md px-4 py-3 flex items-center justify-between border-b border-gray-200 dark:border-gray-800">
            <Link href={`/scales/${scaleId}`}>
              <button className="flex items-center justify-center p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors text-gray-900 dark:text-white">
                <span className="material-symbols-outlined">close</span>
              </button>
            </Link>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white flex-1 text-center pr-10">Solicitar Permuta</h1>
          </header>
        )}

        <main className={`flex-1 flex flex-col ${step < 4 ? 'p-6 gap-8' : ''}`}>
          {step < 4 && (
            <div className="flex items-center justify-between px-2">
              <div className="flex flex-col items-center gap-2">
                <div className={`size-10 rounded-full flex items-center justify-center font-bold text-sm transition-colors ${step >= 1 ? 'bg-primary text-white' : 'bg-gray-200 dark:bg-gray-800 text-gray-500'}`}>1</div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Motivo</span>
              </div>
              <div className={`h-0.5 flex-1 mx-2 ${step >= 2 ? 'bg-primary' : 'bg-gray-200 dark:bg-gray-800'}`}></div>
              <div className="flex flex-col items-center gap-2">
                <div className={`size-10 rounded-full flex items-center justify-center font-bold text-sm transition-colors ${step >= 2 ? 'bg-primary text-white' : 'bg-gray-200 dark:bg-gray-800 text-gray-500'}`}>2</div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Substituto</span>
              </div>
              <div className={`h-0.5 flex-1 mx-2 ${step >= 3 ? 'bg-primary' : 'bg-gray-200 dark:bg-gray-800'}`}></div>
              <div className="flex flex-col items-center gap-2">
                <div className={`size-10 rounded-full flex items-center justify-center font-bold text-sm transition-colors ${step >= 3 ? 'bg-primary text-white' : 'bg-gray-200 dark:bg-gray-800 text-gray-500'}`}>3</div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Revisão</span>
              </div>
            </div>
          )}

          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div key="1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col gap-6">
                <div className="flex flex-col gap-2">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">Por que você precisa da permuta?</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">Selecione o motivo principal para a sua ausência nesta escala específica.</p>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {reasons.map((item) => (
                    <label key={item.id} className={`relative flex items-center p-4 rounded-xl border-2 transition-all cursor-pointer ${selectedReason === item.id ? 'border-primary bg-primary/5' : 'border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-primary/30'}`}>
                      <input className="sr-only" name="reason" type="radio" value={item.id} checked={selectedReason === item.id} onChange={() => setSelectedReason(item.id)} />
                      <div className="flex items-center gap-4 w-full">
                        <div className={`size-10 rounded-lg flex items-center justify-center transition-colors ${selectedReason === item.id ? 'bg-primary text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500'}`}>
                          <span className="material-symbols-outlined">{item.icon}</span>
                        </div>
                        <span className="text-base font-semibold text-gray-900 dark:text-white pointer-events-none">{item.label}</span>
                        <span className={`material-symbols-outlined ml-auto text-primary transition-opacity ${selectedReason === item.id ? 'opacity-100' : 'opacity-0'}`}>check_circle</span>
                      </div>
                    </label>
                  ))}
                </div>

                <div className="flex flex-col gap-2">
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Observações Adicionais</p>
                  <textarea 
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none min-h-[120px] transition-all text-gray-900 dark:text-white" 
                    placeholder="Descreva brevemente o motivo..."
                    value={additionalNotes}
                    onChange={(e) => setAdditionalNotes(e.target.value)}
                  ></textarea>
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div key="2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col gap-6">
                <div className="flex flex-col gap-2">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">Quem irá te substituir?</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">O substituto deve ter o mesmo instrumento ou ser compatível com a função.</p>
                </div>

                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                    <span className="material-symbols-outlined">search</span>
                  </div>
                  <input 
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 pl-10 pr-4 py-3 text-sm focus:ring-2 focus:ring-primary outline-none transition-all text-gray-900 dark:text-white" 
                    placeholder="Buscar por nome ou instrumento..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider px-1">Integrantes Disponíveis</p>
                  <div className="flex flex-col gap-2 max-h-[40vh] overflow-y-auto no-scrollbar pr-1">
                    {filteredMusicians.length === 0 ? (
                      <p className="text-center py-10 text-gray-400 text-sm italic">Nenhum integrante encontrado.</p>
                    ) : (
                      filteredMusicians.map((musician) => (
                        <label key={musician.id} className={`relative flex items-center p-3 rounded-xl border-2 transition-all cursor-pointer ${selectedSubstitute?.id === musician.id ? 'border-primary bg-primary/5' : 'border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-primary/30'}`}>
                          <input className="sr-only" name="substitute" type="radio" value={musician.id} checked={selectedSubstitute?.id === musician.id} onChange={() => setSelectedSubstitute(musician)} />
                          <div className="relative">
                            <div 
                              className={`size-10 rounded-full bg-center bg-cover border-2 shadow-sm ${selectedSubstitute?.id === musician.id ? 'border-primary' : 'border-white dark:border-gray-800'}`}
                              style={{ backgroundImage: `url("${musician.photo_url || 'https://picsum.photos/seed/profile/200/200'}")` }}
                            ></div>
                            <div className="absolute bottom-0 right-0 size-3 bg-green-500 border-2 border-white dark:border-gray-900 rounded-full"></div>
                          </div>
                          <div className="ml-3 flex-1">
                            <p className="text-sm font-bold text-gray-900 dark:text-white pointer-events-none">{musician.rank} {musician.war_name || musician.name}</p>
                            <p className="text-xs text-gray-500 pointer-events-none">{musician.instrument}</p>
                          </div>
                          <span className={`material-symbols-outlined ml-3 text-primary transition-opacity ${selectedSubstitute?.id === musician.id ? 'opacity-100' : 'opacity-0'}`}>check_circle</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div key="3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col gap-6">
                <div className="flex flex-col gap-2">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">Confirme sua solicitação</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">Revise os dados antes de enviar para aprovação do parceiro e depois do comando.</p>
                </div>

                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 flex flex-col gap-4 shadow-sm">
                  <div className="flex items-center gap-4 pb-4 border-b border-gray-50 dark:border-gray-800">
                    <div className="size-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                      <span className="material-symbols-outlined">event_busy</span>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 font-medium uppercase">Escala Selecionada</p>
                      <p className="text-base font-bold text-gray-900 dark:text-white">{scale?.title}</p>
                      <p className="text-xs text-primary font-bold">{new Date(scale?.date + 'T12:00:00').toLocaleDateString('pt-BR')}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-gray-500 font-medium">Motivo</span>
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">{getReasonLabel(selectedReason)}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-gray-500 font-medium">Substituto</span>
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">{selectedSubstitute?.rank} {selectedSubstitute?.war_name || selectedSubstitute?.name}</span>
                    </div>
                  </div>

                  <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg border border-amber-100 dark:border-amber-800/50 flex gap-3">
                    <span className="material-symbols-outlined text-amber-600 text-[20px]">info</span>
                    <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                      O substituto receberá uma notificação. Apenas após ele <strong className="font-bold">Aceitar</strong>, a permuta seguirá para aprovação da Gestão.
                    </p>
                  </div>
                </div>
              </motion.div>
            )}

            {step === 4 && (
              <motion.div key="4" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center justify-center min-h-[70vh] p-6 text-center">
                <div className="size-24 bg-green-100 dark:bg-green-900/30 text-green-500 rounded-full flex items-center justify-center mb-6 ring-8 ring-green-50 dark:ring-green-900/10">
                  <span className="material-symbols-outlined text-[48px]">check_circle</span>
                </div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">Solicitação Enviada!</h2>
                <p className="text-gray-500 dark:text-gray-400 leading-relaxed mb-10 max-w-[280px]">
                  Sua proposta de permuta foi enviada para o <strong className="text-gray-700 dark:text-gray-300">{selectedSubstitute?.rank} {selectedSubstitute?.war_name || selectedSubstitute?.name}</strong>.
                </p>

                <div className="w-full flex flex-col gap-3">
                  <button 
                    onClick={() => router.push('/dashboard')}
                    className="w-full h-14 rounded-xl bg-primary text-white font-bold shadow-lg shadow-primary/20 hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                  >
                    Voltar às Minhas Escalas
                    <span className="material-symbols-outlined text-[20px]">list_alt</span>
                  </button>
                  <button 
                    onClick={() => router.push('/notices')}
                    className="w-full h-14 rounded-xl border border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-300 font-bold hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    Ver Quadro de Avisos
                  </button>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </main>

        {step < 4 && (
          <footer className="p-6 bg-white dark:bg-background-dark border-t border-gray-100 dark:border-gray-800 flex gap-3">
            {step > 1 && (
              <button 
                onClick={() => setStep(step - 1)}
                className="flex-1 h-14 rounded-xl border border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-300 font-bold hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors active:scale-95"
              >
                Voltar
              </button>
            )}
            <button 
              disabled={isSubmitting || (step === 2 && !selectedSubstitute)}
              onClick={() => {
                if (step < 3) setStep(step + 1);
                else handleSubmit();
              }}
              className="flex-[2] h-14 rounded-xl bg-primary text-white font-bold shadow-lg shadow-primary/20 hover:bg-blue-700 transition-all active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                 <span className="material-symbols-outlined animate-spin text-[24px]">progress_activity</span>
              ) : (
                <>
                  {step === 3 ? 'Confirmar Envio' : 'Continuar'}
                  <span className="material-symbols-outlined text-[20px]">{step === 3 ? 'send' : 'arrow_forward'}</span>
                </>
              )}
            </button>
          </footer>
        )}

      </div>
    </div>
  );
}

export default function NewSwapPage() {
  return (
    <Suspense fallback={<div className="bg-background-light dark:bg-background-dark min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div></div>}>
      <NewSwapForm />
    </Suspense>
  );
}
