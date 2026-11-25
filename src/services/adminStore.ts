/*
 * Admin data layer (Phase B). The Owner-only Admin screens read and write Firestore through this file.
 *
 * - Reads: one live listener per collection. Firestore's local cache reflects our own writes at once.
 * - Writes: set(f) computes the next state with f (pure: no writes inside f), diffs it against the
 *   previous state, and commits ONE writeBatch per action. Batches run one after another (serial queue).
 * - Limit: an action with more than 450 operations is aborted before any write, with a clear message.
 *   It is never split into several batches automatically.
 * - Failures: a rejected commit is reported through `error`. Firestore's local cache rolls back the
 *   optimistic change when the server rejects it, and the next snapshot shows the stored state.
 * - Nothing is uploaded or migrated automatically. Empty collections stay empty.
 * - Record IDs: newId() creates a Firestore auto-ID locally (no network call).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Timestamp,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore';
import { db as fdb } from '../firebase';
import { OWNER_UID } from './auth';
import { watchCollection, type FirestoreRecord } from './firestore';
import { COLLECTIONS, type CollectionName } from '../types/firestore';

/* ---------- Admin types (moved from Admin.tsx; field names unchanged) ---------- */

export type Role = 'Owner' | 'Manager' | 'Sales' | 'Editor' | 'Finance';
export type UStatus = 'Active' | 'Invited' | 'Suspended' | 'Removed';
export type Perm = 'leads' | 'projects' | 'finance' | 'delete' | 'archive' | 'transfer' | 'activity';
export type PayModel = 'Per-video' | 'Monthly salary' | 'Per-project' | 'Milestone' | 'Custom';
export type Mode = 'Equal' | 'Performance' | 'Availability' | 'Workload' | 'Combined';
export type LStatus = 'New' | 'Claimed' | 'Researching' | 'Message Sent' | 'Follow-up' | 'Replied' | 'Interested' | 'Call Booked' | 'Negotiation' | 'Won' | 'Lost';
export type Service = 'Video editing' | 'Real estate' | 'Social media' | 'Web design' | 'Branding' | 'Photography' | 'Custom';
export type Stage = 'In Progress' | 'Internal Review' | 'Revision Required' | 'Internal Approval' | 'Client Approval' | 'Delivered';
export type InvStatus = 'Draft' | 'Sent' | 'Paid' | 'Overdue';
export type Tone = 'ok' | 'err' | 'info';
export type Theme = 'dark' | 'light' | 'system';
export type Cur = 'INR' | 'USD' | 'EUR';
export type Section = 'dashboard' | 'team' | 'leads' | 'projects' | 'clients' | 'finance' | 'reports' | 'notifications' | 'settings';

