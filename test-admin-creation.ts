import { resetUserAccess } from './app/actions/auth-actions';
import { getAdminApp } from './lib/firebase-admin';
import * as admin from 'firebase-admin';

async function testCreateUser() {
  try {
    const app = getAdminApp();
    const db = admin.firestore(app);
    
    const email = 'teste.admin123@pmpr.pr.gov.br';
    const tempUid = db.collection('profiles').doc().id;
    
    console.log(`Testando criação do usuário ${email} com tempUid ${tempUid}...`);
    
    const authResult = await resetUserAccess(tempUid, email);
    
    if (!authResult.success) {
      console.error("Falha ao criar usuário Auth:", authResult.error);
      process.exit(1);
    }
    
    const finalUid = authResult.uid || tempUid;
    console.log("Usuário Auth criado com sucesso! UID:", finalUid);
    
    // Simulate Firestore saving
    await db.collection('profiles').doc(finalUid).set({
      name: 'Teste Admin SDK',
      email: email,
      role: 'musician',
      status: 'active',
      uid: finalUid,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log("Perfil criado no Firestore com sucesso!");
    
    // Cleanup
    await admin.auth(app).deleteUser(finalUid);
    await db.collection('profiles').doc(finalUid).delete();
    console.log("Limpeza de teste concluída.");
    process.exit(0);
  } catch (error) {
    console.error("Erro durante o teste:", error);
    process.exit(1);
  }
}

testCreateUser();
