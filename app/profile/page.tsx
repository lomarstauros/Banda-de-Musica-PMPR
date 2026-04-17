'use client';

import Link from 'next/link';
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { BottomNav } from '@/components/ui/bottom-nav';
import { LogoutButton } from '@/components/ui/logout-button';
import { motion } from 'motion/react';
import { useState, useEffect, useRef } from 'react';
import { useFirebase } from '@/components/providers/firebase-provider';
import { useRouter } from 'next/navigation';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { updateUserAuthEmail } from '@/app/actions/auth-actions';

const formatCPF = (value: string) => {
  const clean = value.replace(/\D/g, '');
  const limited = clean.slice(0, 11);
  return limited
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})/, '$1-$2')
    .replace(/(-\d{2})\d+?$/, '$1');
};

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
  if (clean.length <= 11) return clean.replace(/(\d{2})(\d{1})(\d{4})(\d+)/, '($1)$2 $3-$4');
  return value;
};

export default function ProfilePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const { user, logout, loading: authLoading } = useFirebase();

  // Password change state
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    warName: '',
    email: '',
    phone: '',
    rank: '',
    instrument: '',
    photoUrl: '',
    cpf: '',
    re: ''
  });

  useEffect(() => {
    const fetchProfile = async () => {
      if (authLoading) return;
      if (!user) {
        router.push('/login');
        return;
      }

      try {
        const docRef = doc(db, 'profiles', user.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.status === 'pending' && data.role?.toLowerCase() !== 'master') {
            setIsPending(true);
            setLoading(false);
            return;
          }
          setFormData({
            name: data.name || '',
            warName: data.war_name || '',
            email: data.email || user.email || '',
            phone: data.phone || '',
            rank: data.rank || '',
            instrument: data.instrument || '',
            photoUrl: data.photo_url || 'https://picsum.photos/seed/profile/200/200',
            cpf: data.cpf || '',
            re: data.re || ''
          });
        }
      } catch (error: any) {
        console.error('Erro ao buscar perfil:', error.message);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [user, authLoading, router]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 400;
          const MAX_HEIGHT = 400;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);

          // Comprime bem a imagem e transforma num Base64 leve, que nunca vai travar o Firestore
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.8);
          setFormData(prev => ({ ...prev, photoUrl: compressedDataUrl }));
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      // 1. Sincronizar e-mail com Firebase Auth se houver alteração
      const newEmail = formData.email.trim().toLowerCase();
      if (user.email && newEmail !== user.email.toLowerCase()) {
        const authRes = await updateUserAuthEmail(user.uid, newEmail);
        if (!authRes.success) {
          alert(authRes.error);
          setSaving(false);
          return;
        }
      }

      // 2. Atualizar Firestore
      const docRef = doc(db, 'profiles', user.uid);
      await setDoc(docRef, {
        name: formData.name,
        war_name: formData.warName,
        email: newEmail,
        rank: formData.rank,
        // instrumento é gerenciado exclusivamente pelo gestor — nunca salvo aqui
        photo_url: formData.photoUrl,
        phone: formData.phone,
        cpf: formData.cpf,
        re: formData.re
      }, { merge: true });

      alert('Perfil atualizado com sucesso!');
    } catch (error: any) {
      console.error('Erro ao atualizar perfil:', error.message);
      alert('Erro ao atualizar perfil: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);

    if (newPassword.length < 6) {
      setPasswordError('A nova senha deve ter no mínimo 6 caracteres.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordError('As senhas não coincidem.');
      return;
    }
    if (!user || !user.email) return;

    setPasswordLoading(true);
    try {
      // Re-authenticate user first
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);

      // Update password
      await updatePassword(user, newPassword);

      setPasswordSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      // Auto-hide form after success
      setTimeout(() => {
        setShowPasswordForm(false);
        setPasswordSuccess(false);
      }, 3000);
    } catch (err: any) {
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setPasswordError('Senha atual incorreta.');
      } else if (err.code === 'auth/weak-password') {
        setPasswordError('A senha é muito fraca. Use pelo menos 6 caracteres.');
      } else if (err.code === 'auth/too-many-requests') {
        setPasswordError('Muitas tentativas. Aguarde um momento e tente novamente.');
      } else {
        setPasswordError('Erro ao alterar senha: ' + err.message);
      }
    } finally {
      setPasswordLoading(false);
    }
  };

  if (loading || authLoading) {
    return (
      <div className="bg-background-light dark:bg-background-dark min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (isPending) {
    return (
      <div className="bg-background-light dark:bg-background-dark min-h-screen flex items-center justify-center p-6 text-center font-sans">
        <div className="bg-white dark:bg-[#1A202C] p-8 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 max-w-sm flex flex-col items-center">
          <div className="size-20 rounded-full border-4 border-amber-100 dark:border-amber-900/30 bg-amber-50 dark:bg-amber-900/10 flex items-center justify-center text-amber-500 dark:text-amber-400 mb-4 ring-8 ring-amber-50 dark:ring-amber-900/5">
            <span className="material-symbols-outlined text-[40px] animate-pulse">hourglass_empty</span>
          </div>
          <h2 className="text-[#111318] dark:text-white text-xl font-bold mb-2">Conta em Análise</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed mb-6">
            O seu cadastro foi recebido na base de dados, mas o acesso completo ao seu perfil e formulários de música ainda precisa ser liberado oficialmente por um Gestor do Comando.
          </p>
          <LogoutButton />
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="bg-background-light dark:bg-background-dark min-h-screen text-slate-900 dark:text-white font-sans">
      <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden max-w-md mx-auto bg-background-light dark:bg-background-dark shadow-xl">
        <div className="sticky top-0 z-50 flex items-center bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-sm p-4 pb-2 justify-between border-b border-slate-200 dark:border-slate-800">
          <Link href="/dashboard">
            <button className="text-slate-900 dark:text-white flex size-12 shrink-0 items-center justify-start hover:opacity-70 transition-opacity">
              <span className="material-symbols-outlined">arrow_back_ios</span>
            </button>
          </Link>
          <h2 className="text-slate-900 dark:text-white text-lg font-bold leading-tight tracking-[-0.015em] flex-1 text-center pr-12">Editar Perfil</h2>
          <div className="flex items-center justify-end absolute right-4 top-0 bottom-0 gap-3">
            <button 
              onClick={handleSave}
              disabled={saving}
              className="text-primary hover:text-primary/80 text-base font-bold leading-normal tracking-[0.015em] shrink-0 transition-colors disabled:opacity-50"
            >
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
            <LogoutButton />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pb-10">
          <div className="flex p-6 flex-col items-center border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
            <div className="flex w-full flex-col gap-5 items-center">
              <div className="flex gap-4 flex-col items-center relative group">
                <div className="relative">
                  <div 
                    className="bg-center bg-no-repeat aspect-square bg-cover rounded-full min-h-32 w-32 shadow-md ring-4 ring-white dark:ring-slate-800" 
                    style={{ backgroundImage: `url("${formData.photoUrl}")` }}
                  ></div>
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute bottom-0 right-0 bg-primary text-white p-2 rounded-full shadow-lg hover:bg-blue-600 transition-colors flex items-center justify-center border-2 border-white dark:border-slate-800"
                  >
                    <span className="material-symbols-outlined text-[20px]">photo_camera</span>
                  </button>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    accept="image/*" 
                    onChange={handleFileChange}
                  />
                </div>
                <div className="flex flex-col items-center justify-center">
                  <p className="text-slate-900 dark:text-white text-[22px] font-bold leading-tight tracking-[-0.015em] text-center">{formData.name}</p>
                  <p className="text-slate-500 dark:text-slate-400 text-base font-normal leading-normal text-center">{formData.rank} - {formData.instrument}</p>
                </div>
              </div>
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full max-w-[200px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-10 px-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white text-sm font-bold leading-normal tracking-[0.015em] transition-colors border border-slate-200 dark:border-slate-700"
              >
                <span className="truncate">Alterar Foto</span>
              </button>
            </div>
          </div>

          <div className="h-4"></div>

          <div className="bg-white dark:bg-slate-900/50 px-4 py-2 border-y border-slate-200 dark:border-slate-800">
            <h3 className="text-slate-900 dark:text-white text-lg font-bold leading-tight tracking-[-0.015em] pb-2 pt-4">Informações Pessoais</h3>
            <div className="flex flex-col gap-4 py-2">
              <label className="flex flex-col flex-1">
                <p className="text-slate-700 dark:text-slate-300 text-sm font-medium leading-normal pb-2">Nome Completo</p>
                <input 
                  className="flex w-full min-w-0 flex-1 rounded-lg text-slate-900 dark:text-white focus:outline-0 focus:ring-2 focus:ring-primary/20 border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 focus:border-primary h-12 placeholder:text-slate-400 px-[15px] text-base font-normal leading-normal transition-all" 
                  value={formData.name} 
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  type="text"
                />
              </label>
              <label className="flex flex-col flex-1">
                <p className="text-slate-700 dark:text-slate-300 text-sm font-medium leading-normal pb-2">Nome de Guerra</p>
                <input 
                  className="flex w-full min-w-0 flex-1 rounded-lg text-slate-900 dark:text-white focus:outline-0 focus:ring-2 focus:ring-primary/20 border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 focus:border-primary h-12 placeholder:text-slate-400 px-[15px] text-base font-normal leading-normal transition-all" 
                  value={formData.warName} 
                  onChange={(e) => setFormData(prev => ({ ...prev, warName: e.target.value }))}
                  type="text"
                />
              </label>
              <label className="flex flex-col flex-1">
                <p className="text-slate-700 dark:text-slate-300 text-sm font-medium leading-normal pb-2">E-mail</p>
                <input 
                  className="flex w-full min-w-0 flex-1 rounded-lg text-slate-900 dark:text-white focus:outline-0 focus:ring-2 focus:ring-primary/20 border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 focus:border-primary h-12 placeholder:text-slate-400 px-[15px] text-base font-normal leading-normal transition-all" 
                  value={formData.email} 
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  type="email"
                />
              </label>
              <label className="flex flex-col flex-1">
                <p className="text-slate-700 dark:text-slate-300 text-sm font-medium leading-normal pb-2">Celular</p>
                <input 
                  className="flex w-full min-w-0 flex-1 rounded-lg text-slate-900 dark:text-white focus:outline-0 focus:ring-2 focus:ring-primary/20 border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 focus:border-primary h-12 placeholder:text-slate-400 px-[15px] text-base font-normal leading-normal transition-all" 
                  value={formData.phone} 
                  onChange={(e) => setFormData(prev => ({ ...prev, phone: formatPhone(e.target.value) }))}
                  placeholder="(41)9 9999-9999"
                  type="tel"
                />
              </label>
              <label className="flex flex-col flex-1">
                <p className="text-slate-700 dark:text-slate-300 text-sm font-medium leading-normal pb-2">CPF</p>
                <input 
                  className="flex w-full min-w-0 flex-1 rounded-lg text-slate-900 dark:text-white focus:outline-0 focus:ring-2 focus:ring-primary/20 border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 focus:border-primary h-12 placeholder:text-slate-400 px-[15px] text-base font-normal leading-normal transition-all" 
                  value={formData.cpf} 
                  onChange={(e) => setFormData(prev => ({ ...prev, cpf: formatCPF(e.target.value) }))}
                  placeholder="000.000.000-00"
                  type="text"
                />
              </label>
              <label className="flex flex-col flex-1">
                <p className="text-slate-700 dark:text-slate-300 text-sm font-medium leading-normal pb-2">RE / Identificação</p>
                <input 
                  className="flex w-full min-w-0 flex-1 rounded-lg text-slate-900 dark:text-white focus:outline-0 focus:ring-2 focus:ring-primary/20 border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 focus:border-primary h-12 placeholder:text-slate-400 px-[15px] text-base font-normal leading-normal transition-all" 
                  value={formData.re} 
                  onChange={(e) => setFormData(prev => ({ ...prev, re: formatRG(e.target.value) }))}
                  placeholder="0.000.000-0"
                  type="text"
                />
              </label>
            </div>
          </div>

          <div className="h-4"></div>

          <div className="bg-white dark:bg-slate-900/50 px-4 py-2 border-y border-slate-200 dark:border-slate-800">
            <h3 className="text-slate-900 dark:text-white text-lg font-bold leading-tight tracking-[-0.015em] pb-2 pt-4">Dados Militares</h3>
            <div className="flex flex-col gap-4 py-2">
              <label className="flex flex-col flex-1">
                <p className="text-slate-700 dark:text-slate-300 text-sm font-medium leading-normal pb-2">Graduação</p>
                <div className="relative">
                  <select 
                    className="flex w-full min-w-0 flex-1 rounded-lg text-slate-900 dark:text-white focus:outline-0 focus:ring-2 focus:ring-primary/20 border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 focus:border-primary h-12 px-[15px] pr-10 text-base font-normal leading-normal transition-all appearance-none" 
                    value={formData.rank}
                    onChange={(e) => setFormData(prev => ({ ...prev, rank: e.target.value }))}
                  >
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
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
                    <span className="material-symbols-outlined text-sm">expand_more</span>
                  </div>
                </div>
              </label>
              <label className="flex flex-col flex-1">
                <p className="text-slate-700 dark:text-slate-300 text-sm font-medium leading-normal pb-2 flex items-center gap-2">
                  Instrumento/Função
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-full px-2 py-0.5">
                    <span className="material-symbols-outlined text-[12px]">lock</span>
                    Gerenciado pelo gestor
                  </span>
                </p>
                <div className="flex w-full min-w-0 flex-1 items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/60 h-12 px-4 gap-2 text-slate-600 dark:text-slate-400">
                  <span className="material-symbols-outlined text-[18px] text-amber-500">lock</span>
                  <span className="text-sm font-medium">{formData.instrument || 'Não definido pelo gestor'}</span>
                </div>
              </label>
            </div>
          </div>

          <div className="h-4"></div>

          <div className="bg-white dark:bg-slate-900/50 px-4 py-2 border-y border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between pb-2 pt-4">
              <h3 className="text-slate-900 dark:text-white text-lg font-bold leading-tight tracking-[-0.015em]">Segurança</h3>
              {!showPasswordForm && (
                <button
                  onClick={() => { setShowPasswordForm(true); setPasswordError(null); setPasswordSuccess(false); }}
                  className="flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-blue-600 transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">lock_reset</span>
                  Alterar Senha
                </button>
              )}
            </div>

            {!showPasswordForm ? (
              <div className="flex items-center gap-3 py-3 mb-2">
                <div className="flex items-center justify-center size-10 rounded-full bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800/50">
                  <span className="material-symbols-outlined text-[20px] text-green-500">verified_user</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Senha configurada</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">Clique em "Alterar Senha" para definir uma nova.</p>
                </div>
              </div>
            ) : (
              <motion.form
                onSubmit={handleChangePassword}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3 }}
                className="flex flex-col gap-4 py-3 mb-2"
              >
                {passwordSuccess && (
                  <div className="flex items-center gap-2 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800/50 rounded-lg p-3">
                    <span className="material-symbols-outlined text-green-500 text-[20px]">check_circle</span>
                    <p className="text-sm font-medium text-green-700 dark:text-green-300">Senha alterada com sucesso!</p>
                  </div>
                )}

                {passwordError && (
                  <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-lg p-3">
                    <span className="material-symbols-outlined text-red-500 text-[20px]">error</span>
                    <p className="text-sm font-medium text-red-600 dark:text-red-300">{passwordError}</p>
                  </div>
                )}

                <label className="flex flex-col">
                  <p className="text-slate-700 dark:text-slate-300 text-sm font-medium leading-normal pb-2">Senha Atual</p>
                  <div className="relative">
                    <input
                      className="flex w-full rounded-lg text-slate-900 dark:text-white focus:outline-0 focus:ring-2 focus:ring-primary/20 border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 focus:border-primary h-12 placeholder:text-slate-400 px-[15px] pr-12 text-base font-normal leading-normal transition-all"
                      type={showCurrentPw ? 'text' : 'password'}
                      placeholder="Digite sua senha atual"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPw(!showCurrentPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-primary transition-colors"
                    >
                      <span className="material-symbols-outlined text-[20px]">{showCurrentPw ? 'visibility_off' : 'visibility'}</span>
                    </button>
                  </div>
                </label>

                <label className="flex flex-col">
                  <p className="text-slate-700 dark:text-slate-300 text-sm font-medium leading-normal pb-2">Nova Senha</p>
                  <div className="relative">
                    <input
                      className="flex w-full rounded-lg text-slate-900 dark:text-white focus:outline-0 focus:ring-2 focus:ring-primary/20 border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 focus:border-primary h-12 placeholder:text-slate-400 px-[15px] pr-12 text-base font-normal leading-normal transition-all"
                      type={showNewPw ? 'text' : 'password'}
                      placeholder="No mínimo 6 caracteres"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      minLength={6}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPw(!showNewPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-primary transition-colors"
                    >
                      <span className="material-symbols-outlined text-[20px]">{showNewPw ? 'visibility_off' : 'visibility'}</span>
                    </button>
                  </div>
                  {newPassword.length > 0 && newPassword.length < 6 && (
                    <p className="text-xs text-amber-500 mt-1">A senha deve ter no mínimo 6 caracteres</p>
                  )}
                </label>

                <label className="flex flex-col">
                  <p className="text-slate-700 dark:text-slate-300 text-sm font-medium leading-normal pb-2">Confirmar Nova Senha</p>
                  <input
                    className="flex w-full rounded-lg text-slate-900 dark:text-white focus:outline-0 focus:ring-2 focus:ring-primary/20 border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 focus:border-primary h-12 placeholder:text-slate-400 px-[15px] text-base font-normal leading-normal transition-all"
                    type="password"
                    placeholder="Repita a nova senha"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    required
                  />
                  {confirmNewPassword.length > 0 && newPassword !== confirmNewPassword && (
                    <p className="text-xs text-red-500 mt-1">As senhas não coincidem</p>
                  )}
                </label>

                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setShowPasswordForm(false);
                      setCurrentPassword('');
                      setNewPassword('');
                      setConfirmNewPassword('');
                      setPasswordError(null);
                      setPasswordSuccess(false);
                    }}
                    className="flex-1 h-11 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={passwordLoading || !currentPassword || !newPassword || !confirmNewPassword}
                    className="flex-1 h-11 rounded-lg bg-primary hover:bg-blue-600 text-white text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-md shadow-primary/20"
                  >
                    {passwordLoading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                        Alterando...
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-[18px]">lock</span>
                        Confirmar
                      </>
                    )}
                  </button>
                </div>
              </motion.form>
            )}
          </div>

          <div className="p-6 mt-4">
            <button 
              onClick={logout}
              className="flex w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl h-12 px-5 bg-white dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-900/20 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 text-base font-bold leading-normal tracking-[0.015em] transition-all"
            >
              <span className="material-symbols-outlined mr-2">logout</span>
              <span className="truncate">Sair da Conta</span>
            </button>
            <p className="text-center text-xs text-slate-400 mt-4">Versão do App 1.2.0</p>
          </div>
          <div className="h-20"></div>
          <BottomNav />
        </div>
      </div>
    </div>
  );
}
