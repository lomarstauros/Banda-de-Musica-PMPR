'use server';

import { getAdminApp } from '@/lib/firebase-admin';
import * as admin from 'firebase-admin';

/**
 * Atualiza o e-mail de um usuário no Firebase Authentication.
 * Esta função deve ser chamada apenas do lado do servidor via Server Actions.
 */
export async function updateUserAuthEmail(uid: string, newEmail: string) {
  try {
    // Inicializa o admin app
    const app = getAdminApp();
    const auth = admin.auth(app);
    
    // 1. Verificar se o e-mail já está em uso (opcional, o updateUser já lança erro se estiver)
    // Mas vamos fazer um log para facilitar debug
    console.log(`[AuthAction] Tentando atualizar e-mail do UID ${uid} para ${newEmail}`);

    // 2. Atualizar o usuário
    await auth.updateUser(uid, {
      email: newEmail,
      emailVerified: true // Marcamos como verificado para evitar travas no app
    });

    return { success: true };
  } catch (error: any) {
    console.error(`[AuthAction] Erro ao atualizar e-mail no Auth:`, error.code, error.message);
    
    if (error.code === 'auth/email-already-in-use') {
      return { 
        success: false, 
        error: 'Este e-mail já está em uso por outro usuário no sistema de login.' 
      };
    }
    
    if (error.code === 'auth/invalid-email') {
      return { 
        success: false, 
        error: 'O formato do e-mail é inválido.' 
      };
    }

    return { 
      success: false, 
      error: 'Erro técnico ao atualizar e-mail de login: ' + error.message 
    };
  }
}
