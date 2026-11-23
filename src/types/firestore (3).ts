/**
 * MDS Motion Agency — shared Firestore schema (User App + Admin App)
 *
 * TYPES ONLY. No records, no seed data, no runtime logic.
 *
 * Validated against:
 *   - User App:  src/App.tsx   (sha256 173477b4…)
 *   - Admin App: src/Admin.tsx (sha256 b4326d49…)
 *   - Foundation: src/firebase.ts, src/services/firestore.ts, src/services/auth.ts
 *
 * Conventions
 * - Field names are kept exactly as they exist in the apps. Where a field exists in only
 *   one app, or the two apps use different names for the same concept, BOTH names are kept
 *   as optional fields and marked TODO(confirm). Nothing is renamed or dropped.
 * - users/{uid}: document ID = Firebase Auth UID.
 * - Calendar days: 'YYYY-MM-DD' strings (both apps already use this).
 * - Instants: Firestore Timestamp in the database. The demo code uses epoch ms numbers or
 *   display strings ("Today 10:20"); migration must convert them.
 * - Money: major units as number + currency code.
 * - createdAt / updatedAt are added by the createDocument / setDocument / updateDocument helpers.
 * - Foundation helpers (watchCollection, readDocument) return records with `id`. Use WithId<T>.
 */

import type { Timestamp } from 'firebase/firestore';

/* ------------------------------------------------------------------ */
/* Shared primitives                                                    */
/* ------------------------------------------------------------------ */

export type ISODate = string; // 'YYYY-MM-DD'
export type Instant = Timestamp;

/**
 * TODO(confirm): App.tsx FX table only has INR and USD. Admin.tsx has INR, USD and EUR.
 * EUR is kept because Admin uses it.
 */
export type Currency = 'INR' | 'USD' | 'EUR';

/** Added by the service helpers. Do not set these by hand in app code. */
export interface Timestamped {
  createdAt?: Instant;
  updatedAt?: Instant;
}

/**
 * Shape returned by watchCollection() and readDocument() in src/services/firestore.ts.
 * Their generic constraint is `T extends { id: string }`, so always pass WithId<XDoc>.
 */
export type WithId<T> = T & { id: string };

/** One place for every collection name, so the apps never retype a path. */
export const COLLECTIONS = {
  users: 'users',
  invites: 'invites',
  leads: 'leads',
  leadTransfers: 'leadTransfers',
  leadHistory: 'leadHistory',
  messageTemplates: 'messageTemplates',
  replies: 'replies',
  followUps: 'followUps',
  projects: 'projects',
  clients: 'clients',
  invoices: 'invoices',
  expenses: 'expenses',
  payouts: 'payouts',
  payments: 'payments',
  notifications: 'notifications',
  activityLogs: 'activityLogs',
  targets: 'targets',
  settings: 'settings',
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];

/* ------------------------------------------------------------------ */
/* 1. Users and roles                                                   */
/* Source: Admin.tsx `User`, `Invite`, `ROLE_PERMS`; App.tsx `ME`       */
/* ------------------------------------------------------------------ */

/**
 * TODO(confirm): Admin.tsx role set. App.tsx ME.role is 'Lead Researcher + Editor (demo role)',
 * which is not in this union. Decide whether the User App needs its own role set or a mapping.
 */
export type UserRole = 'Owner' | 'Manager' | 'Sales' | 'Editor' | 'Finance';

export type UserStatus = 'Active' | 'Invited' | 'Suspended' | 'Removed';

export type Permission = 'leads' | 'projects' | 'finance' | 'delete' | 'archive' | 'transfer' | 'activity';

export type PayModel = 'Per-video' | 'Monthly salary' | 'Per-project' | 'Milestone' | 'Custom';

/** users/{uid} — Admin.tsx `User` (id is the document ID) */
export interface UserDoc extends Timestamped {
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  perms: Permission[];
  available: boolean;
  limit: number;          // active lead limit
  perf: number;           // performance score 0–100
  points: number;
  msgs: number;           // messages sent (target metric)
  calls: number;          // calls booked (target metric)
  payModel: PayModel;
  rate: number;           // per-video rate, INR (Admin shows it as INR)
}

/** invites/{autoId} — Admin.tsx `Invite` */
export interface InviteDoc extends Timestamped {
  email: string;
  role: UserRole;
  sent: Instant;          // Admin stores a display string ("Yesterday"); migrate to Timestamp
}

/* ------------------------------------------------------------------ */
/* 2. Leads                                                             */
/* Source: App.tsx `Lead`; Admin.tsx `Lead`                             */
/* ------------------------------------------------------------------ */

