const admin = require('firebase-admin');
const fs = require('fs');

const serviceAccountPath = './service-account.json';
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function run() {
  const snapshot = await db.collection('profiles').where('role', '==', 'admin').limit(1).get();
  if (snapshot.empty) {
    console.log('No admin found. Creating one...');
    const userRef = db.collection('profiles').doc('test-admin-uid');
    await userRef.set({
      name: 'Test Admin',
      email: 'testadmin@example.com',
      role: 'admin',
      active: true,
      status: 'active',
      war_name: 'TestAdmin'
    });
    
    await admin.auth().createUser({
      uid: 'test-admin-uid',
      email: 'testadmin@example.com',
      password: 'password123',
    });
    console.log('Created testadmin@example.com / password123');
  } else {
    const doc = snapshot.docs[0];
    const data = doc.data();
    console.log(`Found admin: ${data.email} UID: ${doc.id}`);
    
    // reset password to password123
    try {
        await admin.auth().updateUser(doc.id, {
        password: 'password123'
        });
        console.log(`Reset password for ${data.email} to password123`);
    } catch (e) {
        if (e.code === 'auth/user-not-found') {
             await admin.auth().createUser({
                uid: doc.id,
                email: data.email,
                password: 'password123',
            });
            console.log(`Created auth for ${data.email} / password123`);
        }
    }
  }
}
run().catch(console.error).finally(() => process.exit(0));
