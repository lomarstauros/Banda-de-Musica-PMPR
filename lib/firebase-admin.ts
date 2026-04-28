import * as admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

export function getAdminApp(): admin.app.App {
  const existingApp = admin.apps.find(app => app !== null);
  if (existingApp) {
    return existingApp;
  }
  try {
    // Tenta carregar as credenciais das variáveis de ambiente (Vercel)
    if (process.env.project_id && process.env.client_email && process.env.private_key) {
      // Vercel costuma escapar o \n na chave privada. O replace formata de volta para o padrão esperado.
      const parsedKey = process.env.private_key.replace(/\\n/g, '\n');
      
      return admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.project_id,
          clientEmail: process.env.client_email,
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
