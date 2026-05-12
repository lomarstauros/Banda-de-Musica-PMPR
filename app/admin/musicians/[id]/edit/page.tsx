'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc, updateDoc, deleteDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { handleFirestoreError, OperationType } from '@/lib/firestore-errors';
import { updateUserAuthEmail, resetUserAccess } from '@/app/actions/auth-actions';
import { normalizeSpaces } from '@/lib/utils';

// Máscara RG: 0.000.000-0
const formatRG = (value: string) => {
  const clean = value.replace(/\D/g, '').slice(0, 9);
  if (clean.length <= 1) return clean;
  if (clean.length <= 4) return clean.replace(/(\d{1})(\d+)/, '$1.$2');
  if (clean.length <= 7) return clean.replace(/(\d{1})(\d{3})(\d+)/, '$1.$2.$3');
  return clean.replace(/(\d{1})(\d{3})(\d{3})(\d+)/, '$1.$2.$3-$4');
};

// Máscara celular: (00)0 0000-0000
const formatPhone = (value: string) => {
  const clean = value.replace(/\D/g, '').slice(0, 11);
  if (clean.length <= 2) return clean.replace(/(\d+)/, '($1');
  if (clean.length <= 3) return clean.replace(/(\d{2})(\d+)/, '($1)$2');
  if (clean.length <= 7) return clean.replace(/(\d{2})(\d{1})(\d+)/, '($1)$2 $3');
  return clean.replace(/(\d{2})(\d{1})(\d{4})(\d+)/, '($1)$2 $3-$4');
};

