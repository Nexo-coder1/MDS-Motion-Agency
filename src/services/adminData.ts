import {
  createDocument,
  readDocument,
  removeDocument,
  setDocument,
  updateDocument,
  watchCollection,
} from './firestore';
import { OWNER_UID } from './auth';
import {
  COLLECTIONS,
  type CollectionDocMap,
  type LeadDoc,
  type ProjectDoc,
  type UserDoc,
  type WithId,
} from '../types/firestore';

/*
 * Typed data access for Admin and User apps.
 * Phase A: helpers only. No screen calls these yet, and nothing is written automatically.
 * Writes use canonical field names (see types/firestore.ts):
 *   - lead quality  → write `score`
 *   - project price → write `budget`
 *   - project stage → write 'Delivered'
 */

type Name = keyof CollectionDocMap;
type Data<K extends Name> = CollectionDocMap[K];
type Write<K extends Name> = Omit<Data<K>, 'createdAt' | 'updatedAt'>;

/* ---------- Live subscriptions ---------- */

export function subscribeCollection<K extends Name>(
  name: K,
  onData: (rows: WithId<Data<K>>[]) => void,
  onError?: (error: Error) => void,
) {
  return watchCollection<WithId<Data<K>>>(COLLECTIONS[name], onData, onError);
}

/* ---------- One-off reads ---------- */

export function readRecord<K extends Name>(name: K, id: string) {
  return readDocument<Data<K>>(COLLECTIONS[name], id);
}

/* ---------- Writes ---------- */

export function createRecord<K extends Name>(name: K, data: Write<K>) {
  return createDocument(COLLECTIONS[name], data);
}

export function setRecord<K extends Name>(name: K, id: string, data: Partial<Write<K>>) {
  return setDocument(COLLECTIONS[name], id, data);
}

export function updateRecord<K extends Name>(name: K, id: string, changes: Partial<Write<K>>) {
  return updateDocument(COLLECTIONS[name], id, changes);
}

export function removeRecord<K extends Name>(name: K, id: string) {
  return removeDocument(COLLECTIONS[name], id);
}

/* ---------- Read normalizers (fallbacks for legacy field names) ---------- */

export type NormalizedLead = WithId<LeadDoc> & { score: number };

/** Reads `score`, falls back to `quality` (Admin name). Writes always use `score`. */
export function normalizeLead(lead: WithId<LeadDoc>): NormalizedLead {
  return { ...lead, score: lead.score ?? lead.quality ?? 0 };
}

export type NormalizedProject = WithId<ProjectDoc> & { budget: number };

/** Reads `budget`, falls back to `price` (App name). Maps 'Final Delivery' to 'Delivered'. */
export function normalizeProject(project: WithId<ProjectDoc>): NormalizedProject {
  return {
    ...project,
    budget: project.budget ?? project.price ?? 0,
    stage: project.stage === 'Final Delivery' ? 'Delivered' : project.stage,
  };
}

/* ---------- Owner profile ---------- */

/**
 * Creates users/{OWNER_UID} only when it does not exist. The caller supplies the values.
 * No defaults are invented here. Not called in Phase A.
 * Returns true if a document was created.
 */
export async function ensureOwnerUserDoc(defaults: Write<'users'>): Promise<boolean> {
  const existing = await readDocument<UserDoc>(COLLECTIONS.users, OWNER_UID);
  if (existing) return false;
  await setDocument(COLLECTIONS.users, OWNER_UID, defaults);
  return true;
}
