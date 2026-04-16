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
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/brasao_banda.png',
    requireInteraction: true // This keeps the notification until the user clicks it
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
