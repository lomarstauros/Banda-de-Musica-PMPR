'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updatePassword, sendEmailVerification, signOut } from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  // Password Reset State
  const [needsPasswordReset, setNeedsPasswordReset] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Email Verification State
  const [needsVerification, setNeedsVerification] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }
    if (newPassword.length < 6) {
      setError('A nova senha deve ter pelo menos 6 dígitos.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      if (auth.currentUser) {
        await updatePassword(auth.currentUser, newPassword);
        const userRef = doc(db, "profiles", auth.currentUser.uid);
        // Mark as completed
        await updateDoc(userRef, {
          forcePasswordReset: false
        });
        setNeedsPasswordReset(false);
        router.push('/dashboard');
      }
    } catch (err: any) {
      setError('Erro ao atualizar a senha segura: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isLogin) {
        const userCred = await signInWithEmailAndPassword(auth, email, password);

        if (!userCred.user.emailVerified) {
          setNeedsVerification(true);
          await signOut(auth);
          setLoading(false);
          return;
        }

        // Verify if force password reset flag is active
        const profileSnap = await getDoc(doc(db, "profiles", userCred.user.uid));
        
        if (profileSnap.exists()) {
          const profileData = profileSnap.data();
          if (profileData.forcePasswordReset) {
            setNeedsPasswordReset(true);
            setLoading(false);
            return; // Hold here safely
          }
        }
        router.push('/dashboard');
      } else {
        const userCred = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, "profiles", userCred.user.uid), {
          id: userCred.user.uid,
          name: '',
          email: email,
          phone: '',
          rank: '',
          instrument: '',
          photo_url: 'https://picsum.photos/seed/profile/200/200',
          status: 'pending'
        });

        await sendEmailVerification(userCred.user);
        await signOut(auth);
        
        setIsLogin(true);
        setNeedsVerification(true);
        setVerificationSent(true);
        setLoading(false);
      }
    } catch (err: any) {
      if (err.code === 'auth/invalid-credential') {
        setError('E-mail ou senha incorretos.');
      } else if (err.code === 'auth/email-already-in-use') {
        setError('Este e-mail já está sendo usado por outra conta.');
      } else if (err.code === 'auth/operation-not-allowed') {
        setError('O login por E-mail não está ativado no Firebase.');
      } else {
        setError(err.message || 'Erro ao processar sua requisição.');
      }
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden group/design-root bg-background-light dark:bg-background-dark">
      <div className="flex flex-col items-center justify-center pt-16 pb-8 px-4 w-full">
        <div className="h-28 w-28 rounded-xl bg-[#1c1f27] flex items-center justify-center mb-6 overflow-hidden border border-[#3b4354] shadow-xl relative">
          <div className="absolute inset-0 bg-gradient-to-br from-[#135bec]/40 to-transparent"></div>
          <span className="material-symbols-outlined text-5xl text-white z-10 drop-shadow-md">music_note</span>
        </div>
        <h1 className="text-slate-900 dark:text-white text-[28px] font-bold leading-tight tracking-[-0.015em] text-center">
          {needsVerification ? 'Verifique seu e-mail' : (needsPasswordReset ? 'Segurança Inicial' : (isLogin ? 'Bem-vindo, Músico' : 'Criar Nova Conta'))}
        </h1>
        <p className="text-slate-500 dark:text-[#9da6b9] text-base font-normal leading-normal pt-2 text-center max-w-xs mx-auto">
          {needsVerification ? 'Para sua segurança, valide seu e-mail antes de acessar a plataforma da PM.' : (needsPasswordReset ? 'Sua conta foi criada por um gestor com senha provisória. Digite sua nova senha de uso pessoal.' : (isLogin ? 'Acesse suas escalas de serviço' : 'Preencha seus dados para começar'))}
        </p>
      </div>

      <motion.div 
        key={needsVerification ? "verify" : (needsPasswordReset ? "reset" : (isLogin ? "login" : "register"))}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col w-full max-w-[420px] mx-auto px-6 gap-6"
      >
        {needsPasswordReset ? (
          <form onSubmit={handlePasswordReset} className="flex flex-col gap-6">
            <label className="flex flex-col w-full">
              <p className="text-slate-900 dark:text-white text-base font-medium leading-normal pb-2">Nova Senha Pessoal</p>
              <input 
                className="flex w-full rounded-lg border border-slate-300 dark:border-[#3b4354] bg-white dark:bg-[#1c1f27] text-slate-900 dark:text-white focus:outline-0 focus:ring-2 focus:ring-primary focus:border-primary h-14 px-[15px]" 
                placeholder="No mínimo 6 caracteres" 
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </label>

            <label className="flex flex-col w-full">
              <p className="text-slate-900 dark:text-white text-base font-medium leading-normal pb-2">Confirmar Nova Senha</p>
              <input 
                className="flex w-full rounded-lg border border-slate-300 dark:border-[#3b4354] bg-white dark:bg-[#1c1f27] text-slate-900 dark:text-white focus:outline-0 focus:ring-2 focus:ring-primary focus:border-primary h-14 px-[15px]" 
                placeholder="Repita a senha" 
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </label>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-lg p-4 text-red-600 dark:text-red-300 text-sm">
                {error}
              </div>
            )}

            <button 
              type="submit"
              disabled={loading}
              className="flex items-center justify-center w-full h-14 bg-primary hover:bg-blue-600 text-white font-bold text-lg rounded-lg shadow-lg shadow-primary/25 transition-all active:scale-[0.98] mt-2 disabled:opacity-50"
            >
              {loading ? 'SALVANDO...' : 'ATUALIZAR E ENTRAR'}
            </button>
          </form>
        ) : needsVerification ? (
          <div className="flex flex-col gap-6 items-center text-center">
            <div className="size-20 rounded-full border-4 border-amber-100 dark:border-amber-900/30 bg-amber-50 dark:bg-amber-900/10 flex items-center justify-center text-amber-500 dark:text-amber-400 mb-2">
              <span className="material-symbols-outlined text-[40px]">mark_email_unread</span>
            </div>
            
            <p className="text-slate-600 dark:text-slate-300">
              {verificationSent 
                ? "Criamos sua conta! Um link de verificação foi enviado para " 
                : "Seu login foi bloqueado. Você precisa confirmar o e-mail "}
              <strong className="text-slate-900 dark:text-white block mt-1">{email}</strong>
            </p>
            
            <div className="bg-slate-50 dark:bg-[#151e2c] p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-sm text-slate-500 dark:text-slate-400">
              Procure na sua caixa de entrada principal ou na pasta de <strong>Spam/Lixo Eletrônico</strong>. Clique no link do e-mail e depois volte aqui para fazer login.
            </div>

            <button 
              onClick={() => {
                setNeedsVerification(false);
                setIsLogin(true);
                setPassword('');
              }}
              className="flex items-center justify-center w-full h-14 bg-primary hover:bg-blue-600 text-white font-bold text-lg rounded-lg shadow-lg shadow-primary/25 transition-all active:scale-[0.98]"
            >
              JÁ VERIFIQUEI, FAZER LOGIN
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <label className="flex flex-col w-full">
              <p className="text-slate-900 dark:text-white text-base font-medium leading-normal pb-2">E-mail</p>
              <div className="flex w-full items-stretch rounded-lg shadow-sm">
                <input 
                  className="flex w-full min-w-0 flex-1 rounded-l-lg border border-slate-300 dark:border-[#3b4354] bg-white dark:bg-[#1c1f27] text-slate-900 dark:text-white focus:outline-0 focus:ring-2 focus:ring-primary focus:border-primary h-14 px-[15px] text-base font-normal leading-normal placeholder:text-slate-400 dark:placeholder:text-[#9da6b9] border-r-0" 
                  placeholder="seu.email@pmpr.pr.gov.br" 
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <div className="text-slate-400 dark:text-[#9da6b9] flex border border-l-0 border-slate-300 dark:border-[#3b4354] bg-white dark:bg-[#1c1f27] items-center justify-center pr-[15px] pl-2 rounded-r-lg">
                  <span className="material-symbols-outlined text-[24px]">badge</span>
                </div>
              </div>
            </label>

            <label className="flex flex-col w-full">
              <div className="flex justify-between items-center pb-2">
                <p className="text-slate-900 dark:text-white text-base font-medium leading-normal">Senha</p>
              </div>
              <div className="flex w-full items-stretch rounded-lg shadow-sm">
                <input 
                  className="flex w-full min-w-0 flex-1 rounded-l-lg border border-slate-300 dark:border-[#3b4354] bg-white dark:bg-[#1c1f27] text-slate-900 dark:text-white focus:outline-0 focus:ring-2 focus:ring-primary focus:border-primary h-14 px-[15px] text-base font-normal leading-normal placeholder:text-slate-400 dark:placeholder:text-[#9da6b9] border-r-0" 
                  placeholder={isLogin ? "Digite sua senha" : "Crie uma senha forte"} 
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <div 
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-slate-400 dark:text-[#9da6b9] flex border border-l-0 border-slate-300 dark:border-[#3b4354] bg-white dark:bg-[#1c1f27] items-center justify-center pr-[15px] pl-2 rounded-r-lg cursor-pointer hover:text-primary transition-colors"
                >
                  <span className="material-symbols-outlined text-[24px]">
                    {showPassword ? "visibility_off" : "visibility"}
                  </span>
                </div>
              </div>
            </label>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-lg p-4 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                  <span className="material-symbols-outlined text-[20px]">error</span>
                  <p className="text-sm font-bold uppercase tracking-wide">Erro</p>
                </div>
                <p className="text-red-600 dark:text-red-300 text-sm leading-relaxed">
                  {error}
                </p>
              </div>
            )}

            {isLogin && (
              <div className="flex justify-end -mt-3">
                <a className="text-sm font-medium text-slate-500 hover:text-primary dark:text-[#9da6b9] dark:hover:text-white transition-colors" href="#">
                  Esqueci minha senha
                </a>
              </div>
            )}

            <div className="flex flex-col gap-4 mt-2">
              <button 
                type="submit"
                disabled={loading}
                className="flex items-center justify-center w-full h-14 bg-primary hover:bg-blue-600 text-white font-bold text-lg rounded-lg shadow-lg shadow-primary/25 transition-all active:scale-[0.98] disabled:opacity-50"
              >
                {loading ? 'PROCESSANDO...' : (isLogin ? 'ACESSAR' : 'CRIAR CONTA')}
              </button>
              
              <button 
                type="button" 
                onClick={() => {
                  setIsLogin(!isLogin);
                  setError(null);
                }}
                className="flex items-center justify-center w-full py-2 text-slate-500 dark:text-slate-400 hover:text-primary dark:hover:text-white transition-colors"
              >
                <span className="text-sm font-medium">
                  {isLogin ? 'Ainda não tem conta? Clique aqui' : 'Já tem uma conta? Faça login'}
                </span>
              </button>

              <button type="button" className="flex items-center justify-center gap-2 w-full py-2 text-slate-500 dark:text-slate-400 hover:text-primary dark:hover:text-white transition-colors opacity-80 hover:opacity-100">
                <span className="material-symbols-outlined text-[32px]">face</span>
              </button>
            </div>
          </form>
        )}
      </motion.div>

      <div className="flex-grow"></div>

      <div className="py-8 w-full text-center">
        <Link href="/admin/login">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full hover:bg-slate-100 dark:hover:bg-[#1c1f27] transition-colors cursor-pointer group">
            <span className="text-slate-500 dark:text-[#9da6b9] text-sm group-hover:text-slate-700 dark:group-hover:text-white transition-colors">É um gestor?</span>
            <span className="text-primary font-semibold text-sm group-hover:underline">Acesse aqui</span>
          </div>
        </Link>
      </div>
    </div>
  );
}
