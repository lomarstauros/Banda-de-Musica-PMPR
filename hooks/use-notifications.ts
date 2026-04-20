'use client';

import { useEffect, useState } from 'react';
import { getToken, onMessage } from 'firebase/messaging';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db, messaging, auth } from '@/lib/firebase';

export const useNotifications = () => {
  const [fcmToken, setFcmToken] = useState<string | null>(null);

  const setupNotifications = async (isManual = false) => {
    console.log('--- Iniciando configuração de notificações ---');
    try {
      if (typeof window === 'undefined' || !('Notification' in window)) {
        console.warn('Este navegador não suporta notificações de desktop.');
        if (isManual) alert('Este navegador não suporta notificações.');
        return;
      }

      const msg = await messaging();
      if (!msg) {
        console.error('Falha ao obter instância de messaging.');
        if (isManual) alert('Erro: Não foi possível carregar o sistema de mensagens do Firebase.');
        return;
      }

      // Request permission
      console.log('Solicitando permissão...');
      const permission = await Notification.requestPermission();
      console.log('Status da permissão:', permission);

      if (permission !== 'granted') {
        console.warn('Permissão para notificações não concedida.');
        if (isManual) alert('Permissão negada. Você precisa permitir notificações nas configurações do navegador.');
        return;
      }

      // Get token
      const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
      if (!vapidKey) {
        console.error('NEXT_PUBLIC_FIREBASE_VAPID_KEY não está configurada.');
        if (isManual) alert('Erro interno: Chave VAPID ausente.');
        return;
      }

      console.log('Solicitando token FCM...');
      const currentToken = await getToken(msg, { vapidKey });
      
      if (currentToken) {
        console.log('Token FCM obtido:', currentToken);
        setFcmToken(currentToken);
        
        // Save token to user profile if logged in
        if (auth.currentUser) {
          console.log('Salvando token no Firestore para o usuário:', auth.currentUser.uid);
          const userRef = doc(db, 'profiles', auth.currentUser.uid);
          await updateDoc(userRef, {
            fcmTokens: arrayUnion(currentToken)
          });
          console.log('Token salvo com sucesso no banco de dados.');
          if (isManual) alert('Notificações ativadas com sucesso neste aparelho!');
        } else {
          console.warn('Usuário não logado. Token não foi salvo no banco.');
          if (isManual) alert('Token gerado, mas você precisa estar logado para salvá-lo.');
        }
      } else {
        console.warn('Nenhum token FCM disponível.');
        if (isManual) alert('Não foi possível gerar um token. Tente novamente mais tarde.');
      }

      // Listen for foreground messages
      onMessage(msg, (payload) => {
        console.log('Mensagem recebida em primeiro plano:', payload);
        if (payload.notification) {
          const { title, body } = payload.notification;
          new Notification(title || 'Nova Notificação', {
            body: body,
            icon: '/brasao_banda.png',
            requireInteraction: true
          });
        }
      });

    } catch (error: any) {
      console.error('Erro ao configurar notificações FCM:', error);
      if (isManual) alert('Erro ao configurar notificações: ' + error.message);
    }
  };

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        // Tenta registrar automaticamente ao logar
        setupNotifications(false);
      }
    });

    return () => unsubscribe();
  }, []);

  return { fcmToken, setupNotifications };
};
