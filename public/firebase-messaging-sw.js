// Scripts for firebase messaging service worker
importScripts("https://www.gstatic.com/firebasejs/10.11.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.11.0/firebase-messaging-compat.js");

// Initialize the Firebase app in the service worker by passing in the messagingSenderId.
firebase.initializeApp({
  projectId: "banda-de-musica-pmpr",
  appId: "1:450288699709:web:2cb0cffd8d923c1361dd54",
  apiKey: "AIzaSyDDp2JfXtiBN2LhpWQU14_hGq3ZehACjcw",
  authDomain: "banda-de-musica-pmpr.firebaseapp.com",
  messagingSenderId: "450288699709",
});

// Retrieve an instance of Firebase Messaging so that it can handle background messages.
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  // Se o payload já contém o objeto 'notification', o FCM exibe nativamente a notificação no navegador.
  // Só chamamos showNotification manualmente se for uma mensagem 'data-only' (sem payload.notification)
  // para evitar que o usuário receba duas notificações idênticas simultâneas.
  if (!payload.notification && payload.data) {
    const notificationTitle = payload.data.title || 'Banda de Música PMPR';
    const notificationOptions = {
      body: payload.data.body || 'Você tem uma nova escala de serviço',
      icon: '/brasao_banda.png',
      badge: '/brasao_banda.png',
      data: payload.data,
      requireInteraction: true
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || '/dashboard';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(urlToOpen) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
