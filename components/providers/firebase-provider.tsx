'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User, onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useRouter } from 'next/navigation';

export type UserRole = 'user' | 'admin' | 'master';

type FirebaseContextType = {
  user: User | null;
  profile: any | null;
  userRole: UserRole;
  unreadNotificationsCount: number;
  pendingSwapsCount: number;
  loading: boolean;
  logout: () => Promise<void>;
  refreshProfile: (targetUid?: string) => Promise<void>;
};

const FirebaseContext = createContext<FirebaseContextType | undefined>(undefined);

const CACHE_PROFILE_KEY = 'banda_pmpr_cached_profile';

export default function FirebaseProvider({ children }: { children: React.ReactNode }) {
  // Função para derivar o papel de usuário padronizado
  const computeRole = (pData: any, email?: string | null): UserRole => {
    if (email?.toLowerCase() === 'heliomardejesus87@gmail.com') return 'master';
    const role = (pData?.role || '').toLowerCase();
    if (role === 'master') return 'master';
    if (role === 'admin' || role === 'manager' || role === 'comando' || role === 'sargenteante') return 'admin';
    return 'user';
  };

  const getCachedProfile = (): any | null => {
    if (typeof window === 'undefined') return null;
    try {
      const cached = localStorage.getItem(CACHE_PROFILE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && (parsed.uid || parsed.id)) {
          return parsed;
        }
      }
    } catch {}
    return null;
  };

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any | null>(() => getCachedProfile());
  const [userRole, setUserRole] = useState<UserRole>(() => {
    const cached = getCachedProfile();
    return cached ? computeRole(cached, cached.email) : 'user';
  });
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState<number>(0);
  const [pendingSwapsCount, setPendingSwapsCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const refreshProfile = useCallback(async (targetUid?: string) => {
    const uid = targetUid || auth.currentUser?.uid;
    if (!uid) return;

    try {
      const snap = await getDoc(doc(db, 'profiles', uid));
      if (snap.exists()) {
        const data = { uid, id: uid, ...snap.data() };
        setProfile(data);
        setUserRole(computeRole(data, auth.currentUser?.email || (data as any).email));
        try {
          localStorage.setItem(CACHE_PROFILE_KEY, JSON.stringify(data));
        } catch {}
      }
    } catch (err) {
      console.warn('Erro ao atualizar perfil do usuário:', err);
    }
  }, []);

  useEffect(() => {
    let unsubNotifs: (() => void) | undefined;

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);

      if (currentUser) {
        // Carrega ou valida o perfil
        await refreshProfile(currentUser.uid);
        setLoading(false);

        // Listener único e centralizado de notificações não lidas
        try {
          const qNotif = query(
            collection(db, 'notifications'),
            where('userId', '==', currentUser.uid),
            where('read', '==', false)
          );
          unsubNotifs = onSnapshot(qNotif, (snap) => {
            const count = snap.size;
            setUnreadNotificationsCount(count);

            // Atualiza App Badge nativo (PWA)
            if (typeof navigator !== 'undefined' && 'setAppBadge' in navigator && 'clearAppBadge' in navigator) {
              if (count > 0) {
                (navigator as any).setAppBadge(count).catch(() => {});
              } else {
                (navigator as any).clearAppBadge().catch(() => {});
              }
            }
          }, (err) => {
            console.warn('Aviso no listener de notificações não lidas:', err);
          });
        } catch (e) {
          console.warn('Erro ao iniciar listener de notificações:', e);
        }

      } else {
        // Usuário deslogado
        setProfile(null);
        setUserRole('user');
        setUnreadNotificationsCount(0);
        setPendingSwapsCount(0);
        setLoading(false);
        try {
          localStorage.removeItem(CACHE_PROFILE_KEY);
        } catch {}

        if (typeof navigator !== 'undefined' && 'clearAppBadge' in navigator) {
          (navigator as any).clearAppBadge().catch(() => {});
        }
      }
    });

    return () => {
      unsubscribe();
      if (unsubNotifs) unsubNotifs();
    };
  }, [refreshProfile]);

  // Listener único de permutas pendentes baseado no userRole
  useEffect(() => {
    if (!user) return;

    let q;
    if (userRole === 'admin' || userRole === 'master') {
      q = query(
        collection(db, 'swaps'),
        where('status', '==', 'Aguardando Gestor')
      );
    } else {
      q = query(
        collection(db, 'swaps'),
        where('substitute_id', '==', user.uid),
        where('status', '==', 'Aguardando Parceiro')
      );
    }

    const unsub = onSnapshot(q, (snap) => {
      setPendingSwapsCount(snap.size);
    }, (err) => {
      console.warn('Aviso no listener de permutas pendentes:', err);
    });

    return () => unsub();
  }, [user, userRole]);

  const logout = async () => {
    try {
      await signOut(auth);
      setProfile(null);
      setUserRole('user');
      try {
        localStorage.removeItem(CACHE_PROFILE_KEY);
      } catch {}
      router.push('/login');
    } catch (error) {
      console.error('Erro ao sair:', error);
    }
  };

  return (
    <FirebaseContext.Provider
      value={{
        user,
        profile,
        userRole,
        unreadNotificationsCount,
        pendingSwapsCount,
        loading,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </FirebaseContext.Provider>
  );
}

export const useFirebase = () => {
  const context = useContext(FirebaseContext);
  if (context === undefined) {
    throw new Error('useFirebase must be used inside FirebaseProvider');
  }
  return context;
};