/** `_ts` (epoch ms) comes from the stored Timestamp. `at` / `sent` are display strings for the UI. */
export interface User { id: string; name: string; email: string; role: Role; status: UStatus; perms: Perm[]; available: boolean; limit: number; perf: number; points: number; msgs: number; calls: number; payModel: PayModel; rate: number; }
export interface Invite { id: string; email: string; role: Role; sent: string; _ts?: number; }
export interface Lead { id: string; name: string; platform: string; handle: string; status: LStatus; priority: 'High' | 'Medium' | 'Low'; owner: string | null; quality: number; niche: string; deleted: boolean; archived: boolean; claimedAt: number | null; }
export interface Transfer { id: string; leadId: string; from: string; to: string; reason: string; status: 'Pending' | 'Approved' | 'Rejected'; }
export interface HistRow { id: string; leadId: string; to: string | null; by: string; at: string; _ts?: number; }
export interface Tpl { id: string; name: string; kind: 'First contact' | 'Follow-up' | 'Custom'; platform: string; lang: 'EN' | 'HI'; body: string; }
export interface Reply { id: string; leadId: string; category: string; text: string; at: string; _ts?: number; }
export interface FU { id: string; leadId: string; due: string; reason: string; done: boolean; }
export interface Task { id: string; title: string; done: boolean; }
export interface Project { id: string; title: string; clientId: string; service: Service; budget: number; currency: Cur; editorId: string | null; deadline: string; stage: Stage; progress: number; revisions: number; tasks: Task[]; links: string[]; comments: string[]; }
export interface Client { id: string; name: string; email: string; company: string; }
export interface Invoice { id: string; projectId: string; amount: number; currency: Cur; due: string; status: InvStatus; }
export interface Expense { id: string; label: string; amount: number; currency: Cur; projectId: string | null; }
export interface Payout { id: string; editorId: string; projectId: string; amount: number; currency: Cur; status: 'Pending' | 'Paid'; }
export interface Notice { id: string; cat: 'Lead' | 'Follow-up' | 'Team' | 'Project' | 'Finance'; text: string; read: boolean; }
export interface Act { id: string; text: string; at: string; by: string; _ts?: number; }
export interface Target { id: string; label: string; scope: 'Team' | 'Personal'; metric: 'msgs' | 'calls'; goal: number; userId: string | null; }
export interface Settings { theme: Theme; reduce: boolean; mode: Mode; limit: number; base: Cur; fx: Record<Cur, number>; }
export interface Db { users: User[]; invites: Invite[]; leads: Lead[]; transfers: Transfer[]; hist: HistRow[]; tpls: Tpl[]; replies: Reply[]; fus: FU[]; projects: Project[]; clients: Client[]; invoices: Invoice[]; expenses: Expense[]; payouts: Payout[]; notices: Notice[]; acts: Act[]; targets: Target[]; settings: Settings; }
export interface Plan { assign: Record<string, string>; hist: HistRow[]; skipped: number; total: number; }
export interface Ctx { db: Db; set: (f: (d: Db) => Db) => void; toast: (text: string, tone?: Tone) => void; ask: (text: string, run: () => void) => void; go: (s: Section, tab?: string) => void; }

/* ---------- Constants ---------- */

/** Firestore allows 500 operations per batch. The app stops at 450 and never splits automatically. */
export const BATCH_LIMIT = 450;
export const BATCH_LIMIT_MESSAGE = 'This action exceeds the safe Firestore batch limit.';

/** App defaults, used for display only until the Owner changes a setting. Nothing is written by default. */
export const DEFAULT_AGENCY: Pick<Settings, 'mode' | 'limit' | 'base' | 'fx'> = { mode: 'Combined', limit: 25, base: 'INR', fx: { INR: 1, USD: 83, EUR: 90 } };
export const DEFAULT_PREFS: Pick<Settings, 'theme' | 'reduce'> = { theme: 'system', reduce: false };

const AGENCY_KEYS: (keyof Settings)[] = ['mode', 'limit', 'base', 'fx'];
const PREF_KEYS: (keyof Settings)[] = ['theme', 'reduce'];

export class ConsistencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConsistencyError';
  }
}

/** Auto-ID created locally. Firestore does not contact the server for this. */
export function newId(): string {
  return doc(collection(fdb, '_ids')).id;
}

/* ---------- Raw Firestore shapes ---------- */

type Raw = FirestoreRecord;

const LISTENED = [
  'users', 'invites', 'leads', 'leadTransfers', 'leadHistory', 'messageTemplates', 'replies',
  'followUps', 'projects', 'clients', 'invoices', 'expenses', 'payouts', 'notifications',
  'activityLogs', 'targets', 'settings',
] as const;
type Listened = (typeof LISTENED)[number];
type Raws = Record<Listened, Raw[]>;

const EMPTY_RAWS: Raws = {
  users: [], invites: [], leads: [], leadTransfers: [], leadHistory: [], messageTemplates: [], replies: [],
  followUps: [], projects: [], clients: [], invoices: [], expenses: [], payouts: [], notifications: [],
  activityLogs: [], targets: [], settings: [],
};

/* ---------- Small helpers ---------- */

const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const msOf = (v: unknown): number | null => (v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : null);
const fmtAt = (ms: number): string => new Date(ms).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const messageOf = (err: unknown): string => (err instanceof Error && err.message ? err.message : 'Save failed. Please try again.');
const newestFirst = (x: { _ts?: number }) => x._ts ?? Number.MAX_SAFE_INTEGER;

