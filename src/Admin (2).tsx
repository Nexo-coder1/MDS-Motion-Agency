import { useEffect, useState, type ReactNode } from 'react';
import './admin.css';
import {
  newId,
  useAdminStore,
  type Role,
  type UStatus,
  type Perm,
  type PayModel,
  type Mode,
  type LStatus,
  type Service,
  type Stage,
  type InvStatus,
  type Tone,
  type Theme,
  type Cur,
  type Section,
  type User,
  type Invite,
  type Lead,
  type Tpl,
  type FU,
  type Project,
  type Notice,
  type Target,
  type Settings,
  type Db,
  type Plan,
  type Ctx,
} from './services/adminStore';

/* =====================================================================
   MDS MOTION AGENCY — ADMIN APPLICATION (Phase B, Firestore-connected)
   Opened with #/admin behind Owner sign-in. Data: Firestore via services/adminStore.ts.
   NOT connected yet: payments, invoices sent to clients, emails, push
   notifications, backups, real FX rates.
   Security is enforced by Firestore Security Rules (Owner-only). The UI gate is not security.
   ===================================================================== */

/* ---------- Types ---------- */

/* ---------- Constants ---------- */
const ALL_PERMS: Perm[] = ['leads', 'projects', 'finance', 'delete', 'archive', 'transfer', 'activity'];
const PERM_LABEL: Record<Perm, string> = { leads: 'Leads', projects: 'Projects', finance: 'Finance', delete: 'Delete', archive: 'Archive', transfer: 'Transfer', activity: 'Activity' };
const ROLE_PERMS: Record<Role, Perm[]> = {
  Owner: ALL_PERMS,
  Manager: ['leads', 'projects', 'delete', 'archive', 'transfer', 'activity'],
  Sales: ['leads', 'archive', 'transfer'],
  Editor: ['projects'],
  Finance: ['finance', 'activity'],
};
const ROLES = Object.keys(ROLE_PERMS) as Role[];
const USTATUS_TONE: Record<UStatus, 'ok' | 'info' | 'warn' | 'err'> = { Active: 'ok', Invited: 'info', Suspended: 'warn', Removed: 'err' };
const LSTATUSES: LStatus[] = ['New', 'Claimed', 'Researching', 'Message Sent', 'Follow-up', 'Replied', 'Interested', 'Call Booked', 'Negotiation', 'Won', 'Lost'];
const SERVICES: Service[] = ['Video editing', 'Real estate', 'Social media', 'Web design', 'Branding', 'Photography', 'Custom'];
const STAGES: Stage[] = ['In Progress', 'Internal Review', 'Revision Required', 'Internal Approval', 'Client Approval', 'Delivered'];
const PAY_MODELS: PayModel[] = ['Per-video', 'Monthly salary', 'Per-project', 'Milestone', 'Custom'];
const MODES: Mode[] = ['Equal', 'Performance', 'Availability', 'Workload', 'Combined'];
const MODE_INFO: Record<Mode, string> = {
  Equal: 'Each lead goes to the eligible active member with the fewest active leads. Result: even spread.',
  Performance: 'Each lead goes to the eligible member with the highest performance score first. Top performers can reach their limit faster.',
  Availability: 'Only members marked available and under their limit receive leads. Fewest active leads wins.',
  Workload: 'Each lead goes to the eligible member with the lowest current workload.',
  Combined: 'Available members under their limit only. Lowest workload first, performance score breaks ties.',
};
const CURS: Cur[] = ['INR', 'USD', 'EUR'];
const CLAIM_MS = 48 * 3600 * 1000;

