import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
  type Unsubscribe,
} from 'firebase/auth';
import { auth } from '../firebase';

// This is the verified Firebase Authentication UID for the agency Owner account.
export const OWNER_UID = 'Gw7bfTdjUFXs8sYo5sxicM7OBj12';

export function subscribeToAuth(callback: (user: User | null) => void): Unsubscribe {
  return onAuthStateChanged(auth, callback);
}

export async function signInOwner(email: string, password: string): Promise<User> {
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);

  if (credential.user.uid !== OWNER_UID) {
    await signOut(auth);
    throw new Error('This account is not the configured MDS Motion Owner account.');
  }

  return credential.user;
}

export async function signOutCurrentUser(): Promise<void> {
  await signOut(auth);
}

export function isOwner(user: User | null): user is User {
  return Boolean(user && user.uid === OWNER_UID);
  }
