import * as admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

export function getAdminApp(): admin.app.App {
  const existingApp = admin.apps.find(app => app !== null);
  if (existingApp) {
    return existingApp;
  }
  try {
    const projectId = process.env.FIREBASE_PROJECT_ID || process.env.project_id;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL || process.env.client_email;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY || process.env.private_key;

    if (projectId && clientEmail && privateKey) {
      // Vercel costuma escapar o \n na chave privada. O replace formata de volta para o padrão esperado.
      const parsedKey = privateKey.replace(/\\n/g, '\n');
      
      return admin.initializeApp({
        credential: admin.credential.cert({
          projectId: projectId,
          clientEmail: clientEmail,
          privateKey: parsedKey,
        })
      });
    }

    // Fallback: Busca a chave no diretório raiz do projeto bandas-de-musica-pmpr (desenvolvimento local)
    const serviceAccountPath = path.join(process.cwd(), 'service-account.json');
    
    if (!fs.existsSync(serviceAccountPath)) {
      throw new Error(`Arquivo de credenciais não encontrado nem nas variáveis de ambiente nem em: ${serviceAccountPath}`);
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
