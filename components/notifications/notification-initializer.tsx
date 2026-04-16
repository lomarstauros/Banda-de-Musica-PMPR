'use client';

import { useNotifications } from '@/hooks/use-notifications';

export default function NotificationInitializer() {
  // Chamamos o hook que gerencia as permissões e tokens FCM
  useNotifications();
  
  // Este componente não renderiza nada visualmente
  return null;
}
