import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBfI9GJxHfN3Y0M2qW8VtA7KpL6dR1cE4n",
  authDomain: "crewroster-app.firebaseapp.com",
  projectId: "crewroster-app",
  storageBucket: "crewroster-app.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123def456"
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
