import * as admin from 'firebase-admin';

let firestore: admin.firestore.Firestore;

export function getFirestore(): admin.firestore.Firestore {
  if (!firestore) {
    if (!admin.apps.length) {
      admin.initializeApp();
    }
    firestore = admin.firestore();
    firestore.settings({ ignoreUndefinedProperties: true });
  }
  return firestore;
}

export { admin };
