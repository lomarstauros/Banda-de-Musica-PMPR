'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updatePassword, verifyBeforeUpdateEmail, sendEmailVerification, sendPasswordResetEmail, signOut } from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  // Password Reset State
  const [needsPasswordReset, setNeedsPasswordReset] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Forgot password state
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotEmailSent, setForgotEmailSent] = useState(false);

  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
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
        // 1. Update the password
        await updatePassword(auth.currentUser, newPassword.trim());
        
        const userRef = doc(db, "profiles", auth.currentUser.uid);
        
        // 2. Just update the profile to remove the reset flag
        await updateDoc(userRef, {
          forcePasswordReset: false,
          email: auth.currentUser.email
        });
        
        setNeedsPasswordReset(false);
        router.push('/dashboard');
      }
    } catch (err: any) {
      if (err.code === 'auth/network-request-failed') {
        setError('Falha de conexão com o servidor. Verifique sua internet e tente clicar em "Atualizar e Entrar" novamente.');
      } else {
        setError('Erro ao atualizar credenciais: ' + (err.message || err.code));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const targetEmail = forgotEmail.trim().toLowerCase();
      if (!targetEmail) {
        setError('Por favor, informe seu e-mail.');
        return;
      }
      await sendPasswordResetEmail(auth, targetEmail);
      setForgotEmailSent(true);
    } catch (err: any) {
      if (err.code === 'auth/user-not-found') {
        setError('Nenhuma conta encontrada com este e-mail.');
      } else if (err.code === 'auth/invalid-email') {
        setError('E-mail inválido. Verifique e tente novamente.');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Muitas tentativas. Aguarde um momento e tente novamente.');
      } else {
        setError('Erro ao enviar e-mail de recuperação: ' + err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const cleanEmail = email.trim().toLowerCase();
      const userCred = await signInWithEmailAndPassword(auth, cleanEmail, password.trim());

      // Verify if force password reset flag is active first (for provisional accounts)
      const profileSnap = await getDoc(doc(db, "profiles", userCred.user.uid));
      
      if (profileSnap.exists()) {
        const profileData = profileSnap.data();
        if (profileData.forcePasswordReset) {
          setNeedsPasswordReset(true);
          setNewEmail(userCred.user.email || ''); // Pre-fill with the email the manager entered
          setLoading(false);
          return; // Hold here safely to force reset flow
        }
      }

      router.push('/dashboard');
    } catch (err: any) {
      if (err.code === 'auth/invalid-credential') {
        setError('E-mail ou senha incorretos.');
      } else if (err.code === 'auth/user-not-found') {
        setError('Usuário não encontrado. O gestor precisa cadastrar seu e-mail pessoal antes do primeiro acesso.');
      } else {
        setError(`Erro técnico [${err.code}]: ` + (err.message || 'Erro ao processar sua requisição.'));
      }
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden group/design-root bg-background-light dark:bg-background-dark">
      <div className="flex flex-col items-center justify-center pt-16 pb-8 px-4 w-full">
        <div className="h-28 w-28 rounded-xl bg-[#1c1f27] flex items-center justify-center mb-6 overflow-hidden border border-[#3b4354] shadow-xl relative group">
          <div className="absolute inset-0 bg-gradient-to-br from-[#135bec]/40 to-transparent"></div>
          <img src="/brasao_banda.png" alt="Banda PMPR Logo" className="h-full w-full object-contain p-3 z-10 drop-shadow-md group-hover:scale-110 transition-transform" />
        </div>
        <h1 className="text-slate-900 dark:text-white text-[28px] font-bold leading-tight tracking-[-0.015em] text-center">
          {showForgotPassword ? 'Recuperar Senha' : (needsPasswordReset ? 'Configuração de Segurança' : 'Bem-vindo, Músico')}
        </h1>
        <p className="text-slate-500 dark:text-[#9da6b9] text-base font-normal leading-normal pt-2 text-center max-w-xs mx-auto">
          {showForgotPassword ? 'Informe seu e-mail cadastrado para receber o link de redefinição de senha.' : (needsPasswordReset ? 'Este é seu primeiro acesso. Por segurança, você deve definir uma nova Senha Pessoal agora.' : 'Acesse suas escalas de serviço')}
        </p>
      </div>

      <motion.div 
        key={showForgotPassword ? "forgot" : (needsPasswordReset ? "reset" : "login")}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col w-full max-w-[420px] mx-auto px-6 gap-6"
      >
        {showForgotPassword ? (
          <div className="flex flex-col gap-6">
            {forgotEmailSent ? (
              <div className="flex flex-col gap-6 items-center text-center">
                <div className="size-20 rounded-full border-4 border-green-100 dark:border-green-900/30 bg-green-50 dark:bg-green-900/10 flex items-center justify-center text-green-500 dark:text-green-400 mb-2">
                  <span className="material-symbols-outlined text-[40px]">mark_email_read</span>
                </div>
                <p className="text-slate-600 dark:text-slate-300">
                  Enviamos um link de redefinição de senha para:
                  <strong className="text-slate-900 dark:text-white block mt-1">{forgotEmail}</strong>
                </p>
                <div className="bg-slate-50 dark:bg-[#151e2c] p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-sm text-slate-500 dark:text-slate-400">
                  Acesse sua caixa de entrada e clique no link para definir uma nova senha. Verifique também a pasta de <strong>Spam/Lixo Eletrônico</strong>.
                </div>
                <button 
                  onClick={() => {
                    setShowForgotPassword(false);
                    setForgotEmailSent(false);
                    setForgotEmail('');
                    setError(null);
                  }}
                  className="flex items-center justify-center w-full h-14 bg-primary hover:bg-blue-600 text-white font-bold text-lg rounded-lg shadow-lg shadow-primary/25 transition-all active:scale-[0.98]"
                >
                  VOLTAR AO LOGIN
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword} className="flex flex-col gap-6">
                <label className="flex flex-col w-full">
                  <p className="text-slate-900 dark:text-white text-base font-medium leading-normal pb-2">E-mail cadastrado</p>
                  <div className="flex w-full items-stretch rounded-lg shadow-sm">
                    <input 
                      className="flex w-full min-w-0 flex-1 rounded-l-lg border border-slate-300 dark:border-[#3b4354] bg-white dark:bg-[#1c1f27] text-slate-900 dark:text-white focus:outline-0 focus:ring-2 focus:ring-primary focus:border-primary h-14 px-[15px] text-base font-normal leading-normal placeholder:text-slate-400 dark:placeholder:text-[#9da6b9] border-r-0" 
                      placeholder="seu.email@exemplo.com" 
                      type="email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      required
                    />
                    <div className="text-slate-400 dark:text-[#9da6b9] flex border border-l-0 border-slate-300 dark:border-[#3b4354] bg-white dark:bg-[#1c1f27] items-center justify-center pr-[15px] pl-2 rounded-r-lg">
                      <span className="material-symbols-outlined text-[24px]">mail</span>
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

                <button 
                  type="submit"
                  disabled={loading}
                  className="flex items-center justify-center w-full h-14 bg-primary hover:bg-blue-600 text-white font-bold text-lg rounded-lg shadow-lg shadow-primary/25 transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  {loading ? 'ENVIANDO...' : 'ENVIAR LINK DE RECUPERAÇÃO'}
                </button>

                <button 
                  type="button"
                  onClick={() => {
                    setShowForgotPassword(false);
                    setError(null);
                    setForgotEmail('');
                  }}
                  className="flex items-center justify-center gap-2 w-full py-3 text-slate-500 dark:text-slate-400 hover:text-primary dark:hover:text-white transition-colors text-sm font-medium"
                >
                  <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                  Voltar ao login
                </button>
              </form>
            )}
          </div>
        ) : needsPasswordReset ? (
          <form onSubmit={handlePasswordReset} className="flex flex-col gap-6">
            {/* Remover campo de e-mail para simplificar e evitar erros de rede */}
            <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-sm mb-2 text-center text-slate-600 dark:text-slate-400">
               Logado como: <strong className="text-slate-900 dark:text-slate-200">{newEmail}</strong>
            </div>

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

            <div className="flex flex-col w-full">
              <div className="flex justify-between items-center pb-2">
                <p className="text-slate-900 dark:text-white text-base font-medium leading-normal">Senha</p>
                <button 
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowForgotPassword(true);
                    setError(null);
                    setForgotEmail(email);
                  }}
                  className="text-primary text-sm font-medium hover:text-blue-600 transition-colors hover:underline"
                >
                  Esqueceu a senha?
                </button>
              </div>
              <div className="flex w-full items-stretch rounded-lg shadow-sm">
                <input 
                  className="flex w-full min-w-0 flex-1 rounded-l-lg border border-slate-300 dark:border-[#3b4354] bg-white dark:bg-[#1c1f27] text-slate-900 dark:text-white focus:outline-0 focus:ring-2 focus:ring-primary focus:border-primary h-14 px-[15px] text-base font-normal leading-normal placeholder:text-slate-400 dark:placeholder:text-[#9da6b9] border-r-0" 
                  placeholder="Digite sua senha" 
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button 
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowPassword(!showPassword);
                  }}
                  className="text-slate-400 dark:text-[#9da6b9] flex border border-l-0 border-slate-300 dark:border-[#3b4354] bg-white dark:bg-[#1c1f27] items-center justify-center pr-[15px] pl-2 rounded-r-lg cursor-pointer hover:text-primary transition-colors"
                >
                  <span className="material-symbols-outlined text-[24px]">
                    {showPassword ? "visibility_off" : "visibility"}
                  </span>
                </button>
              </div>
            </div>

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

            <div className="flex flex-col gap-4 mt-2">
              <button 
                type="submit"
                disabled={loading}
                className="flex items-center justify-center w-full h-14 bg-primary hover:bg-blue-600 text-white font-bold text-lg rounded-lg shadow-lg shadow-primary/25 transition-all active:scale-[0.98] disabled:opacity-50"
              >
                {loading ? 'PROCESSANDO...' : 'ACESSAR'}
              </button>

              <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/50 rounded-xl p-4 mt-2">
                 <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                   <strong>Primeiro acesso?</strong> Utilize seu e-mail pessoal cadastrado pelo Comando e a senha padrão <strong>123456</strong> para configurar sua senha definitiva.
                 </p>
              </div>

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
