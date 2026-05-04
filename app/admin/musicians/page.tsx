'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, onSnapshot, query, orderBy, deleteDoc, doc, getDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { sortByRankThenName } from '@/lib/sort-military';
import { getCurrentMilitaryStatus } from '@/lib/military-status';
import { handleFirestoreError, OperationType } from '@/lib/firestore-errors';
import { useFirebase } from '@/components/providers/firebase-provider';
import { useRouter } from 'next/navigation';

export default function AdminMusiciansListPage() {
  const [search, setSearch] = useState('');
  const [musicians, setMusicians] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const { user, loading: authLoading } = useFirebase();
  const router = useRouter();
  
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }

    const checkRoleAndFetch = async () => {
      try {
        // 1. Verificar se é admin/manager
        const profileSnap = await getDoc(doc(db, 'profiles', user.uid));
        const profileData = profileSnap.data();
        const role = (profileData?.role || '').toLowerCase();
        
        if (role !== 'admin' && role !== 'master' && role !== 'manager') {
          router.push('/dashboard');
          return;
        }

        // 2. Buscar Efetivo
        const q = query(collection(db, 'profiles'), orderBy('name', 'asc'));
        const unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
          const docs = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .sort(sortByRankThenName);
          setMusicians(docs);
          setLoading(false);
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, 'profiles');
          setLoading(false);
        });

        return unsubscribeSnapshot;
      } catch (err) {
        console.error('Erro ao verificar permissões:', err);
        setLoading(false);
      }
    };

    const unsubPromise = checkRoleAndFetch();
    return () => {
      unsubPromise.then(unsub => unsub?.());
    };
  }, [user, authLoading, router]);

  const handleDelete = async (id: string, name: string) => {
    if (window.confirm(`Tem certeza que deseja excluir ${name}?`)) {
      try {
        await deleteDoc(doc(db, 'profiles', id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `profiles/${id}`);
      }
    }
  };

  const filteredMusicians = musicians
    .filter(m =>
      (m.name?.toLowerCase() || '').includes(search.toLowerCase()) ||
      (m.war_name?.toLowerCase() || '').includes(search.toLowerCase()) ||
      (m.re || '').includes(search)
    )
    .sort(sortByRankThenName);

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
          <Link href="/admin/swaps">
            <button className="flex items-center justify-center p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors text-gray-900 dark:text-white">
              <span className="material-symbols-outlined">arrow_back_ios_new</span>
            </button>
          </Link>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white flex-1 text-center pr-10">Efetivo</h1>
        </header>

        <main className="flex-1 p-4 flex flex-col gap-6 pb-24">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Quadro de Pessoal</h2>
              <Link href="/admin/musicians/new">
                <button className="bg-primary text-white p-2 rounded-full shadow-lg hover:bg-blue-700 transition-all active:scale-95">
                  <span className="material-symbols-outlined">person_add</span>
                </button>
              </Link>
            </div>

            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                <span className="material-symbols-outlined">search</span>
              </div>
              <input 
                className="w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 pl-10 pr-4 py-3 text-sm focus:ring-2 focus:ring-primary outline-none" 
                placeholder="Buscar por nome ou RG..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {filteredMusicians.map((musician) => {
              const currentStatus = getCurrentMilitaryStatus(musician);
              return (
                <div key={musician.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4 flex items-center gap-4 shadow-sm hover:shadow-md transition-all group">
                  <div className="size-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500 font-bold text-sm uppercase border border-gray-200 dark:border-gray-700">
                    {musician.name?.split(' ').map((n: string) => n[0]).join('') || '??'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-gray-900 dark:text-white truncate">{musician.name}</h3>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                        musician.role === 'admin' || musician.role === 'Admin' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' :
                        musician.role === 'Gestor' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                        'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                      }`}>
                        {musician.role === 'musician' ? 'Músico' :
                         musician.role === 'admin' ? 'Admin' :
                         musician.role === 'manager' ? 'Gestor' :
                         musician.role}
                      </span>
                      {currentStatus && (
                        <span className="flex-none text-[8px] font-black bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400 px-1.5 py-0.5 rounded uppercase tracking-tighter">
                          {currentStatus}
                        </span>
                      )}
                    </div>
                  <p className="text-xs text-gray-500 truncate">{musician.instrument}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Link href={`/admin/musicians/${musician.id}/edit`}>
                    <button className="p-2 text-gray-400 hover:text-primary transition-colors">
                      <span className="material-symbols-outlined text-[20px]">edit</span>
                    </button>
                  </Link>
                  <button 
                    onClick={() => handleDelete(musician.id, musician.name)}
                    className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[20px]">delete</span>
                  </button>
                </div>
              </div>
            );
          })}
            {filteredMusicians.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <span className="material-symbols-outlined text-[48px] mb-2">person_off</span>
                <p className="text-sm">Nenhum integrante encontrado no Efetivo</p>
              </div>
            )}
          </div>
        </main>

        <nav className="fixed bottom-0 w-full max-w-md bg-white dark:bg-background-dark border-t border-gray-100 dark:border-gray-800 pb-safe pt-2 px-6 flex justify-between items-center z-40 pb-4">
          <Link href="/admin/swaps" className="flex flex-col items-center gap-1 text-gray-400">
            <span className="material-symbols-outlined">swap_horiz</span>
            <span className="text-[10px] font-medium">Permutas</span>
          </Link>
          <Link href="/admin/scales/new" className="flex flex-col items-center gap-1 text-gray-400">
            <span className="material-symbols-outlined">add_box</span>
            <span className="text-[10px] font-medium">Escalas</span>
          </Link>
          <Link href="/admin/musicians" className="flex flex-col items-center gap-1 text-primary">
            <span className="material-symbols-outlined filled">group</span>
            <span className="text-[10px] font-medium">Efetivo</span>
          </Link>
          <Link href="/login" className="flex flex-col items-center gap-1 text-gray-400">
            <span className="material-symbols-outlined">logout</span>
            <span className="text-[10px] font-medium">Sair</span>
          </Link>
        </nav>
      </div>
    </div>
  );
}