/** Shallow copy without the given keys. */
function without(obj: object, keys: string[]): Record<string, unknown> {
  const out = { ...(obj as Record<string, unknown>) };
  for (const k of keys) delete out[k];
  return out;
}

/** Firestore rejects `undefined` values, so they are dropped here. */
function clean(obj: object): DocumentData {
  const out: DocumentData = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) if (v !== undefined) out[k] = v;
  return out;
}

function pick(s: Settings, keys: (keyof Settings)[]): Partial<Settings> {
  const out: Partial<Settings> = {};
  for (const k of keys) (out as Record<string, unknown>)[k] = s[k];
  return out;
}

const changed = (a: object, b: object): boolean => JSON.stringify(a) !== JSON.stringify(b);

/* ---------- Firestore → Admin rows ---------- */

function plainIn<T>(raw: Raw): T {
  return without(raw, ['createdAt', 'updatedAt']) as unknown as T;
}

/** Reads a stored Timestamp into `_ts` (ms) and a display string into `at` / `sent`. Legacy strings are kept. */
function timeIn<T>(raw: Raw, field: 'at' | 'sent'): T {
  const v: unknown = raw[field];
  const ms = msOf(v);
  const out = without(raw, ['createdAt', 'updatedAt']);
  out[field] = typeof v === 'string' ? v : ms === null ? 'Just now' : fmtAt(ms);
  if (ms !== null) out._ts = ms;
  return out as unknown as T;
}

function userIn(raw: Raw): User {
  const out = plainIn<Record<string, unknown>>(raw);
  out.perms = Array.isArray(raw.perms) ? raw.perms : [];
  out.available = raw.available !== false;
  for (const k of ['limit', 'perf', 'points', 'msgs', 'calls', 'rate']) out[k] = num(raw[k]);
  return out as unknown as User;
}

/** `score` is the stored name, `quality` the Admin name. Reads both. */
function leadIn(raw: Raw): Lead {
  const out = plainIn<Record<string, unknown>>(raw);
  out.quality = num(raw.score ?? raw.quality);
  out.claimedAt = msOf(raw.claimedAt);
  out.owner = raw.owner ?? null;
  out.archived = raw.archived === true;
  out.deleted = raw.deleted === true;
  out.niche = String(raw.niche ?? '');
  out.handle = String(raw.handle ?? '');
  return out as unknown as Lead;
}

/** `budget` is the stored name, `price` the App name. 'Final Delivery' reads as 'Delivered'. */
function projectIn(raw: Raw): Project {
  const out = plainIn<Record<string, unknown>>(raw);
  out.budget = num(raw.budget ?? raw.price);
  out.stage = raw.stage === 'Final Delivery' ? 'Delivered' : raw.stage;
  out.clientId = String(raw.clientId ?? '');
  out.editorId = raw.editorId ?? null;
  out.progress = num(raw.progress);
  out.revisions = num(raw.revisions);
  out.tasks = Array.isArray(raw.tasks) ? raw.tasks : [];
  out.links = Array.isArray(raw.links) ? raw.links : [];
  out.comments = Array.isArray(raw.comments) ? raw.comments : [];
  return out as unknown as Project;
}

const KIND_IN: Record<string, Tpl['kind']> = { first: 'First contact', follow: 'Follow-up', custom: 'Custom' };
const KIND_OUT: Record<Tpl['kind'], string> = { 'First contact': 'first', 'Follow-up': 'follow', Custom: 'custom' };
const LANG_IN: Record<string, Tpl['lang']> = { en: 'EN', hi: 'HI' };
const LANG_OUT: Record<Tpl['lang'], string> = { EN: 'en', HI: 'hi' };

function tplIn(raw: Raw): Tpl {
  const out = plainIn<Record<string, unknown>>(raw);
  out.kind = KIND_IN[String(raw.kind)] ?? 'Custom';
  out.lang = LANG_IN[String(raw.lang)] ?? 'EN';
  return out as unknown as Tpl;
}

