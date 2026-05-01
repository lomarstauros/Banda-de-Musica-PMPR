import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function testAddUser() {
  try {
    const formData = {
      name: 'Teste Novo Usuário',
      war_name: 'Teste',
      email: 'teste.novo@pmpr.pr.gov.br',
      rank: 'Soldado QPM PM',
      instrument: 'Clarinete',
      role: 'musician',
      active: true,
    };
    
    console.log("Iniciando processo de salvamento...");
    const finalUid = doc(collection(db, 'profiles')).id;
    const finalProfileRef = doc(db, 'profiles', finalUid);
    
    await setDoc(finalProfileRef, {
      ...formData,
      uid: finalUid,
      createdAt: serverTimestamp(),
      forcePasswordReset: true,
      status: formData.active ? 'active' : 'pending'
    });
    
    console.log("Usuário salvo com sucesso no Firestore! UID:", finalUid);
    process.exit(0);
  } catch (error) {
    console.error("Erro ao salvar:", error);
    process.exit(1);
  }
}

testAddUser();
