'use client';

import Link from 'next/link';
import { motion, AnimatePresence } from 'motion/react';
import { useParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import { doc, onSnapshot, collection, query, where, getDocs, updateDoc, serverTimestamp, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useFirebase } from '@/components/providers/firebase-provider';
import { handleFirestoreError, OperationType } from '@/lib/firestore-errors';
import { generateScalePDF } from '@/lib/pdf-generator';
import { getFormatColors } from '@/lib/scale-formats';
import { fmtDate } from '@/lib/format-date';

export default function ScaleDetailsPage() {
  const params = useParams();
  const { user } = useFirebase();
  const [scale, setScale] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [confirmedTime, setConfirmedTime] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>('');

  // Repertório
  const [repertoire, setRepertoire] = useState('');
  const [savingRepertoire, setSavingRepertoire] = useState(false);
  const [repertoireSaved, setRepertoireSaved] = useState(false);

  useEffect(() => {
    if (!params.id) return;
    const unsubscribe = onSnapshot(doc(db, 'scales', params.id as string), (docSnap) => {
      if (docSnap.exists()) {
        const data = { id: docSnap.id, ...docSnap.data() } as any;
        setScale(data);
        setRepertoire(data.repertoire || '');
      }
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `scales/${params.id}`);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [params.id]);

  // Carrega o papel do usuário logado
  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, 'profiles', user.uid)).then(snap => {
      if (snap.exists()) setUserRole(snap.data().role || '');
    });
  }, [user]);

  // Confirmação Automática de Visualização / Ciência ao abrir a escala
  useEffect(() => {
    if (!user || !params.id || !scale) return;

    let isMounted = true;
    const autoConfirmView = async () => {
      try {
        const q = query(
          collection(db, 'notifications'),
          where('userId', '==', user.uid),
          where('scaleId', '==', params.id as string)
        );
        const snap = await getDocs(q);

        if (!snap.empty) {
          const docItem = snap.docs[0];
          const data = docItem.data();

          if (!data.read) {
            await updateDoc(doc(db, 'notifications', docItem.id), {
              read: true,
              confirmedAt: serverTimestamp(),
              viewedAt: serverTimestamp(),
            });
            if (isMounted) {
              setConfirmedTime(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
            }
          } else if (data.confirmedAt || data.viewedAt) {
            const ts = data.confirmedAt || data.viewedAt;
            const dateObj = ts.toDate ? ts.toDate() : new Date(ts);
            if (isMounted) {
              setConfirmedTime(dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
            }
          }
        } else {
          // Verifica se o usuário pertence a este serviço
          const isMusicianInScale = 
            scale.musicians?.some((m: any) => m.id === user.uid) ||
            scale.serviceChief?.id === user.uid ||
            (scale.expediente && (
              scale.expediente.regenteMaestroId === user.uid ||
              scale.expediente.regenteId === user.uid ||
              scale.expediente.arquivoId === user.uid ||
              scale.expediente.sargenteacaoId === user.uid ||
              scale.expediente.p4FinancasTransporteId === user.uid ||
              scale.expediente.administrativo?.some((m: any) => m.id === user.uid) ||
              scale.expediente.obra?.some((m: any) => m.id === user.uid) ||
              scale.expediente.permanencia?.some((m: any) => m.id === user.uid)
            ));

          if (isMusicianInScale) {
            const notifRef = doc(collection(db, 'notifications'));
            const profileSnap = await getDoc(doc(db, 'profiles', user.uid));
            const pData = profileSnap.data();

            await setDoc(notifRef, {
              userId: user.uid,
              scaleId: params.id,
              scaleTitle: scale.title || scale.format || 'Escala',
              scaleDate: scale.date || '',
              userName: pData?.war_name || pData?.name || 'Músico',
              userRank: pData?.rank || '',
              userInstrument: pData?.instrument || '',
              type: 'scale_view',
              read: true,
              confirmedAt: serverTimestamp(),
              viewedAt: serverTimestamp(),
              createdAt: serverTimestamp(),
            });

            if (isMounted) {
              setConfirmedTime(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
            }
          }
        }
      } catch (err) {
        console.error("Erro na confirmação automática ao abrir escala:", err);
      }
    };

    autoConfirmView();
    return () => { isMounted = false; };
  }, [user, params.id, scale]);

  const handleSaveRepertoire = async () => {
    if (!params.id) return;
    setSavingRepertoire(true);
    try {
      await updateDoc(doc(db, 'scales', params.id as string), {
        repertoire,
        repertoireUpdatedAt: serverTimestamp()
      });
      setRepertoireSaved(true);
      setTimeout(() => setRepertoireSaved(false), 3000);
    } catch (e) {
      console.error('Erro ao salvar repertório:', e);
    } finally {
      setSavingRepertoire(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-background-light dark:bg-background-dark min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!scale) {
    return (
      <div className="bg-background-light dark:bg-background-dark min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <span className="material-symbols-outlined text-gray-400 text-[64px] mb-4">event_busy</span>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Escala não encontrada</h2>
        <Link href="/dashboard" className="text-primary font-bold hover:underline">
          Voltar ao Início
        </Link>
      </div>
    );
  }

  const isEnsaio = scale.format === 'Ensaio' || scale.format === 'Expediente Administrativo';
  // Verifica se o usuário atual é o Chefe do Serviço desta escala
  const isChief = user && scale.serviceChief && scale.serviceChief.id === user.uid;
  const isAdmin = userRole === 'admin' || userRole === 'manager';
  // Pode editar repertório: chefe do serviço OU gestor/admin
  const canEditRepertoire = isChief || isAdmin;

  // Parse lines of repertoire for display
  const repertoireLines = (scale.repertoire || '')
    .split('\n')
    .map((l: string) => l.trim())
    .filter((l: string) => l.length > 0);

  return (
    <div className="bg-transparent font-sans flex flex-col items-center lg:items-stretch w-full">
      <div className="relative w-full max-w-md lg:max-w-none bg-background-light dark:bg-[#121620]/90 backdrop-blur-xl lg:rounded-3xl lg:border lg:border-white/10 flex flex-col h-full min-h-screen lg:min-h-0 shadow-2xl">
        <header className="sticky top-0 z-10 bg-background-light/95 dark:bg-[#121620]/95 backdrop-blur-md px-4 lg:px-6 py-3.5 flex items-center justify-between border-b border-gray-200 dark:border-white/10 lg:rounded-t-3xl">
          <Link href="/dashboard">
            <button className="flex items-center justify-center p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors text-gray-900 dark:text-white">
              <span className="material-symbols-outlined">arrow_back_ios_new</span>
            </button>
          </Link>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white flex-1 text-center">Detalhes da Escala</h1>
          <button
            onClick={() => generateScalePDF(scale)}
            title="Baixar PDF da Escala"
            className="flex items-center justify-center size-10 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 transition-colors"
          >
            <span className="material-symbols-outlined">download</span>
          </button>
        </header>

        <main className="flex-1 p-4 flex flex-col gap-5 pb-24">

          {/* Banner de ciência confirmada automaticamente ao abrir */}
          {confirmedTime && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 flex items-center justify-between gap-3 shadow-sm"
            >
              <div className="flex items-center gap-3">
                <div className="size-9 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[22px]">verified</span>
                </div>
                <div className="flex flex-col">
                  <p className="text-sm font-bold text-emerald-300">Ciência Confirmada Automaticamente</p>
                  <p className="text-xs text-emerald-400/80">O comando foi notificado de que você abriu e verificou esta escala.</p>
                </div>
              </div>
              <span className="text-[11px] font-bold text-emerald-300/90 bg-emerald-500/20 px-2.5 py-1 rounded-full whitespace-nowrap">
                {confirmedTime}
              </span>
            </motion.div>
          )}

          {/* Destaque da Função / Posto Designado do Músico Conectado */}
          {(() => {
            const myMusician = scale.musicians?.find((m: any) => m.id === user?.uid);
            const myRole = myMusician?.roleInScale || myMusician?.function;
            if (!myRole) return null;
            return (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-gradient-to-r from-blue-600/15 via-indigo-600/15 to-purple-600/15 border border-blue-500/40 rounded-2xl p-4 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <div className="size-11 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[26px]">assignment_ind</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] font-black uppercase tracking-wider text-blue-400">
                      Sua Função / Posto nesta Escala
                    </span>
                    <h4 className="text-base font-bold text-gray-900 dark:text-white mt-0.5 truncate">
                      {myRole}
                    </h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      Verifique a documentação anexa e os horários acima.
                    </p>
                  </div>
                </div>
              </motion.div>
            );
          })()}

          {/* Documento Oficial Anexo (Escalas Externas ou com Documento) */}
          {scale.attachedDocument && (
            <section className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800/60 rounded-2xl p-4 shadow-sm flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[20px] text-red-500">picture_as_pdf</span>
                  <h3 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Documento Oficial Anexo
                  </h3>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 uppercase">
                  {scale.classification === 'externa' ? 'Escala Externa' : 'Documento Anexo'}
                </span>
              </div>

              <div className="flex items-center justify-between gap-3 bg-white dark:bg-slate-800/60 p-3 rounded-xl border border-gray-100 dark:border-white/5">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="size-10 rounded-lg bg-red-500/10 text-red-500 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[24px]">description</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900 dark:text-white truncate">
                      {scale.attachedDocument.name || 'Documento Oficial'}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {scale.attachedDocument.size ? `${(scale.attachedDocument.size / 1024).toFixed(1)} KB` : 'Documento'} • Enviado pelo comando
                    </p>
                  </div>
                </div>

                <a
                  href={scale.attachedDocument.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary hover:bg-blue-600 text-white text-xs font-bold shrink-0 transition-colors shadow-sm"
                >
                  <span className="material-symbols-outlined text-[16px]">visibility</span>
                  Visualizar
                </a>
              </div>
            </section>
          )}

          {/* Badge de Chefe do Serviço ou Gestor com permissão de edição */}
          {canEditRepertoire && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/50 rounded-2xl p-4"
            >
              <span className="material-symbols-outlined text-amber-500 text-[28px]">
                {isAdmin && !isChief ? 'admin_panel_settings' : 'military_tech'}
              </span>
              <div>
                <p className="text-sm font-black text-amber-700 dark:text-amber-400">
                  {isAdmin && !isChief ? 'Você pode editar o repertório (Gestor)' : 'Você é o Chefe deste Serviço'}
                </p>
                <p className="text-xs text-amber-600/70 dark:text-amber-500/70 mt-0.5">Preencha o repertório abaixo para os demais integrantes.</p>
              </div>
            </motion.div>
          )}

          <div className="flex justify-center">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border border-green-200 dark:border-green-800">
              <span className="material-symbols-outlined text-[16px] leading-none">check_circle</span>
              Confirmado
            </span>
          </div>

          <section className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="relative w-full h-32 bg-slate-900 dark:bg-black flex items-center justify-center">
              <img
                alt="Brasão da Banda de Música PMPR"
                className="w-full h-full object-contain p-2 opacity-80"
                src="/brasao_banda.png"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent"></div>
              <div className="absolute bottom-3 left-4 text-white flex flex-col items-start gap-1">
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold border ${getFormatColors(scale.format).bg} ${getFormatColors(scale.format).text} ${getFormatColors(scale.format).border}`}>
                  {scale.format}
                </span>
                <h2 className="text-xl font-bold leading-tight mt-0.5">{scale.title}</h2>
              </div>
            </div>
            <div className="p-4 flex flex-col gap-4">
              <div className="flex items-center gap-3 border-b border-gray-100 dark:border-gray-800 pb-4">
                <div className="bg-primary/10 text-primary rounded-lg p-2.5 flex items-center justify-center">
                  <span className="material-symbols-outlined">calendar_month</span>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase">Data do Serviço</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    {fmtDate(scale.date)}
                  </p>
                </div>
              </div>

              <div className={`grid ${isEnsaio ? 'grid-cols-2' : 'grid-cols-2'} gap-4`}>
                {!isEnsaio && (
                  <div className="flex flex-col gap-1 text-amber-600 dark:text-amber-400">
                    <span className="text-xs opacity-70">Saída da BM</span>
                    <span className="text-sm font-bold">{scale.departureTime}</span>
                  </div>
                )}
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-gray-500 dark:text-gray-400">{isEnsaio ? 'Horário do Ensaio' : 'Início Previsto'}</span>
                  <span className="text-sm font-bold text-primary">{scale.startTime}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Término Previsto</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{scale.endTime}</span>
                </div>
                {!isEnsaio && (
                  <div className="flex flex-col gap-1 text-blue-600 dark:text-blue-400">
                    <span className="text-xs opacity-70">Retorno Previsto</span>
                    <span className="text-sm font-bold">{scale.returnTime}</span>
                  </div>
                )}
              </div>

              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 flex items-start gap-3 mt-2">
                <span className="material-symbols-outlined text-gray-400 mt-0.5 text-[20px]">styler</span>
                <div className="flex-1">
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase">Uniforme</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{scale.uniform}</p>
                </div>
              </div>

              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 flex items-start gap-3">
                <span className="material-symbols-outlined text-gray-400 mt-0.5 text-[20px]">location_on</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{scale.location}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mt-0.5">Confirme o endereço oficial com o comando.</p>
                </div>
              </div>
            </div>
          </section>

          {/* EXPEDIENTE E APOIO */}
          {(scale.expediente || scale.serviceChief) && (
            <section className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800/50 rounded-2xl overflow-hidden shadow-sm">
              <div className="bg-slate-100 dark:bg-slate-800/60 px-4 py-2 border-b border-slate-200 dark:border-slate-800/50 flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-slate-500">shield_person</span>
                <h3 className="text-[10px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-[0.15em]">Expediente e Comando</h3>
              </div>
              
              <div className="p-4 flex flex-col gap-4">
                {scale.expediente?.referencia && (
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Referência</span>
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-300">{scale.expediente.referencia}</p>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3">
                  {[ 
                    ...(scale.signer ? [{
                      label: `Assinatura PDF (${scale.signer.title})`,
                      val: `${scale.signer.rank ? `${scale.signer.rank} ` : ''}${scale.signer.name || scale.signer.war_name}`,
                      icon: 'draw',
                      color: 'text-emerald-600'
                    }] : []),
                    { label: 'Maestro Chefe', val: scale.expediente?.regenteMaestro, icon: 'military_tech', color: 'text-amber-600' },
                    { label: 'Regente', val: scale.expediente?.regente, icon: 'edit_note', color: 'text-blue-600' },
                    { label: 'Chefe do Serviço', val: scale.serviceChief ? `${scale.serviceChief.rank || ''} ${scale.serviceChief.war_name || scale.serviceChief.name}` : null, icon: 'star', color: 'text-amber-500' },
                    { label: 'Sargenteação', val: scale.expediente?.sargenteacao, icon: 'assignment_ind', color: 'text-slate-500' },
                    { label: 'Arquivo', val: scale.expediente?.arquivo, icon: 'library_music', color: 'text-slate-500' }
                  ].filter(x => !!x.val).map((item, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      <div className="flex-none size-8 rounded-lg bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 flex items-center justify-center">
                        <span className={`material-symbols-outlined text-[18px] ${item.color}`}>{item.icon}</span>
                      </div>
                      <div className="flex-1">
                        <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{item.label}</p>
                        <p className="text-sm font-bold text-slate-900 dark:text-white">{item.val}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Administrativo e Obra */}
                {(scale.expediente?.administrativo?.length > 0 || scale.expediente?.obra?.length > 0) && (
                   <div className="mt-2 pt-4 border-t border-slate-100 dark:border-slate-800/50 flex flex-col gap-4">
                      {scale.expediente?.administrativo?.length > 0 && (
                        <div className="flex flex-col gap-2">
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Equipe Administrativa</span>
                          <div className="flex flex-wrap gap-1.5">
                             {scale.expediente.administrativo.map((adm: any, i: number) => (
                               <span key={i} className="text-[11px] font-bold bg-slate-200/60 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2.5 py-1 rounded-lg border border-slate-300/30 dark:border-slate-700/50">
                                 {adm.label}
                               </span>
                             ))}
                          </div>
                        </div>
                      )}

                      {scale.expediente?.obra?.length > 0 && (
                        <div className="flex flex-col gap-2">
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Equipe de Obra</span>
                          <div className="flex flex-wrap gap-1.5">
                             {scale.expediente.obra.map((ob: any, i: number) => (
                               <span key={i} className="text-[11px] font-bold bg-blue-50 dark:bg-blue-900/10 text-blue-700 dark:text-blue-400 px-2.5 py-1 rounded-lg border border-blue-200/50 dark:border-blue-800/30">
                                 {ob.label}
                               </span>
                             ))}
                          </div>
                        </div>
                      )}
                   </div>
                )}
              </div>
            </section>
          )}

          {/* REPERTÓRIO */}
          <section className="flex flex-col gap-3">
            <div className="flex items-center gap-2 px-1">
              <span className="material-symbols-outlined text-[18px] text-gray-500">queue_music</span>
              <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider flex-1">Repertório</h3>
              {canEditRepertoire && (
                <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-full px-2 py-0.5 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[11px]">edit</span>
                  {isAdmin && !isChief ? 'Editável pelo Gestor' : 'Editável por você'}
                </span>
              )}
            </div>

            {canEditRepertoire ? (
              /* MODO EDIÇÃO — somente para o Chefe do Serviço ou Gestor */
              <div className="flex flex-col gap-2">
                <textarea
                  value={repertoire}
                  onChange={(e) => setRepertoire(e.target.value)}
                  rows={6}
                  placeholder={'Digite o repertório, uma música por linha:\n\n01. Hino Nacional Brasileiro\n02. Dobrado 220\n03. Canção da PMPR'}
                  className="w-full rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/10 px-4 py-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-400 focus:border-amber-400 outline-none resize-none transition-all placeholder:text-gray-400 font-mono leading-relaxed"
                />
                <button
                  onClick={handleSaveRepertoire}
                  disabled={savingRepertoire}
                  className="flex items-center justify-center gap-2 h-11 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm shadow-lg shadow-amber-200 dark:shadow-amber-900/30 transition-all active:scale-[0.98] disabled:opacity-60"
                >
                  {savingRepertoire ? (
                    <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
                  ) : repertoireSaved ? (
                    <>
                      <span className="material-symbols-outlined text-[18px]">check_circle</span>
                      Repertório Salvo!
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[18px]">save</span>
                      Salvar Repertório
                    </>
                  )}
                </button>
              </div>
            ) : (
              /* MODO LEITURA — todos os outros usuários */
              <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
                {repertoireLines.length > 0 ? (
                  <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {repertoireLines.map((line: string, i: number) => (
                      <div key={i} className="p-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                        <div className="flex-none size-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                          {String(i + 1).padStart(2, '0')}
                        </div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white flex-1">{line}</p>
                        <span className="material-symbols-outlined text-gray-400 text-[20px]">music_note</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-6 text-center flex flex-col items-center gap-2">
                    <span className="material-symbols-outlined text-gray-300 dark:text-gray-600 text-[40px]">queue_music</span>
                    <p className="text-sm text-gray-400 dark:text-gray-500">Repertório ainda não definido pelo Chefe do Serviço.</p>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Efetivo Escalado</h3>
              <span className="text-xs bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full font-medium">{scale.musicians?.length || 0} Efetivo</span>
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
              {scale.musicians?.map((person: any, i: number) => (
                <div key={i} className="group border-b border-gray-100 dark:border-gray-800 last:border-0">
                  <div className="p-4 flex items-start gap-3">
                    <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-black text-sm">
                      {(person.war_name || person.name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{person.war_name || person.name}</p>
                        <span className="text-[10px] font-bold text-gray-500 px-2 py-0.5 rounded ml-2 uppercase tracking-tight">{person.instrument}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <p className="text-xs text-gray-500 dark:text-gray-400">{person.rank} - PMPR</p>
                        {(person.roleInScale || person.function) && (
                          <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800/40 px-2 py-0.5 rounded-md truncate max-w-[190px]">
                            {person.roleInScale || person.function}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div className="mt-4 px-1">
            <Link href={`/swaps/new?scaleId=${scale.id}`}>
              <button className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-primary/20 transition-all active:scale-[0.98]">
                <span className="material-symbols-outlined text-[20px]">swap_horiz</span>
                Solicitar Permuta de Escala
              </button>
            </Link>
            <p className="text-center text-xs text-gray-400 mt-3 px-4">
              A permuta precisará ser aceita pelo parceiro e posteriormente autorizada pelo comando.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