function sortNewest<T extends { _ts?: number }>(rows: T[]): T[] {
  return rows.sort((a, b) => newestFirst(a) - newestFirst(b));
}

/** Settings live in two documents: settings/agency (agency-wide) and settings/{OWNER_UID} (Owner preferences). */
function buildDb(r: Raws): Db {
  const agency = r.settings.find(s => s.id === 'agency');
  const prefs = r.settings.find(s => s.id === OWNER_UID);
  return {
    users: r.users.map(userIn),
    invites: sortNewest(r.invites.map(x => timeIn<Invite>(x, 'sent'))),
    leads: r.leads.map(leadIn),
    transfers: r.leadTransfers.map(x => plainIn<Transfer>(x)),
    hist: sortNewest(r.leadHistory.map(x => timeIn<HistRow>(x, 'at'))),
    tpls: r.messageTemplates.map(tplIn),
    replies: sortNewest(r.replies.map(x => timeIn<Reply>(x, 'at'))),
    fus: r.followUps.map(x => plainIn<FU>(x)),
    projects: r.projects.map(projectIn),
    clients: r.clients.map(x => plainIn<Client>(x)),
    invoices: r.invoices.map(x => plainIn<Invoice>(x)),
    expenses: r.expenses.map(x => plainIn<Expense>(x)),
    payouts: r.payouts.map(x => plainIn<Payout>(x)),
    notices: r.notifications.map(x => plainIn<Notice>(x)),
    acts: sortNewest(r.activityLogs.map(x => timeIn<Act>(x, 'at'))),
    targets: r.targets.map(x => plainIn<Target>(x)),
    settings: {
      theme: (prefs?.theme ?? DEFAULT_PREFS.theme) as Theme,
      reduce: prefs?.reduce === true,
      mode: (agency?.mode ?? DEFAULT_AGENCY.mode) as Mode,
      limit: num(agency?.limit, DEFAULT_AGENCY.limit),
      base: (agency?.base ?? DEFAULT_AGENCY.base) as Cur,
      fx: { ...DEFAULT_AGENCY.fx, ...(agency?.fx ?? {}) },
    },
  };
}

const EMPTY_DB: Db = buildDb(EMPTY_RAWS);

/* ---------- Admin rows → Firestore payloads ---------- */

function plainWrite(row: { id: string }): DocumentData {
  return clean(without(row, ['id']));
}

/** Writes `score` (canonical). `quality` is not stored under its Admin name. */
function leadWrite(row: Lead): DocumentData {
  return clean({
    ...without(row, ['id', 'quality', 'claimedAt']),
    score: row.quality,
    claimedAt: typeof row.claimedAt === 'number' ? Timestamp.fromMillis(row.claimedAt) : null,
  });
}

function tplWrite(row: Tpl): DocumentData {
  return clean({ ...without(row, ['id']), kind: KIND_OUT[row.kind], lang: LANG_OUT[row.lang] });
}

/**
 * Writes the stored Timestamp for a new row (serverTimestamp), or the existing one for an old row,
 * so an unchanged `at` / `sent` never moves.
 */
function timeWrite(row: { _ts?: number }, field: 'at' | 'sent'): DocumentData {
  const out = without(row, ['id', '_ts', field]);
  out[field] = row._ts !== undefined ? Timestamp.fromMillis(row._ts) : serverTimestamp();
  return clean(out);
}

/* ---------- Table map (parents first; children are deleted first) ---------- */

interface Table {
  col: CollectionName;
  rows: (d: Db) => { id: string }[];
  write: (row: { id: string }) => DocumentData;
}

function table<T extends { id: string }>(col: CollectionName, rows: (d: Db) => T[], write: (row: T) => DocumentData): Table {
  return { col, rows, write: row => write(row as T) };
}

