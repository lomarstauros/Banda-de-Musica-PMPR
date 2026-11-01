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
import { BottomNav } from '@/components/ui/bottom-nav';

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
    <div className="bg-transparent font-sans flex flex-col items-center lg:items-stretch w-full">
      <div className="relative w-full max-w-md lg:max-w-none bg-background-light dark:bg-[#121620]/90 backdrop-blur-xl lg:rounded-3xl lg:border lg:border-white/10 flex flex-col h-full min-h-screen lg:min-h-0 shadow-2xl">
        <header className="sticky top-0 z-10 bg-background-light/95 dark:bg-[#121620]/95 backdrop-blur-md px-4 lg:px-6 py-3.5 flex items-center justify-between border-b border-gray-200 dark:border-white/10 lg:rounded-t-3xl">
          <Link href="/admin/swaps">
            <button className="flex items-center justify-center p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors text-gray-900 dark:text-white">
              <span className="material-symbols-outlined">arrow_back_ios_new</span>
            </button>
          </Link>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white flex-1 text-center pr-10">Efetivo</h1>
        </header>

        <main className="flex-1 p-4 lg:p-6 flex flex-col gap-6 pb-24">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Quadro de Pessoal</h2>
              <Link href="/admin/musicians/new">
                <button className="bg-primary text-white p-2 rounded-full shadow-lg hover:bg-blue-700 transition-all active:scale-95">
                  <span className="material-symbols-outlined">person_add</span>
                </button>
              </Link>
            </div>

            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 flex items-center gap-4 shadow-sm">
              <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                <span className="material-symbols-outlined text-[28px]">groups</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wider">Efetivo Total</span>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-2xl font-black text-gray-900 dark:text-white leading-none">{musicians.length}</span>
                  <span className="text-sm font-medium text-gray-500 dark:text-gray-400">militares</span>
                </div>
              </div>
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

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filteredMusicians.map((musician) => {
              const currentStatus = getCurrentMilitaryStatus(musician);
              const displayName = musician.war_name || musician.name || 'Militar';

              return (
                <div key={musician.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4 flex items-start sm:items-center gap-3.5 shadow-sm hover:shadow-md transition-all group">
                  {musician.photo_url ? (
                    <div 
                      className="size-12 rounded-full bg-gray-100 dark:bg-gray-800 shrink-0 bg-cover bg-center border border-gray-200 dark:border-gray-700 shadow-sm"
                      style={{ backgroundImage: `url(${musician.photo_url})` }}
                    />
                  ) : (
                    <div className="size-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-600 dark:text-gray-300 font-bold text-xs uppercase border border-gray-200 dark:border-gray-700 shrink-0">
                      {displayName.slice(0, 3)}
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                      <h3 className="text-sm font-bold text-gray-900 dark:text-white break-words">
                        {musician.rank && (
                          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 mr-1.5">
                            {musician.rank}
                          </span>
                        )}
                        <span className="text-gray-900 dark:text-white font-extrabold">
                          {displayName}
                        </span>
                      </h3>

                      <div className="flex items-center gap-1">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                          musician.role === 'admin' || musician.role === 'Admin' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' :
                          musician.role === 'master' || musician.role === 'Master' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                          musician.role === 'Gestor' || musician.role === 'manager' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                          'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                        }`}>
                          {musician.role === 'master' || musician.role === 'Master' ? 'Master' :
                           musician.role === 'admin' || musician.role === 'Admin' ? 'Admin' :
                           musician.role === 'manager' || musician.role === 'Gestor' ? 'Gestor' :
                           'Efetivo'}
                        </span>
                        {currentStatus ? (
                          <span className="text-[9px] font-black bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400 px-1.5 py-0.5 rounded uppercase tracking-wider">
                            {currentStatus}
                          </span>
                        ) : (
                          <span className="text-[9px] font-black bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 px-1.5 py-0.5 rounded uppercase tracking-wider">
                            ATIVO
                          </span>
                        )}
                      </div>
                    </div>

                    {musician.name && musician.war_name && musician.name !== musician.war_name && (
                      <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate leading-tight">
                        {musician.name}
                      </p>
                    )}
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mt-0.5 truncate">
                      {musician.instrument || 'Instrumento não definido'}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 self-center">
                    <Link href={`/admin/musicians/${musician.id}/edit`}>
                      <button className="p-2 text-gray-400 hover:text-primary transition-colors" title="Editar">
                        <span className="material-symbols-outlined text-[20px]">edit</span>
                      </button>
                    </Link>
                    <button 
                      onClick={() => handleDelete(musician.id, displayName)}
                      className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                      title="Excluir"
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

        <BottomNav />
      </div>
    </div>
  );
}
