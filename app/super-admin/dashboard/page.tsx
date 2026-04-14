'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { LogoutButton } from '@/components/ui/logout-button';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '@/firebase-applet-config.json';

// Initialize a secondary app just for creating accounts without dropping the main admin's session
const secondaryApp = getApps().find(app => app.name === 'SecondaryApp') || initializeApp(firebaseConfig, 'SecondaryApp');
const secondaryAuth = getAuth(secondaryApp);

export default function SuperAdminDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: 'musician' // musician | admin
  });

  const generateEmail = (fullName: string) => {
    const baseName = (fullName.split(' ')[0] || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
    return baseName ? `${baseName}@bm.pmpr.com` : '';
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      // 1. Create User in Firebase using the secondary auth instance
      // The user requested '12345' as standard password, though Firebase requires 6 chars minimum usually. We will use '123456' as standard. 
      // Wait! The user asked for "12345". I will send "123456" and tell them in UI because Firebase rejects 5 chars. Or I use "123456". Let's use 123456 and explain.
      const standardPassword = '123456'; 
      const provisionalEmail = generateEmail(formData.name);
      
      const userCred = await createUserWithEmailAndPassword(secondaryAuth, provisionalEmail, standardPassword);
      const newUid = userCred.user.uid;

      // 2. Set profile in Firestore with forcePasswordReset flag
      await setDoc(doc(db, 'profiles', newUid), {
        name: formData.name,
        email: provisionalEmail,
        role: formData.role,
        forcePasswordReset: true,
        created_at: new Date().toISOString()
      });

      // 3. Clear secondary auth just to be clean
      await secondaryAuth.signOut();

      setSuccess(true);
      setFormData({ name: '', email: '', role: 'musician' });
      setTimeout(() => setSuccess(false), 3000);

    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/weak-password') setError('Falha: Firebase exige senha com mínimo 6 dígitos (O padrão setado foi 123456).');
      else if (err.code === 'auth/email-already-in-use') setError('Este e-mail já está em uso.');
      else setError('Erro ao criar usuário: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white font-sans selection:bg-red-500/30">
      <header className="sticky top-0 z-50 flex items-center justify-between border-b border-red-900/30 bg-[#0A0A0A]/90 backdrop-blur-md px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-gradient-to-br from-red-600 to-red-900 border border-red-500/30 flex items-center justify-center shadow-lg shadow-red-900/50">
             <span className="material-symbols-outlined text-[20px] text-white">admin_panel_settings</span>
          </div>
          <div>
            <h1 className="text-lg font-bold">Painel Master</h1>
            <p className="text-[10px] uppercase font-bold text-red-500 tracking-wider">Criação de Contas</p>
          </div>
        </div>
        <LogoutButton />
      </header>

      <main className="max-w-xl mx-auto p-6 flex flex-col gap-8">
        
        <div className="flex flex-col gap-3">
          <div className="bg-red-900/10 border border-red-900/30 rounded-2xl p-6 flex flex-col gap-2">
            <h2 className="text-xl font-bold flex items-center gap-2 text-white">
              <span className="material-symbols-outlined text-red-500">person_add</span>
              Gerador de Credenciais
            </h2>
            <p className="text-sm text-gray-400">
              Crie novas contas para Músicos ou Gestores. A conta será criada com a senha padrão <strong>123456</strong> e o usuário será obrigado a trocar a senha no primeiro acesso.
            </p>
          </div>

          <Link href="/admin/master/logs">
            <button className="bg-white/5 border border-white/10 hover:bg-white/10 rounded-2xl p-6 flex items-center justify-between transition-all group">
              <div className="flex items-center gap-4">
                <div className="size-12 rounded-xl bg-red-600/20 flex items-center justify-center text-red-500 group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined text-[32px]">security</span>
                </div>
                <div className="flex flex-col text-left">
                  <h3 className="text-lg font-bold text-white uppercase tracking-tight">Auditoria de Escalas</h3>
                  <p className="text-xs text-gray-400">Verificar quem alterou datas e horários</p>
                </div>
              </div>
              <span className="material-symbols-outlined text-gray-500 group-hover:translate-x-1 transition-transform">arrow_forward_ios</span>
            </button>
          </Link>
        </div>

        <form onSubmit={handleCreateUser} className="flex flex-col gap-5 bg-white/5 border border-white/10 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
          {success && (
            <motion.div initial={{opacity:0, y:-10}} animate={{opacity:1, y:0}} className="bg-green-500/20 border border-green-500/50 text-green-400 p-4 rounded-xl text-sm font-medium flex flex-col items-center justify-center gap-2 absolute inset-0 z-20 backdrop-blur-sm">
               <span className="material-symbols-outlined text-4xl">check_circle</span>
               <p>Usuário criado com sucesso!</p>
            </motion.div>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-3 rounded-xl text-sm font-medium">
              {error}
            </div>
          )}

          <label className="flex flex-col gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Tipo de Acesso</span>
            <select 
              value={formData.role} onChange={(e) => setFormData({...formData, role: e.target.value})}
              className="bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-red-500 appearance-none"
            >
              <option value="musician">Comum (Músico)</option>
              <option value="admin">Oficialato (Gestor Administrativo)</option>
            </select>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Nome Completo</span>
            <input 
              required
              type="text" 
              value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})}
              className="bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
              placeholder="Ex: Sgt. Silva"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">E-mail Operacional (Automático)</span>
            <input 
              disabled
              type="email" 
              value={generateEmail(formData.name)}
              className="bg-black/20 border border-white/5 rounded-xl px-4 py-3 text-gray-400 focus:outline-none cursor-not-allowed"
              placeholder="oficial@bm.pmpr.com"
            />
          </label>

          <button 
            type="submit" disabled={loading}
            className="mt-6 bg-gradient-to-r from-red-600 to-red-800 hover:from-red-500 hover:to-red-700 text-white font-bold h-12 rounded-xl shadow-lg shadow-red-900/50 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            {loading ? <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span> : (
              <>
                <span className="material-symbols-outlined text-[20px]">how_to_reg</span>
                Finalizar Cadastro Forçado
              </>
            )}
          </button>
        </form>

      </main>
    </div>
  );
}
