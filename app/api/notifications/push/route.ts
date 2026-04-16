import { NextResponse } from 'next/server';
import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { join } from 'path';

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  try {
    // We try to find the service account file based on what we saw earlier
    const serviceAccountPath = '/Users/heliomardejesus/Downloads/banda-de-musica-pmpr-firebase-adminsdk-fbsvc-66a93792e8.json';
    const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  } catch (error) {
    console.error('Erro ao inicializar Firebase Admin:', error);
  }
}

export async function POST(request: Request) {
  try {
    const { userIds, title, body, scaleId } = await request.json();

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ error: 'Lista de IDs de usuário inválida' }, { status: 400 });
    }

    const db = admin.firestore();
    const messaging = admin.messaging();

    // Fetch tokens for all users
    const tokens: string[] = [];
    
    // We fetch profiles for the specific users
    const profilesSnap = await db.collection('profiles')
      .where(admin.firestore.FieldPath.documentId(), 'in', userIds)
      .get();

    profilesSnap.forEach(doc => {
      const data = doc.data();
      if (data.fcmTokens && Array.isArray(data.fcmTokens)) {
        tokens.push(...data.fcmTokens);
      }
    });

    if (tokens.length === 0) {
      return NextResponse.json({ success: true, message: 'Nenhum token encontrado para os usuários' });
    }

    // Filter unique tokens
    const uniqueTokens = [...new Set(tokens)];

    // Send multicast message
    const message = {
      notification: {
        title: title || 'Banda de Música PMPR',
        body: body || 'Você tem uma nova escala',
      },
      data: {
        scaleId: scaleId || '',
        click_action: scaleId ? `/scales/${scaleId}` : '/notifications',
      },
      tokens: uniqueTokens,
      webpush: {
        fcm_options: {
          link: scaleId ? `https://banda-de-musica-pmpr.vercel.app/scales/${scaleId}` : 'https://banda-de-musica-pmpr.vercel.app/notifications'
        },
        notification: {
          requireInteraction: true,
          icon: 'https://banda-de-musica-pmpr.vercel.app/brasao_banda.png'
        }
      }
    };

    const response = await messaging.sendEachForMulticast(message);

    console.log(`${response.successCount} mensagens enviadas com sucesso.`);
    
    // Cleanup invalid tokens if any (optional but good practice)
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
