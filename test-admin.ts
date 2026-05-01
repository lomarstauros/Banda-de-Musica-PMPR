import { getAdminApp } from './lib/firebase-admin';
import * as admin from 'firebase-admin';

async function test() {
  try {
    const app = getAdminApp();
    const authAdmin = admin.auth(app);
    console.log("Got admin app");
    
    const uid = 'test-uid-12345';
    const cleanEmail = 'test_manager@gmail.com';
    const defaultPassword = '123456';
    
    console.log("Creating user...");
    await authAdmin.createUser({
      uid: uid,
      email: cleanEmail,
      password: defaultPassword,
      emailVerified: true
    });
    console.log("User created!");
  } catch (err) {
    console.error("Error:", err);
  }
}

test();
