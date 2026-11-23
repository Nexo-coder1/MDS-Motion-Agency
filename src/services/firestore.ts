import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentData,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase';

export type FirestoreRecord = DocumentData & { id: string };

/** Subscribe to a collection and include each Firestore document ID as `id`. */
export function watchCollection<T extends FirestoreRecord>(
  collectionPath: string,
  onData: (records: T[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    collection(db, collectionPath),
    snapshot => onData(snapshot.docs.map(item => ({ id: item.id, ...item.data() }) as T)),
    error => onError?.(error),
  );
}

export async function readDocument<T extends DocumentData>(
  collectionPath: string,
  documentId: string,
): Promise<(T & { id: string }) | null> {
  const snapshot = await getDoc(doc(db, collectionPath, documentId));
  return snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as T & { id: string }) : null;
}

export async function createDocument<T extends DocumentData>(
  collectionPath: string,
  data: T,
): Promise<string> {
  const result = await addDoc(collection(db, collectionPath), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return result.id;
}

export async function setDocument<T extends DocumentData>(
  collectionPath: string,
  documentId: string,
  data: T,
): Promise<void> {
  await setDoc(doc(db, collectionPath, documentId), {
    ...data,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function updateDocument<T extends DocumentData>(
  collectionPath: string,
  documentId: string,
  changes: T,
): Promise<void> {
  await updateDoc(doc(db, collectionPath, documentId), {
    ...changes,
    updatedAt: serverTimestamp(),
  });
}

export async function removeDocument(collectionPath: string, documentId: string): Promise<void> {
  await deleteDoc(doc(db, collectionPath, documentId));
}
