'use client';

import { useEffect, useState } from 'react';
import { getToken, onMessage } from 'firebase/messaging';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db, messaging, auth } from '@/lib/firebase';

export const useNotifications = () => {
  const [fcmToken, setFcmToken] = useState<string | null>(null);

  useEffect(() => {
    const setupNotifications = async () => {
      try {
        const msg = await messaging();
        if (!msg) return;

        // Request permission
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          console.log('Permissão para notificações não concedida.');
          return;
        }

        // Get token
        const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
        if (!vapidKey) {
          console.error('NEXT_PUBLIC_FIREBASE_VAPID_KEY não está configurada.');
          return;
        }

        const currentToken = await getToken(msg, { vapidKey });
        if (currentToken) {
          setFcmToken(currentToken);
          
          // Save token to user profile if logged in
          if (auth.currentUser) {
            const userRef = doc(db, 'profiles', auth.currentUser.uid);
            await updateDoc(userRef, {
              fcmTokens: arrayUnion(currentToken)
            });
          }
        } else {
          console.log('Nenhum token FCM disponível.');
        }

        // Listen for foreground messages
        onMessage(msg, (payload) => {
          console.log('Mensagem recebida em primeiro plano:', payload);
          // Opcional: Mostrar uma notificação customizada ou alert se quiser
          if (payload.notification) {
            const { title, body } = payload.notification;
            new Notification(title || 'Nova Notificação', {
              body: body,
              icon: '/brasao_banda.png',
              requireInteraction: true
            });
          }
        });

      } catch (error) {
        console.error('Erro ao configurar notificações FCM:', error);
      }
    };

    // Só tenta configurar se estiver no cliente e o usuário mudar status (login/logout)
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        setupNotifications();
      }
    });

    return () => unsubscribe();
  }, []);

  return { fcmToken };
};
