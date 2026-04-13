import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { readFileSync } from 'fs';

const firebaseConfig = JSON.parse(readFileSync('./firebase-applet-config.json', 'utf-8'));
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

async function testSignIn() {
  try {
    const cred = await signInWithEmailAndPassword(auth, 'teste@bm.pmpr.com', '123456');
    console.log("SUCCESS:", cred.user.uid);
  } catch(e) {
    console.log("FAILED:", e.code, e.message);
  }
}
testSignIn();