export type LeadStatus =
  | 'New' | 'Claimed' | 'Researching' | 'Message Sent' | 'Follow-up' | 'Replied'
  | 'Interested' | 'Call Booked' | 'Negotiation' | 'Won' | 'Lost';

export type Priority = 'High' | 'Medium' | 'Low';

export type Platform = 'Instagram' | 'WhatsApp' | 'LinkedIn' | 'Email' | 'Other';

/**
 * leads/{autoId}
 * Fields marked "App only" are absent in Admin.tsx-created data and are optional here.
 * Fields marked "Admin only" are absent in App.tsx data and are optional here.
 */
export interface LeadDoc extends Timestamped {
  name: string;
  platform: Platform;     // App: union. Admin: typed as string but only these 5 values are used
  handle: string;
  status: LeadStatus;
  priority: Priority;

  /**
   * TODO(confirm): App.tsx stores the owner as a display name ('Demo User' / 'Unassigned').
   * Admin.tsx stores a user id ('u2') or null. The target schema uses the user's Auth UID or null.
   * Name-based values must be mapped to UIDs during migration. Do not guess the mapping.
   */
  owner: string | null;
  claimedAt?: Instant | null;             // App: optional epoch ms number. Admin: ms or null

  archived: boolean;
  deleted: boolean;

  /** App.tsx name. Quality score 0–100. */
  score?: number;
  /** Admin.tsx name for the same concept (quality score 0–100). TODO(confirm): choose one name. */
  quality?: number;
  scoreOverride?: number | null;          // App only (manual override)

  niche: string;
  phone?: string;                         // App only
  source?: string;                        // App only ('Manual entry', 'CSV import', …)
  notes?: string;                         // App only
  custom?: Record<string, string>;        // App only (custom key/value details)

  /**
   * App only: per-lead activity text list (App.tsx `Lead.activity: string[]`).
   * Kept here so existing App data is not lost. Recommended long-term home: activityLogs with leadId.
   * TODO(confirm): keep on the lead or move to activityLogs.
   */
  activity?: string[];
}

/** leadTransfers/{autoId} — Admin.tsx `Transfer`. App has no transfer UI. */
export interface LeadTransferDoc extends Timestamped {
  leadId: string;
  from: string;                           // UID of current owner (Admin: user id)
  to: string;                             // UID of requested owner
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  decidedAt?: Instant | null;             // Admin does not store this yet
}

/** leadHistory/{autoId} — Admin.tsx `HistRow`. */
export interface LeadHistoryDoc extends Timestamped {
  leadId: string;
  to: string | null;                      // UID; null = released
  by: string;                             // method: 'Auto · Equal', 'Manual', 'Transfer approved', …
  at: Instant;                            // Admin: display string; migrate
}

/* ------------------------------------------------------------------ */
/* 3. Message templates and replies                                     */
/* Source: App.tsx `Template`, `Reply`; Admin.tsx `Tpl`, `Reply`        */
/* ------------------------------------------------------------------ */

/**
 * TODO(confirm): App uses 'first' | 'follow' | 'custom'. Admin uses
 * 'First contact' | 'Follow-up' | 'Custom'. Canonical here = App values.
 */
export type TemplateKind = 'first' | 'follow' | 'custom';

/** TODO(confirm): App uses 'en' | 'hi'. Admin uses 'EN' | 'HI'. Canonical here = App values. */
export type TemplateLang = 'en' | 'hi';

/** messageTemplates/{autoId}. Body may contain {name}, {niche}, {handle}. */
export interface MessageTemplateDoc extends Timestamped {
  name: string;
  kind: TemplateKind;
  platform: Platform;
  lang: TemplateLang;
  body: string;
}

export type ReplyCategory = 'Interested' | 'Not interested' | 'Pricing enquiry' | 'Meeting request' | 'General';

/** replies/{autoId} — App.tsx `Reply`, Admin.tsx `Reply` (same fields) */
export interface ReplyDoc extends Timestamped {
  leadId: string;
  category: ReplyCategory;
  text: string;
  at: Instant;                            // Both apps store a display string; migrate to Timestamp
}

/* ------------------------------------------------------------------ */
/* 4. Follow-ups                                                        */
/* Source: App.tsx `FollowUp`; Admin.tsx `FU`                           */
/* ------------------------------------------------------------------ */

