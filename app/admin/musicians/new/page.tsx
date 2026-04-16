'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { collection, addDoc, serverTimestamp, query, where, getDocs, doc, setDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { handleFirestoreError, OperationType } from '@/lib/firestore-errors';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '@/firebase-applet-config.json';

const secondaryApp = getApps().find(app => app.name === 'SecondaryApp') || initializeApp(firebaseConfig, 'SecondaryApp');
const secondaryAuth = getAuth(secondaryApp);

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

export default function AdminNewMusicianPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [checkingEmail, setCheckingEmail] = useState(false);

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
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, () => {
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, email: e.target.value.toLowerCase().trim() });
  };

  const handleSave = async () => {
    if (!formData.name) {
      alert('Por favor, preencha o nome.');
      return;
    }
    if (!formData.email) {
      alert('Por favor, preencha o e-mail pessoal.');
      return;
    }

    setLoading(true);
    try {
      const userCred = await createUserWithEmailAndPassword(secondaryAuth, formData.email, '123456');
      const newUid = userCred.user.uid;

      await setDoc(doc(db, 'profiles', newUid), {
        ...formData,
        uid: newUid,
        createdAt: serverTimestamp(),
        forcePasswordReset: true,
        status: formData.active ? 'active' : 'pending' // active because admin created
      });

      await secondaryAuth.signOut();
      router.push('/admin/musicians');
    } catch (error: any) {
      if (error.code === 'auth/email-already-in-use') {
        alert('Falha: O e-mail (' + formData.email + ') já está cadastrado no sistema.');
      } else {
        handleFirestoreError(error, OperationType.CREATE, 'profiles');
      }
    } finally {
      setLoading(false);
    }
  };

  const inputCls = 'w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all text-gray-900 dark:text-white';
  const selectCls = inputCls + ' appearance-none pr-10';
  const labelCls = 'flex flex-col gap-1.5';
  const labelTextCls = 'text-sm font-bold text-gray-700 dark:text-gray-300';

  if (authLoading) {
    return (
      <div className="bg-background-light dark:bg-background-dark min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="bg-background-light dark:bg-background-dark font-sans min-h-screen flex flex-col items-center">
      <div className="relative w-full max-w-md bg-background-light dark:bg-background-dark flex flex-col h-full min-h-screen shadow-2xl">

        {/* Header */}
        <header className="sticky top-0 z-10 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md px-4 py-3 flex items-center justify-between border-b border-gray-200 dark:border-gray-800">
          <Link href="/admin/musicians">
            <button className="flex items-center justify-center p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors text-gray-900 dark:text-white">
              <span className="material-symbols-outlined">arrow_back_ios_new</span>
            </button>
          </Link>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white flex-1 text-center pr-10">
            Novo Integrante do Efetivo
          </h1>
        </header>

        <main className="flex-1 p-5 flex flex-col gap-5 pb-28">

          {/* Avatar placeholder */}
          <div className="flex flex-col items-center gap-2 py-2">
            <div className="size-24 rounded-full bg-primary/10 border-4 border-white dark:border-gray-700 shadow-lg flex items-center justify-center text-primary font-bold text-2xl uppercase">
              {formData.war_name?.[0] || formData.name?.[0] || (
                <span className="material-symbols-outlined text-[36px]">person_add</span>
              )}
            </div>
            <p className="text-xs text-gray-400 italic">A foto será definida pelo próprio integrante</p>
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
              <span className={labelTextCls}>E-mail Pessoal <span className="text-red-400">*</span></span>
              <input
                className={inputCls}
                value={formData.email}
                onChange={handleEmailChange}
                type="email"
                placeholder="exemplo@gmail.com"
              />
              <p className="text-xs text-primary mt-1 flex items-center gap-1 font-medium">
                <span className="material-symbols-outlined text-[14px]">info</span>
                Este será o e-mail de login. A senha padrão inicial será 123456.
              </p>
            </label>

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
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary" />
            </label>
            <div className="flex flex-col">
              <span className="text-sm font-bold text-gray-900 dark:text-white">Acesso Ativo</span>
              <span className="text-[10px] text-gray-500">Permite login no sistema</span>
            </div>
          </div>

        </main>

        {/* Footer fixo — igual ao de edição, mas só com o botão Salvar */}
        <footer className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md p-4 bg-white dark:bg-background-dark border-t border-gray-100 dark:border-gray-800 flex gap-3 z-10">
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex-1 py-3.5 rounded-xl bg-primary text-white font-bold shadow-lg shadow-primary/20 hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 text-sm"
          >
            {loading ? (
              <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
            ) : (
              <>
                <span className="material-symbols-outlined text-[18px]">person_add</span>
                Salvar Cadastro
              </>
            )}
          </button>
        </footer>

      </div>
    </div>
  );
}
