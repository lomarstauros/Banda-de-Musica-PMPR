const { resetUserAccess } = require('./app/actions/auth-actions.js') || {};

async function test() {
  try {
    const { getAdminApp } = require('./lib/firebase-admin');
    const admin = require('firebase-admin');
    
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
