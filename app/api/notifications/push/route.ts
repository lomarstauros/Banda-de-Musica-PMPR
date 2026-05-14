import { NextResponse } from 'next/server';
import { getAdminApp } from '@/lib/firebase-admin';
import * as admin from 'firebase-admin';

export async function POST(request: Request) {
  try {
    const bodyArgs = await request.json();
    const { userIds, title, scaleId } = bodyArgs;

    console.log(`\n--- Nova Solicitação de Notificação Push ---`);
    console.log(`User IDs recebidos: ${userIds?.length || 0}`);
    console.log(`Escala ID: ${scaleId}`);

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      console.error('Erro: Lista de IDs de usuário vazia ou inválida.');
      return NextResponse.json({ error: 'Lista de IDs de usuário inválida' }, { status: 400 });
    }

    const app = getAdminApp();
    const messaging = admin.messaging(app || undefined);
    const db = admin.firestore(app || undefined);

    // Fetch tokens for all users
    const tokens: string[] = [];
    console.log(`Buscando tokens FCM para ${userIds.length} usuários no Firestore...`);
    
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

    console.log(`Tokens encontrados no total: ${tokens.length}`);

    if (tokens.length === 0) {
      console.warn('Aviso: Nenhum token encontrado para estes usuários. Verifique se eles permitiram notificações no navegador.');
      return NextResponse.json({ success: true, message: 'Nenhum token encontrado para os usuários' });
    }

    const uniqueTokens = [...new Set(tokens)].filter(t => typeof t === 'string' && t.length > 0);
    console.log(`Tokens únicos e válidos: ${uniqueTokens.length}`);

    if (uniqueTokens.length === 0) {
      return NextResponse.json({ success: true, message: 'Nenhum token válido encontrado' });
    }

    // Message configuration
    const messageTitle = title || 'Banda de Música PMPR';
    const messageBody = 'você tem uma nova escala de serviço'; 
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

    console.log('Enviando mensagem via multicast...');
    const response = await messaging.sendEachForMulticast(message);

    console.log(`Resultado do Multicast: ${response.successCount} sucessos, ${response.failureCount} falhas.`);
    
    if (response.failureCount > 0) {
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          console.error(`Falha no token ${idx}:`, resp.error);
        }
      });
    }

    return NextResponse.json({ 
      success: true, 
      count: response.successCount, 
      failures: response.failureCount 
    });

  } catch (error) {
    console.error('ERRO na API de Notificações:', error);
    return NextResponse.json({ error: 'Erro interno ao enviar notificações' }, { status: 500 });
  }
}
