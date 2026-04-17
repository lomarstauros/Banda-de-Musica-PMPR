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
    const authAdmin = admin.auth(app);
    
    // Limpeza profunda do e-mail
    const cleanEmail = newEmail.trim().toLowerCase().replace(/\s/g, '');
    
    // 1. Verificar se o e-mail já está em uso
    console.log(`[AuthAction] Tentando atualizar e-mail do UID ${uid} para [${cleanEmail}]`);

    // 2. Atualizar o usuário
    await authAdmin.updateUser(uid, {
      email: cleanEmail,
      emailVerified: true
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
    const authAdmin = admin.auth(app);
    const defaultPassword = '123456';

    // Limpeza profunda do e-mail
    const cleanEmail = email.trim().toLowerCase().replace(/\s/g, '');

    console.log(`[AuthAction] Resetando acesso para UID: ${uid}, Email Original: "${email}", Email Limpo: "${cleanEmail}"`);

    if (!cleanEmail || !cleanEmail.includes('@')) {
      return { success: false, error: 'E-mail inválido ou vazio após limpeza.' };
    }

    try {
      // 1. Tentar atualizar usuário existente
      await authAdmin.updateUser(uid, {
        email: cleanEmail,
        password: defaultPassword,
        emailVerified: true
      });
      console.log(`[AuthAction] Usuário ${uid} atualizado com sucesso.`);
    } catch (e: any) {
      if (e.code === 'auth/user-not-found') {
        // 2. Se não existir, criar novo com o mesmo UID
        console.log(`[AuthAction] Usuário não encontrado no Auth. Criando com UID ${uid} e email ${cleanEmail}...`);
        await authAdmin.createUser({
          uid: uid,
          email: cleanEmail,
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
