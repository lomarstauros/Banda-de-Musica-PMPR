const admin = require('firebase-admin');
const serviceAccount = require('/Users/heliomardejesus/Downloads/banda-de-musica-pmpr-firebase-adminsdk-fbsvc-66a93792e8.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const auth = admin.auth();

async function resetMasterAccess() {
  const email = 'heliomardejesus87@gmail.com';
  const newPassword = '123456'; // Senha temporária - TROQUE IMEDIATAMENTE após o login

  console.log(`\n🔧 Recuperando acesso master para: ${email}\n`);

  try {
    // 1. Buscar o usuário no Firebase Auth
    let userRecord;
    try {
      userRecord = await auth.getUserByEmail(email);
      console.log('✅ Usuário encontrado no Firebase Auth');
      console.log(`   UID: ${userRecord.uid}`);
      console.log(`   Email: ${userRecord.email}`);
      console.log(`   Email verificado: ${userRecord.emailVerified}`);
    } catch (err) {
      console.log('❌ Usuário NÃO encontrado com esse email no Firebase Auth.');
      console.log('   Erro:', err.message);
      
      // Listar todos os usuários para ajudar a identificar
      console.log('\n📋 Listando todos os usuários cadastrados:');
      const listResult = await auth.listUsers(50);
      listResult.users.forEach((user) => {
        console.log(`   - ${user.email} (UID: ${user.uid})`);
      });
      process.exit(1);
    }

    // 2. Redefinir a senha
    await auth.updateUser(userRecord.uid, {
      password: newPassword,
      emailVerified: true, // Marcar email como verificado
    });
    console.log(`✅ Senha redefinida para: ${newPassword}`);
    console.log('✅ Email marcado como verificado');

    // 3. Garantir perfil master no Firestore
    const profileRef = db.collection('profiles').doc(userRecord.uid);
    const profileSnap = await profileRef.get();
    
    if (profileSnap.exists) {
      console.log('\n📄 Perfil existente no Firestore:', JSON.stringify(profileSnap.data(), null, 2));
    }

    await profileRef.set({
      role: 'master',
      status: 'active',
      forcePasswordReset: false,
      email: email,
    }, { merge: true });
    
    console.log('✅ Perfil Firestore atualizado: role=master, status=active');

    console.log('\n🎉 Acesso restaurado com sucesso!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   Email: ${email}`);
    console.log(`   Senha: ${newPassword}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('⚠️  IMPORTANTE: Troque a senha assim que fizer login!\n');

  } catch (error) {
    console.error('❌ Erro geral:', error.message);
  }

  process.exit();
}

resetMasterAccess();
