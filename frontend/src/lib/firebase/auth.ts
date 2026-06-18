import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from './config';

// Convert crewCode to Firebase Auth email
function crewCodeToEmail(crewCode: string): string {
  return `${crewCode.trim().toUpperCase()}@crewroster.local`;
}

// Extract crewCode from Firebase Auth email
export function emailToCrewCode(email: string): string {
  return email.replace('@crewroster.local', '');
}

export interface CrewUser {
  uid: string;
  crewCode: string;
  fullName: string;
  base: string;
  role: string;
  email?: string;
  phone?: string;
  medicalValidity?: string;
  lpcValidity?: string;
}

// Register a new user
export async function registerUser(
  crewCode: string,
  password: string,
  fullName: string,
  base: string,
  role: string,
  email?: string
): Promise<CrewUser> {
  const authEmail = crewCodeToEmail(crewCode);

  // Create Firebase Auth account
  const userCredential = await createUserWithEmailAndPassword(auth, authEmail, password);
  const { uid } = userCredential.user;

  // Store user profile in Firestore
  await setDoc(doc(db, 'users', uid), {
    crewCode: crewCode.trim().toUpperCase(),
    fullName: fullName.trim(),
    base,
    role,
    email: email || null,
    phone: null,
    medicalValidity: null,
    lpcValidity: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return {
    uid,
    crewCode: crewCode.trim().toUpperCase(),
    fullName: fullName.trim(),
    base,
    role,
    email: email || undefined,
  };
}

// Login with crew code + password
export async function loginWithCrewCode(
  crewCode: string,
  password: string
): Promise<CrewUser> {
  const authEmail = crewCodeToEmail(crewCode);
  const userCredential = await signInWithEmailAndPassword(auth, authEmail, password);
  return loadUserProfile(userCredential.user);
}

// Load user profile from Firestore
async function loadUserProfile(firebaseUser: FirebaseUser): Promise<CrewUser> {
  const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));

  if (!userDoc.exists()) {
    throw new Error('User profile not found in Firestore.');
  }

  const data = userDoc.data();
  return {
    uid: firebaseUser.uid,
    crewCode: emailToCrewCode(firebaseUser.email || ''),
    fullName: data.fullName,
    base: data.base,
    role: data.role,
    email: data.email,
    phone: data.phone,
    medicalValidity: data.medicalValidity?.toDate?.()?.toISOString(),
    lpcValidity: data.lpcValidity?.toDate?.()?.toISOString(),
  };
}

// Logout
export async function logoutUser(): Promise<void> {
  await signOut(auth);
}

// Listen to auth state changes
export function onAuthChange(callback: (user: CrewUser | null) => void) {
  return onAuthStateChanged(auth, async (firebaseUser) => {
    if (firebaseUser) {
      try {
        const crewUser = await loadUserProfile(firebaseUser);
        if (crewUser) callback(crewUser);
        else callback(null);
      } catch {
        callback(null);
      }
    } else {
      callback(null);
    }
  });
}
