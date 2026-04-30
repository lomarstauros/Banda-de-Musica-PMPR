const admin = require('firebase-admin');
const path = require('path');
const serviceAccountPath = path.join(process.cwd(), 'service-account.json');
const serviceAccount = require(serviceAccountPath);
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}
async function test() {
  try {
    const db = admin.firestore();
    const snapshot = await db.collection('profiles').limit(5).get();
    snapshot.forEach(doc => {
      console.log(doc.id, "=>", doc.data().email, doc.data().role);
    });
  } catch(e) {
    console.error("Error:", e);
  }
}
test();
