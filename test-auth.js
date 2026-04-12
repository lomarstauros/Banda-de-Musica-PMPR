const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const fs = require('fs');

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const auth = getAuth(app);

// Use a fake email that was just created? We can't know the password the user used.
// Let's test creating one.
const { createUserWithEmailAndPassword, signOut } = require('firebase/auth');

async function test() {
  try {
    const cred = await createUserWithEmailAndPassword(auth, "testefake123@fake.com", "123456");
    console.log("Created. Verified:", cred.user.emailVerified);
    await signOut(auth);
    const loginCred = await signInWithEmailAndPassword(auth, "testefake123@fake.com", "123456");
    console.log("Logged In. Verified:", loginCred.user.emailVerified);
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
test();
