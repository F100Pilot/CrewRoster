import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAkLxKWeiQOH-LS-9cQqhlF14pqldt-D6U",
  authDomain: "crewroster-app.firebaseapp.com",
  projectId: "crewroster-app",
  storageBucket: "crewroster-app.firebasestorage.app",
  messagingSenderId: "109261258857",
  appId: "1:109261258857:web:30703f24ccdaeb700f62f8"
};

// NOTE: Replace the config above with your actual Firebase Web App config
// from Firebase Console → Project Settings → General → Your apps → Web app
// The values above are public and only identify your project.

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

// Connect to Firebase emulators in development
if (process.env.NODE_ENV === 'development' && process.env.REACT_APP_USE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://localhost:9099');
  connectFirestoreEmulator(db, 'localhost', 8080);
}

export default app;
