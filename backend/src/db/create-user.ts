import 'dotenv/config';
import { getFirestore } from '../config/firebase';
import { getAuth } from 'firebase-admin/auth';
import { admin } from '../config/firebase';

async function createUser() {
  const db = getFirestore();
  const crewCode = 'PMORAIS';
  const password = 'PMORAIS';
  const email = `${crewCode}@crewroster.local`;

  try {
    // Create Firebase Auth user
    const userRecord = await getAuth().createUser({
      email,
      password,
      displayName: crewCode,
    });

    console.log('Firebase Auth user created:', userRecord.uid);

    // Create Firestore user document
    await db.collection('users').doc(userRecord.uid).set({
      crewCode,
      fullName: 'P. Morais',
      base: 'LIS',
      role: 'First Officer',
      email: null,
      phone: null,
      medicalValidity: null,
      lpcValidity: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    console.log('Firestore user document created.');
    console.log(`\n✅ Conta criada com sucesso!`);
    console.log(`   CREW CODE: ${crewCode}`);
    console.log(`   Password: ${password}`);
    console.log(`   Login em: https://crewroster-app.web.app`);
  } catch (err: any) {
    if (err.code === 'auth/email-already-exists') {
      console.log('User already exists in Firebase Auth. Creating/updating Firestore doc...');
      const userRecord = await getAuth().getUserByEmail(email);
      await db.collection('users').doc(userRecord.uid).set({
        crewCode,
        fullName: 'P. Morais',
        base: 'LIS',
        role: 'First Officer',
        email: null,
        phone: null,
        medicalValidity: null,
        lpcValidity: null,
        updatedAt: new Date(),
      }, { merge: true });
      console.log('Firestore user document updated.');
      console.log(`\n✅ Conta pronta! Login: ${crewCode} / ${password}`);
    } else {
      console.error('Error:', err.message || err);
    }
  }
}

createUser();
