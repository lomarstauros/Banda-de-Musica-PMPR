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

/**
 * Força a redefinição de acesso de um usuário: garante a existência no Auth e reseta a senha.
 */
export async function resetUserAccess(uid: string, email: string) {
  try {
    const app = getAdminApp();
    const auth = admin.auth(app);
    const defaultPassword = '123456';

    console.log(`[AuthAction] Resetando acesso para UID: ${uid}, Email: ${email}`);

    try {
      // 1. Tentar atualizar usuário existente
      await auth.updateUser(uid, {
        email: email,
        password: defaultPassword,
        emailVerified: true
      });
      console.log(`[AuthAction] Usuário ${uid} atualizado com sucesso.`);
    } catch (e: any) {
      if (e.code === 'auth/user-not-found') {
        // 2. Se não existir, criar novo com o mesmo UID
        console.log(`[AuthAction] Usuário não encontrado no Auth. Criando nova entrada com UID ${uid}...`);
        await auth.createUser({
          uid: uid,
          email: email,
          password: defaultPassword,
          emailVerified: true
        });
      } else {
        throw e;
      }
    }

    return { success: true };
  } catch (error: any) {
    console.error(`[AuthAction] Erro crítico no resetUserAccess:`, error.message);
    return { 
      success: false, 
      error: 'Falha ao redefinir acesso: ' + (error.message || error.code) 
    };
  }
}
