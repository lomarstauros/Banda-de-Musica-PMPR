import { NextResponse } from 'next/server';
import admin from 'firebase-admin';

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  try {
    const serviceAccountVar = process.env.FIREBASE_SERVICE_ACCOUNT;
    
    if (serviceAccountVar) {
      // Direct JSON string from environment variable (preferred for production)
      const serviceAccount = JSON.parse(serviceAccountVar);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    } else {
      // Local file fallback (useful for local development)
      const serviceAccountPath = '/Users/heliomardejesus/Downloads/banda-de-musica-pmpr-firebase-adminsdk-fbsvc-66a93792e8.json';
      const { readFileSync } = require('fs');
      const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    }
  } catch (error) {
    console.error('Erro ao inicializar Firebase Admin:', error);
  }
}

export async function POST(request: Request) {
  try {
    const { userIds, title, scaleId } = await request.json();

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ error: 'Lista de IDs de usuário inválida' }, { status: 400 });
    }

    const messaging = admin.messaging();
    const db = admin.firestore();

    // Fetch tokens for all users
    const tokens: string[] = [];
    
    // We fetch profiles for the specific users in chunks of 30 (Firestore limit for 'in')
    const chunks = [];
    for (let i = 0; i < userIds.length; i += 30) {
      chunks.push(userIds.slice(i, i + 30));
    }

    for (const chunk of chunks) {
      const profilesSnap = await db.collection('profiles')
        .where(admin.firestore.FieldPath.documentId(), 'in', chunk)
        .get();

      profilesSnap.forEach(doc => {
        const data = doc.data();
        if (data.fcmTokens && Array.isArray(data.fcmTokens)) {
          tokens.push(...data.fcmTokens);
        }
      });
    }

    if (tokens.length === 0) {
      return NextResponse.json({ success: true, message: 'Nenhum token encontrado para os usuários' });
    }

    // Filter unique and valid tokens
    const uniqueTokens = [...new Set(tokens)].filter(t => typeof t === 'string' && t.length > 0);

    if (uniqueTokens.length === 0) {
      return NextResponse.json({ success: true, message: 'Nenhum token válido encontrado' });
    }

    // Message configuration
    const messageTitle = title || 'Banda de Música PMPR';
    const messageBody = 'você tem uma nova escala de serviço'; // Standardized as requested
    const baseUrl = 'https://banda-de-musica-pmpr.vercel.app';
    const clickLink = scaleId ? `${baseUrl}/scales/${scaleId}` : `${baseUrl}/dashboard`;

    const message = {
      notification: {
        title: messageTitle,
        body: messageBody,
      },
      data: {
        scaleId: scaleId || '',
        url: clickLink,
      },
      tokens: uniqueTokens,
      webpush: {
        fcm_options: {
          link: clickLink
        },
        notification: {
          requireInteraction: true,
          icon: `${baseUrl}/brasao_banda.png`,
          badge: `${baseUrl}/brasao_banda.png`
        }
      }
    };

    const response = await messaging.sendEachForMulticast(message);

    console.log(`${response.successCount} mensagens enviadas com sucesso.`);
    
    if (response.failureCount > 0) {
      console.log(`${response.failureCount} falhas no envio.`);
    }

    return NextResponse.json({ 
      success: true, 
      count: response.successCount, 
      failures: response.failureCount 
    });

  } catch (error) {
    console.error('Erro na API de Notificações:', error);
    return NextResponse.json({ error: 'Erro interno ao enviar notificações' }, { status: 500 });
  }
}