const TABLES: Table[] = [
  table<User>('users', d => d.users, plainWrite),
  table<Client>('clients', d => d.clients, plainWrite),
  table<Lead>('leads', d => d.leads, leadWrite),
  table<Project>('projects', d => d.projects, plainWrite),
  table<Invite>('invites', d => d.invites, r => timeWrite(r, 'sent')),
  table<Tpl>('messageTemplates', d => d.tpls, tplWrite),
  table<Transfer>('leadTransfers', d => d.transfers, plainWrite),
  table<HistRow>('leadHistory', d => d.hist, r => timeWrite(r, 'at')),
  table<Reply>('replies', d => d.replies, r => timeWrite(r, 'at')),
  table<FU>('followUps', d => d.fus, plainWrite),
  table<Invoice>('invoices', d => d.invoices, plainWrite),
  table<Expense>('expenses', d => d.expenses, plainWrite),
  table<Payout>('payouts', d => d.payouts, plainWrite),
  table<Notice>('notifications', d => d.notices, plainWrite),
  table<Act>('activityLogs', d => d.acts, r => timeWrite(r, 'at')),
  table<Target>('targets', d => d.targets, plainWrite),
];

/* ---------- Planner: prev state + next state → batch operations ---------- */

type WriteOp =
  | { kind: 'set'; col: CollectionName; id: string; data: DocumentData; create: boolean; order: number; row?: { id: string } }
  | { kind: 'del'; col: CollectionName; id: string; order: number };

interface WritePlan {
  ops: WriteOp[];
  owners: string[];
}

function planWrites(prev: Db, next: Db): WritePlan {
  // Removing a lead also removes its child rows (transfers, history, replies, follow-ups).
  const nextLeadIds = new Set(next.leads.map(l => l.id));
  const removed = new Set(prev.leads.map(l => l.id).filter(id => !nextLeadIds.has(id)));
  const keep = <T extends { leadId: string }>(rows: T[]): T[] => rows.filter(r => !removed.has(r.leadId));
  const state: Db = {
    ...next,
    transfers: keep(next.transfers),
    hist: keep(next.hist),
    replies: keep(next.replies),
    fus: keep(next.fus),
  };

  const ops: WriteOp[] = [];

  if (changed(pick(prev.settings, AGENCY_KEYS), pick(state.settings, AGENCY_KEYS))) {
    ops.push({ kind: 'set', col: 'settings', id: 'agency', data: clean(pick(state.settings, AGENCY_KEYS)), create: false, order: 0 });
  }
  if (changed(pick(prev.settings, PREF_KEYS), pick(state.settings, PREF_KEYS))) {
    ops.push({ kind: 'set', col: 'settings', id: OWNER_UID, data: clean(pick(state.settings, PREF_KEYS)), create: false, order: 0 });
  }

  TABLES.forEach((t, i) => {
    const order = i + 1;
    const before = new Map(t.rows(prev).map(r => [r.id, r] as const));
    const seen = new Set<string>();
    for (const row of t.rows(state)) {
      seen.add(row.id);
      const old = before.get(row.id);
      if (old && !changed(old, row)) continue;
      ops.push({ kind: 'set', col: t.col, id: row.id, data: t.write(row), create: !old, order, row });
    }
    for (const id of before.keys()) {
      if (!seen.has(id)) ops.push({ kind: 'del', col: t.col, id, order });
    }
  });

  if (ops.length > BATCH_LIMIT) throw new Error(BATCH_LIMIT_MESSAGE);

  // Linked-record checks on rows this action creates or changes. Nothing is written if one fails.
  const ids = {
    users: new Set(state.users.map(u => u.id)),
    leads: new Set(state.leads.map(l => l.id)),
    clients: new Set(state.clients.map(c => c.id)),
    projects: new Set(state.projects.map(p => p.id)),
  };
  const link = (col: string, row: Record<string, unknown>, field: string, known: Set<string>) => {
    const v = row[field];
    if (v === undefined || v === null || v === '') return;
    if (!known.has(String(v))) throw new ConsistencyError(`Linked record not found: ${col}.${field}. Nothing was saved.`);
  };
  const owners = new Set<string>();
  for (const op of ops) {
    if (op.kind !== 'set' || !op.row) continue;
    const r = op.row as unknown as Record<string, unknown>;
    switch (op.col) {
      case 'leads':
        link('leads', r, 'owner', ids.users);
        if (typeof r.owner === 'string') owners.add(r.owner);
        break;
      case 'leadHistory':
        link('leadHistory', r, 'leadId', ids.leads);
        link('leadHistory', r, 'to', ids.users);
        break;
      case 'leadTransfers':
        link('leadTransfers', r, 'leadId', ids.leads);
        link('leadTransfers', r, 'from', ids.users);
        link('leadTransfers', r, 'to', ids.users);
        break;
      case 'replies':
      case 'followUps':
        link(op.col, r, 'leadId', ids.leads);
        break;
      case 'projects':
        link('projects', r, 'clientId', ids.clients);
        link('projects', r, 'editorId', ids.users);
        break;
      case 'invoices':
      case 'expenses':
        link(op.col, r, 'projectId', ids.projects);
        break;
      case 'payouts':
        link('payouts', r, 'projectId', ids.projects);
        link('payouts', r, 'editorId', ids.users);
        break;
      case 'targets':
        link('targets', r, 'userId', ids.users);
        break;
      default:
        break;
    }
  }

  // Creates and updates first (parents first), then deletes (children first).
  const sets = ops.filter(o => o.kind === 'set').sort((a, b) => a.order - b.order);
  const dels = ops.filter(o => o.kind === 'del').sort((a, b) => b.order - a.order);
  return { ops: [...sets, ...dels], owners: Array.from(owners) };
}

