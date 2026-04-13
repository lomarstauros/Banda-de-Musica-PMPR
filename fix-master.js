const admin = require('firebase-admin');
const serviceAccount = require('/Users/heliomardejesus/Downloads/banda-de-música-pmpr-firebase-adminsdk-fbsvc-66a93792e8.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const auth = admin.auth();

async function fixUser() {
  const email = 'heliomardejesus87@gmail.com';
  try {
    const userRecord = await auth.getUserByEmail(email);
    console.log('Successfully fetched user data:', userRecord.toJSON());
    
    // update firestore profile
    const profileRef = db.collection('profiles').doc(userRecord.uid);
    await profileRef.set({
      role: 'master',
      status: 'active'
    }, { merge: true });
    
    console.log(`Document profile ${userRecord.uid} successfully updated to master for ${email}!`);
  } catch (error) {
    console.log('Error fetching user data:', error);
  }
  process.exit();
}

fixUser();