/** followUps/{autoId} */
export interface FollowUpDoc extends Timestamped {
  leadId: string;
  due: ISODate;
  time?: string | null;                   // 'HH:mm'. App only; Admin has no time
  reason: string;
  done: boolean;
  /**
   * App only: App sets cancelled = true. Admin deletes the document instead.
   * TODO(confirm): choose one behaviour.
   */
  cancelled?: boolean;
}

/* ------------------------------------------------------------------ */
/* 5. Projects, clients                                                 */
/* Source: App.tsx `Project`, `Client`; Admin.tsx `Project`, `Client`   */
/* ------------------------------------------------------------------ */

/**
 * TODO(confirm): App.tsx uses 'Final Delivery'. Admin.tsx uses 'Delivered'.
 * Both are listed until one is chosen.
 */
export type ProjectStage =
  | 'In Progress' | 'Internal Review' | 'Revision Required' | 'Internal Approval'
  | 'Client Approval' | 'Delivered' | 'Final Delivery';

/**
 * App.tsx: free text ('Monthly retainer (reels)', 'Per-video editing', 'Fixed project', …).
 * Admin.tsx: enum ('Video editing', 'Real estate', …). Stored as string.
 * TODO(confirm): decide whether this becomes a fixed list.
 */
export type ProjectService = string;

/**
 * projects/{autoId}
 * App.tsx stores the client and editor as DISPLAY NAMES (`client`, `editor`).
 * Admin.tsx stores them as IDs (`clientId`, `editorId`). Both are kept as optional fields.
 */
export interface ProjectDoc extends Timestamped {
  title: string;
  service: ProjectService;
  deadline: ISODate;
  progress: number;                       // 0–100
  revisions: number;
  stage: ProjectStage;
  currency: Currency;

  /** App only: client display name. Mirror of clients/{clientId}.name when both exist. */
  client?: string;
  /** Admin only: client document ID. */
  clientId?: string;
  /** App only: editor display name. */
  editor?: string;
  /** Admin only: editor user ID, or null when unassigned. */
  editorId?: string | null;

  /** App only: 'Active' | 'Done'. Admin derives state from stage. */
  status?: string;

  /**
   * Amount the client pays.
   * TODO(confirm): App.tsx uses `price`; Admin.tsx uses `budget`. Both kept until one is chosen.
   * Migration must not drop either value.
   */
  price?: number;
  budget?: number;

  notes?: string;                         // App only (free text)
  tasks?: ProjectTask[];                  // Admin only
  links?: string[];                       // Admin only: external http(s) links (no file upload)
  comments?: string[];                    // Admin only: review comments
}

export interface ProjectTask {
  id: string;
  title: string;
  done: boolean;
}

/** clients/{autoId} — App.tsx `Client` has phone and notes; Admin.tsx `Client` does not. */
export interface ClientDoc extends Timestamped {
  name: string;
  email: string;
  company: string;
  phone?: string;                         // App only
  notes?: string;                         // App only
}

/* ------------------------------------------------------------------ */
/* 6. Finance                                                           */
/* Source: Admin.tsx `Invoice`, `Expense`, `Payout`; App.tsx `Payment`  */
/* ------------------------------------------------------------------ */

/**
 * App.tsx `Payment` has only { id, label, amount, currency, kind } where kind is
 * 'received' | 'pending' | 'payout' | 'expense'. It has NO projectId and NO due date, so it
 * cannot be mapped reliably onto invoices/payouts/expenses without guessing.
 * It is therefore kept as its own collection, `payments`, exactly as the App defines it.
 */
export type PaymentKind = 'received' | 'pending' | 'payout' | 'expense';

/** payments/{autoId} — App.tsx `Payment` */
export interface PaymentDoc extends Timestamped {
  label: string;
  amount: number;
  currency: Currency;                     // App: string. Values used: INR, USD
  kind: PaymentKind;
}

export type InvoiceStatus = 'Draft' | 'Sent' | 'Paid' | 'Overdue';

/** invoices/{autoId} — Admin.tsx `Invoice`. App has no invoice model. */
export interface InvoiceDoc extends Timestamped {
  projectId: string;
  amount: number;
  currency: Currency;
  due: ISODate;
  status: InvoiceStatus;
}

/** expenses/{autoId} — Admin.tsx `Expense` */
export interface ExpenseDoc extends Timestamped {
  label: string;
  amount: number;
  currency: Currency;
  projectId: string | null;               // null = agency overhead
}

/** payouts/{autoId} — Admin.tsx `Payout` (editor payments) */
export interface PayoutDoc extends Timestamped {
  editorId: string;
  projectId: string;
  amount: number;
  currency: Currency;
  status: 'Pending' | 'Paid';
}

