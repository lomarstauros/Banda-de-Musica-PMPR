'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { motion } from 'motion/react';

export default function SuperAdminLogin() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    let finalEmail = username.trim();
    if (finalEmail === 'adm') {
      finalEmail = 'adm@pmpr.br';
    }

    try {
      await signInWithEmailAndPassword(auth, finalEmail, password);
      router.push('/super-admin/dashboard');
    } catch (err: any) {
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
          setError('Credenciais restritas inválidas ou conta Master não configurada no Firebase.');
      } else {
          setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white flex flex-col justify-center items-center font-sans selection:bg-red-500/30">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm p-8 flex flex-col gap-6 relative"
      >
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-red-500/20 rounded-full blur-[80px] pointer-events-none"></div>

        <div className="flex flex-col gap-2 items-center text-center relative z-10 mb-4">
          <div className="size-24 rounded-2xl bg-gradient-to-br from-red-600 to-red-900 border border-red-500/30 flex items-center justify-center shadow-lg shadow-red-900/50 mb-2 overflow-hidden relative group">
             <div className="absolute inset-0 bg-black/20 z-0"></div>
             <img src="/brasao_banda.png" alt="Banda PMPR Logo" className="h-full w-full object-contain p-2 z-10 drop-shadow-md group-hover:scale-110 transition-transform" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white">Sistema Master</h1>
          <p className="text-sm font-medium text-gray-400">Acesso Restrito ao Gestor Geral</p>
        </div>

        <form onSubmit={handleLogin} className="flex flex-col gap-4 relative z-10">
          {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-3 rounded-xl text-sm font-medium text-center">
              {error}
            </div>
          )}

          <label className="flex flex-col gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Usuário do Sistema</span>
            <input 
              type="text" 
              value={username} onChange={(e) => setUsername(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
              placeholder="Digite o ID Master"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Senha Master</span>
            <input 
              type="password" 
              value={password} onChange={(e) => setPassword(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
              placeholder="••••••••••••"
            />
          </label>

          <button 
            type="submit" disabled={loading}
            className="mt-4 bg-gradient-to-r from-red-600 to-red-800 hover:from-red-500 hover:to-red-700 text-white font-bold h-12 rounded-xl shadow-lg shadow-red-900/50 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            {loading ? <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span> : (
              <>
                Confirmar Identidade
                <span className="material-symbols-outlined text-[20px]">login</span>
              </>
            )}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
