import * as admin from 'firebase-admin';

// Substitua pelo caminho absoluto que encontramos no seu sistema
const SERVICE_ACCOUNT_PATH = '/Users/heliomardejesus/Downloads/banda-de-musica-pmpr-firebase-adminsdk-fbsvc-66a93792e8.json';

export function getAdminApp() {
  if (admin.apps.length > 0) {
    return admin.apps[0];
  }

  try {
    // Usando require para carregar o JSON localmente como feito no reset-master.js
    const serviceAccount = require(SERVICE_ACCOUNT_PATH);
    
    return admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  } catch (error) {
    console.error('Erro ao inicializar Firebase Admin:', error);
    throw error;
  }
}

export const adminAuth = () => getAdminApp?.() ? admin.auth() : null;
export const adminDb = () => getAdminApp?.() ? admin.firestore() : null;