/* ---------- Pure helpers ---------- */
function iso(offsetDays: number) { const x = new Date(); x.setDate(x.getDate() + offsetDays); return x.toISOString().slice(0, 10); }
const TODAY = iso(0);
const addDays = (s: string, n: number) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const uid = () => Math.random().toString(36).slice(2, 9);
const fmt = (n: number, c: Cur) => new Intl.NumberFormat(c === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(n);
const toBase = (db: Db, n: number, c: Cur) => (n * db.settings.fx[c]) / db.settings.fx[db.settings.base];
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const validUrl = (u: string) => /^https?:\/\/\S+$/i.test(u);
const uName = (db: Db, id: string | null) => (id ? db.users.find(u => u.id === id)?.name ?? '—' : 'Unassigned');
const cName = (db: Db, id: string) => db.clients.find(c => c.id === id)?.name ?? '—';
const pTitle = (db: Db, id: string | null) => db.projects.find(p => p.id === id)?.title ?? '—';
const lName = (db: Db, id: string) => db.leads.find(l => l.id === id)?.name ?? '—';
const leadLoad = (db: Db, id: string) => db.leads.filter(l => l.owner === id && !l.deleted && !['Won', 'Lost'].includes(l.status)).length;
const projLoad = (db: Db, id: string) => db.projects.filter(p => p.editorId === id && p.stage !== 'Delivered').length;
const claimLeft = (l: Lead) => (l.claimedAt === null ? null : Math.max(0, l.claimedAt + CLAIM_MS - Date.now()));
const hm = (ms: number) => `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
const tierOf = (q: number) => (q >= 70 ? 'High' : q >= 50 ? 'Medium' : 'Low');
const rulesQuality = (l: Lead) => Math.min(100, 30 + (l.niche ? 15 : 0) + (['Instagram', 'LinkedIn'].includes(l.platform) ? 10 : 0) + (l.priority === 'High' ? 25 : l.priority === 'Medium' ? 15 : 5) + (l.handle ? 10 : 0));
const badgeFor = (p: number) => (p >= 300 ? 'Elite' : p >= 150 ? 'Pro' : p >= 50 ? 'Starter' : '—');
const csvRow = (rows: (string | number)[][]) => rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
const addAct = (d: Db, text: string): Db => ({ ...d, acts: [{ id: newId(), text, at: 'Just now', by: 'Owner' }, ...d.acts] });

function downloadFile(name: string, type: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* Distribution: plans assignments only. Caller applies the plan. */
function distribute(db: Db, mode: Mode): Plan {
  const cur: Record<string, number> = {};
  db.users.forEach(u => { cur[u.id] = leadLoad(db, u.id); });
  const todo = db.leads.filter(l => !l.deleted && !l.archived && !l.owner && !['Won', 'Lost'].includes(l.status));
  const plan: Plan = { assign: {}, hist: [], skipped: 0, total: todo.length };
  for (const lead of todo) {
    const needAvail = mode === 'Availability' || mode === 'Combined';
    const pool = db.users.filter(u => u.status === 'Active' && cur[u.id] < u.limit && (!needAvail || u.available));
    pool.sort((a, b) => {
      const byLoad = cur[a.id] - cur[b.id];
      if (mode === 'Performance') return b.perf - a.perf || byLoad;
      if (mode === 'Combined') return byLoad || b.perf - a.perf;
      return byLoad;
    });
    const pick = pool[0];
    if (!pick) { plan.skipped++; continue; }
    cur[pick.id]++;
    plan.assign[lead.id] = pick.id;
    plan.hist.push({ id: newId(), leadId: lead.id, to: pick.id, by: `Auto · ${mode}`, at: 'Just now' });
  }
  return plan;
}

/* Stage actions. `rev` = counts as a revision. */
const ACTIONS: Record<Stage, { label: string; to: Stage; rev?: boolean }[]> = {
  'In Progress': [{ label: 'Submit for internal review', to: 'Internal Review' }],
  'Internal Review': [{ label: 'Approve internally', to: 'Internal Approval' }, { label: 'Request revision', to: 'Revision Required', rev: true }],
  'Revision Required': [{ label: 'Revision done → resubmit', to: 'Internal Review' }],
  'Internal Approval': [{ label: 'Send to client', to: 'Client Approval' }, { label: 'Request revision', to: 'Revision Required', rev: true }],
  'Client Approval': [{ label: 'Client requested changes', to: 'Revision Required', rev: true }, { label: 'Client approved → mark delivered', to: 'Delivered' }],
  Delivered: [],
};


/* ---------- Icons (subset; duplicated because App.tsx must stay unchanged) ---------- */
const PATHS = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  more: 'M4 6h16M4 12h16M4 18h16',
  plus: 'M12 5v14M5 12h14',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  x: 'M18 6L6 18M6 6l12 12',
  chevron: 'M9 18l6-6-6-6',
  check: 'M20 6L9 17l-5-5',
  cal: 'M3 6h18v15H3zM8 2v4M16 2v4M3 10h18',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  trash: 'M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14',
  archive: 'M3 4h18v4H3zM5 8v12h14V8M10 12h4',
  target: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  wallet: 'M20 7H5a2 2 0 0 1 0-4h13v4M3 5v14a2 2 0 0 0 2 2h15V7',
  star: 'M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z',
  film: 'M4 4h16v16H4zM8 4v16M16 4v16M4 9h4M4 15h4M16 9h4M16 15h4',
  msg: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  reply: 'M9 17l-5-5 5-5M4 12h11a5 5 0 0 1 5 5v2',
  sparkle: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  info: 'M12 16v-4M12 8h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  download: 'M12 3v12M7 10l5 5 5-5M4 21h16',
  copy: 'M9 9h11v11H9zM5 15V5h10',
};
type IconName = keyof typeof PATHS;
function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg className="ic" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

const SECTIONS: { k: Section; l: string; i: IconName; tabs: { k: string; l: string }[] }[] = [
  { k: 'dashboard', l: 'Dashboard', i: 'home', tabs: [{ k: 'overview', l: 'Overview' }] },
  { k: 'team', l: 'Team', i: 'users', tabs: [{ k: 'accounts', l: 'Accounts' }, { k: 'invites', l: 'Invitations' }, { k: 'perms', l: 'Permissions' }, { k: 'workload', l: 'Workload' }, { k: 'distribution', l: 'Distribution' }, { k: 'transfers', l: 'Transfers' }] },
  { k: 'leads', l: 'Leads', i: 'target', tabs: [{ k: 'all', l: 'All leads' }, { k: 'pipeline', l: 'Pipeline' }, { k: 'quality', l: 'Quality' }, { k: 'templates', l: 'Templates' }, { k: 'replies', l: 'Replies' }, { k: 'followups', l: 'Follow-ups' }, { k: 'deleted', l: 'Deleted' }] },
  { k: 'projects', l: 'Projects', i: 'film', tabs: [{ k: 'list', l: 'Projects' }, { k: 'editors', l: 'Editors' }, { k: 'assign', l: 'Assignments' }, { k: 'deadlines', l: 'Deadlines' }, { k: 'review', l: 'Review' }, { k: 'delivery', l: 'Delivery' }] },
  { k: 'clients', l: 'Clients', i: 'users', tabs: [{ k: 'list', l: 'Clients' }] },
  { k: 'finance', l: 'Finance', i: 'wallet', tabs: [{ k: 'overview', l: 'Overview' }, { k: 'invoices', l: 'Invoices' }, { k: 'payables', l: 'Payables' }, { k: 'expenses', l: 'Expenses' }, { k: 'payments', l: 'Payments' }, { k: 'currency', l: 'Currencies' }] },
  { k: 'reports', l: 'Reports', i: 'sparkle', tabs: [{ k: 'analytics', l: 'Analytics' }, { k: 'targets', l: 'Targets' }, { k: 'rewards', l: 'Rewards' }, { k: 'leaderboard', l: 'Leaderboard' }, { k: 'backup', l: 'Backup' }] },
  { k: 'notifications', l: 'Notifications', i: 'bell', tabs: [{ k: 'notices', l: 'Notices' }, { k: 'activity', l: 'Activity' }] },
  { k: 'settings', l: 'Settings', i: 'gear', tabs: [{ k: 'prefs', l: 'Preferences' }, { k: 'security', l: 'Security' }, { k: 'about', l: 'About' }] },
];

/* ---------- Shared UI ---------- */
function Btn({ children, variant = 'primary', onClick, disabled, title, icon }: { children?: ReactNode; variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'icon'; onClick?: () => void; disabled?: boolean; title?: string; icon?: IconName }) {
  return <button type="button" className={`btn btn-${variant}`} onClick={onClick} disabled={disabled} title={title} aria-label={title}>{icon && <Icon name={icon} size={18} />}{children}</button>;
}
function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'ok' | 'warn' | 'err' | 'info' | 'gold' }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
function Seg<T extends string>({ options, value, onChange }: { options: readonly T[]; value: T; onChange: (v: T) => void }) {
  return <div className="seg" role="tablist">{options.map(o => <button key={o} type="button" role="tab" aria-selected={o === value} className={o === value ? 'on' : ''} onClick={() => onChange(o)}>{o}</button>)}</div>;
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span className="field-label">{label}</span>{children}</label>;
}
function Empty({ text }: { text: string }) { return <div className="empty anim-fade">{text}</div>; }
function Bar({ value }: { value: number }) { return <div className="bar" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}><div className="bar-fill" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div>; }
function Stat({ label, value, sub, icon }: { label: string; value: string | number; sub?: string; icon: IconName }) {
  return <div className="card stat anim-item"><div className="stat-ic"><Icon name={icon} /></div><div><div className="stat-val">{value}</div><div className="stat-lab">{label}</div>{sub && <div className="stat-sub">{sub}</div>}</div></div>;
}
function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return <section className="card"><div className="row-between"><h3>{title}</h3>{action}</div>{children}</section>;
}
function Collapse({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="collapse">
      <button type="button" className="collapse-head" aria-expanded={open} onClick={() => setOpen(o => !o)}>{title}<span className={`chev ${open ? 'open' : ''}`}><Icon name="chevron" size={16} /></span></button>
      <div className={`collapse-body ${open ? 'open' : ''}`}><div>{children}</div></div>
    </div>
  );
}
function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal adm-modal anim-pop" role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>
        <header className="modal-head"><h3>{title}</h3><button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button></header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}
function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="overlay sheet-overlay" onClick={onClose}>
      <div className="sheet anim-slide-up" role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>
        <div className="sheet-grip" /><header className="modal-head"><h3>{title}</h3><button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button></header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
function Tabs({ tab, map }: { tab: string; map: Record<string, ReactNode> }) { return <>{map[tab] ?? null}</>; }

/* ============================================================
   ROOT — state, navigation, toasts, confirm dialog
   ============================================================ */
export default function Admin({ onSignOut }: { onSignOut?: () => void } = {}) {
  const { db, set, loading, error, clearError } = useAdminStore();
  const [section, setSection] = useState<Section>('dashboard');
  const [tab, setTab] = useState('overview');
  const [more, setMore] = useState(false);
  const [toasts, setToasts] = useState<{ id: string; text: string; tone: Tone }[]>([]);
  const [confirm, setConfirm] = useState<{ text: string; run: () => void } | null>(null);

  useEffect(() => {
    const r = document.documentElement;
    if (db.settings.theme === 'system') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', db.settings.theme);
  }, [db.settings.theme]);
  useEffect(() => { document.documentElement.classList.toggle('reduce-motion', db.settings.reduce); }, [db.settings.reduce]);

  const toast = (text: string, tone: Tone = 'ok') => {
    const id = uid();
    setToasts(t => [...t, { id, text, tone }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 2600);
  };
  const ask = (text: string, run: () => void) => setConfirm({ text, run });
  const go = (s: Section, t?: string) => { setSection(s); setTab(t ?? SECTIONS.find(x => x.k === s)!.tabs[0].k); setMore(false); };
  const ctx: Ctx = { db, set, toast, ask, go };
  const sec = SECTIONS.find(s => s.k === section)!;
  const badges: Partial<Record<Section, number>> = {
    leads: db.fus.filter(f => !f.done && f.due <= TODAY).length,
    team: db.transfers.filter(t => t.status === 'Pending').length,
    notifications: db.notices.filter(n => !n.read).length,
  };

  return (
    <div className={`app adm ${loading ? 'is-loading' : ''}`}>
      <Sidebar section={section} onPick={s => go(s)} badges={badges} />
      <div className="main-col">
        <header className="topbar">
          <h1 className="page-title">{sec.l}</h1>
          <span className="adm-role">Admin · demo</span>
          <div className="top-actions">
            <a className="btn btn-secondary" href="#/">User App</a>
            {onSignOut && <button type="button" className="btn btn-secondary" onClick={onSignOut}>Sign out</button>}
            <button type="button" className="avatar" onClick={() => go('settings', 'about')} aria-label="Admin account">AD</button>
          </div>
        </header>
        <div className="demo-banner" role="note"><Icon name="info" size={16} /> ADMIN — Owner sign-in is active. Data is read from and written to Firestore. Nothing is uploaded automatically. Payments, emails, push notifications and backups are not connected yet.</div>
        {error && (
          <div className="notice err adm-banner" role="alert">
            <span>{error}</span>
            <button type="button" className="btn btn-ghost" onClick={clearError}>Dismiss</button>
          </div>
        )}
        {!loading && db.users.length === 0 && db.leads.length === 0 && db.projects.length === 0 && (
          <div className="notice adm-banner" role="status">No records in Firestore yet. Nothing is created automatically. Add records from the sections below.</div>
        )}
        <main className="content">
          {loading ? (
            <div className="skeleton-wrap" aria-hidden="true"><div className="skel" /><div className="skel short" /><div className="skel" /></div>
          ) : (
            <div className="page anim-page" key={section + tab}>
              <div className="seg-scroll">
                <div className="seg" role="tablist" aria-label={`${sec.l} sections`}>
                  {sec.tabs.map(t => <button key={t.k} type="button" role="tab" aria-selected={tab === t.k} className={tab === t.k ? 'on' : ''} onClick={() => setTab(t.k)}>{t.l}</button>)}
                </div>
              </div>
              <div style={{ height: 14 }} />
              <SectionView section={section} tab={tab} ctx={ctx} />
            </div>
          )}
        </main>
      </div>

      <nav className="mobile-nav" aria-label="Admin bottom navigation">
        {(['dashboard', 'team', 'leads', 'projects'] as Section[]).map(k => {
          const s = SECTIONS.find(x => x.k === k)!;
          return <button key={k} type="button" className={section === k ? 'on' : ''} onClick={() => go(k)}><Icon name={s.i} /><span>{s.l}</span></button>;
        })}
        <button type="button" onClick={() => setMore(true)} aria-label="More sections"><Icon name="more" /><span>More</span></button>
      </nav>
      {more && (
        <Sheet title="All sections" onClose={() => setMore(false)}>
          <div className="grid-menu">{SECTIONS.map(s => <button key={s.k} type="button" className="menu-tile" onClick={() => go(s.k)}><Icon name={s.i} /><span>{s.l}</span></button>)}</div>
        </Sheet>
      )}
      {confirm && (
        <Modal title="Please confirm (demo)" onClose={() => setConfirm(null)} footer={<><Btn variant="secondary" onClick={() => setConfirm(null)}>Cancel</Btn><Btn variant="danger" onClick={() => { confirm.run(); setConfirm(null); }}>Confirm</Btn></>}>
          <p>{confirm.text}</p>
        </Modal>
      )}
      <div className="toasts" aria-live="polite">{toasts.map(t => <div key={t.id} className={`toast toast-${t.tone} anim-toast`}>{t.text}</div>)}</div>
    </div>
  );
}

function Sidebar({ section, onPick, badges }: { section: Section; onPick: (s: Section) => void; badges: Partial<Record<Section, number>> }) {
  const groups: { t: string; items: Section[] }[] = [
    { t: 'Operations', items: ['dashboard', 'team', 'leads', 'projects', 'clients'] },
    { t: 'Money & reports', items: ['finance', 'reports'] },
    { t: 'System', items: ['notifications', 'settings'] },
  ];
  const [open, setOpen] = useState<Record<string, boolean>>({ Operations: true, 'Money & reports': true, System: false });
  return (
    <aside className="sidebar" aria-label="Admin navigation">
      <div className="brand"><span className="logo">M</span><div><div className="brand-name">MDS Admin</div><div className="brand-sub">Agency control · demo</div></div></div>
      {groups.map(g => (
        <div key={g.t} className="nav-group">
          <button type="button" className="nav-group-head" aria-expanded={open[g.t]} onClick={() => setOpen(o => ({ ...o, [g.t]: !o[g.t] }))}>{g.t}<span className={`chev ${open[g.t] ? 'open' : ''}`}><Icon name="chevron" size={14} /></span></button>
          <div className={`collapse-body ${open[g.t] ? 'open' : ''}`}><div>
            {g.items.map(k => {
              const s = SECTIONS.find(x => x.k === k)!;
              const b = badges[k];
              return (
                <button key={k} type="button" className={`nav-item ${section === k ? 'active' : ''}`} onClick={() => onPick(k)} aria-current={section === k ? 'page' : undefined}>
                  <Icon name={s.i} size={18} /><span>{s.l}</span>{!!b && <span className="count">{b}</span>}
                </button>
              );
            })}
          </div></div>
        </div>
      ))}
    </aside>
  );
}

function SectionView({ section, tab, ctx }: { section: Section; tab: string; ctx: Ctx }) {
  switch (section) {
    case 'dashboard': return <Dashboard ctx={ctx} />;
    case 'team': return <Tabs tab={tab} map={{ accounts: <Accounts ctx={ctx} />, invites: <Invites ctx={ctx} />, perms: <Perms ctx={ctx} />, workload: <Workload ctx={ctx} />, distribution: <Distribution ctx={ctx} />, transfers: <Transfers ctx={ctx} /> }} />;
    case 'leads': return <Tabs tab={tab} map={{ all: <AllLeads ctx={ctx} />, pipeline: <Pipeline ctx={ctx} />, quality: <Quality ctx={ctx} />, templates: <Templates ctx={ctx} />, replies: <Replies ctx={ctx} />, followups: <FollowUps ctx={ctx} />, deleted: <Deleted ctx={ctx} /> }} />;
    case 'projects': return <Tabs tab={tab} map={{ list: <ProjectList ctx={ctx} />, editors: <Editors ctx={ctx} />, assign: <Assignments ctx={ctx} />, deadlines: <Deadlines ctx={ctx} />, review: <Review ctx={ctx} />, delivery: <Delivery ctx={ctx} /> }} />;
    case 'clients': return <ClientList ctx={ctx} />;
    case 'finance': return <Tabs tab={tab} map={{ overview: <FinOverview ctx={ctx} />, invoices: <Invoices ctx={ctx} />, payables: <Payables ctx={ctx} />, expenses: <Expenses ctx={ctx} />, payments: <Payments ctx={ctx} />, currency: <Currency ctx={ctx} /> }} />;
    case 'reports': return <Tabs tab={tab} map={{ analytics: <Analytics ctx={ctx} />, targets: <Targets ctx={ctx} />, rewards: <Rewards ctx={ctx} />, leaderboard: <Leaderboard ctx={ctx} />, backup: <Backup ctx={ctx} /> }} />;
    case 'notifications': return <Tabs tab={tab} map={{ notices: <Notices ctx={ctx} />, activity: <ActivityLog ctx={ctx} /> }} />;
    case 'settings': return <Tabs tab={tab} map={{ prefs: <Prefs ctx={ctx} />, security: <Security />, about: <About /> }} />;
  }
}

/* ============================================================
   DASHBOARD
   ============================================================ */
function Dashboard({ ctx }: { ctx: Ctx }) {
  const { db, go } = ctx;
  const now = Date.now();
  const sumBase = (rows: { amount: number; currency: Cur }[]) => rows.reduce((a, r) => a + toBase(db, r.amount, r.currency), 0);
  const unassigned = db.leads.filter(l => !l.deleted && !l.archived && !l.owner && !['Won', 'Lost'].includes(l.status)).length;
  const expired = db.leads.filter(l => !l.deleted && l.claimedAt !== null && now - l.claimedAt > CLAIM_MS).length;
  const pendingTr = db.transfers.filter(t => t.status === 'Pending').length;
  const overdueFU = db.fus.filter(f => !f.done && f.due < TODAY).length;
  const overdueProj = db.projects.filter(p => p.stage !== 'Delivered' && p.deadline < TODAY).length;
  const overdueInv = db.invoices.some(i => i.status === 'Overdue');
  const receivable = sumBase(db.invoices.filter(i => i.status === 'Sent' || i.status === 'Overdue'));
  const payables = sumBase(db.payouts.filter(p => p.status === 'Pending'));
  const revenue = sumBase(db.invoices.filter(i => i.status === 'Paid'));
  const paidOut = sumBase(db.payouts.filter(p => p.status === 'Paid'));
  const expenses = sumBase(db.expenses);
  const profit = revenue - paidOut - expenses;
  const alerts: { t: string; tone: 'err' | 'warn' | 'info'; s: Section; tab: string }[] = [];
  if (overdueFU) alerts.push({ t: `${overdueFU} overdue follow-up(s)`, tone: 'err', s: 'leads', tab: 'followups' });
  if (expired) alerts.push({ t: `${expired} lead claim(s) expired — admin decision needed`, tone: 'err', s: 'leads', tab: 'all' });
  if (pendingTr) alerts.push({ t: `${pendingTr} lead transfer request(s) pending`, tone: 'warn', s: 'team', tab: 'transfers' });
  if (unassigned) alerts.push({ t: `${unassigned} unassigned lead(s) — run distribution`, tone: 'info', s: 'team', tab: 'distribution' });
  if (overdueProj) alerts.push({ t: `${overdueProj} project(s) past deadline`, tone: 'err', s: 'projects', tab: 'deadlines' });
  if (overdueInv) alerts.push({ t: 'Overdue invoice(s) — check receivables', tone: 'warn', s: 'finance', tab: 'invoices' });
  return (
    <div className="stack">
      <div className="quick-actions" role="group" aria-label="Quick actions">
        <Btn icon="plus" onClick={() => go('team', 'invites')}>Invite user</Btn>
        <Btn variant="secondary" onClick={() => go('team', 'distribution')}>Run distribution</Btn>
        <Btn variant="secondary" onClick={() => go('projects', 'list')}>New project</Btn>
        <Btn variant="secondary" onClick={() => go('finance', 'invoices')}>New invoice</Btn>
      </div>
      <section className="grid stats">
        <Stat icon="users" label="Active members" value={db.users.filter(u => u.status === 'Active').length} />
        <Stat icon="target" label="Unassigned leads" value={unassigned} />
        <Stat icon="reply" label="Transfers pending" value={pendingTr} />
        <Stat icon="cal" label="Overdue follow-ups" value={overdueFU} />
        <Stat icon="film" label="Active projects" value={db.projects.filter(p => p.stage !== 'Delivered').length} sub={`${overdueProj} overdue`} />
        <Stat icon="wallet" label="Receivables" value={fmt(receivable, db.settings.base)} sub="Demo" />
        <Stat icon="wallet" label="Payables" value={fmt(payables, db.settings.base)} sub="Demo" />
        <Stat icon="star" label="Paid revenue" value={fmt(revenue, db.settings.base)} sub="Demo" />
        <Stat icon="sparkle" label="Expenses" value={fmt(expenses, db.settings.base)} sub="Demo" />
        <Stat icon="target" label="Profit" value={fmt(profit, db.settings.base)} sub="Demo: revenue − payouts − expenses" />
      </section>
      <Panel title="Alerts">
        {alerts.length === 0 ? <Empty text="No alerts right now (demo data)." /> : (
          <div className="list">
            {alerts.map((a, i) => (
              <div key={i} className={`list-row adm-alert ${a.tone}`}>
                <span className="grow">{a.t}</span>
                <Btn variant="ghost" onClick={() => go(a.s, a.tab)}>Open</Btn>
              </div>
            ))}
          </div>
        )}
      </Panel>
      <section className="grid two">
        <Panel title="Recent agency activity"><div className="list">{db.acts.slice(0, 4).map(a => <div key={a.id} className="list-row static"><span>{a.text}</span><span className="muted small">{a.at}</span></div>)}</div></Panel>
        <Panel title="Team snapshot"><div className="list">{db.users.filter(u => u.status !== 'Removed').map(u => <div key={u.id} className="list-row static"><span>{u.name} · {u.role}</span><Badge tone={USTATUS_TONE[u.status]}>{u.status}</Badge></div>)}</div></Panel>
      </section>
    </div>
  );
}

/* ============================================================
   TEAM — accounts, invites, permissions, workload, distribution, transfers
   ============================================================ */
function Accounts({ ctx }: { ctx: Ctx }) {
  const { db, set, toast, ask } = ctx;
  const [status, setStatus] = useState<'All' | UStatus>('All');
  const [openId, setOpenId] = useState<string | null>(null);
  const rows = db.users.filter(u => status === 'All' || u.status === status);
  const u = db.users.find(x => x.id === openId);
  const patch = (id: string, p: Partial<User>, msg?: string) => set(d => {
    const nd = { ...d, users: d.users.map(x => (x.id === id ? { ...x, ...p } : x)) };
    return msg ? addAct(nd, msg) : nd;
  });
  const removeUser = (x: User) => ask(`Remove ${x.name}? Their leads will be unassigned. Data is kept for recovery (demo).`, () => {
    set(d => addAct({
      ...d,
      users: d.users.map(y => (y.id === x.id ? { ...y, status: 'Removed' } : y)),
      leads: d.leads.map(l => (l.owner === x.id ? { ...l, owner: null, claimedAt: null, status: l.status === 'Claimed' ? 'New' : l.status } : l)),
    }, `Removed ${x.name}`));
    setOpenId(null);
    toast(`${x.name} removed (demo)`);
  });
  return (
    <div className="stack">
      <Panel title="User accounts" action={
        <select aria-label="Filter by status" value={status} onChange={e => setStatus(e.target.value as 'All' | UStatus)} style={{ width: 'auto' }}>
          {(['All', 'Active', 'Invited', 'Suspended', 'Removed'] as const).map(s => <option key={s}>{s}</option>)}
        </select>}>
        <div className="table-wrap"><table>
          <thead><tr><th>Name</th><th>Role</th><th>Status</th><th>Workload</th><th></th></tr></thead>
          <tbody>
            {rows.map(x => (
              <tr key={x.id}>
                <td><strong>{x.name}</strong><div className="muted small">{x.email}</div></td>
                <td>{x.role}</td>
                <td><Badge tone={USTATUS_TONE[x.status]}>{x.status}</Badge></td>
                <td>{leadLoad(db, x.id)} / {x.limit} leads · {projLoad(db, x.id)} projects</td>
                <td><Btn variant="ghost" onClick={() => setOpenId(x.id)}>Manage</Btn></td>
              </tr>
            ))}
          </tbody>
        </table></div>
        {rows.length === 0 && <Empty text="No accounts in this status." />}
      </Panel>
      {u && (
        <Modal title={u.name} onClose={() => setOpenId(null)} footer={
          <>
            {u.status !== 'Removed' && <Btn variant="danger" icon="trash" disabled={u.role === 'Owner'} title={u.role === 'Owner' ? 'Owner cannot be removed (demo rule)' : 'Remove user'} onClick={() => removeUser(u)}>Remove</Btn>}
            <Btn variant="secondary" onClick={() => setOpenId(null)}>Close</Btn>
          </>}>
          <div className="kv"><span>Email</span><span>{u.email}</span></div>
          <div className="kv"><span>Status</span><Badge tone={USTATUS_TONE[u.status]}>{u.status}</Badge></div>
          <Field label="Role (applies role preset permissions)">
            <select value={u.role} onChange={e => { const r = e.target.value as Role; patch(u.id, { role: r, perms: ROLE_PERMS[r] }, `${u.name} role → ${r}`); }}>
              {ROLES.map(r => <option key={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="Active lead limit">
            <input type="number" min={0} value={u.limit} onChange={e => patch(u.id, { limit: Math.max(0, Number(e.target.value) || 0) })} />
          </Field>
          <label className="check"><input type="checkbox" checked={u.available} onChange={e => patch(u.id, { available: e.target.checked }, `${u.name} availability → ${e.target.checked ? 'on' : 'off'}`)} /> Available for new leads</label>
          <Field label="Pay model (editors)">
            <select value={u.payModel} onChange={e => patch(u.id, { payModel: e.target.value as PayModel }, `${u.name} pay model → ${e.target.value}`)}>
              {PAY_MODELS.map(p => <option key={p}>{p}</option>)}
            </select>
          </Field>
          <div className="row-wrap">
            {(u.status === 'Suspended' || u.status === 'Invited') && <Btn onClick={() => patch(u.id, { status: 'Active' }, `Activated ${u.name}`)}>Activate</Btn>}
            {u.status === 'Active' && <Btn variant="secondary" disabled={u.role === 'Owner'} onClick={() => patch(u.id, { status: 'Suspended' }, `Suspended ${u.name}`)}>Suspend</Btn>}
            {u.status === 'Removed' && <Btn variant="secondary" onClick={() => patch(u.id, { status: 'Suspended' }, `Restored ${u.name} as Suspended`)}>Restore (as Suspended)</Btn>}
          </div>
          <p className="muted small">Status changes here are frontend demo state. Real login blocking is a backend-phase item.</p>
        </Modal>
      )}
    </div>
  );
}

function Invites({ ctx }: { ctx: Ctx }) {
  const { db, set, toast } = ctx;
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('Sales');
  const send = () => {
    const e = email.trim().toLowerCase();
    if (!validEmail(e)) return toast('Enter a valid email address', 'err');
    if (db.users.some(u => u.email.toLowerCase() === e && u.status !== 'Removed') || db.invites.some(i => i.email.toLowerCase() === e)) return toast('This email is already a user or invited', 'err');
    set(d => addAct({ ...d, invites: [{ id: newId(), email: e, role, sent: 'Just now' }, ...d.invites] }, `Invited ${e} as ${role}`));
    setEmail('');
    toast('Invitation created (demo — no email is sent)', 'info');
  };
  const activate = (inv: Invite) => {
    const name = inv.email.split('@')[0].replace(/[._-]+/g, ' ');
    set(d => addAct({
      ...d,
      invites: d.invites.filter(i => i.id !== inv.id),
      users: [...d.users, { id: newId(), name, email: inv.email, role: inv.role, status: 'Active', perms: ROLE_PERMS[inv.role], available: true, limit: d.settings.limit, perf: 0, points: 0, msgs: 0, calls: 0, payModel: 'Monthly salary', rate: 0 }],
    }, `${inv.email} activated as ${inv.role}`));
    toast('Account activated (simulated — demo)');
  };
  return (
    <div className="stack">
      <Panel title="Invite a team member">
        <div className="adm-form">
          <Field label="Email"><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@agency.com" aria-invalid={!!email && !validEmail(email)} /></Field>
          <Field label="Role"><select value={role} onChange={e => setRole(e.target.value as Role)}>{ROLES.map(r => <option key={r}>{r}</option>)}</select></Field>
          <Btn icon="plus" onClick={send}>Create invite</Btn>
        </div>
        <p className="muted small">Role presets set starting permissions; you can customise them in Permissions.</p>
      </Panel>
      <Panel title="Pending invitations">
        {db.invites.length === 0 ? <Empty text="No pending invitations." /> : (
          <div className="list">
            {db.invites.map(inv => (
              <div key={inv.id} className="list-row static anim-item">
                <div><strong>{inv.email}</strong><div className="muted small">{inv.role} · sent {inv.sent}</div></div>
                <div className="row-wrap">
                  <Btn variant="secondary" onClick={() => activate(inv)}>Simulate activation</Btn>
                  <Btn variant="ghost" onClick={() => toast('Resend simulated (demo — nothing sent)', 'info')}>Resend</Btn>
                  <Btn variant="icon" icon="trash" title="Revoke invite" onClick={() => { set(d => addAct({ ...d, invites: d.invites.filter(i => i.id !== inv.id) }, `Revoked invite ${inv.email}`)); toast('Invite revoked (demo)'); }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function Perms({ ctx }: { ctx: Ctx }) {
  const { db, set, toast } = ctx;
  const rows = db.users.filter(u => u.status !== 'Removed');
  const toggle = (id: string, p: Perm) => set(d => addAct({
    ...d,
    users: d.users.map(x => (x.id !== id ? x : { ...x, perms: x.perms.includes(p) ? x.perms.filter(q => q !== p) : [...x.perms, p] })),
  }, `Permission "${PERM_LABEL[p]}" changed for ${uName(d, id)}`));
  const reset = (u: User) => { set(d => addAct({ ...d, users: d.users.map(x => (x.id === u.id ? { ...x, perms: ROLE_PERMS[x.role] } : x)) }, `Reset permissions for ${u.name} to ${u.role} preset`)); toast('Reset to role preset (demo)'); };
  return (
    <Panel title="Custom user permissions" action={<span className="muted small">Frontend control only</span>}>
      <div className="table-wrap"><table className="adm-matrix">
        <thead><tr><th>Member</th>{ALL_PERMS.map(p => <th key={p}>{PERM_LABEL[p]}</th>)}<th></th></tr></thead>
        <tbody>
          {rows.map(u => (
            <tr key={u.id}>
              <td><strong>{u.name}</strong><div className="muted small">{u.role}</div></td>
              {ALL_PERMS.map(p => (
                <td key={p}><input type="checkbox" aria-label={`${PERM_LABEL[p]} for ${u.name}`} checked={u.perms.includes(p)} disabled={u.role === 'Owner'} onChange={() => toggle(u.id, p)} style={{ width: 'auto' }} /></td>
              ))}
              <td><Btn variant="ghost" onClick={() => reset(u)}>Reset</Btn></td>
            </tr>
          ))}
        </tbody>
      </table></div>
      <p className="muted small">Owner always keeps full permissions (demo rule). Lead access, project access, finance access, delete/archive and transfer rules are enforced by the backend in Phase 3.</p>
    </Panel>
  );
}

function Workload({ ctx }: { ctx: Ctx }) {
  const { db, set } = ctx;
  const rows = db.users.filter(u => u.status !== 'Removed');
  const upd = (id: string, p: Partial<User>) => set(d => ({ ...d, users: d.users.map(x => (x.id === id ? { ...x, ...p } : x)) }));
  return (
    <Panel title="Workload and availability" action={<Btn variant="secondary" onClick={() => { set(d => addAct({ ...d, users: d.users.map(x => (x.status === 'Active' ? { ...x, limit: d.settings.limit } : x)) }, `Applied default limit ${db.settings.limit} to Active members`)); }}>Apply default limit</Btn>}>
      <div className="table-wrap"><table>
        <thead><tr><th>Member</th><th>Load</th><th>Available</th><th>Limit</th><th>Performance</th></tr></thead>
        <tbody>
          {rows.map(u => (
            <tr key={u.id}>
              <td><strong>{u.name}</strong><div className="muted small">{u.status}</div></td>
              <td style={{ minWidth: 160 }}><div className="small">{leadLoad(db, u.id)} / {u.limit}</div><Bar value={pct(leadLoad(db, u.id), Math.max(1, u.limit))} /></td>
              <td><input type="checkbox" aria-label={`Available: ${u.name}`} checked={u.available} onChange={e => upd(u.id, { available: e.target.checked })} style={{ width: 'auto' }} /></td>
              <td><input className="adm-input" type="number" min={0} aria-label={`Limit: ${u.name}`} value={u.limit} onChange={e => upd(u.id, { limit: Math.max(0, Number(e.target.value) || 0) })} /></td>
              <td><input className="adm-input" type="number" min={0} max={100} aria-label={`Performance: ${u.name}`} value={u.perf} onChange={e => upd(u.id, { perf: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })} /></td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </Panel>
  );
}

function Distribution({ ctx }: { ctx: Ctx }) {
  const { db, set, toast, ask } = ctx;
  const mode = db.settings.mode;
  const unassigned = db.leads.filter(l => !l.deleted && !l.archived && !l.owner && !['Won', 'Lost'].includes(l.status)).length;
  const [leadId, setLeadId] = useState(db.leads.find(l => !l.deleted && !l.owner)?.id ?? '');
  const [userId, setUserId] = useState(db.users.find(u => u.status === 'Active')?.id ?? '');
  const applyPlan = (plan: Plan, label: string) => set(d => addAct({
    ...d,
    leads: d.leads.map(l => (plan.assign[l.id] ? { ...l, owner: plan.assign[l.id], claimedAt: Date.now(), status: l.status === 'New' ? 'Claimed' : l.status } : l)),
    hist: [...plan.hist, ...d.hist],
  }, label));
  const run = () => {
    const plan = distribute(db, mode);
    const n = Object.keys(plan.assign).length;
    ask(`Run ${mode} distribution on ${plan.total} unassigned lead(s)? ${n} will be assigned, ${plan.skipped} skipped (no eligible member).`, () => {
      applyPlan(plan, `Ran ${mode} distribution: ${n} assigned, ${plan.skipped} skipped`);
      toast(`${n} lead(s) assigned (demo)`);
    });
  };
  const manual = () => {
    const l = db.leads.find(x => x.id === leadId);
    const u = db.users.find(x => x.id === userId);
    if (!l || !u) return toast('Pick a lead and a member', 'err');
    const over = leadLoad(db, u.id) >= u.limit;
    applyPlan({ assign: { [l.id]: u.id }, hist: [{ id: newId(), leadId: l.id, to: u.id, by: over ? 'Manual (over limit)' : 'Manual', at: 'Just now' }], skipped: 0, total: 1 }, `Assigned ${l.name} → ${u.name}${over ? ' (over limit)' : ''}`);
    toast(over ? 'Assigned, but member is over their limit (manual override)' : 'Lead assigned (demo)', over ? 'info' : 'ok');
  };
  return (
    <div className="stack">
      <Panel title="Distribution mode">
        <Seg options={MODES} value={mode} onChange={m => set(d => ({ ...d, settings: { ...d.settings, mode: m } }))} />
        <p className="small" style={{ marginTop: 10 }}>{MODE_INFO[mode]}</p>
        <div className="row-wrap" style={{ marginTop: 10 }}>
          <Btn onClick={run} disabled={unassigned === 0}>Run {mode} distribution ({unassigned} unassigned)</Btn>
          <span className="muted small">Only Active members under their limit are eligible. Demo run only.</span>
        </div>
      </Panel>
      <Panel title="Active lead limit (default)">
        <div className="row-wrap">
          <Field label="Default limit for new members"><input className="adm-input" type="number" min={0} value={db.settings.limit} onChange={e => set(d => ({ ...d, settings: { ...d.settings, limit: Math.max(0, Number(e.target.value) || 0) } }))} /></Field>
          <span className="muted small">Use "Apply default limit" in Workload to update existing members.</span>
        </div>
      </Panel>
      <Panel title="Manual assignment">
        <div className="adm-form">
          <Field label="Lead">
            <select value={leadId} onChange={e => setLeadId(e.target.value)}>
              {db.leads.filter(l => !l.deleted && !l.archived).map(l => <option key={l.id} value={l.id}>{l.name} · {uName(db, l.owner)}</option>)}
            </select>
          </Field>
          <Field label="Assign to"><select value={userId} onChange={e => setUserId(e.target.value)}>{db.users.filter(u => u.status === 'Active').map(u => <option key={u.id} value={u.id}>{u.name} ({leadLoad(db, u.id)}/{u.limit})</option>)}</select></Field>
          <Btn variant="secondary" onClick={manual}>Assign lead</Btn>
        </div>
      </Panel>
      <Panel title="Assignment history">
        {db.hist.length === 0 ? <Empty text="No assignments yet." /> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Lead</th><th>Assigned to</th><th>Method</th><th>When</th></tr></thead>
            <tbody>{db.hist.slice(0, 25).map(h => <tr key={h.id}><td>{lName(db, h.leadId)}</td><td>{uName(db, h.to)}</td><td><Badge>{h.by}</Badge></td><td>{h.at}</td></tr>)}</tbody>
          </table></div>
        )}
      </Panel>
    </div>
  );
}

function Transfers({ ctx }: { ctx: Ctx }) {
  const { db, set, toast } = ctx;
  const transferable = db.leads.filter(l => !l.deleted && l.owner && db.users.find(u => u.id === l.owner)?.perms.includes('transfer'));
  const [leadId, setLeadId] = useState(transferable[0]?.id ?? '');
  const lead = db.leads.find(l => l.id === leadId);
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const targets = db.users.filter(u => u.status === 'Active' && u.id !== lead?.owner);
  const request = () => {
    if (!lead || !lead.owner) return toast('Pick a lead that has an owner', 'err');
    const target = to || targets[0]?.id;
    if (!target) return toast('No eligible member to transfer to', 'err');
    if (!reason.trim()) return toast('Add a reason for the transfer', 'err');
    set(d => addAct({ ...d, transfers: [{ id: newId(), leadId: lead.id, from: lead.owner!, to: target, reason: reason.trim(), status: 'Pending' }, ...d.transfers] }, `Transfer requested: ${lead.name}`));
    setReason(''); toast('Transfer request created (pending approval)');
  };
  const decide = (id: string, ok: boolean) => {
    const t = db.transfers.find(x => x.id === id);
    if (!t) return;
    set(d => {
      const nd: Db = {
        ...d,
        transfers: d.transfers.map(x => (x.id === id ? { ...x, status: ok ? 'Approved' : 'Rejected' } : x)),
        leads: ok ? d.leads.map(l => (l.id === t.leadId ? { ...l, owner: t.to, claimedAt: Date.now() } : l)) : d.leads,
        hist: ok ? [{ id: newId(), leadId: t.leadId, to: t.to, by: 'Transfer approved', at: 'Just now' }, ...d.hist] : d.hist,
      };
      return addAct(nd, `Transfer ${ok ? 'approved' : 'rejected'}: ${lName(d, t.leadId)}`);
    });
    toast(ok ? 'Transfer approved (demo)' : 'Transfer rejected (demo)', ok ? 'ok' : 'info');
  };
  return (
    <div className="stack">
      <Panel title="Create transfer request">
        {transferable.length === 0 ? <Empty text="No leads owned by members with Transfer permission." /> : (
          <div className="adm-form">
            <Field label="Lead"><select value={leadId} onChange={e => setLeadId(e.target.value)}>{transferable.map(l => <option key={l.id} value={l.id}>{l.name} · {uName(db, l.owner)}</option>)}</select></Field>
            <Field label="Transfer to"><select value={to} onChange={e => setTo(e.target.value)}><option value="">Auto (first eligible)</option>{targets.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
            <Field label="Reason"><input value={reason} onChange={e => setReason(e.target.value)} placeholder="Why should this lead move?" /></Field>
            <Btn icon="reply" onClick={request}>Request transfer</Btn>
          </div>
        )}
        <p className="muted small">Only members with Transfer permission can request transfers (frontend rule). Admin approval is required.</p>
      </Panel>
      <Panel title="Transfer requests">
        {db.transfers.length === 0 ? <Empty text="No transfer requests." /> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Lead</th><th>From</th><th>To</th><th>Reason</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {db.transfers.map(t => (
                <tr key={t.id}>
                  <td>{lName(db, t.leadId)}</td><td>{uName(db, t.from)}</td><td>{uName(db, t.to)}</td><td>{t.reason}</td>
                  <td><Badge tone={t.status === 'Pending' ? 'warn' : t.status === 'Approved' ? 'ok' : 'err'}>{t.status}</Badge></td>
                  <td>{t.status === 'Pending' && <div className="row-wrap"><Btn variant="secondary" onClick={() => decide(t.id, true)}>Approve</Btn><Btn variant="ghost" onClick={() => decide(t.id, false)}>Reject</Btn></div>}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </Panel>
    </div>
  );
}

/* ============================================================
   LEADS — all leads, pipeline, quality, templates, replies, follow-ups, deleted
   ============================================================ */
function AllLeads({ ctx }: { ctx: Ctx }) {
  const { db, set, toast, ask } = ctx;
  const [q, setQ] = useState('');
  const [st, setSt] = useState<'All' | LStatus>('All');
  const [own, setOwn] = useState('All');
  const [pr, setPr] = useState<'All' | 'High' | 'Medium' | 'Low'>('All');
  const [sort, setSort] = useState<'Newest' | 'Quality' | 'Name'>('Newest');
  const [showArch, setShowArch] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [nName, setNName] = useState('');
  const [nHandle, setNHandle] = useState('');
  const [nPlat, setNPlat] = useState('Instagram');
  const [nOwner, setNOwner] = useState('');

  const rows = db.leads
    .filter(l => !l.deleted && (showArch || !l.archived) && (st === 'All' || l.status === st) && (own === 'All' || (own === 'none' ? !l.owner : l.owner === own)) && (pr === 'All' || l.priority === pr) && (!q || [l.name, l.handle, l.niche].some(v => v.toLowerCase().includes(q.toLowerCase()))))
    .sort((a, b) => (sort === 'Quality' ? b.quality - a.quality : sort === 'Name' ? a.name.localeCompare(b.name) : 0));
  const u = db.leads.find(x => x.id === openId);

  const patchLead = (id: string, p: Partial<Lead>, msg?: string) => set(d => {
    const nd = { ...d, leads: d.leads.map(l => (l.id === id ? { ...l, ...p } : l)) };
    return msg ? addAct(nd, msg) : nd;
  });
  const assign = (l: Lead, to: string | null) => set(d => {
    const nd: Db = {
      ...d,
      leads: d.leads.map(x => (x.id === l.id ? { ...x, owner: to, claimedAt: to ? Date.now() : null, status: to && x.status === 'New' ? 'Claimed' : x.status } : x)),
      hist: to ? [{ id: newId(), leadId: l.id, to, by: 'Manual', at: 'Just now' }, ...d.hist] : d.hist,
    };
    return addAct(nd, `${l.name} → ${uName(d, to)}`);
  });
  const addLead = () => {
    if (!nName.trim()) return toast('Name is required', 'err');
    if (!nHandle.trim()) return toast('Handle or profile link is required', 'err');
    if (db.leads.some(l => !l.deleted && l.handle.toLowerCase() === nHandle.trim().toLowerCase())) return toast('Duplicate: this handle already exists', 'err');
    const id = newId();
    set(d => addAct({ ...d, leads: [{ id, name: nName.trim(), platform: nPlat, handle: nHandle.trim(), status: nOwner ? 'Claimed' : 'New', priority: 'Medium', owner: nOwner || null, quality: 50, niche: '', deleted: false, archived: false, claimedAt: nOwner ? Date.now() : null }, ...d.leads] }, `Added lead ${nName.trim()}`));
    setNName(''); setNHandle(''); toast('Lead added (demo)');
  };
  const del = (l: Lead) => ask(`Move ${l.name} to Deleted? You can restore it from the Deleted tab.`, () => { patchLead(l.id, { deleted: true }, `Deleted lead ${l.name}`); toast('Moved to Deleted (demo)'); });

  return (
    <div className="stack">
      <Collapse title="Add lead (manual)">
        <div className="adm-form">
          <Field label="Name *"><input value={nName} onChange={e => setNName(e.target.value)} /></Field>
          <Field label="Handle / profile *"><input value={nHandle} onChange={e => setNHandle(e.target.value)} /></Field>
          <Field label="Platform"><select value={nPlat} onChange={e => setNPlat(e.target.value)}>{['Instagram', 'WhatsApp', 'LinkedIn', 'Email', 'Other'].map(p => <option key={p}>{p}</option>)}</select></Field>
          <Field label="Assign to (optional)"><select value={nOwner} onChange={e => setNOwner(e.target.value)}><option value="">Unassigned</option>{db.users.filter(x => x.status === 'Active').map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
          <Btn icon="plus" onClick={addLead}>Add lead</Btn>
        </div>
      </Collapse>
      <div className="toolbar">
        <div className="search-input"><Icon name="search" size={16} /><input aria-label="Search leads" placeholder="Search name, handle, niche" value={q} onChange={e => setQ(e.target.value)} /></div>
      </div>
      <div className="row-wrap">
        <select aria-label="Status filter" value={st} onChange={e => setSt(e.target.value as 'All' | LStatus)} style={{ width: 'auto' }}><option>All</option>{LSTATUSES.map(s => <option key={s}>{s}</option>)}</select>
        <select aria-label="Owner filter" value={own} onChange={e => setOwn(e.target.value)} style={{ width: 'auto' }}><option value="All">All owners</option><option value="none">Unassigned</option>{db.users.filter(x => x.status !== 'Removed').map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        <select aria-label="Priority filter" value={pr} onChange={e => setPr(e.target.value as 'All' | 'High' | 'Medium' | 'Low')} style={{ width: 'auto' }}><option>All</option><option>High</option><option>Medium</option><option>Low</option></select>
        <select aria-label="Sort leads" value={sort} onChange={e => setSort(e.target.value as 'Newest' | 'Quality' | 'Name')} style={{ width: 'auto' }}><option>Newest</option><option>Quality</option><option>Name</option></select>
        <button type="button" className={`toggle ${showArch ? 'on' : ''}`} aria-pressed={showArch} onClick={() => setShowArch(s => !s)}>Show archived</button>
      </div>
      <div className="muted small">{rows.length} lead(s) · demo data</div>
      {rows.length === 0 && <Empty text="No leads match these filters." />}
      <div className="table-wrap"><table>
        <thead><tr><th>Lead</th><th>Status</th><th>Priority</th><th>Owner</th><th>Quality</th><th>Claim</th><th></th></tr></thead>
        <tbody>
          {rows.map(l => {
            const left = claimLeft(l);
            return (
              <tr key={l.id} className="anim-item">
                <td><button type="button" className="link-title" onClick={() => setOpenId(l.id)}>{l.name}</button><div className="muted small">{l.platform} · {l.handle}{l.archived ? ' · archived' : ''}</div></td>
                <td><select aria-label={`Status ${l.name}`} className="chip-select" value={l.status} onChange={e => patchLead(l.id, { status: e.target.value as LStatus }, `${l.name} → ${e.target.value}`)}>{LSTATUSES.map(s => <option key={s}>{s}</option>)}</select></td>
                <td><select aria-label={`Priority ${l.name}`} className="chip-select" value={l.priority} onChange={e => patchLead(l.id, { priority: e.target.value as Lead['priority'] })}><option>High</option><option>Medium</option><option>Low</option></select></td>
                <td><select aria-label={`Owner ${l.name}`} className="chip-select" value={l.owner ?? ''} onChange={e => assign(l, e.target.value || null)}><option value="">Unassigned</option>{db.users.filter(x => x.status === 'Active' || x.id === l.owner).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></td>
                <td><Badge tone={tierOf(l.quality) === 'High' ? 'ok' : tierOf(l.quality) === 'Medium' ? 'warn' : 'err'}>{l.quality} · {tierOf(l.quality)}</Badge></td>
                <td className="small">{left === null ? '—' : left === 0 ? <Badge tone="err">Expired</Badge> : hm(left) + ' left'}</td>
                <td><div className="row-wrap">
                  {l.owner && <Btn variant="ghost" onClick={() => assign(l, null)}>Release</Btn>}
                  {!l.archived && <Btn variant="icon" icon="archive" title="Archive lead" onClick={() => { patchLead(l.id, { archived: true }, `Archived ${l.name}`); toast('Archived (demo)'); }} />}
                  <Btn variant="icon" icon="trash" title="Delete lead" onClick={() => del(l)} />
                </div></td>
              </tr>
            );
          })}
        </tbody>
      </table></div>
      {u && (
        <Modal title={u.name} onClose={() => setOpenId(null)} footer={<Btn variant="secondary" onClick={() => setOpenId(null)}>Close</Btn>}>
          <div className="kv"><span>Platform</span><span>{u.platform} · {u.handle}</span></div>
          <div className="kv"><span>Niche</span><span>{u.niche || '—'}</span></div>
          <div className="kv"><span>Owner</span><span>{uName(db, u.owner)}</span></div>
          <Field label="Quality score (0–100, manual override)">
            <input type="number" min={0} max={100} value={u.quality} onChange={e => { const n = Number(e.target.value); if (Number.isFinite(n) && n >= 0 && n <= 100) patchLead(u.id, { quality: n }); else toast('Score must be 0–100', 'err'); }} />
          </Field>
          <h3 style={{ marginTop: 12 }}>Assignment history</h3>
          <div className="list">{db.hist.filter(h => h.leadId === u.id).map(h => <div key={h.id} className="list-row static"><span>{uName(db, h.to)}</span><span className="muted small">{h.by} · {h.at}</span></div>)}</div>
          {db.hist.filter(h => h.leadId === u.id).length === 0 && <p className="muted small">No assignment history for this lead.</p>}
        </Modal>
      )}
    </div>
  );
}

function Pipeline({ ctx }: { ctx: Ctx }) {
  const { db, set } = ctx;
  const live = db.leads.filter(l => !l.deleted && !l.archived);
  const move = (id: string, s: LStatus, name: string) => set(d => addAct({ ...d, leads: d.leads.map(l => (l.id === id ? { ...l, status: s } : l)) }, `${name} → ${s}`));
  return (
    <div className="adm-board" role="list" aria-label="Lead pipeline">
      {LSTATUSES.map(s => {
        const items = live.filter(l => l.status === s);
        return (
          <div key={s} className="board-col" role="listitem">
            <h4>{s} · {items.length}</h4>
            {items.length === 0 && <div className="muted small">Empty</div>}
            {items.map(l => (
              <div key={l.id} className="card anim-item" style={{ padding: 12 }}>
                <strong>{l.name}</strong>
                <div className="muted small">{uName(db, l.owner)} · {l.priority}</div>
                <select aria-label={`Move ${l.name}`} value={l.status} onChange={e => move(l.id, e.target.value as LStatus, l.name)} style={{ marginTop: 6 }}>{LSTATUSES.map(x => <option key={x}>{x}</option>)}</select>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function Quality({ ctx }: { ctx: Ctx }) {
  const { db, set, toast, ask } = ctx;
  const live = db.leads.filter(l => !l.deleted);
  const counts = { High: 0, Medium: 0, Low: 0 } as Record<string, number>;
  live.forEach(l => { counts[tierOf(l.quality)]++; });
  const recalc = () => ask('Recalculate every lead score with the rules? This overwrites manual scores (demo).', () => {
    set(d => addAct({ ...d, leads: d.leads.map(l => (l.deleted ? l : { ...l, quality: rulesQuality(l) })) }, 'Recalculated lead quality with rules'));
    toast('Scores recalculated (rules demo)');
  });
  return (
    <div className="stack">
      <section className="grid stats">
        <Stat icon="star" label="High quality" value={counts.High} sub="70–100" />
        <Stat icon="target" label="Medium quality" value={counts.Medium} sub="50–69" />
        <Stat icon="info" label="Low quality" value={counts.Low} sub="0–49" />
      </section>
      <Panel title="Lead quality" action={<Btn variant="secondary" onClick={recalc}>Recalculate with rules</Btn>}>
        <p className="muted small">Rules-based estimate from platform, niche, handle, and priority. It does not guarantee conversion or client acquisition.</p>
        <div className="table-wrap"><table>
          <thead><tr><th>Lead</th><th>Score</th><th>Tier</th><th>Manual score</th></tr></thead>
          <tbody>
            {live.map(l => (
              <tr key={l.id}>
                <td>{l.name}<div className="muted small">{l.platform} · {l.priority}</div></td>
                <td style={{ minWidth: 140 }}><div className="small">{l.quality}</div><Bar value={l.quality} /></td>
                <td><Badge tone={tierOf(l.quality) === 'High' ? 'ok' : tierOf(l.quality) === 'Medium' ? 'warn' : 'err'}>{tierOf(l.quality)}</Badge></td>
                <td><input className="adm-input" type="number" min={0} max={100} aria-label={`Score for ${l.name}`} value={l.quality} onChange={e => { const n = Number(e.target.value); if (!Number.isFinite(n) || n < 0 || n > 100) return toast('Score must be 0–100', 'err'); set(d => ({ ...d, leads: d.leads.map(x => (x.id === l.id ? { ...x, quality: n } : x)) })); }} /></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </Panel>
    </div>
  );
}

function Templates({ ctx }: { ctx: Ctx }) {
  const { db, set, toast, ask } = ctx;
  const blank = { id: '', name: '', kind: 'First contact' as Tpl['kind'], platform: 'WhatsApp', lang: 'EN' as Tpl['lang'], body: '' };
  const [draft, setDraft] = useState(blank);
  const save = () => {
    if (!draft.name.trim() || !draft.body.trim()) return toast('Name and message body are required', 'err');
    if (draft.id) set(d => addAct({ ...d, tpls: d.tpls.map(t => (t.id === draft.id ? { ...draft } : t)) }, `Updated template ${draft.name}`));
    else set(d => addAct({ ...d, tpls: [...d.tpls, { ...draft, id: newId() }] }, `Created template ${draft.name}`));
    setDraft(blank); toast('Template saved (demo)');
  };
  const preview = draft.body.replace(/\{name\}/g, 'Sample Lead').replace(/\{niche\}/g, 'Reels').replace(/\{handle\}/g, '@sample');
  return (
    <div className="stack">
      <Panel title={draft.id ? 'Edit template' : 'New template'}>
        <div className="adm-form">
          <Field label="Name"><input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></Field>
          <Field label="Category"><select value={draft.kind} onChange={e => setDraft({ ...draft, kind: e.target.value as Tpl['kind'] })}><option>First contact</option><option>Follow-up</option><option>Custom</option></select></Field>
          <Field label="Platform"><select value={draft.platform} onChange={e => setDraft({ ...draft, platform: e.target.value })}>{['WhatsApp', 'Instagram', 'LinkedIn', 'Email', 'Other'].map(p => <option key={p}>{p}</option>)}</select></Field>
          <Field label="Language"><select value={draft.lang} onChange={e => setDraft({ ...draft, lang: e.target.value as Tpl['lang'] })}><option value="EN">English</option><option value="HI">Hindi</option></select></Field>
          <div className="adm-wide"><Field label="Message ({name}, {niche}, {handle})"><textarea rows={3} value={draft.body} onChange={e => setDraft({ ...draft, body: e.target.value })} /></Field></div>
        </div>
        <div className="notice info small">Preview: {preview || '—'}</div>
        <div className="row-wrap" style={{ marginTop: 10 }}>
          <Btn onClick={save}>{draft.id ? 'Save changes' : 'Create template'}</Btn>
          {draft.id && <Btn variant="ghost" onClick={() => setDraft(blank)}>Cancel edit</Btn>}
        </div>
        <p className="muted small">Messages are sent manually by the team. The app only stores and copies text.</p>
      </Panel>
      <Panel title="Templates">
        <div className="list">
          {db.tpls.map(t => (
            <div key={t.id} className="list-row static anim-item">
              <div className="grow"><strong>{t.name}</strong><div className="muted small">{t.kind} · {t.platform} · {t.lang === 'HI' ? 'Hindi' : 'English'}</div><div className="small clamp">{t.body}</div></div>
              <div className="row-wrap">
                <Btn variant="icon" icon="edit" title="Edit template" onClick={() => setDraft({ ...t })} />
                <Btn variant="icon" icon="trash" title="Delete template" onClick={() => ask(`Delete template "${t.name}"?`, () => { set(d => addAct({ ...d, tpls: d.tpls.filter(x => x.id !== t.id) }, `Deleted template ${t.name}`)); toast('Template deleted (demo)'); })} />
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function Replies({ ctx }: { ctx: Ctx }) {
  const { db, set, toast } = ctx;
  const live = db.leads.filter(l => !l.deleted);
  const [leadId, setLeadId] = useState(live[0]?.id ?? '');
  const [cat, setCat] = useState('General');
  const [text, setText] = useState('');
  const [filter, setFilter] = useState('All');
  const add = () => {
    if (!text.trim()) return toast('Reply text is required', 'err');
    const name = lName(db, leadId);
    set(d => {
      const nd: Db = {
        ...d,
        replies: [{ id: newId(), leadId, category: cat, text: text.trim(), at: 'Just now' }, ...d.replies],
        leads: d.leads.map(l => (l.id !== leadId ? l : { ...l, status: cat === 'Interested' ? 'Interested' : cat === 'Meeting request' ? 'Call Booked' : 'Replied' })),
        fus: cat === 'Interested' || cat === 'Pricing enquiry' ? [{ id: newId(), leadId, due: iso(1), reason: 'Follow up on pricing (suggested)', done: false }, ...d.fus] : d.fus,
      };
      return addAct(nd, `Logged ${cat} reply from ${name}`);
    });
    setText(''); toast('Reply logged (manual entry)');
  };
  const rows = db.replies.filter(r => filter === 'All' || r.category === filter);
  return (
    <div className="stack">
      <Panel title="Log client reply (manual entry)">
        <div className="adm-form">
          <Field label="Lead"><select value={leadId} onChange={e => setLeadId(e.target.value)}>{live.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
          <Field label="Category"><select value={cat} onChange={e => setCat(e.target.value)}>{['Interested', 'Not interested', 'Pricing enquiry', 'Meeting request', 'General'].map(c => <option key={c}>{c}</option>)}</select></Field>
          <div className="adm-wide"><Field label="Reply text"><textarea rows={2} value={text} onChange={e => setText(e.target.value)} /></Field></div>
          <Btn onClick={add}>Save reply</Btn>
        </div>
        <p className="muted small">Interested and Pricing replies suggest a follow-up. Meeting requests move the lead to Call Booked.</p>
      </Panel>
      <div className="row-wrap">
        <select aria-label="Reply category filter" value={filter} onChange={e => setFilter(e.target.value)} style={{ width: 'auto' }}>
          {['All', 'Interested', 'Not interested', 'Pricing enquiry', 'Meeting request', 'General'].map(c => <option key={c}>{c}</option>)}
        </select>
        <span className="muted small">{rows.length} reply(ies)</span>
      </div>
      {rows.length === 0 ? <Empty text="No replies in this category." /> : (
        <div className="list-card">
          {rows.map(r => <div key={r.id} className="bubble anim-item"><div className="row-between small"><strong>{lName(db, r.leadId)}</strong><span className="muted">{r.at}</span></div><Badge tone={r.category === 'Interested' ? 'ok' : r.category === 'Not interested' ? 'err' : 'info'}>{r.category}</Badge><div>{r.text}</div></div>)}
        </div>
      )}
    </div>
  );
}

function FollowUps({ ctx }: { ctx: Ctx }) {
  const { db, set, toast } = ctx;
  const live = db.leads.filter(l => !l.deleted);
  const [leadId, setLeadId] = useState(live[0]?.id ?? '');
  const [due, setDue] = useState(iso(1));
  const [reason, setReason] = useState('');
  const add = () => {
    if (!reason.trim()) return toast('Add a follow-up reason', 'err');
    set(d => addAct({ ...d, fus: [{ id: newId(), leadId, due, reason: reason.trim(), done: false }, ...d.fus] }, `Scheduled follow-up for ${lName(d, leadId)}`));
    setReason(''); toast('Follow-up scheduled (in-app only)');
  };
  const complete = (id: string) => set(d => addAct({ ...d, fus: d.fus.map(f => (f.id === id ? { ...f, done: true } : f)) }, 'Completed follow-up'));
  const cancel = (id: string) => set(d => addAct({ ...d, fus: d.fus.filter(f => f.id !== id) }, 'Cancelled follow-up'));
  const open = db.fus.filter(f => !f.done);
  const groups: [string, FU[]][] = [
    ['Overdue', open.filter(f => f.due < TODAY)],
    ['Today', open.filter(f => f.due === TODAY)],
    ['Upcoming', open.filter(f => f.due > TODAY)],
    ['Done', db.fus.filter(f => f.done)],
  ];
  return (
    <div className="stack">
      <Panel title="Schedule follow-up">
        <div className="adm-form">
          <Field label="Lead"><select value={leadId} onChange={e => setLeadId(e.target.value)}>{live.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
          <Field label="Date"><input type="date" value={due} onChange={e => setDue(e.target.value)} /></Field>
          <Field label="Reason"><input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. share sample" /></Field>
          <Btn icon="cal" onClick={add}>Schedule</Btn>
        </div>
        <p className="muted small">Reminders show in-app only. Background reminders need the backend phase.</p>
      </Panel>
      {groups.map(([name, items]) => (
        <Panel key={name} title={`${name} (${items.length})`}>
          {items.length === 0 ? <p className="muted small">Nothing here.</p> : (
            <div className="list">
              {items.map(f => (
                <div key={f.id} className="list-row static anim-item">
                  <div><strong>{lName(db, f.leadId)}</strong><div className="muted small">{f.due} · {f.reason}</div></div>
                  {!f.done && <div className="row-wrap"><Btn variant="icon" icon="check" title="Complete" onClick={() => complete(f.id)} /><Btn variant="icon" icon="x" title="Cancel" onClick={() => cancel(f.id)} /></div>}
                </div>
              ))}
            </div>
          )}
        </Panel>
      ))}
    </div>
  );
}

function Deleted({ ctx }: { ctx: Ctx }) {
  const { db, set, toast, ask } = ctx;
  const rows = db.leads.filter(l => l.deleted);
  const restore = (id: string, name: string) => { set(d => addAct({ ...d, leads: d.leads.map(l => (l.id === id ? { ...l, deleted: false } : l)) }, `Restored ${name}`)); toast(`${name} restored (demo)`); };
  const purge = (id: string, name: string) => ask(`Permanently delete ${name}? This cannot be undone (demo).`, () => { set(d => addAct({ ...d, leads: d.leads.filter(l => l.id !== id) }, `Permanently deleted ${name}`)); toast('Permanently deleted (demo)'); });
  return (
    <Panel title="Deleted leads and recovery">
      {rows.length === 0 ? <Empty text="No deleted leads." /> : (
        <div className="list">
          {rows.map(l => (
            <div key={l.id} className="list-row static anim-item">
              <div><strong>{l.name}</strong><div className="muted small">{l.platform} · {l.handle}</div></div>
              <div className="row-wrap">
                <Btn variant="secondary" onClick={() => restore(l.id, l.name)}>Restore</Btn>
                <Btn variant="danger" disabled={!db.users.find(u => u.role === 'Owner')} onClick={() => purge(l.id, l.name)}>Delete forever</Btn>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

/* ============================================================
   PROJECTS — list, editors, assignments, deadlines, review, delivery
   ============================================================ */
function ProjectList({ ctx }: { ctx: Ctx }) {
  const { db, set, toast } = ctx;
  const [filter, setFilter] = useState<'All' | 'Active' | 'Delivered'>('All');
  const [svc, setSvc] = useState<'All' | Service>('All');
  const [openId, setOpenId] = useState<string | null>(null);
  const blank = { title: '', clientId: db.clients[0]?.id ?? '', service: 'Video editing' as Service, budget: '', currency: 'INR' as Cur, editorId: '', deadline: iso(7) };
  const [f, setF] = useState(blank);
  const rows = db.projects.filter(p => (filter === 'All' || (filter === 'Delivered' ? p.stage === 'Delivered' : p.stage !== 'Delivered')) && (svc === 'All' || p.service === svc));
  const create = () => {
    if (!f.title.trim()) return toast('Project title is required', 'err');
    const budget = Number(f.budget);
    if (!Number.isFinite(budget) || budget < 0) return toast('Budget must be a positive number', 'err');
    const p: Project = { id: newId(), title: f.title.trim(), clientId: f.clientId, service: f.service, budget, currency: f.currency, editorId: f.editorId || null, deadline: f.deadline, stage: 'In Progress', progress: 0, revisions: 0, tasks: [], links: [], comments: [] };
    set(d => addAct({ ...d, projects: [p, ...d.projects] }, `Created project ${p.title}`));
    setF(blank); toast('Project created (demo)');
  };
  const open = db.projects.find(p => p.id === openId);
  return (
    <div className="stack">
      <Collapse title="New project">
        <div className="adm-form">
          <Field label="Title *"><input value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></Field>
          <Field label="Client"><select value={f.clientId} onChange={e => setF({ ...f, clientId: e.target.value })}>{db.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="Service"><select value={f.service} onChange={e => setF({ ...f, service: e.target.value as Service })}>{SERVICES.map(s => <option key={s}>{s}</option>)}</select></Field>
          <Field label="Budget"><div className="row-wrap" style={{ flexWrap: 'nowrap' }}><input type="number" min={0} value={f.budget} onChange={e => setF({ ...f, budget: e.target.value })} /><select value={f.currency} onChange={e => setF({ ...f, currency: e.target.value as Cur })} style={{ width: 'auto' }}>{CURS.map(c => <option key={c}>{c}</option>)}</select></div></Field>
          <Field label="Editor"><select value={f.editorId} onChange={e => setF({ ...f, editorId: e.target.value })}><option value="">Unassigned</option>{db.users.filter(u => u.role === 'Editor' && u.status === 'Active').map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
          <Field label="Deadline"><input type="date" value={f.deadline} onChange={e => setF({ ...f, deadline: e.target.value })} /></Field>
          <Btn icon="plus" onClick={create}>Create project</Btn>
        </div>
      </Collapse>
      <div className="row-wrap">
        <Seg options={['All', 'Active', 'Delivered'] as const} value={filter} onChange={setFilter} />
        <select aria-label="Service filter" value={svc} onChange={e => setSvc(e.target.value as 'All' | Service)} style={{ width: 'auto' }}><option>All</option>{SERVICES.map(s => <option key={s}>{s}</option>)}</select>
      </div>
      {rows.length === 0 && <Empty text="No projects in this filter." />}
      <div className="grid cards-lead">
        {rows.map(p => (
          <button key={p.id} type="button" className="card card-click anim-item" style={{ textAlign: 'left' }} onClick={() => setOpenId(p.id)}>
            <div className="row-between"><strong>{p.title}</strong><Badge tone={p.stage === 'Delivered' ? 'ok' : 'info'}>{p.stage}</Badge></div>
            <div className="muted small">{cName(db, p.clientId)} · {p.service}</div>
            <div className="small">Deadline {p.deadline} · {uName(db, p.editorId)} · {fmt(p.budget, p.currency)}</div>
            <Bar value={p.progress} />
          </button>
        ))}
      </div>
      {open && <ProjectModal ctx={ctx} id={open.id} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function ProjectModal({ ctx, id, onClose }: { ctx: Ctx; id: string; onClose: () => void }) {
  const { db, set, toast, ask } = ctx;
  const p = db.projects.find(x => x.id === id);
  const [task, setTask] = useState('');
  const [link, setLink] = useState('');
  const [note, setNote] = useState('');
  if (!p) return null;
  const upd = (patch: Partial<Project>, msg?: string) => set(d => {
    const nd = { ...d, projects: d.projects.map(x => (x.id === p.id ? { ...x, ...patch } : x)) };
    return msg ? addAct(nd, msg) : nd;
  });
  const act = ACTIONS[p.stage];
  return (
    <Modal title={p.title} onClose={onClose} footer={
      <Btn variant="danger" icon="trash" onClick={() => ask('Delete this project? Linked invoices and payouts stay as demo records.', () => { set(d => addAct({ ...d, projects: d.projects.filter(x => x.id !== p.id) }, `Deleted project ${p.title}`)); onClose(); toast('Project deleted (demo)'); })}>Delete project</Btn>}>
      <div className="kv"><span>Client</span><span>{cName(db, p.clientId)}</span></div>
      <div className="kv"><span>Service</span><span>{p.service}</span></div>
      <Field label="Editor">
        <select value={p.editorId ?? ''} onChange={e => upd({ editorId: e.target.value || null }, `Assigned ${p.title} → ${uName(db, e.target.value || null)}`)}>
          <option value="">Unassigned</option>{db.users.filter(u => u.role === 'Editor' && u.status === 'Active').map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </Field>
      <div className="adm-form">
        <Field label="Deadline"><input type="date" value={p.deadline} onChange={e => upd({ deadline: e.target.value })} /></Field>
        <Field label="Budget"><input type="number" min={0} value={p.budget} onChange={e => upd({ budget: Math.max(0, Number(e.target.value) || 0) })} /></Field>
        <Field label="Progress (%)"><input type="number" min={0} max={100} value={p.progress} onChange={e => upd({ progress: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })} /></Field>
      </div>
      <Bar value={p.progress} />
      <div className="row-wrap" style={{ marginTop: 10 }}>
        <span className="small">Revisions: {p.revisions}</span>
        <Btn variant="ghost" onClick={() => upd({ revisions: p.revisions + 1 }, `Logged revision for ${p.title}`)}>Log revision</Btn>
      </div>
      <h3 style={{ marginTop: 14 }}>Stage</h3>
      <ol className="timeline">{STAGES.map(s => <li key={s} className={STAGES.indexOf(s) <= STAGES.indexOf(p.stage) ? 'done' : ''}>{s}</li>)}</ol>
      <div className="row-wrap">{act.map(a => <Btn key={a.label} variant="secondary" onClick={() => upd({ stage: a.to, revisions: a.rev ? p.revisions + 1 : p.revisions, progress: a.to === 'Delivered' ? 100 : p.progress }, `${p.title} → ${a.to}`)}>{a.label}</Btn>)}</div>
      <h3 style={{ marginTop: 14 }}>Tasks</h3>
      <div className="list">{p.tasks.map(t => (
        <label key={t.id} className="check"><input type="checkbox" checked={t.done} onChange={() => upd({ tasks: p.tasks.map(x => (x.id === t.id ? { ...x, done: !x.done } : x)) })} style={{ width: 'auto' }} /> <span style={{ textDecoration: t.done ? 'line-through' : 'none' }}>{t.title}</span></label>
      ))}</div>
      <div className="row-wrap"><input aria-label="New task" placeholder="New task" value={task} onChange={e => setTask(e.target.value)} /><Btn variant="secondary" onClick={() => { if (!task.trim()) return toast('Task title required', 'err'); upd({ tasks: [...p.tasks, { id: newId(), title: task.trim(), done: false }] }); setTask(''); }}>Add task</Btn></div>
      <h3 style={{ marginTop: 14 }}>External file links</h3>
      <div className="list">{p.links.map((l, i) => <div key={i} className="list-row static"><a href={l} target="_blank" rel="noreferrer">{l}</a><Btn variant="icon" icon="trash" title="Remove link" onClick={() => upd({ links: p.links.filter((_, j) => j !== i) })} /></div>)}</div>
      <div className="row-wrap"><input aria-label="External link" placeholder="https://… (external file link)" value={link} onChange={e => setLink(e.target.value)} /><Btn variant="secondary" icon="link" onClick={() => { if (!validUrl(link.trim())) return toast('Enter a full http(s) link', 'err'); upd({ links: [...p.links, link.trim()] }); setLink(''); }}>Add link</Btn></div>
      <p className="muted small">Links are stored as text only. No files are uploaded in Phase 2.</p>
      <h3 style={{ marginTop: 14 }}>Review comments</h3>
      <div className="list">{p.comments.map((c, i) => <div key={i} className="bubble">{c}</div>)}</div>
      <div className="row-wrap"><input aria-label="Review comment" placeholder="Add a review comment" value={note} onChange={e => setNote(e.target.value)} /><Btn variant="secondary" onClick={() => { if (!note.trim()) return toast('Comment is empty', 'err'); upd({ comments: [note.trim(), ...p.comments] }); setNote(''); }}>Add comment</Btn></div>
    </Modal>
  );
}

function Editors({ ctx }: { ctx: Ctx }) {
  const { db, set } = ctx;
  const eds = db.users.filter(u => u.role === 'Editor' && u.status !== 'Removed');
  const paid = (id: string) => db.payouts.filter(p => p.editorId === id && p.status === 'Paid').reduce((a, p) => a + toBase(db, p.amount, p.currency), 0);
  const upd = (id: string, p: Partial<User>) => set(d => ({ ...d, users: d.users.map(x => (x.id === id ? { ...x, ...p } : x)) }));
  return (
    <Panel title="Editor management">
      <div className="table-wrap"><table>
        <thead><tr><th>Editor</th><th>Pay model</th><th>Rate (INR, per video)</th><th>Active projects</th><th>Paid (demo)</th></tr></thead>
        <tbody>
          {eds.map(u => (
            <tr key={u.id}>
              <td><strong>{u.name}</strong><div className="muted small">{u.status}</div></td>
              <td><select aria-label={`Pay model ${u.name}`} value={u.payModel} onChange={e => upd(u.id, { payModel: e.target.value as PayModel })}>{PAY_MODELS.map(p => <option key={p}>{p}</option>)}</select></td>
              <td><input className="adm-input" type="number" min={0} aria-label={`Rate ${u.name}`} value={u.rate} onChange={e => upd(u.id, { rate: Math.max(0, Number(e.target.value) || 0) })} disabled={u.payModel !== 'Per-video'} /></td>
              <td>{projLoad(db, u.id)}</td>
              <td>{fmt(paid(u.id), db.settings.base)}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
      {eds.length === 0 && <Empty text="No editors yet. Invite one from Team → Invitations." />}
    </Panel>
  );
}

function Assignments({ ctx }: { ctx: Ctx }) {
  const { db, set, toast } = ctx;
  const eds = db.users.filter(u => u.role === 'Editor' && u.status === 'Active');
  const assign = (p: Project, editorId: string | null) => {
    if (editorId) {
      const ed = db.users.find(u => u.id === editorId);
      if (ed && projLoad(db, editorId) >= ed.limit && p.editorId !== editorId) toast(`${ed.name} is at capacity (manual override)`, 'info');
    }
    set(d => addAct({ ...d, projects: d.projects.map(x => (x.id === p.id ? { ...x, editorId } : x)) }, `${p.title} → ${uName(d, editorId)}`));
  };
  return (
    <div className="stack">
      <Panel title="Editor workload (capacity uses the member limit field)">
        {eds.length === 0 ? <Empty text="No active editors." /> : eds.map(u => (
          <div key={u.id} className="list-row static" style={{ marginBottom: 6 }}>
            <span className="grow">{u.name}</span>
            <span className="small">{projLoad(db, u.id)} / {u.limit}</span>
            <div style={{ width: 140 }}><Bar value={pct(projLoad(db, u.id), Math.max(1, u.limit))} /></div>
          </div>
        ))}
      </Panel>
      <Panel title="Project assignments">
        <div className="table-wrap"><table>
          <thead><tr><th>Project</th><th>Stage</th><th>Editor</th></tr></thead>
          <tbody>
            {db.projects.map(p => (
              <tr key={p.id}>
                <td><strong>{p.title}</strong><div className="muted small">{cName(db, p.clientId)}</div></td>
                <td><Badge>{p.stage}</Badge></td>
                <td><select aria-label={`Editor for ${p.title}`} value={p.editorId ?? ''} onChange={e => assign(p, e.target.value || null)}><option value="">Unassigned</option>{eds.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </Panel>
    </div>
  );
}

function Deadlines({ ctx }: { ctx: Ctx }) {
  const { db, set } = ctx;
  const rows = [...db.projects].filter(p => p.stage !== 'Delivered').sort((a, b) => a.deadline.localeCompare(b.deadline));
  const extend = (p: Project) => set(d => addAct({ ...d, projects: d.projects.map(x => (x.id === p.id ? { ...x, deadline: addDays(x.deadline, 3) } : x)) }, `Extended deadline of ${p.title} by 3 days`));
  const logRev = (p: Project) => set(d => addAct({ ...d, projects: d.projects.map(x => (x.id === p.id ? { ...x, revisions: x.revisions + 1 } : x)) }, `Logged revision for ${p.title}`));
  return (
    <Panel title="Deadlines and revisions">
      {rows.length === 0 ? <Empty text="No open projects." /> : (
        <div className="table-wrap"><table>
          <thead><tr><th>Project</th><th>Deadline</th><th>Days left</th><th>Revisions</th><th></th></tr></thead>
          <tbody>
            {rows.map(p => {
              const days = Math.round((Date.parse(p.deadline + 'T00:00:00') - Date.now()) / 864e5);
              return (
                <tr key={p.id}>
                  <td>{p.title}<div className="muted small">{uName(db, p.editorId)}</div></td>
                  <td>{p.deadline}</td>
                  <td>{days < 0 ? <Badge tone="err">Overdue {Math.abs(days)}d</Badge> : days <= 2 ? <Badge tone="warn">{days}d</Badge> : <Badge tone="ok">{days}d</Badge>}</td>
                  <td>{p.revisions}</td>
                  <td><div className="row-wrap"><Btn variant="secondary" onClick={() => extend(p)}>+3 days</Btn><Btn variant="ghost" onClick={() => logRev(p)}>Log revision</Btn></div></td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      )}
    </Panel>
  );
}

function StageRow({ ctx, p }: { ctx: Ctx; p: Project }) {
  const { set, toast } = ctx;
  const move = (a: { label: string; to: Stage; rev?: boolean }) => {
    set(d => addAct({ ...d, projects: d.projects.map(x => (x.id === p.id ? { ...x, stage: a.to, revisions: a.rev ? x.revisions + 1 : x.revisions, progress: a.to === 'Delivered' ? 100 : x.progress } : x)) }, `${p.title}: ${a.label}`));
    toast(`Stage → ${a.to} (demo)`);
  };
  return (
    <div className="list-row static anim-item">
      <div className="grow"><strong>{p.title}</strong><div className="muted small">Stage: {p.stage} · Revisions: {p.revisions}</div></div>
      <div className="row-wrap">{ACTIONS[p.stage].length === 0 ? <Badge tone="ok">Delivered</Badge> : ACTIONS[p.stage].map(a => <Btn key={a.label} variant={a.rev ? 'ghost' : 'secondary'} onClick={() => move(a)}>{a.label}</Btn>)}</div>
    </div>
  );
}

function Review({ ctx }: { ctx: Ctx }) {
  const rows = ctx.db.projects.filter(p => ['In Progress', 'Internal Review', 'Revision Required', 'Internal Approval'].includes(p.stage));
  return (
    <Panel title="Internal review and approval">
      <p className="muted small">Flow: Internal Review → Revision Required → Internal Approval → Client Approval → Delivered.</p>
      {rows.length === 0 ? <Empty text="Nothing waiting for internal review." /> : <div className="list">{rows.map(p => <StageRow key={p.id} ctx={ctx} p={p} />)}</div>}
    </Panel>
  );
}

function Delivery({ ctx }: { ctx: Ctx }) {
  const { db } = ctx;
  const rows = db.projects.filter(p => ['Internal Approval', 'Client Approval', 'Delivered'].includes(p.stage));
  return (
    <div className="stack">
      <Panel title="Client delivery tracking">
        {rows.length === 0 ? <Empty text="No projects at delivery stage." /> : <div className="list">{rows.map(p => <StageRow key={p.id} ctx={ctx} p={p} />)}</div>}
        <p className="muted small">Client approval is recorded manually by the team (demo). No client emails are sent.</p>
      </Panel>
      <Panel title="Delivered files and links">
        <div className="list">{db.projects.filter(p => p.links.length).map(p => <div key={p.id} className="list-row static"><span>{p.title}</span><span className="muted small">{p.links.length} link(s)</span></div>)}</div>
      </Panel>
    </div>
  );
}

/* ============================================================
   CLIENTS
   ============================================================ */
function ClientList({ ctx }: { ctx: Ctx }) {
  const { db, set, toast } = ctx;
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const add = () => {
    if (!name.trim()) return toast('Client name is required', 'err');
    if (email && !validEmail(email)) return toast('Enter a valid email', 'err');
    set(d => addAct({ ...d, clients: [{ id: newId(), name: name.trim(), email, company: company.trim() }, ...d.clients] }, `Added client ${name.trim()}`));
    setName(''); setEmail(''); setCompany(''); toast('Client added (demo)');
  };
  const open = db.clients.find(c => c.id === openId);
  return (
    <div className="stack">
      <Collapse title="Add client">
        <div className="adm-form">
          <Field label="Name *"><input value={name} onChange={e => setName(e.target.value)} /></Field>
          <Field label="Email"><input value={email} onChange={e => setEmail(e.target.value)} /></Field>
          <Field label="Company"><input value={company} onChange={e => setCompany(e.target.value)} /></Field>
          <Btn icon="plus" onClick={add}>Add client</Btn>
        </div>
      </Collapse>
      <div className="grid cards-lead">
        {db.clients.map(c => {
          const ps = db.projects.filter(p => p.clientId === c.id);
          const billed = db.invoices.filter(i => ps.some(p => p.id === i.projectId)).reduce((a, i) => a + toBase(db, i.amount, i.currency), 0);
          return (
            <button key={c.id} type="button" className="card card-click anim-item" style={{ textAlign: 'left' }} onClick={() => setOpenId(c.id)}>
              <strong>{c.name}</strong>
              <div className="muted small">{c.email || 'No email'} · {c.company || '—'}</div>
              <div className="small">{ps.length} project(s) · Billed {fmt(billed, db.settings.base)} (demo)</div>
            </button>
          );
        })}
      </div>
      {open && (
        <Modal title={open.name} onClose={() => setOpenId(null)} footer={<Btn variant="secondary" onClick={() => setOpenId(null)}>Close</Btn>}>
          <Field label="Email"><input value={open.email} onChange={e => set(d => ({ ...d, clients: d.clients.map(c => (c.id === open.id ? { ...c, email: e.target.value } : c)) }))} /></Field>
          <Field label="Company"><input value={open.company} onChange={e => set(d => ({ ...d, clients: d.clients.map(c => (c.id === open.id ? { ...c, company: e.target.value } : c)) }))} /></Field>
          <h3 style={{ marginTop: 12 }}>Projects</h3>
          <div className="list">{db.projects.filter(p => p.clientId === open.id).map(p => <div key={p.id} className="list-row static"><span>{p.title}</span><Badge>{p.stage}</Badge></div>)}</div>
          <p className="muted small">Client communication history and client files arrive with the backend phase.</p>
        </Modal>
      )}
    </div>
  );
}

/* ============================================================
   FINANCE — overview, invoices, payables, expenses, payments, currencies
   All amounts are DEMO records. No real invoices are sent or payments made.
   ============================================================ */
function FinOverview({ ctx }: { ctx: Ctx }) {
  const { db } = ctx;
  const b = db.settings.base;
  const sum = (rows: { amount: number; currency: Cur }[]) => rows.reduce((a, r) => a + toBase(db, r.amount, r.currency), 0);
  const billed = sum(db.invoices.filter(i => i.status !== 'Draft'));
  const received = sum(db.invoices.filter(i => i.status === 'Paid'));
  const receivable = sum(db.invoices.filter(i => i.status === 'Sent' || i.status === 'Overdue'));
  const payables = sum(db.payouts.filter(p => p.status === 'Pending'));
  const payoutsPaid = sum(db.payouts.filter(p => p.status === 'Paid'));
  const expenses = sum(db.expenses);
  const profit = billed - payoutsPaid - payables - expenses;
  return (
    <div className="stack">
      <div className="notice warn">DEMO FINANCE RECORDS. These are not real transactions or payments.</div>
      <section className="grid stats">
        <Stat icon="wallet" label="Billed (non-draft)" value={fmt(billed, b)} sub="Demo" />
        <Stat icon="check" label="Received" value={fmt(received, b)} sub="Demo" />
        <Stat icon="cal" label="Receivables" value={fmt(receivable, b)} sub="Demo" />
        <Stat icon="users" label="Payables (pending)" value={fmt(payables, b)} sub="Demo" />
        <Stat icon="sparkle" label="Expenses" value={fmt(expenses, b)} sub="Demo" />
        <Stat icon="target" label="Project profit" value={fmt(profit, b)} sub="Demo" />
      </section>
      <Panel title="Project profitability (demo)">
        <div className="table-wrap"><table>
          <thead><tr><th>Project</th><th>Billed</th><th>Editor payouts</th><th>Expenses</th><th>Profit</th><th>Margin</th></tr></thead>
          <tbody>
            {db.projects.map(p => {
              const rev = sum(db.invoices.filter(i => i.projectId === p.id && i.status !== 'Draft'));
              const pay = sum(db.payouts.filter(x => x.projectId === p.id));
              const exp = sum(db.expenses.filter(x => x.projectId === p.id));
              const pr = rev - pay - exp;
              return (
                <tr key={p.id}>
                  <td>{p.title}<div className="muted small">{cName(db, p.clientId)}</div></td>
                  <td>{fmt(rev, b)}</td><td>{fmt(pay, b)}</td><td>{fmt(exp, b)}</td>
                  <td className={pr < 0 ? 'adm-danger' : ''}>{fmt(pr, b)}</td>
                  <td>{rev ? pct(pr, rev) : 0}%</td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </Panel>
    </div>
  );
}

function Invoices({ ctx }: { ctx: Ctx }) {
  const { db, set, toast } = ctx;
  const [pid, setPid] = useState(db.projects[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [cur, setCur] = useState<Cur>('INR');
  const [due, setDue] = useState(iso(14));
  const create = () => {
    const n = Number(amount);
    if (!pid) return toast('Pick a project', 'err');
    if (!Number.isFinite(n) || n <= 0) return toast('Amount must be greater than 0', 'err');
    set(d => addAct({ ...d, invoices: [{ id: newId(), projectId: pid, amount: n, currency: cur, due, status: 'Draft' }, ...d.invoices] }, `Created draft invoice for ${pTitle(d, pid)}`));
    setAmount(''); toast('Draft invoice created (demo — not sent)');
  };
  const setStatus = (id: string, s: InvStatus) => set(d => addAct({ ...d, invoices: d.invoices.map(i => (i.id === id ? { ...i, status: s } : i)) }, `Invoice ${s.toLowerCase()} (demo)`));
  const b = db.settings.base;
  const open = db.invoices.filter(i => i.status === 'Sent' || i.status === 'Overdue');
  const aging = { current: open.filter(i => i.due >= TODAY), late: open.filter(i => i.due < TODAY) };
  return (
    <div className="stack">
      <Panel title="Create invoice (demo draft)">
        <div className="adm-form">
          <Field label="Project"><select value={pid} onChange={e => setPid(e.target.value)}>{db.projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select></Field>
          <Field label="Amount"><div className="row-wrap" style={{ flexWrap: 'nowrap' }}><input type="number" min={0} value={amount} onChange={e => setAmount(e.target.value)} /><select value={cur} onChange={e => setCur(e.target.value as Cur)} style={{ width: 'auto' }}>{CURS.map(c => <option key={c}>{c}</option>)}</select></div></Field>
          <Field label="Due date"><input type="date" value={due} onChange={e => setDue(e.target.value)} /></Field>
          <Btn icon="plus" onClick={create}>Create draft</Btn>
        </div>
      </Panel>
      <section className="grid two">
        <Panel title="Receivables aging (demo)">
          <div className="kv"><span>Not yet due</span><strong>{fmt(aging.current.reduce((a, i) => a + toBase(db, i.amount, i.currency), 0), b)}</strong></div>
          <div className="kv"><span>Overdue</span><strong className="adm-danger">{fmt(aging.late.reduce((a, i) => a + toBase(db, i.amount, i.currency), 0), b)}</strong></div>
        </Panel>
        <Panel title="Invoice status guide"><p className="small">Draft → Sent → Paid. Overdue is set manually in this demo. Actual sending and payment collection are not connected.</p></Panel>
      </section>
      <Panel title="Invoices">
        <div className="table-wrap"><table>
          <thead><tr><th>Project</th><th>Amount</th><th>Base ({b})</th><th>Due</th><th>Status</th></tr></thead>
          <tbody>
            {db.invoices.map(i => (
              <tr key={i.id}>
                <td>{pTitle(db, i.projectId)}</td>
                <td>{fmt(i.amount, i.currency)}</td>
                <td>{fmt(toBase(db, i.amount, i.currency), b)}</td>
                <td>{i.due}</td>
                <td><select aria-label={`Status ${pTitle(db, i.projectId)}`} className="chip-select" value={i.status} onChange={e => setStatus(i.id, e.target.value as InvStatus)}>{(['Draft', 'Sent', 'Paid', 'Overdue'] as InvStatus[]).map(s => <option key={s}>{s}</option>)}</select></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </Panel>
    </div>
  );
}

function Payables({ ctx }: { ctx: Ctx }) {
  const { db, set, toast } = ctx;
  const eds = db.users.filter(u => u.role === 'Editor' && u.status !== 'Removed');
  const [edId, setEdId] = useState(eds[0]?.id ?? '');
  const [pid, setPid] = useState(db.projects[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [cur, setCur] = useState<Cur>('INR');
  const b = db.settings.base;
  const create = () => {
    const n = Number(amount);
    if (!edId || !pid) return toast('Pick an editor and project', 'err');
    if (!Number.isFinite(n) || n <= 0) return toast('Amount must be greater than 0', 'err');
    set(d => addAct({ ...d, payouts: [{ id: newId(), editorId: edId, projectId: pid, amount: n, currency: cur, status: 'Pending' }, ...d.payouts] }, `Added pending payout for ${uName(d, edId)}`));
    setAmount(''); toast('Pending payout added (demo — no money moves)');
  };
  const mark = (id: string) => set(d => addAct({ ...d, payouts: d.payouts.map(p => (p.id === id ? { ...p, status: 'Paid' } : p)) }, 'Marked payout as paid (demo)'));
  return (
    <div className="stack">
      <Panel title="Add editor payout (demo)">
        <div className="adm-form">
          <Field label="Editor"><select value={edId} onChange={e => setEdId(e.target.value)}>{eds.map(u => <option key={u.id} value={u.id}>{u.name} · {u.payModel}</option>)}</select></Field>
          <Field label="Project"><select value={pid} onChange={e => setPid(e.target.value)}>{db.projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select></Field>
          <Field label="Amount"><div className="row-wrap" style={{ flexWrap: 'nowrap' }}><input type="number" min={0} value={amount} onChange={e => setAmount(e.target.value)} /><select value={cur} onChange={e => setCur(e.target.value as Cur)} style={{ width: 'auto' }}>{CURS.map(c => <option key={c}>{c}</option>)}</select></div></Field>
          <Btn icon="plus" onClick={create}>Add payout</Btn>
        </div>
      </Panel>
      <Panel title="Editor payouts and payables">
        <div className="table-wrap"><table>
          <thead><tr><th>Editor</th><th>Project</th><th>Amount</th><th>Base ({b})</th><th>Status</th></tr></thead>
          <tbody>
            {db.payouts.map(p => (
              <tr key={p.id}>
                <td>{uName(db, p.editorId)}</td><td>{pTitle(db, p.projectId)}</td>
                <td>{fmt(p.amount, p.currency)}</td><td>{fmt(toBase(db, p.amount, p.currency), b)}</td>
                <td>{p.status === 'Pending' ? <Btn variant="secondary" onClick={() => mark(p.id)}>Mark paid (demo)</Btn> : <Badge tone="ok">Paid</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </Panel>
    </div>
  );
}

function Expenses({ ctx }: { ctx: Ctx }) {
  const { db, set, toast } = ctx;
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [cur, setCur] = useState<Cur>('INR');
  const [pid, setPid] = useState('');
  const b = db.settings.base;
  const add = () => {
    const n = Number(amount);
    if (!label.trim()) return toast('Expense label is required', 'err');
    if (!Number.isFinite(n) || n <= 0) return toast('Amount must be greater than 0', 'err');
    set(d => addAct({ ...d, expenses: [{ id: newId(), label: label.trim(), amount: n, currency: cur, projectId: pid || null }, ...d.expenses] }, `Added expense ${label.trim()}`));
    setLabel(''); setAmount(''); toast('Expense added (demo)');
  };
  const total = db.expenses.reduce((a, e) => a + toBase(db, e.amount, e.currency), 0);
  return (
    <div className="stack">
      <Panel title="Add expense (demo)">
        <div className="adm-form">
          <Field label="Label"><input value={label} onChange={e => setLabel(e.target.value)} /></Field>
          <Field label="Amount"><div className="row-wrap" style={{ flexWrap: 'nowrap' }}><input type="number" min={0} value={amount} onChange={e => setAmount(e.target.value)} /><select value={cur} onChange={e => setCur(e.target.value as Cur)} style={{ width: 'auto' }}>{CURS.map(c => <option key={c}>{c}</option>)}</select></div></Field>
          <Field label="Project (optional)"><select value={pid} onChange={e => setPid(e.target.value)}><option value="">Agency overhead</option>{db.projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select></Field>
          <Btn icon="plus" onClick={add}>Add expense</Btn>
        </div>
      </Panel>
      <Panel title={`Expenses · total ${fmt(total, b)} (demo)`}>
        <div className="list">{db.expenses.map(e => <div key={e.id} className="list-row static"><span>{e.label}<div className="muted small">{pTitle(db, e.projectId)}</div></span><span>{fmt(e.amount, e.currency)}</span></div>)}</div>
      </Panel>
    </div>
  );
}

function Payments({ ctx }: { ctx: Ctx }) {
  const { db } = ctx;
  const rows = [
    ...db.invoices.filter(i => i.status === 'Paid').map(i => ({ id: i.id, type: 'Invoice received', what: pTitle(db, i.projectId), amount: i.amount, cur: i.currency })),
    ...db.payouts.filter(p => p.status === 'Paid').map(p => ({ id: p.id, type: 'Editor payout', what: uName(db, p.editorId), amount: p.amount, cur: p.currency })),
    ...db.expenses.map(e => ({ id: e.id, type: 'Expense', what: e.label, amount: e.amount, cur: e.currency })),
  ];
  return (
    <Panel title="Payment history (demo ledger)">
      <p className="muted small">Demo ledger built from demo records. Not real transactions.</p>
      <div className="table-wrap"><table>
        <thead><tr><th>Type</th><th>Item</th><th>Amount</th></tr></thead>
        <tbody>{rows.map(r => <tr key={r.type + r.id}><td><Badge>{r.type}</Badge></td><td>{r.what}</td><td>{fmt(r.amount, r.cur)}</td></tr>)}</tbody>
      </table></div>
    </Panel>
  );
}

function Currency({ ctx }: { ctx: Ctx }) {
  const { db, set, toast } = ctx;
  return (
    <Panel title="Multiple currencies (demo rates)">
      <div className="adm-form">
        <Field label="Reporting currency"><select value={db.settings.base} onChange={e => set(d => ({ ...d, settings: { ...d.settings, base: e.target.value as Cur } }))}>{CURS.map(c => <option key={c}>{c}</option>)}</select></Field>
        {(['USD', 'EUR'] as Cur[]).map(c => (
          <Field key={c} label={`1 ${c} in INR (demo rate)`}>
            <input type="number" min={0} value={db.settings.fx[c]} onChange={e => { const n = Number(e.target.value); if (!Number.isFinite(n) || n <= 0) return toast('Rate must be greater than 0', 'err'); set(d => ({ ...d, settings: { ...d.settings, fx: { ...d.settings.fx, [c]: n } } })); }} />
          </Field>
        ))}
      </div>
      <p className="muted small">These are fixed demo rates, not live exchange rates. Reports convert using these values only.</p>
    </Panel>
  );
}

/* ============================================================
   REPORTS — analytics, targets, rewards, leaderboard, backup
   ============================================================ */
function Analytics({ ctx }: { ctx: Ctx }) {
  const { db, toast } = ctx;
  const members = db.users.filter(u => u.status !== 'Removed');
  const statRows = members.map(u => {
    const mine = db.leads.filter(l => l.owner === u.id && !l.deleted);
    const won = mine.filter(l => l.status === 'Won').length;
    return { name: u.name, assigned: mine.length, msgs: u.msgs, calls: u.calls, won, conv: pct(won, mine.length) };
  });
  const exportCsv = () => {
    downloadFile('mds-analytics-demo.csv', 'text/csv', csvRow([['Member', 'Assigned', 'Messages', 'Calls', 'Won', 'Conversion %'], ...statRows.map(r => [r.name, r.assigned, r.msgs, r.calls, r.won, r.conv])]));
    toast('Demo CSV downloaded');
  };
  const live = db.leads.filter(l => !l.deleted);
  const max = Math.max(1, ...LSTATUSES.map(s => live.filter(l => l.status === s).length));
  return (
    <div className="stack">
      <Panel title="Team performance (demo)" action={<Btn variant="secondary" icon="download" onClick={exportCsv}>Export CSV</Btn>}>
        <div className="table-wrap"><table>
          <thead><tr><th>Member</th><th>Assigned</th><th>Messages</th><th>Calls</th><th>Won</th><th>Conversion</th></tr></thead>
          <tbody>{statRows.map(r => <tr key={r.name}><td>{r.name}</td><td>{r.assigned}</td><td>{r.msgs}</td><td>{r.calls}</td><td>{r.won}</td><td>{r.conv}%</td></tr>)}</tbody>
        </table></div>
      </Panel>
      <Panel title="Pipeline distribution (demo)">
        <div className="adm-bars">
          {LSTATUSES.map(s => {
            const n = live.filter(l => l.status === s).length;
            return <div key={s} className="adm-bar-row"><span>{s}</span><Bar value={pct(n, max)} /><span>{n}</span></div>;
          })}
        </div>
      </Panel>
    </div>
  );
}

function Targets({ ctx }: { ctx: Ctx }) {
  const { db, set, toast, ask } = ctx;
  const [label, setLabel] = useState('');
  const [scope, setScope] = useState<'Team' | 'Personal'>('Team');
  const [metric, setMetric] = useState<'msgs' | 'calls'>('msgs');
  const [goal, setGoal] = useState('');
  const [uid_, setUid] = useState(db.users[0]?.id ?? '');
  const current = (t: Target) => {
    if (t.scope === 'Personal') return db.users.find(u => u.id === t.userId)?.[t.metric] ?? 0;
    return db.users.filter(u => u.status === 'Active').reduce((a, u) => a + u[t.metric], 0);
  };
  const add = () => {
    const g = Number(goal);
    if (!label.trim()) return toast('Target name is required', 'err');
    if (!Number.isFinite(g) || g <= 0) return toast('Goal must be greater than 0', 'err');
    set(d => addAct({ ...d, targets: [{ id: newId(), label: label.trim(), scope, metric, goal: g, userId: scope === 'Personal' ? uid_ : null }, ...d.targets] }, `Created target ${label.trim()}`));
    setLabel(''); setGoal(''); toast('Target created (demo)');
  };
  return (
    <div className="stack">
      <Panel title="Create target (demo)">
        <div className="adm-form">
          <Field label="Name"><input value={label} onChange={e => setLabel(e.target.value)} /></Field>
          <Field label="Scope"><select value={scope} onChange={e => setScope(e.target.value as 'Team' | 'Personal')}><option>Team</option><option>Personal</option></select></Field>
          <Field label="Metric"><select value={metric} onChange={e => setMetric(e.target.value as 'msgs' | 'calls')}><option value="msgs">Messages sent</option><option value="calls">Calls booked</option></select></Field>
          {scope === 'Personal' && <Field label="Member"><select value={uid_} onChange={e => setUid(e.target.value)}>{db.users.filter(u => u.status !== 'Removed').map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>}
          <Field label="Goal"><input type="number" min={1} value={goal} onChange={e => setGoal(e.target.value)} /></Field>
          <Btn icon="plus" onClick={add}>Create target</Btn>
        </div>
      </Panel>
      {db.targets.map(t => {
        const cur = current(t);
        return (
          <Panel key={t.id} title={t.label} action={<Btn variant="icon" icon="trash" title="Delete target" onClick={() => ask(`Delete target "${t.label}"?`, () => { set(d => addAct({ ...d, targets: d.targets.filter(x => x.id !== t.id) }, `Deleted target ${t.label}`)); })} />}>
            <div className="muted small">{t.scope}{t.userId ? ` · ${db.users.find(u => u.id === t.userId)?.name ?? ''}` : ''} · {t.metric === 'msgs' ? 'Messages' : 'Calls'}</div>
            <div className="kv"><span>Progress</span><strong>{Math.min(cur, t.goal)} / {t.goal}</strong></div>
            <Bar value={pct(cur, t.goal)} />
          </Panel>
        );
      })}
    </div>
  );
}

function Rewards({ ctx }: { ctx: Ctx }) {
  const { db, set } = ctx;
  const rows = db.users.filter(u => u.status !== 'Removed');
  return (
    <Panel title="Rewards, points and badges (demo)" action={<span className="muted small">Points are manual demo values</span>}>
      <div className="table-wrap"><table>
        <thead><tr><th>Member</th><th>Points</th><th>Level</th><th>Badge</th></tr></thead>
        <tbody>
          {rows.map(u => (
            <tr key={u.id}>
              <td>{u.name}</td>
              <td><input className="adm-input" type="number" min={0} aria-label={`Points for ${u.name}`} value={u.points} onChange={e => set(d => ({ ...d, users: d.users.map(x => (x.id === u.id ? { ...x, points: Math.max(0, Number(e.target.value) || 0) } : x)) }))} /></td>
              <td>{Math.floor(u.points / 100) + 1}</td>
              <td><Badge tone={badgeFor(u.points) === '—' ? 'neutral' : 'gold'}>{badgeFor(u.points)}</Badge></td>
            </tr>
          ))}
        </tbody>
      </table></div>
      <p className="muted small">Badges: Starter 50+, Pro 150+, Elite 300+. Level = floor(points / 100) + 1. Real points need backend-confirmed data.</p>
    </Panel>
  );
}

function Leaderboard({ ctx }: { ctx: Ctx }) {
  const { db, set, toast, ask } = ctx;
  const ranked = db.users.filter(u => u.status === 'Active').sort((a, b) => b.points - a.points);
  const reset = () => ask('Reset all points to 0? (demo)', () => { set(d => addAct({ ...d, users: d.users.map(u => ({ ...u, points: 0 })) }, 'Reset leaderboard points')); toast('Points reset (demo)'); });
  return (
    <Panel title="Leaderboard (demo)" action={<Btn variant="danger" onClick={reset}>Reset points</Btn>}>
      {ranked.length === 0 ? <Empty text="No active members." /> : ranked.map((u, i) => (
        <div key={u.id} className="list-row static anim-item"><span>#{i + 1} {u.name}</span><strong>{u.points} pts</strong></div>
      ))}
      <p className="muted small">Only Active members appear. Ranking is demo-only until backend data exists.</p>
    </Panel>
  );
}

function Backup({ ctx }: { ctx: Ctx }) {
  const { db, toast } = ctx;
  const [last, setLast] = useState('Never (this session)');
  const exportJson = () => {
    downloadFile(`mds-admin-demo-backup-${TODAY}.json`, 'application/json', JSON.stringify(db, null, 2));
    setLast(new Date().toLocaleString()); toast('Demo backup downloaded');
  };
  const exportLeads = () => {
    downloadFile('mds-leads-demo.csv', 'text/csv', csvRow([['Name', 'Platform', 'Handle', 'Status', 'Priority', 'Owner', 'Quality'], ...db.leads.filter(l => !l.deleted).map(l => [l.name, l.platform, l.handle, l.status, l.priority, uName(db, l.owner), l.quality])]));
    toast('Leads CSV downloaded (demo)');
  };
  return (
    <div className="stack">
      <Panel title="Export">
        <div className="row-wrap">
          <Btn icon="download" onClick={exportJson}>Download full demo backup (JSON)</Btn>
          <Btn variant="secondary" icon="download" onClick={exportLeads}>Export leads (CSV)</Btn>
        </div>
        <p className="muted small">Last export: {last}. Files are created in your browser only.</p>
      </Panel>
      <Panel title="Restore from backup file">
        <p className="muted small">Restore is turned off. Replacing all Firestore records from a file is not allowed from this screen.</p>
      </Panel>
    </div>
  );
}

/* ============================================================
   NOTIFICATIONS & ACTIVITY
   ============================================================ */
function Notices({ ctx }: { ctx: Ctx }) {
  const { db, set, toast } = ctx;
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [text, setText] = useState('');
  const [cat, setCat] = useState<Notice['cat']>('Team');
  const rows = db.notices.filter(n => !unreadOnly || !n.read);
  const markRead = (id: string) => set(d => ({ ...d, notices: d.notices.map(n => (n.id === id ? { ...n, read: true } : n)) }));
  const markAll = () => { set(d => ({ ...d, notices: d.notices.map(n => ({ ...n, read: true })) })); toast('All marked as read'); };
  const broadcast = () => {
    if (!text.trim()) return toast('Message is empty', 'err');
    set(d => addAct({ ...d, notices: [{ id: newId(), cat, text: text.trim(), read: false }, ...d.notices] }, `Broadcast notice created: ${text.trim()}`));
    setText(''); toast('Notice added locally. Not delivered to any device (demo).', 'info');
  };
  return (
    <div className="stack">
      <div className="notice info">In-app notices only. Android push notifications, emails and WhatsApp alerts are NOT active in Phase 2.</div>
      <Panel title="Create notice (demo)">
        <div className="adm-form">
          <div className="adm-wide"><Field label="Message"><input value={text} onChange={e => setText(e.target.value)} /></Field></div>
          <Field label="Category"><select value={cat} onChange={e => setCat(e.target.value as Notice['cat'])}>{['Team', 'Lead', 'Follow-up', 'Project', 'Finance'].map(c => <option key={c}>{c}</option>)}</select></Field>
          <Btn icon="bell" onClick={broadcast}>Add notice</Btn>
        </div>
      </Panel>
      <div className="row-wrap">
        <button type="button" className={`toggle ${unreadOnly ? 'on' : ''}`} aria-pressed={unreadOnly} onClick={() => setUnreadOnly(u => !u)}>Unread only</button>
        <Btn variant="ghost" onClick={markAll}>Mark all read</Btn>
      </div>
      {rows.length === 0 ? <Empty text="No notices." /> : (
        <div className="list-card">
          {rows.map(n => (
            <div key={n.id} className={`list-row ${n.read ? 'read' : 'unread'} anim-item`}>
              <span className="dot-sm" aria-hidden="true" />
              <span className="grow">{n.text}</span>
              <Badge>{n.cat}</Badge>
              {!n.read && <Btn variant="ghost" onClick={() => markRead(n.id)}>Mark read</Btn>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ActivityLog({ ctx }: { ctx: Ctx }) {
  const { db } = ctx;
  const [q, setQ] = useState('');
  const rows = db.acts.filter(a => !q || a.text.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="stack">
      <div className="search-input"><Icon name="search" size={16} /><input aria-label="Search activity" placeholder="Search agency activity" value={q} onChange={e => setQ(e.target.value)} /></div>
      {rows.length === 0 ? <Empty text="No activity matches." /> : (
        <div className="list-card">{rows.map(a => <div key={a.id} className="list-row static anim-item"><span className="grow">{a.text}</span><span className="muted small">{a.by} · {a.at}</span></div>)}</div>
      )}
      <p className="muted small">Demo activity log. Full audit history and activity visibility rules arrive with the backend phase.</p>
    </div>
  );
}

/* ============================================================
   SETTINGS
   ============================================================ */
function Prefs({ ctx }: { ctx: Ctx }) {
  const { db, set } = ctx;
  const s = db.settings;
  const patch = (p: Partial<Settings>) => set(d => ({ ...d, settings: { ...d.settings, ...p } }));
  return (
    <div className="stack">
      <Panel title="Appearance">
        <Seg options={['dark', 'light', 'system'] as Theme[]} value={s.theme} onChange={t => patch({ theme: t })} />
        <p className="muted small" style={{ marginTop: 8 }}>Theme is shared with the User App on this device (same design system).</p>
        <label className="check"><input type="checkbox" checked={s.reduce} onChange={e => patch({ reduce: e.target.checked })} /> Reduce motion</label>
      </Panel>
      <Panel title="Distribution defaults">
        <div className="adm-form">
          <Field label="Default distribution mode"><select value={s.mode} onChange={e => patch({ mode: e.target.value as Mode })}>{MODES.map(m => <option key={m}>{m}</option>)}</select></Field>
          <Field label="Default active lead limit"><input type="number" min={0} value={s.limit} onChange={e => patch({ limit: Math.max(0, Number(e.target.value) || 0) })} /></Field>
        </div>
      </Panel>
    </div>
  );
}

function Security() {
  return (
    <Panel title="Security (demo)">
      <div className="notice info">The Admin Panel opens only after Firebase Owner sign-in (Owner UID check). This UI gate is not security on its own.</div>
      <div className="list small">
        <div className="list-row static"><span>Admin login</span><Badge tone="ok">Firebase Owner sign-in</Badge></div>
        <div className="list-row static"><span>Two-factor authentication</span><Badge tone="warn">Not implemented</Badge></div>
        <div className="list-row static"><span>Firestore Security Rules</span><Badge tone="warn">Separate task, not verified here</Badge></div>
        <div className="list-row static"><span>Server-side permission checks</span><Badge tone="warn">Firestore phase</Badge></div>
        <div className="list-row static"><span>Audit log enforcement</span><Badge tone="warn">Backend phase</Badge></div>
      </div>
      <p className="muted small">Frontend restrictions are not security. Real data access control must be enforced by Firestore Security Rules.</p>
    </Panel>
  );
}

function About() {
  return (
    <Panel title="About">
      <p className="small">MDS Motion Agency · Phase 2 Admin Application · demo build.</p>
      <p className="small">Open at <code>#/admin</code>. The User App opens at the default URL.</p>
      <a className="btn btn-secondary" href="#/">Back to User App</a>
    </Panel>
  );
}