export default function AdminEditMusicianPage() {
  const params = useParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [originalEmail, setOriginalEmail] = useState('');

  // Espelha exatamente os mesmos campos do perfil do usuário
  const [formData, setFormData] = useState({
    name: '',
    war_name: '',
    re: '',
    rank: '',
    instrument: '',
    role: 'musician',
    email: '',
    phone: '',
    cpf: '',
    active: true,
    militaryStatus: 'Ativo',
    statusStartDate: '',
    statusEndDate: '',
    photo_url: '',
    institutional_email: '',
    leaveHistory: [] as any[],
  });

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        const fetchMusician = async () => {
          if (!params.id) return;
          try {
            const docRef = doc(db, 'profiles', params.id as string);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
              const data = docSnap.data();
              setFormData({
                name: data.name || '',
                war_name: data.war_name || '',
                re: data.re || '',
                rank: data.rank || '',
                instrument: data.instrument || '',
                role: data.role || 'musician',
                email: data.email || '',
                phone: data.phone || '',
                cpf: data.cpf || '',
                active: data.active ?? true,
                militaryStatus: data.militaryStatus || 'Ativo',
                statusStartDate: data.statusStartDate || '',
                statusEndDate: data.statusEndDate || '',
                photo_url: data.photo_url || '',
                institutional_email: data.institutional_email || '',
                leaveHistory: data.leaveHistory || [],
              });
              setOriginalEmail(data.email || '');
            } else {
              alert('Integrante não encontrado');
              router.push('/admin/musicians');
            }
          } catch (error) {
            handleFirestoreError(error, OperationType.GET, `profiles/${params.id}`);
          } finally {
            setLoading(false);
          }
        };
        fetchMusician();
      } else {
        setLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, [params.id, router]);

  const validateEmail = (email: string) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };

  const checkEmailExists = async (email: string) => {
    if (!email || !email.includes('@')) return;
    setCheckingEmail(true);
    setEmailError(null);
    try {
      const q = query(collection(db, 'profiles'), where('email', '==', email.trim().toLowerCase()));
      const snap = await getDocs(q);
      // Ignora o próprio documento sendo editado
      const others = snap.docs.filter(d => d.id !== params.id);
      if (others.length > 0) {
        setEmailError('Este e-mail já está sendo utilizado por outro usuário.');
      }
    } catch (e) {
      console.error('Erro ao verificar e-mail:', e);
    } finally {
      setCheckingEmail(false);
    }
  };

  const handleSave = async () => {
    if (!formData.name) {
      alert('O nome completo é obrigatório.');
      return;
    }
    if (!formData.email) {
      setEmailError('O e-mail é obrigatório.');
      return;
    }
    if (!validateEmail(formData.email)) {
      setEmailError('Formato de e-mail inválido (exemplo@dominio.com)');
      return;
    }
    if (emailError) {
      alert('Corrija o erro no e-mail antes de salvar.');
      return;
    }
    setSaving(true);
    try {
      // 1. Sincronizar e-mail com Firebase Auth se houver alteração
      const newEmail = formData.email.trim().toLowerCase();
      if (originalEmail && newEmail !== originalEmail.toLowerCase()) {
        console.log(`[AdminEdit] Alteração de e-mail detectada: ${originalEmail} -> ${newEmail}`);
        const authRes = await updateUserAuthEmail(params.id as string, newEmail);
        
        if (!authRes.success) {
          alert(authRes.error);
          setSaving(false);
          return;
        }
      }

      // 2. Atualizar Firestore
      const docRef = doc(db, 'profiles', params.id as string);
      
      const cleanName = normalizeSpaces(formData.name);
      const cleanWarName = normalizeSpaces(formData.war_name);
      const cleanRank = normalizeSpaces(formData.rank);

      // Atualiza histórico se for um afastamento válido
      let updatedHistory = [...formData.leaveHistory];
      if (formData.militaryStatus !== 'Ativo' && formData.statusStartDate && formData.statusEndDate) {
        // Checa se já existe no histórico com essas mesmas datas
        const exists = updatedHistory.find(
          h => h.startDate === formData.statusStartDate && h.endDate === formData.statusEndDate && h.status === formData.militaryStatus
        );
        if (!exists) {
          updatedHistory.push({
            status: formData.militaryStatus,
            startDate: formData.statusStartDate,
            endDate: formData.statusEndDate
          });
        }
      }

      // Salva com as mesmas chaves do Firestore usadas pelo perfil do usuário
      await updateDoc(docRef, {
        name: cleanName,
        war_name: cleanWarName,
        re: formData.re,
        rank: cleanRank,
        instrument: formData.instrument,
        role: formData.role,
        email: newEmail,
        phone: formData.phone,
        cpf: formData.cpf,
        active: formData.active,
        militaryStatus: formData.militaryStatus,
        statusStartDate: formData.statusStartDate,
        statusEndDate: formData.statusEndDate,
        institutional_email: formData.institutional_email,
        leaveHistory: updatedHistory,
        // photo_url NÃO é atualizada pelo gestor — é exclusiva do músico
      });
      router.push('/admin/musicians');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `profiles/${params.id}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (window.confirm('Tem certeza que deseja excluir este integrante?')) {
      setSaving(true);
      try {
        await deleteDoc(doc(db, 'profiles', params.id as string));
        router.push('/admin/musicians');
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `profiles/${params.id}`);
      } finally {
        setSaving(false);
      }
    }
  };

  const handleResetAccess = async () => {
    if (!window.confirm('Isso vai redefinir o e-mail de login para o que está no formulário e a senha para "123456". Deseja continuar?')) {
      return;
    }
    
    setSaving(true);
    try {
      const targetEmail = formData.email.trim().toLowerCase();
      const res = await resetUserAccess(params.id as string, targetEmail);
      
      if (res.success) {
        // Marcar no Firestore que precisa trocar senha no primeiro acesso
        const docRef = doc(db, 'profiles', params.id as string);
        await updateDoc(docRef, {
           forcePasswordReset: true,
           email: targetEmail
        });
        setOriginalEmail(targetEmail);
        alert('Acesso redefinido com sucesso! O músico deve usar a senha 123456.');
      } else {
        alert(res.error);
      }
    } catch (e: any) {
      alert('Erro ao processar reset: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all text-gray-900 dark:text-white';
  const selectCls = inputCls + ' appearance-none pr-10';
  const labelCls = 'flex flex-col gap-1.5';
  const labelTextCls = 'text-sm font-bold text-gray-700 dark:text-gray-300';

  if (loading) {
    return (
      <div className="bg-background-light dark:bg-background-dark min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="bg-background-light dark:bg-background-dark font-sans min-h-screen flex flex-col items-center">
      <div className="relative w-full max-w-md bg-background-light dark:bg-background-dark flex flex-col h-full min-h-screen shadow-2xl">
        <header className="sticky top-0 z-10 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md px-4 py-3 flex items-center justify-between border-b border-gray-200 dark:border-gray-800">
          <Link href="/admin/musicians">
            <button className="flex items-center justify-center p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors text-gray-900 dark:text-white">
              <span className="material-symbols-outlined">arrow_back_ios_new</span>
            </button>
          </Link>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white flex-1 text-center pr-10">Editar Integrante do Efetivo</h1>
        </header>

        <main className="flex-1 p-5 flex flex-col gap-5 pb-28">

          {/* Foto do perfil — somente leitura (definida pelo músico) */}
          <div className="flex flex-col items-center gap-2 py-2">
            {formData.photo_url ? (
              <div
                className="size-24 rounded-full bg-gray-100 dark:bg-gray-800 border-4 border-white dark:border-gray-700 shadow-lg bg-cover bg-center"
                style={{ backgroundImage: `url(${formData.photo_url})` }}
              />
            ) : (
              <div className="size-24 rounded-full bg-primary/10 border-4 border-white dark:border-gray-700 shadow-lg flex items-center justify-center text-primary font-bold text-2xl uppercase">
                {formData.war_name?.[0] || formData.name?.[0] || '?'}
              </div>
            )}
            <p className="text-xs text-gray-400 italic">Foto definida pelo próprio integrante</p>
          </div>

          {/* Seção: Identificação Pessoal */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4 flex flex-col gap-4 shadow-sm">
            <p className="text-[11px] font-black text-primary uppercase tracking-widest">Identificação Pessoal</p>

            <label className={labelCls}>
              <span className={labelTextCls}>Nome Completo <span className="text-red-400">*</span></span>
              <input
                className={inputCls}
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Nome completo do integrante"
              />
            </label>

            <label className={labelCls}>
              <span className={labelTextCls}>Nome de Guerra</span>
              <input
                className={inputCls}
                value={formData.war_name}
                onChange={(e) => setFormData({ ...formData, war_name: e.target.value })}
                placeholder="Nome de guerra"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className={labelCls}>
                <span className={labelTextCls}>RG / Identificação</span>
                <input
                  className={inputCls}
                  value={formData.re}
                  onChange={(e) => setFormData({ ...formData, re: formatRG(e.target.value) })}
                  placeholder="0.000.000-0"
                />
              </label>
              <label className={labelCls}>
                <span className={labelTextCls}>CPF</span>
                <input
                  className={inputCls}
                  value={formData.cpf}
                  onChange={(e) => setFormData({ ...formData, cpf: e.target.value })}
                  placeholder="000.000.000-00"
                />
              </label>
            </div>

            <label className={labelCls}>
              <span className={labelTextCls}>E-mail <span className="text-red-400">*</span></span>
              <input
                className={`w-full rounded-xl border bg-white dark:bg-gray-900 px-4 py-3 text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all text-gray-900 dark:text-white ${
                  emailError ? 'border-red-400 focus:ring-red-300' : 'border-gray-200 dark:border-gray-700'
                }`}
                value={formData.email}
                onChange={(e) => {
                  const cleanValue = e.target.value.toLowerCase().replace(/\s/g, '');
                  setFormData({ ...formData, email: cleanValue });
                  setEmailError(null);
                }}
                onBlur={(e) => checkEmailExists(e.target.value)}
                type="email"
                placeholder="email@pmpr.pr.gov.br"
              />
              {checkingEmail && (
                <p className="text-xs text-gray-400 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px] animate-spin">progress_activity</span>
                  Verificando disponibilidade...
                </p>
              )}
              {emailError && (
                <p className="text-xs text-red-500 flex items-center gap-1 font-medium">
                  <span className="material-symbols-outlined text-[14px]">error</span>
                  {emailError}
                </p>
              )}
            </label>

            <label className={labelCls}>
              <span className={labelTextCls}>E-mail Institucional</span>
              <input
                className={inputCls}
                value={formData.institutional_email}
                onChange={(e) => setFormData({ ...formData, institutional_email: e.target.value.toLowerCase().replace(/\s/g, '') })}
                type="email"
                placeholder="email@instituicao.gov.br"
              />
            </label>

            <button
               type="button"
               onClick={handleResetAccess}
               disabled={saving}
               className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/10 text-amber-700 dark:text-amber-400 text-xs font-bold hover:bg-amber-100 transition-all disabled:opacity-50"
            >
               <span className="material-symbols-outlined text-[18px]">lock_reset</span>
               REDEFINIR ACESSO (SENHA 123456)
            </button>

            <label className={labelCls}>
              <span className={labelTextCls}>Celular</span>
              <input
                className={inputCls}
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: formatPhone(e.target.value) })}
                type="tel"
                placeholder="(41)9 9999-9999"
              />
            </label>
          </div>

          {/* Seção: Dados Militares */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4 flex flex-col gap-4 shadow-sm">
            <p className="text-[11px] font-black text-primary uppercase tracking-widest">Dados Militares</p>

            <div className="grid grid-cols-2 gap-3">
              <label className={labelCls}>
                <span className={labelTextCls}>Graduação</span>
                <div className="relative">
                  <select className={selectCls} value={formData.rank} onChange={(e) => setFormData({ ...formData, rank: e.target.value })}>
                    <option value="">Selecione...</option>
                    <option>Soldado QPM PM</option>
                    <option>Cabo QPM PM</option>
                    <option>3º Sargento QPM PM</option>
                    <option>2º Sargento QPM PM</option>
                    <option>1º Sargento QPM PM</option>
                    <option>Subtenente QPM PM</option>
                    <option>2º Tenente QOM PM</option>
                    <option>1º Tenente QOM PM</option>
                    <option>Capitão QOM PM</option>
                    <option>Major QOM PM</option>
                  </select>
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-400">
                    <span className="material-symbols-outlined">expand_more</span>
                  </div>
                </div>
              </label>

              <label className={labelCls}>
                <span className={labelTextCls}>Instrumento/Função</span>
                <div className="relative">
                  <select className={selectCls} value={formData.instrument} onChange={(e) => setFormData({ ...formData, instrument: e.target.value })}>
                    <option value="">Selecione...</option>
                    <optgroup label="Funções de Comando/Administração">
                      <option>Comandante da Banda de Música</option>
                      <option>Subcomandante da Banda de Música</option>
                      <option>Aux. P1/Sargenteante</option>
                      <option>Auxiliar P/3</option>
                      <option>Auxiliar P/4</option>
                      <option>Auxiliar P/5</option>
                      <option>Administrativo</option>
                      <option>Comando</option>
                      <option>Regente</option>
                    </optgroup>
                    <optgroup label="Instrumentos">
                      <option>Clarinete</option>
                      <option>Eufônio</option>
                      <option>Flauta</option>
                      <option>Percussão</option>
                      <option>Saxofone</option>
                      <option>Trombone</option>
                      <option>Trompa</option>
                      <option>Trompete</option>
                      <option>Tuba</option>
                    </optgroup>
                  </select>
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-400">
                    <span className="material-symbols-outlined">expand_more</span>
                  </div>
                </div>
              </label>
            </div>

            <label className={labelCls}>
              <span className={labelTextCls}>Tipo de Acesso</span>
              <div className="relative">
                <select className={selectCls} value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value })}>
                  <option value="musician">Músico</option>
                  <option value="admin">Administrador / Gestor</option>
                </select>
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-400">
                  <span className="material-symbols-outlined">expand_more</span>
                </div>
              </div>
            </label>

            <label className={labelCls}>
              <span className={labelTextCls}>Situação do Militar</span>
              <div className="relative">
                <select className={selectCls} value={formData.militaryStatus} onChange={(e) => setFormData({ ...formData, militaryStatus: e.target.value })}>
                  <option value="Ativo">Ativo</option>
                  <option value="Férias">Férias</option>
                  <option value="Licença">Licença</option>
                  <option value="Atestado">Atestado</option>
                  <option value="Outros">Outros</option>
                </select>
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-400">
                  <span className="material-symbols-outlined">expand_more</span>
                </div>
              </div>
            </label>

            {formData.militaryStatus !== 'Ativo' && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="grid grid-cols-2 gap-3">
                <label className={labelCls}>
                  <span className={labelTextCls}>Início do Período</span>
                  <input
                    type="date"
                    className={inputCls}
                    value={formData.statusStartDate}
                    onChange={(e) => setFormData({ ...formData, statusStartDate: e.target.value })}
                  />
                </label>
                <label className={labelCls}>
                  <span className={labelTextCls}>Fim do Período</span>
                  <input
                    type="date"
                    className={inputCls}
                    value={formData.statusEndDate}
                    onChange={(e) => setFormData({ ...formData, statusEndDate: e.target.value })}
                  />
                </label>
              </motion.div>
            )}
          </div>

          {/* Toggle acesso ativo */}
          <div className="flex items-center gap-3 p-4 bg-primary/5 rounded-2xl border border-primary/10">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={formData.active}
                onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary"></div>
            </label>
            <div className="flex flex-col">
              <span className="text-sm font-bold text-gray-900 dark:text-white">Acesso Ativo</span>
              <span className="text-[10px] text-gray-500">Permite login no sistema</span>
            </div>
          </div>

        </main>

        <footer className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md p-4 bg-white dark:bg-background-dark border-t border-gray-100 dark:border-gray-800 flex gap-3 z-10">
          <button
            onClick={handleDelete}
            disabled={saving}
            className="flex-1 h-13 py-3.5 rounded-xl border-2 border-red-200 dark:border-red-900/40 text-red-600 dark:text-red-400 font-bold hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors disabled:opacity-50 text-sm"
          >
            Excluir
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-[2] py-3.5 rounded-xl bg-primary text-white font-bold shadow-lg shadow-primary/20 hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 text-sm"
          >
            {saving ? (
              <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
            ) : (
              <>
                <span className="material-symbols-outlined text-[18px]">save</span>
                Salvar Alterações
              </>
            )}
          </button>
        </footer>
      </div>
    </div>
  );
}
