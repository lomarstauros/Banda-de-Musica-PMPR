'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useState } from 'react';

export default function AdminLoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const userCred = await signInWithEmailAndPassword(auth, email, password);
      
      if (email.toLowerCase() === 'heliomardejesus87@gmail.com') {
        const userRef = doc(db, 'profiles', userCred.user.uid);
        await setDoc(userRef, { role: 'master', status: 'active', email: email }, { merge: true });
        router.push('/admin/swaps');
        return;
      }
      
      const profileSnap = await getDoc(doc(db, 'profiles', userCred.user.uid));
      
      if (profileSnap.exists()) {
        const data = profileSnap.data();
        const role = data.role?.toLowerCase();
        if (role === 'admin' || role === 'master') {
          router.push('/admin/swaps');
        } else {
          await auth.signOut();
          setError('Acesso negado. Apenas Gestores Oficiais podem acessar este painel.');
        }
      } else {
         await auth.signOut();
         setError('Perfil não encontrado no sistema.');
      }
    } catch (err: any) {
      if (err.code === 'auth/invalid-credential') setError('Credenciais de gestor incorretas.');
      else setError('Acesso negado: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex h-full min-h-screen w-full flex-col overflow-x-hidden max-w-md mx-auto bg-white dark:bg-background-dark shadow-xl">
      <div className="flex items-center bg-white dark:bg-background-dark p-4 pb-2 justify-between sticky top-0 z-10 border-b border-gray-100 dark:border-gray-800">
        <Link href="/login">
          <button className="text-[#111318] dark:text-white flex size-12 shrink-0 items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
        </Link>
        <h2 className="text-[#111318] dark:text-white text-lg font-bold leading-tight tracking-[-0.015em] flex-1 text-center pr-12">
          Acesso Administrativo
        </h2>
      </div>

      <div className="w-full bg-center bg-no-repeat bg-cover flex flex-col justify-end overflow-hidden bg-gray-100 dark:bg-gray-800 min-h-[220px] relative" 
        style={{ backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuAx-ExPnpWaPu-pHNMuENvAWhEZz_rPAfhC6cXHf5cY0YBvS8bXJN6LgEOuSI_7z6RfLuxtuzjrP6i9RDi46d4svkO3Gd-Snp0uy7w-hvzwxkRNa-QWnmC-z9a80yG0_L9n8Ut__uKqZIEuLNc-S_sewxs8H-mW-T_mteqlqRMMES5xQxSfq8qkMCdwpH4gvR13AVRtPjVFS3jUXbWXXMHPvmAzen-7xgBQO8EB3tgIENfC4e89TME0wScMha5k1jgasgZ-_6lQKQ3c")' }}>
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent"></div>
        
        {/* Floating Brasão */}
        <div className="absolute top-4 right-4 size-16 z-10 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 flex items-center justify-center shadow-2xl">
          <img src="/brasao_banda.png" alt="Brasão Banda" className="w-12 h-12 object-contain drop-shadow-lg" />
        </div>

        <div className="relative p-6">
          <div className="inline-flex items-center gap-2 bg-primary/90 text-white px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-2 backdrop-blur-sm shadow-sm">
            <span className="material-symbols-outlined text-[16px]">security</span>
            Área Restrita
          </div>
          <h3 className="text-white text-xl font-bold">Banda de Música PMPR</h3>
        </div>
      </div>

      <div className="px-4 pt-6 pb-2">
        <h1 className="text-[#111318] dark:text-white tracking-tight text-[32px] font-bold leading-tight text-center">
          Login do Gestor
        </h1>
        <p className="text-[#616f89] dark:text-gray-400 text-sm font-normal leading-normal pt-2 text-center max-w-xs mx-auto">
          Insira suas credenciais de oficial para acessar o painel de gerenciamento de escalas.
        </p>
      </div>

      <form onSubmit={handleAdminLogin} className="flex flex-col gap-4 px-4 py-4">
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-lg text-sm font-semibold text-center ring-1 ring-red-600/20">
            {error}
          </div>
        )}

        <label className="flex flex-col w-full">
          <p className="text-[#111318] dark:text-gray-200 text-base font-medium leading-normal pb-2">Identificação Administrativa (E-mail)</p>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none text-[#616f89]">
              <span className="material-symbols-outlined">badge</span>
            </div>
            <input 
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex w-full min-w-0 flex-1 rounded-xl text-[#111318] dark:text-white border border-[#dbdfe6] dark:border-gray-600 bg-white dark:bg-gray-800 focus:border-primary focus:ring-1 focus:ring-primary h-14 placeholder:text-[#616f89] pl-[48px] pr-[15px] text-base font-normal leading-normal transition-all" 
              placeholder="admin@pmpr.br" 
              type="email"
            />
          </div>
        </label>

        <label className="flex flex-col w-full">
          <div className="flex justify-between items-baseline pb-2">
            <p className="text-[#111318] dark:text-gray-200 text-base font-medium leading-normal">Senha</p>
          </div>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none text-[#616f89]">
              <span className="material-symbols-outlined">lock</span>
            </div>
            <input 
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="flex w-full min-w-0 flex-1 rounded-xl text-[#111318] dark:text-white border border-[#dbdfe6] dark:border-gray-600 bg-white dark:bg-gray-800 focus:border-primary focus:ring-1 focus:ring-primary h-14 placeholder:text-[#616f89] pl-[48px] pr-[48px] text-base font-normal leading-normal transition-all" 
              placeholder="••••••••" 
              type={showPassword ? "text" : "password"}
            />
            <button 
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 flex items-center pr-4 text-[#616f89] hover:text-primary transition-colors focus:outline-none"
            >
              <span className="material-symbols-outlined">{showPassword ? "visibility_off" : "visibility"}</span>
            </button>
          </div>
        </label>

        <div className="flex justify-end">
          <a className="text-sm font-medium text-primary hover:text-blue-700 transition-colors" href="#">
            Esqueceu a senha?
          </a>
        </div>

        <div className="pt-2">
          <button 
            type="submit"
            disabled={loading}
            className="flex w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl h-12 px-5 bg-primary hover:bg-blue-700 text-white text-base font-bold leading-normal tracking-[0.015em] shadow-lg shadow-blue-500/20 transition-all active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100"
          >
            {loading ? (
              <span className="material-symbols-outlined animate-spin text-[24px]">progress_activity</span>
            ) : (
              <>
                <span className="truncate">Acessar Painel Gestor</span>
                <span className="material-symbols-outlined ml-2 text-[20px]">login</span>
              </>
            )}
          </button>
        </div>
      </form>

      <div className="h-px bg-gray-200 dark:bg-gray-700 mx-4 my-2"></div>

      <div className="px-4 py-4 flex flex-col items-center justify-center gap-3">
        <p className="text-sm text-[#616f89] dark:text-gray-400">Não é um gestor?</p>
        <Link href="/login">
          <div className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-sm font-bold transition-colors cursor-pointer">
            <span className="material-symbols-outlined mr-2 text-[18px]">music_note</span>
            Entrar como Músico
          </div>
        </Link>
      </div>
    </div>
  );
}
