import * as admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

export function getAdminApp(): admin.app.App {
  const existingApp = admin.apps.find(app => app !== null);
  if (existingApp) {
    return existingApp;
  }

  try {
    // Busca a chave no diretório raiz do projeto bandas-de-musica-pmpr
    const serviceAccountPath = path.join(process.cwd(), 'service-account.json');
    
    if (!fs.existsSync(serviceAccountPath)) {
      throw new Error(`Arquivo de credenciais não encontrado em: ${serviceAccountPath}`);
    }

    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    
    return admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  } catch (error) {
    console.error('Erro ao inicializar Firebase Admin:', error);
    throw error;
  }
}

export const adminAuth = () => {
  const app = getAdminApp();
  return app ? admin.auth(app) : null;
};

export const adminDb = () => {
  const app = getAdminApp();
  return app ? admin.firestore(app) : null;
};