/** Lead owners are checked against Firestore right before the batch is sent. */
async function execute(plan: WritePlan): Promise<void> {
  const snaps = await Promise.all(plan.owners.map(uid => getDoc(doc(fdb, COLLECTIONS.users, uid))));
  snaps.forEach((snap, i) => {
    if (!snap.exists()) throw new ConsistencyError(`Lead owner has no users record (${plan.owners[i]}). Nothing was saved.`);
  });

  const batch = writeBatch(fdb);
  for (const op of plan.ops) {
    const ref = doc(fdb, op.col, op.id);
    if (op.kind === 'del') {
      batch.delete(ref);
      continue;
    }
    batch.set(
      ref,
      { ...op.data, ...(op.create ? { createdAt: serverTimestamp() } : {}), updatedAt: serverTimestamp() },
      { merge: true },
    );
  }
  await batch.commit();
}

/* ---------- Hook ---------- */

/**
 * Live Admin data. `db` starts empty and fills from Firestore.
 * `set(f)` works like the old local setState: f receives the current Db and returns the next one.
 */
export function useAdminStore() {
  const [raw, setRaw] = useState<Raws>(EMPTY_RAWS);
  const [ready, setReady] = useState<Partial<Record<Listened, boolean>>>({});
  const [error, setError] = useState('');
  const db = useMemo(() => buildDb(raw), [raw]);

  // Last known state. set() moves it forward at once, so two actions in one click build on each other.
  const latest = useRef<Db>(EMPTY_DB);
  const queue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    latest.current = db;
  }, [db]);

  useEffect(() => {
    const unsubs = LISTENED.map(name =>
      watchCollection<Raw>(
        COLLECTIONS[name],
        rows => {
          setRaw(prev => ({ ...prev, [name]: rows }));
          setReady(prev => (prev[name] ? prev : { ...prev, [name]: true }));
        },
        err => setError(messageOf(err)),
      ),
    );
    return () => {
      unsubs.forEach(u => u());
    };
  }, []);

  const set = useCallback((f: (d: Db) => Db) => {
    try {
      const prev = latest.current;
      const next = f(prev);
      const plan = planWrites(prev, next);
      if (plan.ops.length === 0) return;
      latest.current = next;
      queue.current = queue.current.then(() => execute(plan)).catch(err => setError(messageOf(err)));
    } catch (err) {
      setError(messageOf(err));
    }
  }, []);

  const clearError = useCallback(() => setError(''), []);
  const loading = LISTENED.some(name => !ready[name]);

  return { db, set, loading, error, clearError };
}
