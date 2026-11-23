import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Public Firebase web configuration. Access is controlled by Firebase Auth + Firestore Rules.
const firebaseConfig = {
  apiKey: 'AIzaSyBFzXFHP0VTT6PmHhbk9epP_ARhrIBSHr0',
  authDomain: 'mdsmotion-2dcb6.firebaseapp.com',
  projectId: 'mdsmotion-2dcb6',
  storageBucket: 'mdsmotion-2dcb6.firebasestorage.app',
  messagingSenderId: '1058441980745',
  appId: '1:1058441980745:web:62e679fabb031a33eec898',
  measurementId: 'G-TRH1LL34TG',
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;
