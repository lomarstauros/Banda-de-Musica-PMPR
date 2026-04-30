const admin = require('firebase-admin');
const path = require('path');
const serviceAccountPath = path.join(process.cwd(), 'service-account.json');
const serviceAccount = require(serviceAccountPath);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
async function test() {
  try {
    const user = await admin.auth().createUser({
        uid: 'test-uid-123',
        email: 'test' + Date.now() + '@example.com',
        password: 'password123'
    });
    console.log("Created:", user.uid);
  } catch(e) {
    console.error("Error:", e);
  }
}
test();