/* ------------------------------------------------------------------ */
/* 7. Notifications and activity logs                                   */
/* Source: App.tsx `Notice`, `Activity`; Admin.tsx `Notice`, `Act`      */
/* ------------------------------------------------------------------ */

/**
 * TODO(confirm): App uses 'Message' and 'Payment'. Admin uses 'Team' and 'Finance'.
 * All are listed until the set is agreed.
 */
export type NotificationCategory = 'Lead' | 'Follow-up' | 'Message' | 'Project' | 'Payment' | 'Team' | 'Finance';

/** notifications/{autoId} */
export interface NotificationDoc extends Timestamped {
  cat: NotificationCategory;
  text: string;
  read: boolean;
  /**
   * Admin/App do not store this yet. Optional. null = visible to all with access.
   * TODO(confirm): both apps keep one global read flag today. Per-user read state needs a decision.
   */
  recipientUid?: string | null;
}

export type ActivityCategory = 'Lead' | 'Message' | 'Follow-up' | 'Project' | 'Payment';

/**
 * activityLogs/{autoId}
 * App.tsx `Activity` has { id, cat, text, at }. Admin.tsx `Act` has { id, text, at, by }.
 * `leadId` is NOT in either app. It is added so lead activity can move out of Lead.activity.
 */
export interface ActivityLogDoc extends Timestamped {
  text: string;
  at: Instant;                            // Both apps: display string; migrate to Timestamp
  cat?: ActivityCategory | null;          // App only
  by?: string | null;                     // Admin only: actor label ('Admin (demo)'); TODO(confirm) actor UID
  leadId?: string | null;                 // NEW (not in apps yet)
}

/* ------------------------------------------------------------------ */
/* 8. Targets                                                           */
/* Source: Admin.tsx `Target`; App.tsx Dashboard uses a hard-coded 10   */
/* ------------------------------------------------------------------ */

/** targets/{autoId} — Admin.tsx `Target` */
export interface TargetDoc extends Timestamped {
  label: string;
  scope: 'Team' | 'Personal';
  metric: 'msgs' | 'calls';
  goal: number;
  userId: string | null;                  // required when scope === 'Personal'
}
// TODO(confirm): App.tsx Dashboard uses `const target = 10` (messages per day) with no data
// model. Decide whether it becomes a target document or stays as a per-user setting.

/* ------------------------------------------------------------------ */
/* 9. Settings                                                          */
/* Source: Admin.tsx `Settings`; App.tsx `theme`, `lang` (state)        */
/* ------------------------------------------------------------------ */

export type Theme = 'dark' | 'light' | 'system';
export type DistributionMode = 'Equal' | 'Performance' | 'Availability' | 'Workload' | 'Combined';

/**
 * settings/agency — agency-wide defaults. Admin-only writes.
 * Admin.tsx `Settings` fields: mode, limit, base, fx (theme and reduce are kept in UserPreferencesDoc).
 */
export interface AgencySettingsDoc extends Timestamped {
  mode: DistributionMode;
  limit: number;                          // default active lead limit
  base: Currency;                         // reporting currency
  fx: Record<Currency, number>;           // rate to INR. INR must be 1.
}

/**
 * settings/{uid} — per-user preferences.
 * Admin.tsx keeps `theme` and `reduce`. App.tsx keeps `theme` and `lang`.
 * TODO(confirm): both apps default theme to 'system'; the App's lang state is 'en' | 'hi'.
 */
export interface UserPreferencesDoc extends Timestamped {
  theme: Theme;
  reduce?: boolean;                       // Admin only
  lang?: 'en' | 'hi';                     // App only
}

/* ------------------------------------------------------------------ */
/* Collection → document type map (for typed helpers)                    */
/* ------------------------------------------------------------------ */

export interface CollectionDocMap {
  users: UserDoc;
  invites: InviteDoc;
  leads: LeadDoc;
  leadTransfers: LeadTransferDoc;
  leadHistory: LeadHistoryDoc;
  messageTemplates: MessageTemplateDoc;
  replies: ReplyDoc;
  followUps: FollowUpDoc;
  projects: ProjectDoc;
  clients: ClientDoc;
  invoices: InvoiceDoc;
  expenses: ExpenseDoc;
  payouts: PayoutDoc;
  payments: PaymentDoc;
  notifications: NotificationDoc;
  activityLogs: ActivityLogDoc;
  targets: TargetDoc;
  settings: AgencySettingsDoc | UserPreferencesDoc;
}
