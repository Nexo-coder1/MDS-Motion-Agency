import { useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';

/* ============================================================
   MDS MOTION AGENCY — USER APPLICATION (Phase 1, frontend only)
   All data below is DEMO data kept in local state. No backend,
   no auth, no external APIs. Push notifications, auto-assignment
   and cross-user visibility are backend-phase items.
   ============================================================ */

/* ---------- Types ---------- */
type Page =
  | 'dashboard' | 'leads' | 'add' | 'messages' | 'replies' | 'followups'
  | 'notifications' | 'projects' | 'clients' | 'editor' | 'review'
  | 'finance' | 'targets' | 'rewards' | 'settings' | 'search' | 'profile' | 'activity';

type Status = 'New' | 'Claimed' | 'Researching' | 'Message Sent' | 'Follow-up' | 'Replied' | 'Interested' | 'Call Booked' | 'Negotiation' | 'Won' | 'Lost';
type Priority = 'High' | 'Medium' | 'Low';
type Platform = 'Instagram' | 'WhatsApp' | 'LinkedIn' | 'Email' | 'Other';
type Lang = 'en' | 'hi';
type Theme = 'dark' | 'light' | 'system';

interface Lead {
  id: string; name: string; platform: Platform; handle: string; phone: string;
  source: string; status: Status; priority: Priority; owner: string;
  claimedAt?: number; archived: boolean; deleted: boolean; score: number;
  scoreOverride?: number; niche: string; notes: string; custom: Record<string, string>;
  activity: string[];
}
interface Template { id: string; name: string; kind: 'first' | 'follow' | 'custom'; platform: Platform; lang: Lang; body: string; }
interface Reply { id: string; leadId: string; category: 'Interested' | 'Not interested' | 'Pricing enquiry' | 'Meeting request' | 'General'; text: string; at: string; }
interface FollowUp { id: string; leadId: string; due: string; time: string; reason: string; done: boolean; cancelled: boolean; }
interface Notice { id: string; cat: 'Lead' | 'Follow-up' | 'Message' | 'Project' | 'Payment'; text: string; read: boolean; }
interface Project { id: string; title: string; client: string; service: string; editor: string; status: string; deadline: string; price: number; currency: string; progress: number; revisions: number; stage: 'Internal Review' | 'Revision Required' | 'Internal Approval' | 'Client Approval' | 'Final Delivery' | 'In Progress'; notes: string; }
interface Client { id: string; name: string; email: string; phone: string; company: string; notes: string; }
interface Payment { id: string; label: string; amount: number; currency: string; kind: 'received' | 'pending' | 'payout' | 'expense'; }
interface Activity { id: string; cat: 'Lead' | 'Message' | 'Follow-up' | 'Project' | 'Payment'; text: string; at: string; }

/* ---------- Demo data (clearly marked DEMO in UI) ---------- */
const ME = { name: 'Demo User', email: 'demo@mdsmotion.local', role: 'Lead Researcher + Editor (demo role)' };
const DEMO_BANNER = 'DEMO MODE — local frontend data, no backend connected.';
const STATUSES: Status[] = ['New', 'Claimed', 'Researching', 'Message Sent', 'Follow-up', 'Replied', 'Interested', 'Call Booked', 'Negotiation', 'Won', 'Lost'];
const PRIORITIES: Priority[] = ['High', 'Medium', 'Low'];
const PLATFORMS: Platform[] = ['Instagram', 'WhatsApp', 'LinkedIn', 'Email', 'Other'];
const CLAIM_MS = 48 * 3600 * 1000;

const SEED_LEADS: Lead[] = [
  { id: 'L-1001', name: 'Aarav Creates', platform: 'Instagram', handle: '@aarav.creates', phone: '+91 90000 11111', source: 'Manual entry', status: 'Researching', priority: 'High', owner: 'Demo User', claimedAt: Date.now() - 10 * 3600 * 1000, archived: false, deleted: false, score: 78, niche: 'Reels creator', notes: 'Posts 3 reels a week, inconsistent edits.', custom: { Followers: '42k', Budget: '₹15k/video' }, activity: ['Claimed', 'Profile researched'] },
  { id: 'L-1002', name: 'Priya Realty', platform: 'WhatsApp', handle: '+91 98111 22222', phone: '+91 98111 22222', source: 'Paste profile link', status: 'Message Sent', priority: 'Medium', owner: 'Demo User', claimedAt: Date.now() - 30 * 3600 * 1000, archived: false, deleted: false, score: 64, niche: 'Real estate', notes: 'Needs property walkthrough videos.', custom: { City: 'Agra' }, activity: ['First message sent'] },
  { id: 'L-1003', name: 'FitWithRohan', platform: 'Instagram', handle: '@fitwithrohan', phone: '', source: 'Screenshot (manual fallback)', status: 'New', priority: 'Low', owner: 'Unassigned', archived: false, deleted: false, score: 41, niche: 'Fitness coach', notes: '', custom: {}, activity: ['Added'] },
  { id: 'L-1004', name: 'Sharma Interiors', platform: 'LinkedIn', handle: 'sharma-interiors', phone: '+91 97000 33333', source: 'CSV import', status: 'Interested', priority: 'High', owner: 'Demo User', claimedAt: Date.now() - 60 * 3600 * 1000, archived: false, deleted: false, score: 86, niche: 'Interior design', notes: 'Wants before/after reel series.', custom: { Budget: '₹40k/month' }, activity: ['Replied: interested'] },
  { id: 'L-1005', name: 'Foodie Diaries', platform: 'Instagram', handle: '@foodiediaries', phone: '', source: 'Manual entry', status: 'Lost', priority: 'Low', owner: 'Demo User', archived: true, deleted: false, score: 33, niche: 'Food blog', notes: 'Chose in-house editor.', custom: {}, activity: ['Marked lost'] },
];
const SEED_TEMPLATES: Template[] = [
  { id: 'T1', name: 'Intro — Creator', kind: 'first', platform: 'Instagram', lang: 'en', body: 'Hi {name}, I loved your recent reels! I edit short-form videos for creators and had a quick idea for {niche}. Open to a free sample?' },
  { id: 'T2', name: 'परिचय — Realty', kind: 'first', platform: 'WhatsApp', lang: 'hi', body: 'नमस्ते {name}, मैं प्रॉपर्टी वीडियो एडिटिंग में मदद करता हूँ। क्या मैं आपको एक छोटा सैंपल भेज सकता हूँ?' },
  { id: 'T3', name: 'Follow-up — Gentle', kind: 'follow', platform: 'WhatsApp', lang: 'en', body: 'Hi {name}, just checking if you had a chance to look at my sample idea for {niche}.' },
  { id: 'T4', name: 'फॉलो-अप — सरल', kind: 'follow', platform: 'WhatsApp', lang: 'hi', body: 'नमस्ते {name}, क्या आपने मेरा सैंपल देखा? अगर आप चाहें तो कल कॉल कर सकते हैं।' },
];
const SEED_REPLIES: Reply[] = [
  { id: 'R1', leadId: 'L-1004', category: 'Interested', text: 'Yes, interested. What is your package for 8 reels?', at: 'Today 10:20' },
  { id: 'R2', leadId: 'L-1002', category: 'Pricing enquiry', text: 'What will it cost per walkthrough video?', at: 'Yesterday 17:05' },
];
const today = new Date();
const iso = (d: number) => { const x = new Date(today); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10); };
const SEED_FOLLOWUPS: FollowUp[] = [
  { id: 'F1', leadId: 'L-1001', due: iso(0), time: '18:00', reason: 'Send sample reel', done: false, cancelled: false },
  { id: 'F2', leadId: 'L-1002', due: iso(-1), time: '11:00', reason: 'Ask about walkthrough date', done: false, cancelled: false },
  { id: 'F3', leadId: 'L-1004', due: iso(2), time: '15:30', reason: 'Share package pricing', done: false, cancelled: false },
];
const SEED_NOTICES: Notice[] = [
  { id: 'N1', cat: 'Follow-up', text: 'Follow-up due today: Aarav Creates (demo)', read: false },
  { id: 'N2', cat: 'Follow-up', text: 'Overdue follow-up: Priya Realty (demo)', read: false },
  { id: 'N3', cat: 'Lead', text: 'Sharma Interiors replied: Interested (demo)', read: true },
  { id: 'N4', cat: 'Project', text: 'Project "Reel Pack – Feb" moved to Client Approval (demo)', read: false },
];
const SEED_PROJECTS: Project[] = [
  { id: 'P1', title: 'Reel Pack — Feb', client: 'Sharma Interiors', service: 'Monthly retainer (reels)', editor: 'Demo Editor A', status: 'Active', deadline: iso(4), price: 40000, currency: 'INR', progress: 60, revisions: 1, stage: 'Client Approval', notes: 'Client wants warmer colour grade.' },
  { id: 'P2', title: 'Property Walkthrough', client: 'Priya Realty', service: 'Per-video editing', editor: 'Demo Editor B', status: 'Active', deadline: iso(9), price: 6000, currency: 'INR', progress: 25, revisions: 0, stage: 'In Progress', notes: '' },
  { id: 'P3', title: 'Brand Explainer', client: 'Demo Startup (USD)', service: 'Fixed project', editor: 'Demo Editor A', status: 'Done', deadline: iso(-6), price: 450, currency: 'USD', progress: 100, revisions: 2, stage: 'Final Delivery', notes: 'Delivered.' },
];
const SEED_CLIENTS: Client[] = [
  { id: 'C1', name: 'Sharma Interiors', email: 'contact@sharma.demo', phone: '+91 97000 33333', company: 'Sharma Interiors', notes: 'Monthly retainer client (demo).' },
  { id: 'C2', name: 'Priya Realty', email: 'hello@priya.demo', phone: '+91 98111 22222', company: 'Priya Realty', notes: 'Per-video client (demo).' },
];
const SEED_PAYMENTS: Payment[] = [
  { id: 'M1', label: 'Sharma — retainer (demo)', amount: 40000, currency: 'INR', kind: 'received' },
  { id: 'M2', label: 'Priya — walkthrough (demo)', amount: 6000, currency: 'INR', kind: 'pending' },
  { id: 'M3', label: 'Demo Editor A — payout (demo)', amount: 12000, currency: 'INR', kind: 'payout' },
  { id: 'M4', label: 'Software tools (demo)', amount: 2500, currency: 'INR', kind: 'expense' },
  { id: 'M5', label: 'Demo Startup — explainer (demo)', amount: 450, currency: 'USD', kind: 'pending' },
];
const FX: Record<string, number> = { INR: 1, USD: 83 }; // demo rate only
const SEED_ACTIVITY: Activity[] = [
  { id: 'A1', cat: 'Lead', text: 'Claimed Aarav Creates (demo)', at: 'Today 09:10' },
  { id: 'A2', cat: 'Message', text: 'Sent WhatsApp intro to Priya Realty (demo, manual send)', at: 'Yesterday 16:40' },
  { id: 'A3', cat: 'Follow-up', text: 'Rescheduled follow-up for Sharma Interiors (demo)', at: 'Yesterday 12:02' },
  { id: 'A4', cat: 'Project', text: 'Uploaded revision for Reel Pack — Feb (demo)', at: 'Mon 18:30' },
  { id: 'A5', cat: 'Payment', text: 'Recorded payment from Sharma Interiors (demo)', at: 'Mon 11:15' },
];

/* ---------- Helpers ---------- */
const fmt = (n: number, c = 'INR') => new Intl.NumberFormat(c === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(n);
const todayStr = iso(0);
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const waLink = (phone: string, text: string) => `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
const fill = (body: string, lead: Lead) => body.replace(/\{name\}/g, lead.name).replace(/\{niche\}/g, lead.niche).replace(/\{handle\}/g, lead.handle);
const scoreOf = (l: Lead) => l.scoreOverride ?? l.score;
const tier = (s: number) => (s >= 70 ? 'High' : s >= 50 ? 'Medium' : 'Low');
const dupOf = (leads: Lead[], handle: string) => leads.find(l => !l.deleted && l.handle.toLowerCase() === handle.trim().toLowerCase());
const claimLeft = (l: Lead) => (l.claimedAt ? Math.max(0, l.claimedAt + CLAIM_MS - Date.now()) : 0);
const hrs = (ms: number) => `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
const uid = () => Math.random().toString(36).slice(2, 9);

/* Rules-based quality (no paid AI). Not a guarantee of conversion. */
function qualityOf(l: Lead) {
  const strengths: string[] = [], weaknesses: string[] = [], missing: string[] = [], tips: string[] = [];
  if (l.handle) strengths.push('Handle/contact available'); else missing.push('Handle or contact');
  if (l.niche) strengths.push(`Niche known: ${l.niche}`); else missing.push('Niche');
  if (l.phone) strengths.push('Phone available'); else { weaknesses.push('No phone (WhatsApp outreach not possible)'); tips.push('Ask for a WhatsApp number in first reply'); }
  if (Object.keys(l.custom).length) strengths.push('Custom details recorded'); else missing.push('Budget / followers (custom fields)');
  if (l.notes.length > 20) strengths.push('Notes captured'); else tips.push('Add a short research note');
  return { score: scoreOf(l), tier: tier(scoreOf(l)), strengths, weaknesses, missing, tips };
}

/* ---------- Icons (inline outline SVG) ---------- */
const PATHS: Record<string, string> = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  more: 'M4 6h16M4 12h16M4 18h16',
  plus: 'M12 5v14M5 12h14',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  help: 'M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z',
  x: 'M18 6L6 18M6 6l12 12',
  chevron: 'M9 18l6-6-6-6',
  copy: 'M9 9h11v11H9zM5 15V5h10',
  check: 'M20 6L9 17l-5-5',
  cal: 'M3 6h18v15H3zM8 2v4M16 2v4M3 10h18',
  sun: 'M12 4V2M12 22v-2M4.9 4.9L3.5 3.5M20.5 20.5l-1.4-1.4M2 12h2M20 12h2M4.9 19.1l-1.4 1.4M20.5 3.5l-1.4 1.4M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
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
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  info: 'M12 16v-4M12 8h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z',
  mail: 'M4 4h16v16H4zM22 6l-10 7L2 6',
};
type IconName = keyof typeof PATHS;
function Icon({ name, size = 20, filled = false }: { name: IconName; size?: number; filled?: boolean }) {
  return (
    <svg className="ic" width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

/* ---------- Reusable UI ---------- */
function Btn({ children, variant = 'primary', onClick, disabled, title, icon, type = 'button' }: { children?: ReactNode; variant?: 'primary' | 'secondary' | 'danger' | 'icon' | 'ghost'; onClick?: () => void; disabled?: boolean; title?: string; icon?: IconName; type?: 'button' | 'submit'; key?: string }) {
  return (
    <button type={type} className={`btn btn-${variant}`} onClick={onClick} disabled={disabled} title={title} aria-label={title}>
      {icon && <Icon name={icon} size={18} />}{children}
    </button>
  );
}
function Card({ children, className = '', onClick }: { children: ReactNode; className?: string; onClick?: () => void; key?: string }) {
  return <div className={`card ${onClick ? 'card-click' : ''} ${className}`} onClick={onClick}>{children}</div>;
}
function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal anim-pop" role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>
        <header className="modal-head"><h3>{title}</h3><button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button></header>
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
        <div className="sheet-grip" /><header className="modal-head"><h3>{title}</h3><button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button></header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
function Field({ label, children, error, ok }: { label: string; children: ReactNode; error?: string; ok?: boolean }) {
  return (
    <label className={`field ${error ? 'is-error' : ''} ${ok ? 'is-ok' : ''}`}>
      <span className="field-label">{label}</span>
      {children}
      {error && <span className="field-msg err">{error}</span>}
    </label>
  );
}
function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'ok' | 'warn' | 'err' | 'info' | 'gold'; key?: string }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
function Empty({ text }: { text: string }) { return <div className="empty anim-fade">{text}</div>; }
function Skeleton() { return <div className="skeleton-wrap" aria-hidden="true"><div className="skel" /><div className="skel short" /><div className="skel" /></div>; }
function ProgressBar({ value }: { value: number }) { return <div className="bar" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}><div className="bar-fill" style={{ width: `${Math.min(100, value)}%` }} /></div>; }
function Stat({ label, value, sub, icon }: { label: string; value: string | number; sub?: string; icon: IconName }) {
  return (
    <Card className="stat">
      <div className="stat-ic"><Icon name={icon} /></div>
      <div><div className="stat-val">{value}</div><div className="stat-lab">{label}</div>{sub && <div className="stat-sub">{sub}</div>}</div>
    </Card>
  );
}
function Seg<T extends string>({ options, value, onChange }: { options: T[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="tablist">
      {options.map(o => <button key={o} role="tab" aria-selected={o === value} className={o === value ? 'on' : ''} onClick={() => onChange(o)}>{o}</button>)}
    </div>
  );
}
function Toasts({ items }: { items: { id: string; text: string; tone: 'ok' | 'err' | 'info' }[] }) {
  return <div className="toasts" aria-live="polite">{items.map(t => <div key={t.id} className={`toast toast-${t.tone} anim-toast`}>{t.text}</div>)}</div>;
}
function Collapse({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="collapse">
      <button className="collapse-head" aria-expanded={open} onClick={() => setOpen(o => !o)}>{title}<span className={`chev ${open ? 'open' : ''}`}><Icon name="chevron" size={16} /></span></button>
      <div className={`collapse-body ${open ? 'open' : ''}`}><div>{children}</div></div>
    </div>
  );
}

/* ============================================================
   APP ROOT — state, navigation, toasts, theme, language
   ============================================================ */
export default function App() {
  const [page, setPage] = useState<Page>('dashboard');
  const [theme, setTheme] = useState<Theme>('system');
  const [lang, setLang] = useState<Lang>('en');
  const [leads, setLeads] = useState<Lead[]>(SEED_LEADS);
  const [templates, setTemplates] = useState<Template[]>(SEED_TEMPLATES);
  const [replies, setReplies] = useState<Reply[]>(SEED_REPLIES);
  const [followups, setFollowups] = useState<FollowUp[]>(SEED_FOLLOWUPS);
  const [notices, setNotices] = useState<Notice[]>(SEED_NOTICES);
  const [projects, setProjects] = useState<Project[]>(SEED_PROJECTS);
  const [clients] = useState<Client[]>(SEED_CLIENTS);
  const [payments] = useState<Payment[]>(SEED_PAYMENTS);
  const [activity, setActivity] = useState<Activity[]>(SEED_ACTIVITY);
  const [sent, setSent] = useState(3); // demo counter of messages marked sent
  const [openLead, setOpenLead] = useState<string | null>(null);
  const [showNotif, setShowNotif] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [loggedIn, setLoggedIn] = useState(true);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<{ id: string; text: string; tone: 'ok' | 'err' | 'info' }[]>([]);

  /* theme: apply to <html data-theme> (system = no attribute, follows prefers-color-scheme) */
  useEffect(() => {
    const r = document.documentElement;
    if (theme === 'system') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', theme);
  }, [theme]);
  useEffect(() => { const t = setTimeout(() => setLoading(false), 450); return () => clearTimeout(t); }, []);

  const toast = (text: string, tone: 'ok' | 'err' | 'info' = 'ok') => {
    const id = uid();
    setToasts(t => [...t, { id, text, tone }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 2600);
  };
  const log = (cat: Activity['cat'], text: string) => setActivity(a => [{ id: uid(), cat, text: `${text} (demo)`, at: 'Just now' }, ...a]);
  const unread = notices.filter(n => !n.read).length;
  const dueToday = followups.filter(f => !f.done && !f.cancelled && f.due === todayStr).length;
  const overdue = followups.filter(f => !f.done && !f.cancelled && f.due < todayStr).length;

  const ctx = { leads, setLeads, templates, setTemplates, replies, setReplies, followups, setFollowups, notices, setNotices, projects, setProjects, clients, payments, activity, log, toast, lang, sent, setSent, setPage, setOpenLead, openLead, unread, dueToday, overdue };

  if (!loggedIn) return <LoginDemo onLogin={() => { setLoggedIn(true); toast('Demo session started', 'info'); }} />;

  const titles: Record<Page, string> = { dashboard: 'Dashboard', leads: 'Leads', add: 'Add Lead', messages: 'Message Center', replies: 'Client Replies', followups: 'Follow-up Centre', notifications: 'Notifications', projects: 'Projects', clients: 'Clients', editor: 'Editor Workspace', review: 'Review & Delivery', finance: 'Finance', targets: 'Targets', rewards: 'Rewards', settings: 'Settings', search: 'Search', profile: 'Profile', activity: 'Activity' };

  return (
    <div className={`app ${loading ? 'is-loading' : ''}`}>
      <Sidebar page={page} setPage={p => { setPage(p); setOpenLead(null); }} unread={unread} dueToday={dueToday} overdue={overdue} />
      <div className="main-col">
        <Header title={titles[page]} setPage={setPage} onNotif={() => setShowNotif(true)} onAccount={() => setShowAccount(s => !s)} onHelp={() => setShowHelp(true)} unread={unread} />
        <div className="demo-banner" role="note"><Icon name="info" size={16} /> {DEMO_BANNER}</div>
        <main className="content" key={page + (openLead ?? '')}>
          {loading ? <Skeleton /> : (
            <div className="page anim-page">
              {openLead ? <LeadProfile ctx={ctx} id={openLead} onBack={() => setOpenLead(null)} />
                : page === 'dashboard' ? <Dashboard ctx={ctx} />
                : page === 'leads' ? <Leads ctx={ctx} />
                : page === 'add' ? <AddLead ctx={ctx} />
                : page === 'messages' ? <Messages ctx={ctx} />
                : page === 'replies' ? <Replies ctx={ctx} />
                : page === 'followups' ? <FollowUps ctx={ctx} />
                : page === 'notifications' ? <Notifications ctx={ctx} />
                : page === 'projects' ? <Projects ctx={ctx} />
                : page === 'clients' ? <Clients ctx={ctx} />
                : page === 'editor' ? <EditorWS ctx={ctx} />
                : page === 'review' ? <Review ctx={ctx} />
                : page === 'finance' ? <Finance ctx={ctx} />
                : page === 'targets' ? <Targets ctx={ctx} />
                : page === 'rewards' ? <Rewards ctx={ctx} />
                : page === 'settings' ? <Settings theme={theme} setTheme={setTheme} lang={lang} setLang={setLang} toast={toast} />
                : page === 'search' ? <Search ctx={ctx} />
                : page === 'profile' ? <Profile onLogout={() => setLoggedIn(false)} toast={toast} />
                : page === 'activity' ? <ActivityPage ctx={ctx} />
                : page === 'more' ? <MorePage setPage={setPage} />
                : null}
            </div>
          )}
        </main>
      </div>
      <MobileNav page={page} setPage={p => { setPage(p); setOpenLead(null); }} onAdd={() => setPage('add')} />
      {showNotif && <Sheet title="Quick notifications" onClose={() => setShowNotif(false)}><NotifList ctx={ctx} compact /><div className="row-end"><Btn variant="secondary" onClick={() => { setPage('notifications'); setShowNotif(false); }}>Open centre</Btn></div></Sheet>}
      {showAccount && <AccountMenu onClose={() => setShowAccount(false)} setPage={p => { setPage(p); setShowAccount(false); }} />}
      {showHelp && <Modal title="Help & support" onClose={() => setShowHelp(false)} footer={<Btn onClick={() => setShowHelp(false)}>Got it</Btn>}>
        <p>This is the Phase 1 frontend demo. Data is local and resets on refresh. WhatsApp and Instagram messages are sent manually by you. Push notifications, backend sync and team visibility arrive in the backend phase.</p>
      </Modal>}
      <Toasts items={toasts} />
    </div>
  );
}

/* ---------- Shell: sidebar, header, nav ---------- */
function Sidebar({ page, setPage, unread, dueToday, overdue }: { page: Page; setPage: (p: Page) => void; unread: number; dueToday: number; overdue: number }) {
  const groups: { title: string; items: { k: Page; l: string; i: IconName; b?: number }[] }[] = [
    { title: 'Work', items: [{ k: 'dashboard', l: 'Dashboard', i: 'home' }, { k: 'leads', l: 'Leads', i: 'users' }, { k: 'add', l: 'Add Lead', i: 'plus' }, { k: 'messages', l: 'Messages', i: 'msg' }, { k: 'replies', l: 'Client Replies', i: 'reply' }, { k: 'followups', l: 'Follow-ups', i: 'cal', b: dueToday + overdue }] },
    { title: 'Agency', items: [{ k: 'projects', l: 'Projects', i: 'film' }, { k: 'clients', l: 'Clients', i: 'users' }, { k: 'editor', l: 'Editor Workspace', i: 'edit' }, { k: 'review', l: 'Review & Delivery', i: 'shield' }] },
    { title: 'Growth', items: [{ k: 'finance', l: 'Finance', i: 'wallet' }, { k: 'targets', l: 'Targets', i: 'target' }, { k: 'rewards', l: 'Rewards', i: 'star' }] },
    { title: 'Account', items: [{ k: 'notifications', l: 'Notifications', i: 'bell', b: unread }, { k: 'activity', l: 'Activity', i: 'sparkle' }, { k: 'settings', l: 'Settings', i: 'gear' }, { k: 'profile', l: 'Profile', i: 'users' }] },
  ];
  const [open, setOpen] = useState<Record<string, boolean>>({ Work: true, Agency: true, Growth: false, Account: false });
  return (
    <aside className="sidebar" aria-label="Main navigation">
      <div className="brand"><span className="logo">M</span><div><div className="brand-name">MDS Motion</div><div className="brand-sub">Agency CRM</div></div></div>
      {groups.map(g => (
        <div key={g.title} className="nav-group">
          <button className="nav-group-head" aria-expanded={open[g.title]} onClick={() => setOpen(o => ({ ...o, [g.title]: !o[g.title] }))}>{g.title}<span className={`chev ${open[g.title] ? 'open' : ''}`}><Icon name="chevron" size={14} /></span></button>
          <div className={`collapse-body ${open[g.title] ? 'open' : ''}`}><div>
            {g.items.map(it => (
              <button key={it.k} className={`nav-item ${page === it.k ? 'active' : ''}`} onClick={() => setPage(it.k)} aria-current={page === it.k ? 'page' : undefined}>
                <Icon name={it.i} size={18} /><span>{it.l}</span>{!!it.b && <span className="count">{it.b}</span>}
              </button>
            ))}
          </div></div>
        </div>
      ))}
      <div className="shortcut-hint">Shortcut: press <kbd>/</kbd> to search</div>
    </aside>
  );
}
function Header({ title, setPage, onNotif, onAccount, onHelp, unread }: { title: string; setPage: (p: Page) => void; onNotif: () => void; onAccount: () => void; onHelp: () => void; unread: number }) {
  return (
    <header className="topbar">
      <h1 className="page-title">{title}</h1>
      <button className="search-pill" onClick={() => setPage('search')} aria-label="Open search"><Icon name="search" size={16} /><span>Search leads, projects…</span></button>
      <div className="top-actions">
        <Btn variant="icon" icon="plus" title="Add lead" onClick={() => setPage('add')} />
        <button className="icon-btn badge-wrap" onClick={onNotif} aria-label={`Notifications, ${unread} unread`}><Icon name="bell" />{unread > 0 && <span className="dot">{unread}</span>}</button>
        <button className="icon-btn" onClick={onHelp} aria-label="Help"><Icon name="help" /></button>
        <button className="avatar" onClick={onAccount} aria-label="Account menu">DU</button>
      </div>
    </header>
  );
}
function MobileNav({ page, setPage, onAdd }: { page: Page; setPage: (p: Page) => void; onAdd: () => void }) {
  const items: { k: Page; l: string; i: IconName }[] = [{ k: 'dashboard', l: 'Home', i: 'home' }, { k: 'leads', l: 'Leads', i: 'users' }];
  const right: { k: Page; l: string; i: IconName }[] = [{ k: 'projects', l: 'Projects', i: 'folder' }];
  return (
    <nav className="mobile-nav" aria-label="Bottom navigation">
      {items.map(it => <button key={it.k} className={page === it.k ? 'on' : ''} onClick={() => setPage(it.k)}><Icon name={it.i} /><span>{it.l}</span></button>)}
      <button className="fab" onClick={onAdd} aria-label="Add lead"><Icon name="plus" size={26} /></button>
      {right.map(it => <button key={it.k} className={page === it.k ? 'on' : ''} onClick={() => setPage(it.k)}><Icon name={it.i} /><span>{it.l}</span></button>)}
      <MoreTrigger setPage={setPage} />
    </nav>
  );
}
function MoreTrigger({ setPage }: { setPage: (p: Page) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="More"><Icon name="more" /><span>More</span></button>
      {open && <Sheet title="More" onClose={() => setOpen(false)}><MorePage setPage={p => { setPage(p); setOpen(false); }} /></Sheet>}
    </>
  );
}
function MorePage({ setPage }: { setPage: (p: Page) => void }) {
  const items: { k: Page; l: string; i: IconName }[] = [
    { k: 'messages', l: 'Messages', i: 'msg' }, { k: 'replies', l: 'Client Replies', i: 'reply' }, { k: 'followups', l: 'Follow-ups', i: 'cal' },
    { k: 'clients', l: 'Clients', i: 'users' }, { k: 'editor', l: 'Editor Workspace', i: 'edit' }, { k: 'review', l: 'Review & Delivery', i: 'shield' },
    { k: 'finance', l: 'Finance', i: 'wallet' }, { k: 'targets', l: 'Targets', i: 'target' }, { k: 'rewards', l: 'Rewards', i: 'star' },
    { k: 'notifications', l: 'Notifications', i: 'bell' }, { k: 'activity', l: 'Activity', i: 'sparkle' }, { k: 'search', l: 'Search', i: 'search' },
    { k: 'settings', l: 'Settings', i: 'gear' }, { k: 'profile', l: 'Profile', i: 'users' },
  ];
  return <div className="grid-menu">{items.map(it => <button key={it.k} className="menu-tile" onClick={() => setPage(it.k)}><Icon name={it.i} /><span>{it.l}</span></button>)}</div>;
}
function AccountMenu({ onClose, setPage }: { onClose: () => void; setPage: (p: Page) => void }) {
  return (
    <div className="overlay transparent" onClick={onClose}>
      <div className="dropdown anim-drop" onClick={e => e.stopPropagation()} role="menu">
        <div className="dd-head"><strong>{ME.name}</strong><span>{ME.email}</span></div>
        <button role="menuitem" onClick={() => setPage('profile')}><Icon name="users" size={16} /> Profile</button>
        <button role="menuitem" onClick={() => setPage('settings')}><Icon name="gear" size={16} /> Settings</button>
        <button role="menuitem" onClick={() => setPage('activity')}><Icon name="sparkle" size={16} /> Activity</button>
      </div>
    </div>
  );
}
function LoginDemo({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="login">
      <Card className="login-card anim-pop">
        <span className="logo lg">M</span>
        <h2>MDS Motion Agency</h2>
        <p className="muted">Frontend demo login. No real authentication is implemented in Phase 1.</p>
        <Badge tone="warn">DEMO ONLY</Badge>
        <Btn onClick={onLogin}>Continue to demo</Btn>
      </Card>
    </div>
  );
}

/* ============================================================
   PAGE: DASHBOARD
   ============================================================ */
function Dashboard({ ctx }: { ctx: Ctx }) {
  const { leads, followups, replies, setPage, setOpenLead, sent, activity } = ctx;
  const mine = leads.filter(l => !l.deleted && l.owner === ME.name);
  const active = mine.filter(l => !l.archived && !['Won', 'Lost'].includes(l.status));
  const claimed = mine.filter(l => l.claimedAt);
  const interested = leads.filter(l => !l.deleted && l.status === 'Interested').length;
  const dueToday = followups.filter(f => !f.done && !f.cancelled && f.due === todayStr);
  const overdueFU = followups.filter(f => !f.done && !f.cancelled && f.due < todayStr);
  const upcoming = followups.filter(f => !f.done && !f.cancelled && f.due > todayStr).sort((a, b) => a.due.localeCompare(b.due));
  const target = 10;
  const done = followups.filter(f => f.done).length;
  const leadName = (id: string) => leads.find(l => l.id === id)?.name ?? '—';
  const firstName = ME.name.split(' ')[0];
  return (
    <div className="stack">
      <Card className="hero">
        <div>
          <div className="eyebrow">Good morning</div>
          <h2>Welcome back, {firstName}</h2>
          <p className="muted">Here is your work for today. All figures are demo data.</p>
        </div>
        <div className="profile-mini"><div className="avatar lg">DU</div><div><strong>{ME.name}</strong><div className="muted small">{ME.role}</div></div></div>
      </Card>
      <div className="quick-actions" role="group" aria-label="Quick actions">
        <Btn icon="plus" onClick={() => setPage('add')}>Add lead</Btn>
        <Btn variant="secondary" icon="msg" onClick={() => setPage('messages')}>Messages</Btn>
        <Btn variant="secondary" icon="reply" onClick={() => setPage('replies')}>Log reply</Btn>
        <Btn variant="secondary" icon="cal" onClick={() => setPage('followups')}>Follow-ups</Btn>
      </div>
      <section className="grid stats">
        <Stat icon="users" label="Assigned leads" value={mine.length} />
        <Stat icon="target" label="Active leads" value={active.length} />
        <Stat icon="check" label="Claimed leads" value={claimed.length} />
        <Stat icon="msg" label="Messages sent" value={sent} sub="Manual sends (demo)" />
        <Stat icon="reply" label="Replies received" value={replies.length} />
        <Stat icon="star" label="Interested prospects" value={interested} />
      </section>
      <section className="grid two">
        <Card>
          <h3>Follow-ups</h3>
          <div className="kv"><span>Due today</span><Badge tone={dueToday.length ? 'warn' : 'ok'}>{dueToday.length}</Badge></div>
          <div className="kv"><span>Overdue</span><Badge tone={overdueFU.length ? 'err' : 'ok'}>{overdueFU.length}</Badge></div>
          <div className="list">{[...dueToday, ...overdueFU].slice(0, 4).map(f => (
            <button key={f.id} className="list-row" onClick={() => setPage('followups')}><span>{leadName(f.leadId)} — {f.reason}</span><Badge tone={f.due < todayStr ? 'err' : 'warn'}>{f.due < todayStr ? 'Overdue' : 'Today'}</Badge></button>
          ))}</div>
        </Card>
        <Card>
          <h3>Today's target</h3>
          <div className="kv"><span>Messages sent</span><strong>{sent} / {target}</strong></div>
          <ProgressBar value={pct(sent, target)} />
          <div className="kv"><span>Follow-ups completed</span><strong>{done}</strong></div>
          <Btn variant="ghost" onClick={() => setPage('targets')}>View targets</Btn>
        </Card>
      </section>
      <section className="grid two">
        <Card>
          <h3>Upcoming tasks</h3>
          {upcoming.length ? <div className="list">{upcoming.slice(0, 4).map(f => <div key={f.id} className="list-row static"><span>{leadName(f.leadId)} — {f.reason}</span><span className="muted small">{f.due} {f.time}</span></div>)}</div> : <Empty text="No upcoming tasks." />}
        </Card>
        <Card>
          <h3>Recent activity</h3>
          <div className="list">{activity.slice(0, 4).map(a => <div key={a.id} className="list-row static"><span>{a.text}</span><span className="muted small">{a.at}</span></div>)}</div>
          <Btn variant="ghost" onClick={() => setPage('activity')}>See all</Btn>
        </Card>
      </section>
      <section className="grid two">
        <Card>
          <h3>Performance overview</h3>
          <div className="kv"><span>Conversion (lead → interested)</span><strong>{pct(interested, Math.max(1, mine.length + interested))}%</strong></div>
          <div className="kv"><span>Reply rate</span><strong>{pct(replies.length, Math.max(1, sent))}%</strong></div>
          <p className="muted small">Calculated only from demo records. Not a guarantee of results.</p>
        </Card>
        <Card>
          <h3>Quick open</h3>
          <div className="list">{mine.slice(0, 3).map(l => <button key={l.id} className="list-row" onClick={() => { setPage('leads'); setOpenLead(l.id); }}><span>{l.name}</span><Badge>{l.status}</Badge></button>)}</div>
        </Card>
      </section>
    </div>
  );
}

/* ============================================================
   PAGE: LEADS (list, search, filters, sort, status, priority, claim)
   ============================================================ */
function Leads({ ctx }: { ctx: Ctx }) {
  const { leads, setLeads, setOpenLead, toast, log } = ctx;
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'All' | Status>('All');
  const [prio, setPrio] = useState<'All' | Priority>('All');
  const [view, setView] = useState<'Active' | 'Archived' | 'Deleted'>('Active');
  const [sort, setSort] = useState<'Newest' | 'Score' | 'Name'>('Newest');
  const [showFilters, setShowFilters] = useState(false);
  const [confirmDel, setConfirmDel] = useState<Lead | null>(null);

  const rows = useMemo(() => {
    const k = q.trim().toLowerCase();
    const r = leads.filter(l => (view === 'Active' ? !l.archived && !l.deleted : view === 'Archived' ? l.archived && !l.deleted : l.deleted)
      && (status === 'All' || l.status === status) && (prio === 'All' || l.priority === prio)
      && (!k || [l.name, l.handle, l.niche, l.phone].some(v => v.toLowerCase().includes(k))));
    if (sort === 'Score') r.sort((a, b) => scoreOf(b) - scoreOf(a));
    else if (sort === 'Name') r.sort((a, b) => a.name.localeCompare(b.name));
    return r;
  }, [leads, q, status, prio, view, sort]);

  const setLead = (id: string, patch: Partial<Lead>, msg?: string) => {
    setLeads(ls => ls.map(l => (l.id === id ? { ...l, ...patch } : l)));
    if (msg) toast(msg);
  };
  const claim = (l: Lead) => { setLead(l.id, { owner: ME.name, claimedAt: Date.now(), status: 'Claimed' }, `Claimed ${l.name} for 48h (demo)`); log('Lead', `Claimed ${l.name}`); };
  const release = (l: Lead) => { setLead(l.id, { owner: 'Unassigned', claimedAt: undefined, status: 'New' }, 'Claim released (demo)'); };
  const restore = (l: Lead) => { setLeads(ls => ls.map(x => x.id === l.id ? { ...x, deleted: false, archived: false } : x)); toast(`${l.name} restored (demo)`); };
  const archive = (l: Lead) => { setLead(l.id, { archived: true }, `${l.name} archived (demo)`); };
  const softDelete = (l: Lead) => { setLead(l.id, { deleted: true }, `${l.name} moved to deleted (demo)`); setConfirmDel(null); };
  const quick = (l: Lead, s: Status) => setLead(l.id, { status: s }, `Status → ${s} (demo)`);

  return (
    <div className="stack">
      <div className="toolbar">
        <div className="search-input"><Icon name="search" size={16} /><input aria-label="Search leads" placeholder="Search name, handle, niche, phone" value={q} onChange={e => setQ(e.target.value)} /></div>
        <Btn variant="secondary" icon="sparkle" onClick={() => setShowFilters(s => !s)}>Filters</Btn>
      </div>
      <Seg options={['Active', 'Archived', 'Deleted']} value={view} onChange={setView} />
      {showFilters && (
        <Card className="filters anim-fade">
          <Field label="Status"><select value={status} onChange={e => setStatus(e.target.value as 'All' | Status)}><option>All</option>{STATUSES.map(s => <option key={s}>{s}</option>)}</select></Field>
          <Field label="Priority"><select value={prio} onChange={e => setPrio(e.target.value as 'All' | Priority)}><option>All</option>{PRIORITIES.map(s => <option key={s}>{s}</option>)}</select></Field>
          <Field label="Sort by"><select value={sort} onChange={e => setSort(e.target.value as typeof sort)}><option>Newest</option><option>Score</option><option>Name</option></select></Field>
          <Btn variant="ghost" onClick={() => { setStatus('All'); setPrio('All'); setSort('Newest'); setQ(''); }}>Reset</Btn>
        </Card>
      )}
      <div className="muted small">{rows.length} lead(s) shown · demo data</div>
      {rows.length === 0 && <Empty text="No leads match these filters." />}
      <div className="grid cards-lead">
        {rows.map(l => {
          const left = claimLeft(l);
          return (
            <Card key={l.id} className="lead-card anim-item">
              <div className="row-between">
                <button className="link-title" onClick={() => setOpenLead(l.id)}>{l.name}</button>
                <Badge tone={l.priority === 'High' ? 'err' : l.priority === 'Medium' ? 'warn' : 'neutral'}>{l.priority}</Badge>
              </div>
              <div className="muted small">{l.platform} · {l.handle} · {l.source}</div>
              <div className="row-wrap">
                <select aria-label={`Status for ${l.name}`} className="chip-select" value={l.status} onChange={e => quick(l, e.target.value as Status)}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select>
                <Badge tone="info">Score {scoreOf(l)}</Badge>
                <Badge>{l.owner}</Badge>
              </div>
              {l.claimedAt && <div className="small muted">Claim expires in {hrs(left)} {left === 0 && <Badge tone="err">Expired</Badge>}</div>}
              <div className="row-wrap">
                {l.owner === 'Unassigned' ? <Btn variant="secondary" onClick={() => claim(l)}>Claim</Btn> : l.owner === ME.name && <Btn variant="ghost" onClick={() => release(l)}>Release</Btn>}
                {!l.deleted && !l.archived && <Btn variant="icon" icon="archive" title="Archive" onClick={() => archive(l)} />}
                {!l.deleted && <Btn variant="icon" icon="trash" title="Delete" onClick={() => setConfirmDel(l)} />}
                {l.deleted && <Btn variant="secondary" onClick={() => restore(l)}>Restore</Btn>}
                <Btn variant="ghost" onClick={() => setOpenLead(l.id)}>Open</Btn>
              </div>
            </Card>
          );
        })}
      </div>
      {confirmDel && <Modal title="Move lead to Deleted?" onClose={() => setConfirmDel(null)} footer={<><Btn variant="secondary" onClick={() => setConfirmDel(null)}>Cancel</Btn><Btn variant="danger" onClick={() => softDelete(confirmDel)}>Delete (demo)</Btn></>}>
        <p>{confirmDel.name} will move to the Deleted tab. You can restore it from there. Nothing is permanently erased in this demo.</p>
      </Modal>}
    </div>
  );
}

/* ============================================================
   PAGE: LEAD PROFILE WORKSPACE
   ============================================================ */
function LeadProfile({ ctx, id, onBack }: { ctx: Ctx; id: string; onBack: () => void }) {
  const { leads, setLeads, followups, setFollowups, replies, setReplies, templates, toast, log, setSent, sent } = ctx;
  const lead = leads.find(l => l.id === id);
  const [tab, setTab] = useState<'Overview' | 'Quality' | 'Notes' | 'History'>('Overview');
  const [notes, setNotes] = useState(lead?.notes ?? '');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<Lead>>({});
  const [customKey, setCustomKey] = useState('');
  const [customVal, setCustomVal] = useState('');
  const [quickReply, setQuickReply] = useState('');
  const [fuDate, setFuDate] = useState(iso(1));
  const [fuTime, setFuTime] = useState('10:00');
  const [fuReason, setFuReason] = useState('');
  if (!lead) return <Empty text="Lead not found (may be deleted)." />;
  const my = followups.filter(f => f.leadId === lead.id && !f.cancelled);
  const myReplies = replies.filter(r => r.leadId === lead.id);
  const update = (patch: Partial<Lead>, msg?: string) => { setLeads(ls => ls.map(l => (l.id === lead.id ? { ...l, ...patch } : l))); if (msg) toast(msg); };
  const saveEdit = () => {
    if (!draft.name?.trim()) return toast('Name is required', 'err');
    update({ name: draft.name, handle: draft.handle ?? lead.handle, phone: draft.phone ?? lead.phone, niche: draft.niche ?? lead.niche }, 'Lead saved (demo)');
    setEditing(false);
  };
  const addCustom = () => {
    if (!customKey.trim()) return toast('Field name required', 'err');
    update({ custom: { ...lead.custom, [customKey.trim()]: customVal } }, 'Custom field added (demo)');
    setCustomKey(''); setCustomVal('');
  };
  const sendMsg = (tpl: Template) => { navigator.clipboard?.writeText(fill(tpl.body, lead)).catch(() => {}); setSent(sent + 1); log('Message', `Marked message sent to ${lead.name} (manual)`); toast('Copied. Send it manually, then it is counted.'); update({ status: lead.status === 'New' || lead.status === 'Claimed' || lead.status === 'Researching' ? 'Message Sent' : lead.status }); };
  const addReply = () => {
    if (!quickReply.trim()) return toast('Reply text is empty', 'err');
    const r: Reply = { id: uid(), leadId: lead.id, category: 'General', text: quickReply.trim(), at: 'Just now' };
    setReplies(rs => [r, ...rs]); setQuickReply(''); toast('Reply logged (manual)'); log('Message', `Logged reply from ${lead.name}`);
    update({ status: 'Replied' });
  };
  const addFU = () => {
    if (!fuReason.trim()) return toast('Add a follow-up reason', 'err');
    setFollowups(fs => [...fs, { id: uid(), leadId: lead.id, due: fuDate, time: fuTime, reason: fuReason.trim(), done: false, cancelled: false }]);
    setFuReason(''); toast('Follow-up scheduled (demo, no reminder push)'); log('Follow-up', `Scheduled follow-up for ${lead.name}`); update({ status: 'Follow-up' });
  };
  const q = qualityOf(lead);
  const isHindi = ctx.lang === 'hi';
  return (
    <div className="stack">
      <div className="row-between"><Btn variant="ghost" icon="chevron" onClick={onBack}>Back</Btn><Badge tone="gold">{lead.id}</Badge></div>
      <Card className="hero">
        <div>
          <h2>{lead.name}</h2>
          <div className="muted">{lead.platform} · {lead.handle} · Source: {lead.source}</div>
          <div className="row-wrap" style={{ marginTop: 8 }}>
            <select aria-label="Status" className="chip-select" value={lead.status} onChange={e => update({ status: e.target.value as Status }, `Status → ${e.target.value} (demo)`)}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select>
            <select aria-label="Priority" className="chip-select" value={lead.priority} onChange={e => update({ priority: e.target.value as Priority }, `Priority → ${e.target.value}`)}>{PRIORITIES.map(s => <option key={s}>{s}</option>)}</select>
            <Badge>Owner: {lead.owner}</Badge>
          </div>
        </div>
        <div className="row-wrap">
          <Btn variant="secondary" icon="edit" onClick={() => { setDraft(lead); setEditing(true); }}>Edit</Btn>
          <Btn variant="secondary" icon="archive" onClick={() => { update({ archived: !lead.archived }, lead.archived ? 'Restored to active' : 'Archived (demo)'); }}>{lead.archived ? 'Unarchive' : 'Archive'}</Btn>
        </div>
      </Card>
      <div className="seg-scroll"><Seg options={['Overview', 'Quality', 'Notes', 'History']} value={tab} onChange={setTab} /></div>

      {tab === 'Overview' && (
        <div className="stack">
          <section className="grid two">
            <Card>
              <h3>Contact & niche</h3>
              <div className="kv"><span>Phone</span><span>{lead.phone || 'Not provided'}</span></div>
              <div className="kv"><span>Niche</span><span>{lead.niche || '—'}</span></div>
              <div className="kv"><span>Claim</span><span>{lead.claimedAt ? `${hrs(claimLeft(lead))} left` : 'Not claimed'}</span></div>
              {lead.claimedAt && claimLeft(lead) === 0 && <div className="notice warn">Claim expired. Admin decision is pending (demo state, no real reassignment in Phase 1).</div>}
            </Card>
            <Card>
              <h3>Custom fields</h3>
              {Object.entries(lead.custom).length ? Object.entries(lead.custom).map(([k, v]) => <div key={k} className="kv"><span>{k}</span><span>{v}</span></div>) : <Empty text="No custom fields yet." />}
              <div className="row-wrap">
                <input aria-label="Custom field name" placeholder="Field name" value={customKey} onChange={e => setCustomKey(e.target.value)} />
                <input aria-label="Custom field value" placeholder="Value" value={customVal} onChange={e => setCustomVal(e.target.value)} />
                <Btn variant="secondary" onClick={addCustom}>Add</Btn>
              </div>
            </Card>
          </section>
          <Card>
            <h3>{isHindi ? 'संदेश भेजें (मैन्युअल)' : 'Send message (manual)'}</h3>
            <p className="muted small">Copy the message and send it yourself on the app. Only a manual "mark sent" is counted.</p>
            <div className="row-wrap">
              {templates.filter(t => t.kind === 'first').slice(0, 2).map(t => <Btn key={t.id} variant="secondary" icon="copy" onClick={() => sendMsg(t)}>{t.name}</Btn>)}
              {lead.phone && <a className="btn btn-secondary" href={waLink(lead.phone, fill(templates[0].body, lead))} target="_blank" rel="noreferrer">WhatsApp link</a>}
            </div>
          </Card>
          <section className="grid two">
            <Card>
              <h3>Log a client reply (manual)</h3>
              <textarea aria-label="Reply text" rows={3} placeholder="Paste or type the client's reply" value={quickReply} onChange={e => setQuickReply(e.target.value)} />
              <Btn onClick={addReply}>Save reply</Btn>
            </Card>
            <Card>
              <h3>Schedule follow-up</h3>
              <div className="row-wrap">
                <input type="date" aria-label="Follow-up date" value={fuDate} onChange={e => setFuDate(e.target.value)} />
                <input type="time" aria-label="Follow-up time" value={fuTime} onChange={e => setFuTime(e.target.value)} />
              </div>
              <input aria-label="Follow-up reason" placeholder="Reason, e.g. share sample" value={fuReason} onChange={e => setFuReason(e.target.value)} />
              <Btn variant="secondary" icon="cal" onClick={addFU}>Schedule</Btn>
              {my.length > 0 && <div className="list">{my.map(f => <div key={f.id} className="list-row static"><span>{f.due} {f.time} — {f.reason}</span><Badge>{f.done ? 'Done' : 'Open'}</Badge></div>)}</div>}
            </Card>
          </section>
          <Card>
            <h3>Conversation & replies</h3>
            {myReplies.length ? <div className="list">{myReplies.map(r => <div key={r.id} className="bubble"><div className="small muted">{r.category} · {r.at}</div><div>{r.text}</div></div>)}</div> : <Empty text="No client replies logged yet." />}
          </Card>
        </div>
      )}

      {tab === 'Quality' && <QualityPanel lead={lead} update={update} q={q} toast={toast} />}

      {tab === 'Notes' && (
        <Card>
          <h3>Lead notes</h3>
          <textarea aria-label="Lead notes" rows={6} value={notes} onChange={e => setNotes(e.target.value)} />
          <div className="row-end"><Btn onClick={() => update({ notes }, 'Notes saved (local demo)')}>Save notes</Btn></div>
        </Card>
      )}

      {tab === 'History' && (
        <Card>
          <h3>Lead activity history</h3>
          <div className="list">{lead.activity.map((a, i) => <div key={i} className="list-row static"><span>{a}</span><span className="muted small">demo</span></div>)}</div>
          <p className="muted small">Full history with timestamps arrives with the backend phase.</p>
        </Card>
      )}
      {!!templates.length && <span className="sr-only">{templates.length} templates available</span>}

      {editing && (
        <Modal title="Edit lead" onClose={() => setEditing(false)} footer={<><Btn variant="secondary" onClick={() => setEditing(false)}>Cancel</Btn><Btn onClick={saveEdit}>Save</Btn></>}>
          <Field label="Name" error={!draft.name?.trim() ? 'Name is required' : undefined}><input value={draft.name ?? ''} onChange={e => setDraft({ ...draft, name: e.target.value })} /></Field>
          <Field label="Handle"><input value={draft.handle ?? ''} onChange={e => setDraft({ ...draft, handle: e.target.value })} /></Field>
          <Field label="Phone (WhatsApp)"><input value={draft.phone ?? ''} onChange={e => setDraft({ ...draft, phone: e.target.value })} /></Field>
          <Field label="Niche"><input value={draft.niche ?? ''} onChange={e => setDraft({ ...draft, niche: e.target.value })} /></Field>
        </Modal>
      )}
    </div>
  );
}

function QualityPanel({ lead, update, q, toast }: { lead: Lead; update: (p: Partial<Lead>, m?: string) => void; q: ReturnType<typeof qualityOf>; toast: Toast }) {
  const [ov, setOv] = useState(String(scoreOf(lead)));
  const [copied, setCopied] = useState(false);
  const prompt = `Score this Instagram/agency lead for a motion-graphics/video editing service.\nName: ${lead.name}\nNiche: ${lead.niche}\nNotes: ${lead.notes}\nDetails: ${JSON.stringify(lead.custom)}\nGive 3 strengths, 3 weaknesses, and 2 outreach ideas. Do not promise results.`;
  const applyOv = () => { const n = Number(ov); if (!Number.isFinite(n) || n < 0 || n > 100) return toast('Score must be 0–100', 'err'); update({ scoreOverride: n }, 'Manual score saved (demo)'); };
  return (
    <div className="stack">
      <section className="grid two">
        <Card className="score-card">
          <div className="score-ring"><strong>{q.score}</strong><span>/100</span></div>
          <Badge tone={q.tier === 'High' ? 'ok' : q.tier === 'Medium' ? 'warn' : 'err'}>{q.tier} quality</Badge>
          <p className="muted small">Rules-based estimate from the information entered. It does not guarantee conversion or client acquisition.</p>
        </Card>
        <Card>
          <h3>Manual score override</h3>
          <Field label="Score (0–100)" error={(Number(ov) < 0 || Number(ov) > 100) ? 'Out of range' : undefined}><input type="number" min={0} max={100} value={ov} onChange={e => setOv(e.target.value)} /></Field>
          <Btn variant="secondary" onClick={applyOv}>Save override</Btn>
          {lead.scoreOverride !== undefined && <Btn variant="ghost" onClick={() => { update({ scoreOverride: undefined }, 'Back to rules score'); setOv(String(lead.score)); }}>Use rules score</Btn>}
        </Card>
      </section>
      <section className="grid three">
        <Card><h3>Strengths</h3><ul>{q.strengths.map(s => <li key={s}>{s}</li>)}</ul></Card>
        <Card><h3>Weaknesses</h3>{q.weaknesses.length ? <ul>{q.weaknesses.map(s => <li key={s}>{s}</li>)}</ul> : <p className="muted small">None found.</p>}</Card>
        <Card><h3>Missing information</h3>{q.missing.length ? <ul>{q.missing.map(s => <li key={s}>{s}</li>)}</ul> : <p className="muted small">Nothing missing.</p>}</Card>
      </section>
      <Card><h3>Improvement suggestions</h3><ul>{q.tips.length ? q.tips.map(s => <li key={s}>{s}</li>) : <li>Looks complete. Start outreach.</li>}</ul></Card>
      <Card>
        <Collapse title="ChatGPT prompt (copy, paste into ChatGPT yourself)">
          <textarea readOnly rows={6} value={prompt} aria-label="Generated prompt" />
          <Btn variant="secondary" icon="copy" onClick={() => { navigator.clipboard?.writeText(prompt).catch(() => {}); setCopied(true); toast('Prompt copied'); }}>{copied ? 'Copied' : 'Copy prompt'}</Btn>
        </Collapse>
      </Card>
    </div>
  );
}

/* ============================================================
   PAGE: ADD LEAD (5 methods, validation, duplicates, preview)
   ============================================================ */
function AddLead({ ctx }: { ctx: Ctx }) {
  const { leads, setLeads, toast, setPage, log } = ctx;
  const [method, setMethod] = useState<'Manual' | 'Link' | 'Share' | 'Screenshot' | 'CSV'>('Manual');
  const [form, setForm] = useState({ name: '', handle: '', platform: 'Instagram' as Platform, phone: '', niche: '', source: 'Manual entry' });
  const [link, setLink] = useState('');
  const [preview, setPreview] = useState<Partial<Lead> | null>(null);
  const [csv, setCsv] = useState('');
  const [csvRows, setCsvRows] = useState<Partial<Lead>[]>([]);
  const [ocrText, setOcrText] = useState('');
  const errs = {
    name: form.name.trim() ? '' : 'Name is required',
    handle: form.handle.trim() ? '' : 'Handle or profile link required',
    phone: form.phone && !/^\+?[\d\s-]{8,15}$/.test(form.phone) ? 'Enter a valid phone number' : '',
  };
  const dup = form.handle ? dupOf(leads, form.handle) : undefined;
  const commit = (items: Partial<Lead>[]) => {
    const ok = items.filter(i => i.name && i.handle).map(i => ({ id: `L-${uid()}`, name: i.name!, platform: (i.platform ?? 'Other') as Platform, handle: i.handle!, phone: i.phone ?? '', source: i.source ?? 'Manual entry', status: 'New' as Status, priority: 'Medium' as Priority, owner: 'Unassigned', archived: false, deleted: false, score: 50, niche: i.niche ?? '', notes: '', custom: {}, activity: ['Added (demo)'] }));
    if (!ok.length) return toast('Nothing valid to add', 'err');
    setLeads(ls => [...ok, ...ls]); toast(`${ok.length} lead(s) added (demo)`); log('Lead', `Added ${ok.length} lead(s)`);
    setPreview(null); setCsvRows([]); setCsv(''); setPage('leads');
  };
  const parseLink = () => {
    const raw = link.trim();
    if (!/^https?:\/\//i.test(raw) && !raw.startsWith('@')) return toast('Paste a valid profile link or @handle', 'err');
    const handle = raw.startsWith('@') ? raw : (raw.replace(/^https?:\/\/[^/]+\//, '').split('/')[0] ? '@' + raw.replace(/^https?:\/\/[^/]+\//, '').split('/')[0] : raw);
    setPreview({ name: handle.replace('@', ''), handle, platform: /instagram/i.test(raw) ? 'Instagram' : /linkedin/i.test(raw) ? 'LinkedIn' : 'Other', source: 'Paste profile link', niche: '' });
    toast('Preview ready. Details not auto-extracted; please complete them.', 'info');
  };
  const parseCSV = () => {
    const lines = csv.trim().split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return toast('Need a header row and at least one data row', 'err');
    const cols = lines[0].split(',').map(c => c.trim().toLowerCase());
    const rows = lines.slice(1).map(l => { const v = l.split(','); const g = (k: string) => (v[cols.indexOf(k)] ?? '').trim(); return { name: g('name'), handle: g('handle'), platform: (g('platform') || 'Other') as Platform, phone: g('phone'), niche: g('niche'), source: 'CSV import' }; });
    setCsvRows(rows);
  };
  const submitManual = () => {
    if (errs.name || errs.handle || errs.phone) return toast('Fix the highlighted fields first', 'err');
    setPreview({ ...form, source: 'Manual entry' });
  };
  const Method = (
    <Seg options={['Manual', 'Link', 'Share', 'Screenshot', 'CSV']} value={method} onChange={setMethod} />
  );
  return (
    <div className="stack">
      <div className="seg-scroll">{Method}</div>
      {method === 'Manual' && (
        <Card>
          <div className="form-grid">
            <Field label="Name *" error={form.name ? '' : undefined} ok={!!form.name}>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} aria-invalid={!!errs.name} />
            </Field>
            <Field label="Platform"><select value={form.platform} onChange={e => setForm({ ...form, platform: e.target.value as Platform })}>{PLATFORMS.map(p => <option key={p}>{p}</option>)}</select></Field>
            <Field label="Handle / profile *" error={form.handle ? undefined : undefined}><input value={form.handle} onChange={e => setForm({ ...form, handle: e.target.value })} /></Field>
            <Field label="Phone (for WhatsApp)" error={errs.phone || undefined}><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="Niche"><input value={form.niche} onChange={e => setForm({ ...form, niche: e.target.value })} /></Field>
          </div>
          {!!form.handle && dup && <div className="notice warn">Possible duplicate: {dup.name} already has this handle.</div>}
          {(errs.name || errs.handle) && <div className="notice">{errs.name || errs.handle}</div>}
          <Btn onClick={submitManual}>Preview lead</Btn>
        </Card>
      )}
      {method === 'Link' && (
        <Card>
          <h3>Paste profile link</h3>
          <p className="muted small">Profile details are not extracted automatically. Only the handle is read from the link; you complete the rest.</p>
          <div className="row-wrap"><input aria-label="Profile link" placeholder="https://instagram.com/handle or @handle" value={link} onChange={e => setLink(e.target.value)} /><Btn variant="secondary" icon="link" onClick={parseLink}>Preview</Btn></div>
        </Card>
      )}
      {method === 'Share' && (
        <Card>
          <h3>Share-to-app</h3>
          <p className="muted small">Some phones and browsers can share a link into this app. This is not available on every device. If it does not work, use Manual or Link above.</p>
          <Btn variant="secondary" disabled title="Available after native share integration">Share-to-app (not active in demo)</Btn>
        </Card>
      )}
      {method === 'Screenshot' && (
        <Card>
          <h3>Screenshot OCR</h3>
          <div className="notice warn">OCR is not active in Phase 1. Paste the text you read from the screenshot and it will be used as a manual entry.</div>
          <textarea rows={4} aria-label="Text from screenshot" placeholder="Type the name and handle you see in the screenshot" value={ocrText} onChange={e => setOcrText(e.target.value)} />
          <Btn variant="secondary" onClick={() => { const n = ocrText.split('\n')[0]?.trim(); if (!n) return toast('Type something first', 'err'); setPreview({ name: n, handle: '@' + n.toLowerCase().replace(/\s+/g, '.'), source: 'Screenshot (manual fallback)', platform: 'Instagram', niche: '' }); }}>Preview</Btn>
        </Card>
      )}
      {method === 'CSV' && (
        <Card>
          <h3>Bulk CSV / Excel import</h3>
          <p className="muted small">Paste CSV text with header: name,handle,platform,phone,niche. Excel files must be saved as CSV first. File upload parsing is not active in Phase 1.</p>
          <textarea rows={6} aria-label="CSV text" value={csv} onChange={e => setCsv(e.target.value)} placeholder={'name,handle,platform,phone,niche\nRiya Vlogs,@riyavlogs,Instagram,,Travel'} />
          <Btn variant="secondary" onClick={parseCSV}>Parse</Btn>
          {csvRows.length > 0 && <>
            <div className="table-wrap"><table><thead><tr><th>Name</th><th>Handle</th><th>Platform</th><th>Status</th></tr></thead><tbody>
              {csvRows.map((r, i) => <tr key={i}><td>{r.name || '—'}</td><td>{r.handle || '—'}</td><td>{r.platform}</td><td>{!r.name || !r.handle ? <Badge tone="err">Missing</Badge> : dupOf(leads, r.handle!) ? <Badge tone="warn">Duplicate</Badge> : <Badge tone="ok">Ready</Badge>}</td></tr>)}
            </tbody></table></div>
            <Btn onClick={() => commit(csvRows)}>Add {csvRows.filter(r => r.name && r.handle).length} valid lead(s)</Btn>
          </>}
        </Card>
      )}
      {preview && (
        <Sheet title="Confirm before adding" onClose={() => setPreview(null)}>
          <div className="kv"><span>Name</span><strong>{preview.name}</strong></div>
          <div className="kv"><span>Handle</span><span>{preview.handle}</span></div>
          <div className="kv"><span>Platform</span><span>{preview.platform}</span></div>
          <div className="kv"><span>Source</span><span>{preview.source}</span></div>
          {!!preview.handle && dupOf(leads, preview.handle) && <div className="notice warn">Duplicate warning: this handle already exists.</div>}
          <div className="row-end"><Btn variant="secondary" onClick={() => setPreview(null)}>Edit</Btn><Btn onClick={() => commit([preview])}>Add lead</Btn></div>
        </Sheet>
      )}
    </div>
  );
}

/* ============================================================
   PAGE: MESSAGE CENTER (templates, EN/HI, copy, WhatsApp link)
   ============================================================ */
function Messages({ ctx }: { ctx: Ctx }) {
  const { leads, templates, setTemplates, toast, lang, sent, setSent, log } = ctx;
  const [cat, setCat] = useState<'first' | 'follow' | 'custom'>('first');
  const [plat, setPlat] = useState<'All' | Platform>('All');
  const [hi, setHi] = useState(lang === 'hi');
  const [sel, setSel] = useState<Template | null>(null);
  const [edit, setEdit] = useState<Template | null>(null);
  const [leadId, setLeadId] = useState(leads[0]?.id ?? '');
  const lead = leads.find(l => l.id === leadId) ?? leads[0];
  const list = templates.filter(t => t.kind === cat && (plat === 'All' || t.platform === plat) && (hi ? t.lang === 'hi' : t.lang === 'en'));
  const save = () => {
    if (!edit) return;
    if (!edit.name.trim() || !edit.body.trim()) return toast('Name and body are required', 'err');
    setTemplates(ts => ts.some(t => t.id === edit.id) ? ts.map(t => t.id === edit.id ? edit : t) : [...ts, edit]);
    setEdit(null); toast('Template saved (demo)');
  };
  const dup = (t: Template) => { setTemplates(ts => [...ts, { ...t, id: uid(), name: t.name + ' (copy)' }]); toast('Template duplicated'); };
  const del = (t: Template) => { setTemplates(ts => ts.filter(x => x.id !== t.id)); if (sel?.id === t.id) setSel(null); toast('Template deleted (demo)'); };
  const copy = (text: string) => { navigator.clipboard?.writeText(text).then(() => toast('Copied. Send it manually.')).catch(() => toast('Copy not supported here. Select and copy.', 'err')); };
  const preview = sel && lead ? fill(sel.body, lead) : '';
  return (
    <div className="stack">
      <div className="row-wrap">
        <Seg options={['first', 'follow', 'custom']} value={cat} onChange={setCat} />
        <select aria-label="Platform" value={plat} onChange={e => setPlat(e.target.value as 'All' | Platform)}><option>All</option>{PLATFORMS.map(p => <option key={p}>{p}</option>)}</select>
        <button className={`toggle ${hi ? 'on' : ''}`} onClick={() => setHi(h => !h)} aria-pressed={hi}>{hi ? 'हिंदी' : 'English'}</button>
        <Btn icon="plus" variant="secondary" onClick={() => setEdit({ id: uid(), name: '', kind: cat, platform: 'WhatsApp', lang: hi ? 'hi' : 'en', body: '' })}>New template</Btn>
      </div>
      <div className="notice info small">Variables: {'{name}'}, {'{niche}'}, {'{handle}'}. WhatsApp and Instagram messages are sent manually by you.</div>
      <section className="grid two">
        <div className="stack">
          {list.length === 0 && <Empty text="No templates in this filter." />}
          {list.map(t => (
            <Card key={t.id} className={`anim-item ${sel?.id === t.id ? 'selected' : ''}`} onClick={() => setSel(t)}>
              <div className="row-between"><strong>{t.name}</strong><Badge>{t.platform}</Badge></div>
              <div className="muted small clamp">{t.body}</div>
              <div className="row-wrap" onClick={e => e.stopPropagation()}>
                <Btn variant="icon" icon="edit" title="Edit" onClick={() => setEdit(t)} />
                <Btn variant="icon" icon="copy" title="Duplicate" onClick={() => dup(t)} />
                <Btn variant="icon" icon="trash" title="Delete" onClick={() => del(t)} />
              </div>
            </Card>
          ))}
        </div>
        <Card className="preview">
          <h3>Preview</h3>
          <select aria-label="Preview for lead" value={leadId} onChange={e => setLeadId(e.target.value)}>{leads.filter(l => !l.deleted).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
          {sel ? <>
            <div className="bubble out">{preview}</div>
            <div className="row-wrap">
              <Btn variant="secondary" icon="copy" onClick={() => copy(preview)}>Copy message</Btn>
              {lead?.phone ? <a className="btn btn-primary" href={waLink(lead.phone, preview)} target="_blank" rel="noreferrer">Open WhatsApp chat</a> : <Badge tone="warn">No phone for WhatsApp</Badge>}
              <Btn variant="ghost" onClick={() => { setSent(sent + 1); log('Message', `Marked sent to ${lead?.name}`); toast('Counted as sent (manual)'); }}>I sent it</Btn>
            </div>
            <p className="muted small">The app does not send messages for you.</p>
          </> : <Empty text="Select a template to preview." />}
        </Card>
      </section>
      <Card>
        <h3>Message history</h3>
        <div className="table-wrap"><table><thead><tr><th>Lead</th><th>Type</th><th>Time</th><th>Status</th></tr></thead><tbody>
          <tr><td>Priya Realty</td><td>First contact</td><td>Yesterday 16:40</td><td><Badge tone="ok">Sent (manual)</Badge></td></tr>
          <tr><td>Aarav Creates</td><td>Follow-up</td><td>Mon 09:05</td><td><Badge tone="warn">Pending</Badge></td></tr>
        </tbody></table></div>
        <p className="muted small">Demo history. Real history is stored in the backend phase.</p>
      </Card>
      {edit && (
        <Modal title={edit.name ? 'Edit template' : 'New template'} onClose={() => setEdit(null)} footer={<><Btn variant="secondary" onClick={() => setEdit(null)}>Cancel</Btn><Btn onClick={save}>Save</Btn></>}>
          <Field label="Name" error={edit.name.trim() ? undefined : 'Required'}><input value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} /></Field>
          <Field label="Category"><select value={edit.kind} onChange={e => setEdit({ ...edit, kind: e.target.value as Template['kind'] })}><option value="first">First contact</option><option value="follow">Follow-up</option><option value="custom">Custom</option></select></Field>
          <Field label="Platform"><select value={edit.platform} onChange={e => setEdit({ ...edit, platform: e.target.value as Platform })}>{PLATFORMS.map(p => <option key={p}>{p}</option>)}</select></Field>
          <Field label="Language"><select value={edit.lang} onChange={e => setEdit({ ...edit, lang: e.target.value as Lang })}><option value="en">English</option><option value="hi">Hindi</option></select></Field>
          <Field label="Message body" error={edit.body.trim() ? undefined : 'Required'}><textarea rows={5} value={edit.body} onChange={e => setEdit({ ...edit, body: e.target.value })} /></Field>
        </Modal>
      )}
    </div>
  );
}

/* ============================================================
   PAGE: CLIENT REPLIES (manual entry, category, suggestions)
   ============================================================ */
function Replies({ ctx }: { ctx: Ctx }) {
  const { leads, replies, setReplies, toast, log, setFollowups, setLeads } = ctx;
  const [leadId, setLeadId] = useState(leads[0]?.id ?? '');
  const [cat, setCat] = useState<Reply['category']>('General');
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [fCat, setFCat] = useState<'All' | Reply['category']>('All');
  const suggest: Record<Reply['category'], string> = {
    Interested: 'Thank them, share a short package with 2 options, and ask for a call slot.',
    'Not interested': 'Thank them politely, ask if you can share work later, close the thread.',
    'Pricing enquiry': 'Share a range (demo), explain what is included, ask about their volume.',
    'Meeting request': 'Offer 2 time slots today/tomorrow, confirm timezone (IST).',
    General: 'Acknowledge, answer briefly, ask one open question.',
  };
  const add = () => {
    if (!text.trim()) return toast('Reply text is required', 'err');
    const r: Reply = { id: uid(), leadId, category: cat, text: text.trim(), at: 'Just now' };
    setReplies(rs => [r, ...rs]);
    if (cat === 'Interested' || cat === 'Meeting request') setLeads(ls => ls.map(l => l.id === leadId ? { ...l, status: cat === 'Meeting request' ? 'Call Booked' : 'Interested' } : l));
    if (cat === 'Pricing enquiry' || cat === 'Interested') setFollowups(fs => [...fs, { id: uid(), leadId, due: iso(1), time: '11:00', reason: 'Follow up on pricing (suggested)', done: false, cancelled: false }]);
    setText(''); setNote(''); toast('Reply logged (manual)'); log('Message', `Logged ${cat} reply`);
  };
  const rows = replies.filter(r => (fCat === 'All' || r.category === fCat));
  const name = (id: string) => leads.find(l => l.id === id)?.name ?? '—';
  return (
    <div className="stack">
      <section className="grid two">
        <Card>
          <h3>Add client reply (manual)</h3>
          <Field label="Lead"><select value={leadId} onChange={e => setLeadId(e.target.value)}>{leads.filter(l => !l.deleted).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
          <Field label="Category"><select value={cat} onChange={e => setCat(e.target.value as Reply['category'])}>{(Object.keys(suggest) as Reply['category'][]).map(c => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Reply text" error={text.trim() || !text ? undefined : 'Required'}><textarea rows={3} value={text} onChange={e => setText(e.target.value)} /></Field>
          <Field label="Notes"><input value={note} onChange={e => setNote(e.target.value)} /></Field>
          <Btn onClick={add}>Save reply</Btn>
        </Card>
        <Card>
          <h3>Suggested response</h3>
          <p>{suggest[cat as keyof typeof suggest]}</p>
          <p className="muted small">Suggestion is a rule-based hint. You write and send the reply yourself.</p>
          <Collapse title="Follow-up adjustment"><p className="muted small">Adding a reply can auto-suggest a follow-up for Interested and Pricing replies. Edit dates in Follow-up Centre.</p></Collapse>
        </Card>
      </section>
      <Seg options={['All', 'Interested', 'Not interested', 'Pricing enquiry', 'Meeting request', 'General']} value={fCat} onChange={v => setFCat(v as typeof fCat)} />
      <div className="list-card">
        {rows.length === 0 && <Empty text="No replies in this category." />}
        {rows.map(r => <div key={r.id} className="bubble anim-item"><div className="row-between small"><strong>{name(r.leadId)}</strong><span className="muted">{r.at}</span></div><Badge tone={r.category === 'Interested' ? 'ok' : r.category === 'Not interested' ? 'err' : 'info'}>{r.category}</Badge><div>{r.text}</div></div>)}
      </div>
    </div>
  );
}

/* ============================================================
   PAGE: FOLLOW-UP CENTRE (list, calendar, board, actions)
   ============================================================ */
function FollowUps({ ctx }: { ctx: Ctx }) {
  const { leads, followups, setFollowups, toast, log } = ctx;
  const [view, setView] = useState<'List' | 'Calendar' | 'Board'>('List');
  const [resch, setResch] = useState<FollowUp | null>(null);
  const [rDate, setRDate] = useState('');
  const [rTime, setRTime] = useState('');
  const name = (id: string) => leads.find(l => l.id === id)?.name ?? '—';
  const active = followups.filter(f => !f.cancelled);
  const group = {
    Overdue: active.filter(f => !f.done && f.due < todayStr),
    Today: active.filter(f => !f.done && f.due === todayStr),
    Upcoming: active.filter(f => !f.done && f.due > todayStr),
    Done: active.filter(f => f.done),
  };
  const complete = (f: FollowUp) => { setFollowups(fs => fs.map(x => x.id === f.id ? { ...x, done: true } : x)); toast('Follow-up completed'); log('Follow-up', `Completed: ${name(f.leadId)}`); };
  const cancel = (f: FollowUp) => { setFollowups(fs => fs.map(x => x.id === f.id ? { ...x, cancelled: true } : x)); toast('Follow-up cancelled (demo)'); };
  const openResch = (f: FollowUp) => { setResch(f); setRDate(f.due); setRTime(f.time); };
  const saveResch = () => { if (!resch) return; if (!rDate) return toast('Pick a date', 'err'); setFollowups(fs => fs.map(x => x.id === resch.id ? { ...x, due: rDate, time: rTime } : x)); setResch(null); toast('Rescheduled (demo, no push reminder)'); log('Follow-up', `Rescheduled ${name(resch.leadId)}`); };
  const days = Array.from({ length: 7 }, (_, i) => iso(i));
  const suggestions = [
    'Send a short sample 24h after first message.',
    'If no reply in 3 days, send one gentle nudge.',
    'For Interested leads, share pricing within 1 day.',
  ];
  const Row = ({ f }: { f: FollowUp; key?: string }) => (
    <div className="list-row static anim-item">
      <div><strong>{name(f.leadId)}</strong><div className="muted small">{f.due} {f.time} · {f.reason}</div></div>
      <div className="row-wrap">
        <Btn variant="icon" icon="check" title="Complete" onClick={() => complete(f)} />
        <Btn variant="icon" icon="cal" title="Reschedule" onClick={() => openResch(f)} />
        <Btn variant="icon" icon="x" title="Cancel" onClick={() => cancel(f)} />
      </div>
    </div>
  );
  return (
    <div className="stack">
      <Seg options={['List', 'Calendar', 'Board']} value={view} onChange={setView} />
      {view === 'List' && (
        <div className="stack">
          {(['Overdue', 'Today', 'Upcoming', 'Done'] as const).map(k => (
            <Card key={k}><h3>{k} <Badge tone={k === 'Overdue' ? 'err' : k === 'Today' ? 'warn' : 'neutral'}>{group[k].length}</Badge></h3>
              {group[k].length ? group[k].map(f => <Row key={f.id} f={f} />) : <p className="muted small">Nothing here.</p>}
            </Card>
          ))}
        </div>
      )}
      {view === 'Calendar' && (
        <div className="grid cal">
          {days.map(d => (
            <Card key={d} className="cal-day">
              <strong>{d === todayStr ? 'Today' : d}</strong>
              {active.filter(f => f.due === d && !f.done).map(f => <div key={f.id} className="chip small">{f.time} {name(f.leadId)}</div>)}
            </Card>
          ))}
        </div>
      )}
      {view === 'Board' && (
        <div className="board">
          {(['Overdue', 'Today', 'Upcoming', 'Done'] as const).map(k => (
            <div key={k} className="board-col"><h4>{k}</h4>{group[k].map(f => <Card key={f.id} className="anim-item"><strong>{name(f.leadId)}</strong><div className="small muted">{f.reason}</div><div className="row-wrap">{!f.done && <Btn variant="ghost" onClick={() => complete(f)}>Done</Btn>}</div></Card>)}</div>
          ))}
        </div>
      )}
      <Card><h3>Follow-up suggestions</h3><ul>{suggestions.map(s => <li key={s}>{s}</li>)}</ul></Card>
      <p className="muted small">Reminders are shown in-app only. Background reminders need the backend phase.</p>
      {resch && (
        <Modal title="Reschedule follow-up" onClose={() => setResch(null)} footer={<><Btn variant="secondary" onClick={() => setResch(null)}>Cancel</Btn><Btn onClick={saveResch}>Save</Btn></>}>
          <div className="row-wrap"><input type="date" aria-label="New date" value={rDate} onChange={e => setRDate(e.target.value)} /><input type="time" aria-label="New time" value={rTime} onChange={e => setRTime(e.target.value)} /></div>
        </Modal>
      )}
    </div>
  );
}

/* ============================================================
   PAGE: NOTIFICATIONS (preview only, not push)
   ============================================================ */
function Notifications({ ctx }: { ctx: Ctx }) {
  return (
    <div className="stack">
      <div className="notice info">These are in-app previews. Android push notifications are not active in Phase 1.</div>
      <NotifList ctx={ctx} />
    </div>
  );
}
function NotifList({ ctx, compact = false }: { ctx: Ctx; compact?: boolean }) {
  const { notices, setNotices, toast } = ctx;
  const [cat, setCat] = useState<'All' | Notice['cat']>('All');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const rows = notices.filter(n => (cat === 'All' || n.cat === cat) && (!unreadOnly || !n.read));
  const markAll = () => { setNotices(ns => ns.map(n => ({ ...n, read: true }))); toast('All marked as read'); };
  return (
    <div className="stack">
      <div className="row-wrap">
        <Seg options={['All', 'Lead', 'Follow-up', 'Message', 'Project', 'Payment']} value={cat} onChange={v => setCat(v as typeof cat)} />
        <button className={`toggle ${unreadOnly ? 'on' : ''}`} aria-pressed={unreadOnly} onClick={() => setUnreadOnly(u => !u)}>Unread only</button>
        <Btn variant="ghost" onClick={markAll}>Mark all read</Btn>
      </div>
      {rows.length === 0 && <Empty text="No notifications." />}
      <div className="list-card">
        {rows.map(n => (
          <div key={n.id} className={`list-row ${n.read ? 'read' : 'unread'} anim-item`}>
            <span className="dot-sm" aria-hidden="true" />
            <span className="grow">{n.text}</span>
            <Badge>{n.cat}</Badge>
            {!n.read && <Btn variant="ghost" onClick={() => setNotices(ns => ns.map(x => x.id === n.id ? { ...x, read: true } : x))}>Mark read</Btn>}
          </div>
        ))}
      </div>
      {!compact && <Card><h3>Reminder preview</h3><p className="muted small">Example in-app reminder: "Follow-up due at 18:00 — Send sample reel (demo)".</p></Card>}
    </div>
  );
}

/* ============================================================
   PAGE: PROJECTS (list, detail, stages, multi-service)
   ============================================================ */
const STAGES: Project['stage'][] = ['In Progress', 'Internal Review', 'Revision Required', 'Internal Approval', 'Client Approval', 'Final Delivery'];
function Projects({ ctx }: { ctx: Ctx }) {
  const { projects, setProjects, toast, log } = ctx;
  const [sel, setSel] = useState<Project | null>(null);
  const [filter, setFilter] = useState<'All' | 'Active' | 'Done'>('All');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', client: '', service: 'Per-video editing', editor: '', deadline: iso(7), price: '', currency: 'INR' });
  const list = projects.filter(p => filter === 'All' || (filter === 'Done' ? p.status === 'Done' : p.status !== 'Done'));
  const create = () => {
    if (!form.title.trim() || !form.client.trim()) return toast('Title and client are required', 'err');
    const p: Project = { id: uid(), title: form.title, client: form.client, service: form.service, editor: form.editor || 'Unassigned', status: 'Active', deadline: form.deadline, price: Number(form.price) || 0, currency: form.currency, progress: 0, revisions: 0, stage: 'In Progress', notes: '' };
    setProjects(ps => [p, ...ps]); setCreating(false); toast('Project created (demo)'); log('Project', `Created ${form.title}`);
  };
  const advance = (p: Project) => {
    const next = STAGES[Math.min(STAGES.indexOf(p.stage) + 1, STAGES.length - 1)];
    setProjects(ps => ps.map(x => x.id === p.id ? { ...x, stage: next, progress: Math.min(100, x.progress + 20), status: next === 'Final Delivery' ? 'Done' : 'Active' } : x));
    setSel(s => s && s.id === p.id ? { ...s, stage: next } : s);
    toast(`Stage → ${next} (demo)`); log('Project', `${p.title} → ${next}`);
  };
  if (sel) {
    const cur = projects.find(p => p.id === sel.id) ?? sel;
    return (
      <div className="stack">
        <Btn variant="ghost" icon="chevron" onClick={() => setSel(null)}>All projects</Btn>
        <Card className="hero"><div><h2>{cur.title}</h2><div className="muted">{cur.service} · Editor: {cur.editor}</div></div><Badge tone={cur.status === 'Done' ? 'ok' : 'info'}>{cur.status}</Badge></Card>
        <section className="grid two">
          <Card>
            <h3>Details</h3>
            <div className="kv"><span>Client</span><span>{cur.client}</span></div>
            <div className="kv"><span>Deadline</span><span>{cur.deadline}</span></div>
            <div className="kv"><span>Price</span><span>{fmt(cur.price, cur.currency)} (demo)</span></div>
            <div className="kv"><span>Revisions</span><span>{cur.revisions}</span></div>
            <div className="kv"><span>Progress</span><span>{cur.progress}%</span></div>
            <ProgressBar value={cur.progress} />
          </Card>
          <Card>
            <h3>Delivery stage</h3>
            <ol className="timeline">{STAGES.map(s => <li key={s} className={STAGES.indexOf(s) <= STAGES.indexOf(cur.stage) ? 'done' : ''}>{s}</li>)}</ol>
            <Btn disabled={cur.stage === 'Final Delivery'} onClick={() => advance(cur)}>Advance stage</Btn>
          </Card>
        </section>
        <Card><h3>Notes</h3><p>{cur.notes || 'No notes yet.'}</p>
          <Collapse title="Files & external links"><p className="muted small">File upload and storage are not active in Phase 1. Paste an external link in Notes.</p></Collapse>
        </Card>
      </div>
    );
  }
  return (
    <div className="stack">
      <div className="row-wrap">
        <Seg options={['All', 'Active', 'Done']} value={filter} onChange={setFilter} />
        <Btn icon="plus" onClick={() => setCreating(true)}>New project</Btn>
      </div>
      <div className="grid cards-lead">
        {list.length === 0 && <Empty text="No projects in this filter." />}
        {list.map(p => (
          <Card key={p.id} onClick={() => setSel(p)} className="anim-item">
            <div className="row-between"><strong>{p.title}</strong><Badge tone={p.status === 'Done' ? 'ok' : 'info'}>{p.stage}</Badge></div>
            <div className="muted small">{p.client} · {p.service}</div>
            <div className="small">Deadline {p.deadline} · {p.editor}</div>
            <ProgressBar value={p.progress} />
          </Card>
        ))}
      </div>
      {creating && (
        <Modal title="New project" onClose={() => setCreating(false)} footer={<><Btn variant="secondary" onClick={() => setCreating(false)}>Cancel</Btn><Btn onClick={create}>Create</Btn></>}>
          <Field label="Title *"><input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label="Client *"><input value={form.client} onChange={e => setForm({ ...form, client: e.target.value })} /></Field>
          <Field label="Service"><select value={form.service} onChange={e => setForm({ ...form, service: e.target.value })}>{['Per-video editing', 'Fixed project', 'Monthly retainer', 'Reels pack', 'Brand explainer', 'Custom'].map(s => <option key={s}>{s}</option>)}</select></Field>
          <Field label="Editor"><input value={form.editor} onChange={e => setForm({ ...form, editor: e.target.value })} /></Field>
          <Field label="Deadline"><input type="date" value={form.deadline} onChange={e => setForm({ ...form, deadline: e.target.value })} /></Field>
          <Field label="Price"><div className="row-wrap"><input type="number" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} /><select value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })}><option>INR</option><option>USD</option></select></div></Field>
        </Modal>
      )}
    </div>
  );
}

/* ============================================================
   PAGE: CLIENTS
   ============================================================ */
function Clients({ ctx }: { ctx: Ctx }) {
  const { clients, projects, payments } = ctx;
  const [sel, setSel] = useState<Client | null>(null);
  if (sel) {
    const ps = projects.filter(p => p.client === sel.name);
    return (
      <div className="stack">
        <Btn variant="ghost" icon="chevron" onClick={() => setSel(null)}>All clients</Btn>
        <Card className="hero"><div><h2>{sel.name}</h2><div className="muted">{sel.company}</div></div></Card>
        <section className="grid two">
          <Card><h3>Contact</h3><div className="kv"><span>Email</span><span>{sel.email}</span></div><div className="kv"><span>Phone</span><span>{sel.phone}</span></div><p className="muted small">{sel.notes}</p></Card>
          <Card><h3>Projects</h3>{ps.length ? ps.map(p => <div key={p.id} className="list-row static"><span>{p.title}</span><Badge>{p.stage}</Badge></div>) : <Empty text="No projects for this client." />}</Card>
        </section>
        <Card><h3>Payments (demo)</h3>{payments.filter(p => p.label.toLowerCase().includes(sel.name.split(' ')[0].toLowerCase())).map(p => <div key={p.id} className="kv"><span>{p.label}</span><span>{fmt(p.amount, p.currency)}</span></div>)}</Card>
      </div>
    );
  }
  return (
    <div className="grid cards-lead">
      {clients.map(c => (
        <Card key={c.id} onClick={() => setSel(c)} className="anim-item">
          <strong>{c.name}</strong><div className="muted small">{c.email}</div><div className="small">{projects.filter(p => p.client === c.name).length} project(s)</div>
        </Card>
      ))}
    </div>
  );
}

/* ============================================================
   PAGE: EDITOR WORKSPACE
   ============================================================ */
function EditorWS({ ctx }: { ctx: Ctx }) {
  const { projects, setProjects, toast, log } = ctx;
  const editorName = 'Demo Editor A';
  const mine = projects.filter(p => p.editor === editorName && p.status !== 'Done');
  const [note, setNote] = useState('');
  const [pid, setPid] = useState(mine[0]?.id ?? '');
  const submit = () => {
    if (!pid) return toast('No assigned project', 'err');
    setProjects(ps => ps.map(p => p.id === pid ? { ...p, stage: 'Internal Review', progress: Math.min(100, p.progress + 20) } : p));
    setNote(''); toast('Submitted for internal review (demo)'); log('Project', 'Submitted work for review');
  };
  return (
    <div className="stack">
      <div className="notice info">Multiple roles are possible. This view shows the demo editor role only.</div>
      <section className="grid stats">
        <Stat icon="film" label="Assigned projects" value={mine.length} />
        <Stat icon="cal" label="Next deadline" value={mine.length ? mine.map(p => p.deadline).sort()[0] : '—'} />
        <Stat icon="reply" label="Revisions pending" value={mine.filter(p => p.stage === 'Revision Required').length} />
        <Stat icon="star" label="Completed (demo)" value={projects.filter(p => p.editor === editorName && p.status === 'Done').length} />
      </section>
      <Card>
        <h3>Workload</h3>
        <ProgressBar value={Math.min(100, mine.length * 25)} />
        <p className="muted small">Simple demo: each assigned project adds 25% load.</p>
      </Card>
      <Card>
        <h3>Assigned projects</h3>
        {mine.length ? mine.map(p => <div key={p.id} className="list-row static"><span>{p.title} · due {p.deadline}</span><Badge>{p.stage}</Badge></div>) : <Empty text="No assigned projects." />}
      </Card>
      <Card>
        <h3>Submit work</h3>
        <select aria-label="Project to submit" value={pid} onChange={e => setPid(e.target.value)}>{mine.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select>
        <textarea rows={3} placeholder="Submission note (link to your file, external)" value={note} onChange={e => setNote(e.target.value)} />
        <Btn onClick={submit} disabled={!mine.length}>Submit for review</Btn>
      </Card>
    </div>
  );
}

/* ============================================================
   PAGE: REVIEW & DELIVERY (workflow + comments + approvals)
   ============================================================ */
const WORKFLOW: Project['stage'][] = ['Internal Review', 'Revision Required', 'Internal Approval', 'Client Approval', 'Final Delivery'];
function Review({ ctx }: { ctx: Ctx }) {
  const { projects, setProjects, toast, log } = ctx;
  const [pid, setPid] = useState(projects[0]?.id ?? '');
  const [comment, setComment] = useState('');
  const [comments, setComments] = useState<string[]>(['Demo: Colour grade looks warm, check skin tones.']);
  const p = projects.find(x => x.id === pid);
  const move = (stage: Project['stage'], msg: string) => { if (!p) return; setProjects(ps => ps.map(x => x.id === p.id ? { ...x, stage, status: stage === 'Final Delivery' ? 'Done' : 'Active', revisions: stage === 'Revision Required' ? x.revisions + 1 : x.revisions } : x)); toast(msg); log('Project', `${p.title}: ${msg}`); };
  if (!p) return <Empty text="No projects to review." />;
  const idx = WORKFLOW.indexOf(p.stage);
  return (
    <div className="stack">
      <select aria-label="Project" value={pid} onChange={e => setPid(e.target.value)}>{projects.map(x => <option key={x.id} value={x.id}>{x.title}</option>)}</select>
      <Card>
        <h3>Workflow</h3>
        <div className="flow">{WORKFLOW.map((s, i) => <div key={s} className={`flow-step ${i <= idx ? 'on' : ''}`}><span>{i + 1}</span>{s}</div>)}</div>
        <div className="row-wrap">
          <Btn variant="secondary" onClick={() => move('Revision Required', 'Revision requested')}>Request revision</Btn>
          <Btn variant="secondary" onClick={() => move('Internal Approval', 'Internal approval recorded')}>Internal approve</Btn>
          <Btn variant="secondary" onClick={() => move('Client Approval', 'Sent for client approval')}>Send to client</Btn>
          <Btn onClick={() => move('Final Delivery', 'Marked delivered (demo)')}>Mark delivered</Btn>
        </div>
      </Card>
      <Card>
        <h3>Review comments</h3>
        <div className="row-wrap"><input aria-label="Review comment" placeholder="Add a comment" value={comment} onChange={e => setComment(e.target.value)} /><Btn variant="secondary" onClick={() => { if (!comment.trim()) return toast('Empty comment', 'err'); setComments(c => [comment, ...c]); setComment(''); }}>Add</Btn></div>
        <div className="list">{comments.map((c, i) => <div key={i} className="bubble">{c}</div>)}</div>
      </Card>
      <Card><h3>Delivery status</h3><div className="kv"><span>Stage</span><Badge>{p.stage}</Badge></div><div className="kv"><span>Revisions</span><span>{p.revisions}</span></div></Card>
    </div>
  );
}

/* ============================================================
   PAGE: FINANCE (demo calculations, multi-currency, labelled)
   ============================================================ */
function Finance({ ctx }: { ctx: Ctx }) {
  const { payments } = ctx;
  const [cur, setCur] = useState<'INR' | 'USD'>('INR');
  const toBase = (p: Payment) => p.amount * (FX[p.currency] ?? 1);
  const inView = (p: Payment) => cur === 'INR' ? toBase(p) : toBase(p) / FX.USD;
  const sum = (k: Payment['kind']) => payments.filter(p => p.kind === k).reduce((a, p) => a + inView(p), 0);
  const received = sum('received'), pending = sum('pending'), payouts = sum('payout'), expenses = sum('expense');
  const revenue = received + pending;
  const profit = revenue - payouts - expenses;
  const fmtC = (n: number) => fmt(n, cur);
  const [model, setModel] = useState<'Per-video' | 'Fixed' | 'Retainer'>('Per-video');
  const [videos, setVideos] = useState(4);
  const [rate, setRate] = useState(1500);
  const quote = model === 'Per-video' ? videos * rate : model === 'Fixed' ? rate : rate * 4;
  return (
    <div className="stack">
      <div className="notice warn">DEMO FINANCE RECORDS. These are not real transactions.</div>
      <div className="row-wrap"><Seg options={['INR', 'USD']} value={cur} onChange={setCur} /><Badge tone="gold">Demo rate: 1 USD = ₹83</Badge></div>
      <section className="grid stats">
        <Stat icon="wallet" label="Total revenue" value={fmtC(revenue)} sub="Demo" />
        <Stat icon="check" label="Received" value={fmtC(received)} sub="Demo" />
        <Stat icon="cal" label="Pending / receivables" value={fmtC(pending)} sub="Demo" />
        <Stat icon="users" label="Editor payouts" value={fmtC(payouts)} sub="Demo" />
        <Stat icon="sparkle" label="Expenses" value={fmtC(expenses)} sub="Demo" />
        <Stat icon="target" label="Project profit" value={fmtC(profit)} sub="Revenue − payouts − expenses" />
      </section>
      <Card>
        <h3>Quote calculator (demo)</h3>
        <div className="row-wrap">
          <select aria-label="Billing model" value={model} onChange={e => setModel(e.target.value as typeof model)}><option>Per-video</option><option>Fixed</option><option>Retainer</option></select>
          {model === 'Per-video' && <input type="number" aria-label="Videos" value={videos} onChange={e => setVideos(Number(e.target.value) || 0)} />}
          <input type="number" aria-label="Rate" value={rate} onChange={e => setRate(Number(e.target.value) || 0)} />
        </div>
        <div className="kv"><span>Quote (INR, demo)</span><strong>{fmt(quote, 'INR')}</strong></div>
        <p className="muted small">Retainer assumes 4 weeks. Custom editor payment and milestones are represented in the backend phase.</p>
      </Card>
      <Card>
        <h3>Transactions (demo)</h3>
        <div className="table-wrap"><table><thead><tr><th>Item</th><th>Type</th><th>Amount</th></tr></thead><tbody>
          {payments.map(p => <tr key={p.id}><td>{p.label}</td><td><Badge>{p.kind}</Badge></td><td>{fmt(p.amount, p.currency)}</td></tr>)}
        </tbody></table></div>
      </Card>
      <Card><h3>Supported models (representation)</h3><ul className="small">
        <li>Client: per-video, fixed project, monthly retainer, custom billing</li>
        <li>Editor: per-video, monthly salary, per-project, milestone, custom</li>
      </ul></Card>
    </div>
  );
}

/* ============================================================
   PAGE: TARGETS & PERFORMANCE (demo-based only)
   ============================================================ */
function Targets({ ctx }: { ctx: Ctx }) {
  const { sent, replies, leads, followups } = ctx;
  const [period, setPeriod] = useState<'Daily' | 'Weekly' | 'Monthly'>('Daily');
  const goals: Record<typeof period, { msg: number; call: number }> = { Daily: { msg: 10, call: 1 }, Weekly: { msg: 60, call: 5 }, Monthly: { msg: 240, call: 20 } };
  const goal = goals[period as keyof typeof goals];
  const interested = leads.filter(l => l.status === 'Interested').length;
  const calls = leads.filter(l => l.status === 'Call Booked').length;
  const won = leads.filter(l => l.status === 'Won').length, lost = leads.filter(l => l.status === 'Lost').length;
  const fuDone = followups.filter(f => f.done).length, fuOver = followups.filter(f => !f.done && !f.cancelled && f.due < todayStr).length;
  const msgScale = period === 'Daily' ? 1 : period === 'Weekly' ? 6 : 24;
  const sentP = Math.min(sent * msgScale, goal.msg);
  return (
    <div className="stack">
      <Seg options={['Daily', 'Weekly', 'Monthly']} value={period} onChange={setPeriod} />
      <Card><h3>Goal progress ({period.toLowerCase()})</h3>
        <div className="kv"><span>Messages sent</span><strong>{sentP} / {goal.msg}</strong></div><ProgressBar value={pct(sentP, goal.msg)} />
        <div className="kv"><span>Calls booked</span><strong>{calls} / {goal.call}</strong></div><ProgressBar value={pct(calls, goal.call)} />
      </Card>
      <section className="grid stats">
        <Stat icon="msg" label="Messages sent" value={sent} sub="Manual (demo)" />
        <Stat icon="reply" label="Replies" value={replies.length} />
        <Stat icon="star" label="Interested" value={interested} />
        <Stat icon="cal" label="Calls booked" value={calls} />
        <Stat icon="check" label="Won / Lost" value={`${won} / ${lost}`} />
        <Stat icon="target" label="Follow-ups done" value={fuDone} sub={`${fuOver} overdue`} />
      </section>
      <Card><h3>Conversion overview</h3>
        <div className="kv"><span>Reply rate</span><strong>{pct(replies.length, Math.max(1, sent))}%</strong></div>
        <div className="kv"><span>Interested rate</span><strong>{pct(interested, Math.max(1, leads.length))}%</strong></div>
        <p className="muted small">Calculated from demo records only. No performance is invented.</p>
      </Card>
    </div>
  );
}

/* ============================================================
   PAGE: REWARDS & LEADERBOARD (frontend representation)
   ============================================================ */
function Rewards({ ctx }: { ctx: Ctx }) {
  const { sent, replies, followups } = ctx;
  const fuDone = followups.filter(f => f.done).length;
  const points = sent * 5 + replies.length * 10 + fuDone * 3;
  const level = Math.floor(points / 100) + 1;
  const badges = [
    { n: 'First Message', ok: sent >= 1 }, { n: 'First Reply', ok: replies.length >= 1 }, { n: 'Follow-up Pro', ok: fuDone >= 1 }, { n: 'Hundred Points', ok: points >= 100 },
  ];
  const board = [{ n: 'Demo User (you)', p: points }, { n: 'Demo Teammate A', p: 180 }, { n: 'Demo Teammate B', p: 90 }].sort((a, b) => b.p - a.p);
  return (
    <div className="stack">
      <div className="notice warn">Demo points. Real points and rankings need backend-confirmed data.</div>
      <section className="grid stats">
        <Stat icon="star" label="Points" value={points} sub="Demo" />
        <Stat icon="target" label="Level" value={level} />
        <Stat icon="check" label="Badges earned" value={badges.filter(b => b.ok).length} />
      </section>
      <Card><h3>Badges</h3><div className="row-wrap">{badges.map(b => <Badge key={b.n} tone={b.ok ? 'gold' : 'neutral'}>{b.ok ? '★ ' : ''}{b.n}</Badge>)}</div></Card>
      <Card><h3>Leaderboard (demo)</h3>{board.map((r, i) => <div key={r.n} className="list-row static"><span>#{i + 1} {r.n}</span><strong>{r.p}</strong></div>)}</Card>
    </div>
  );
}

/* ============================================================
   PAGE: SETTINGS
   ============================================================ */
function Settings({ theme, setTheme, lang, setLang, toast }: { theme: Theme; setTheme: (t: Theme) => void; lang: Lang; setLang: (l: Lang) => void; toast: Toast }) {
  const [name, setName] = useState(ME.name);
  const [notif, setNotif] = useState({ due: true, reply: true, overdue: true });
  const [dense, setDense] = useState(false);
  const [reduce, setReduce] = useState(false);
  const [pwd, setPwd] = useState('');
  return (
    <div className="stack">
      <Card><h3>Profile</h3>
        <Field label="Display name" error={name.trim() ? undefined : 'Required'}><input value={name} onChange={e => setName(e.target.value)} /></Field>
        <Btn onClick={() => name.trim() && toast('Profile saved (demo only)')}>Save profile</Btn>
      </Card>
      <Card><h3>Appearance</h3>
        <Seg options={['dark', 'light', 'system']} value={theme} onChange={setTheme} />
        <div className="row-wrap" style={{ marginTop: 10 }}><span>Language</span><Seg options={['en', 'hi']} value={lang} onChange={v => setLang(v as Lang)} /></div>
        <label className="check"><input type="checkbox" checked={dense} onChange={e => setDense(e.target.checked)} /> Compact lists</label>
        <label className="check"><input type="checkbox" checked={reduce} onChange={e => { setReduce(e.target.checked); document.documentElement.classList.toggle('reduce-motion', e.target.checked); }} /> Reduce motion (also follows system)</label>
      </Card>
      <Card><h3>Notifications (in-app)</h3>
        {(['due', 'reply', 'overdue'] as const).map(k => <label key={k} className="check"><input type="checkbox" checked={notif[k]} onChange={e => setNotif({ ...notif, [k]: e.target.checked })} /> {k === 'due' ? 'Follow-up due' : k === 'reply' ? 'New reply logged' : 'Overdue follow-up'}</label>)}
        <p className="muted small">Settings are local demo state only.</p>
      </Card>
      <Card><h3>Security</h3>
        <Field label="Change password (demo)"><input type="password" value={pwd} onChange={e => setPwd(e.target.value)} placeholder="Not stored" /></Field>
        <Btn variant="secondary" onClick={() => { setPwd(''); toast('Password change is not active in Phase 1', 'info'); }}>Update</Btn>
        <p className="muted small">Real authentication and password security come in the backend phase.</p>
      </Card>
      <Card><h3>About</h3><p className="small">MDS Motion Agency · Phase 1 user frontend · demo build.</p></Card>
      <Collapse title="Help & support"><p className="muted small">Contact your team admin. Help center links will be added with the backend.</p></Collapse>
    </div>
  );
}

/* ============================================================
   PAGE: SEARCH (global, suggestions, filters, sort)
   ============================================================ */
function Search({ ctx }: { ctx: Ctx }) {
  const { leads, projects, clients, setPage, setOpenLead } = ctx;
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'All' | 'Leads' | 'Projects' | 'Clients'>('All');
  const [sort, setSort] = useState<'Relevance' | 'Name'>('Relevance');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const k = q.trim().toLowerCase();
  const hit = (s: string) => !!k && s.toLowerCase().includes(k);
  const L = kind !== 'Projects' && kind !== 'Clients' ? leads.filter(l => !l.deleted && (hit(l.name) || hit(l.handle) || hit(l.niche) || hit(l.phone))) : [];
  const P = kind !== 'Leads' && kind !== 'Clients' ? projects.filter(p => hit(p.title) || hit(p.client)) : [];
  const C = kind !== 'Leads' && kind !== 'Projects' ? clients.filter(c => hit(c.name) || hit(c.email)) : [];
  if (sort === 'Name') { L.sort((a, b) => a.name.localeCompare(b.name)); }
  const suggest = ['Aarav', 'Priya', 'Sharma', 'Reel'];
  return (
    <div className="stack">
      <div className="search-input big"><Icon name="search" size={18} /><input ref={ref} aria-label="Search everything" placeholder="Search leads, projects, clients" value={q} onChange={e => setQ(e.target.value)} /></div>
      {!k && <div className="row-wrap">{suggest.map(s => <button key={s} className="chip" onClick={() => setQ(s)}>{s}</button>)}</div>}
      <div className="row-wrap">
        <Seg options={['All', 'Leads', 'Projects', 'Clients']} value={kind} onChange={setKind} />
        <select aria-label="Sort results" value={sort} onChange={e => setSort(e.target.value as typeof sort)}><option>Relevance</option><option>Name</option></select>
      </div>
      {!!k && L.length + P.length + C.length === 0 && <Empty text={`No results for "${q}" in demo data.`} />}
      {L.length > 0 && <Card><h3>Leads</h3>{L.map(l => <button key={l.id} className="list-row" onClick={() => { setPage('leads'); setOpenLead(l.id); }}><span>{l.name}</span><span className="muted small">{l.handle}</span></button>)}</Card>}
      {P.length > 0 && <Card><h3>Projects</h3>{P.map(p => <button key={p.id} className="list-row" onClick={() => setPage('projects')}><span>{p.title}</span><span className="muted small">{p.client}</span></button>)}</Card>}
      {C.length > 0 && <Card><h3>Clients</h3>{C.map(c => <button key={c.id} className="list-row" onClick={() => setPage('clients')}><span>{c.name}</span><span className="muted small">{c.email}</span></button>)}</Card>}
      <Collapse title="Advanced search"><p className="muted small">Filter by status, priority and date are available in the Leads page filters. Cross-entity advanced search arrives with the backend.</p></Collapse>
    </div>
  );
}

/* ============================================================
   PAGE: PROFILE / ACCOUNT
   ============================================================ */
function Profile({ onLogout, toast }: { onLogout: () => void; toast: Toast }) {
  const [name, setName] = useState(ME.name);
  const [editing, setEditing] = useState(false);
  return (
    <div className="stack">
      <Card className="hero">
        <div className="avatar lg" aria-label="Profile photo placeholder">DU</div>
        <div><h2>{name}</h2><div className="muted">{ME.email}</div><Badge tone="warn">DEMO LOGIN</Badge></div>
      </Card>
      <Card><h3>Account information</h3>
        <div className="kv"><span>Role</span><span>{ME.role}</span></div>
        <div className="kv"><span>Email</span><span>{ME.email}</span></div>
        <div className="kv"><span>Status</span><span>Demo session (no real login)</span></div>
        <Btn variant="secondary" icon="edit" onClick={() => setEditing(true)}>Edit profile</Btn>
      </Card>
      <Btn variant="danger" icon="logout" onClick={() => { toast('Demo session ended', 'info'); onLogout(); }}>Log out (demo)</Btn>
      {editing && <Modal title="Edit profile" onClose={() => setEditing(false)} footer={<><Btn variant="secondary" onClick={() => setEditing(false)}>Cancel</Btn><Btn onClick={() => { if (!name.trim()) return toast('Name required', 'err'); toast('Profile updated (demo)'); setEditing(false); }}>Save</Btn></>}>
        <Field label="Name" error={name.trim() ? undefined : 'Required'}><input value={name} onChange={e => setName(e.target.value)} /></Field>
      </Modal>}
    </div>
  );
}

/* ============================================================
   PAGE: ACTIVITY HISTORY
   ============================================================ */
function ActivityPage({ ctx }: { ctx: Ctx }) {
  const [cat, setCat] = useState<'All' | Activity['cat']>('All');
  const rows = ctx.activity.filter(a => cat === 'All' || a.cat === cat);
  return (
    <div className="stack">
      <Seg options={['All', 'Lead', 'Message', 'Follow-up', 'Project', 'Payment']} value={cat} onChange={v => setCat(v as typeof cat)} />
      <div className="list-card">{rows.map(a => <div key={a.id} className="list-row static anim-item"><Badge>{a.cat}</Badge><span className="grow">{a.text}</span><span className="muted small">{a.at}</span></div>)}</div>
      <p className="muted small">Demo activity records. Live activity arrives with the backend phase.</p>
    </div>
  );
}

/* ---------- Shared types ---------- */
type Toast = (text: string, tone?: 'ok' | 'err' | 'info') => void;
type Ctx = {
  leads: Lead[]; setLeads: Dispatch<SetStateAction<Lead[]>>;
  templates: Template[]; setTemplates: Dispatch<SetStateAction<Template[]>>;
  replies: Reply[]; setReplies: Dispatch<SetStateAction<Reply[]>>;
  followups: FollowUp[]; setFollowups: Dispatch<SetStateAction<FollowUp[]>>;
  notices: Notice[]; setNotices: Dispatch<SetStateAction<Notice[]>>;
  projects: Project[]; setProjects: Dispatch<SetStateAction<Project[]>>;
  clients: Client[]; payments: Payment[]; activity: Activity[];
  log: (cat: Activity['cat'], text: string) => void; toast: Toast;
  lang: Lang; sent: number; setSent: (n: number) => void;
  setPage: (p: Page) => void; setOpenLead: (id: string | null) => void; openLead: string | null;
  unread: number; dueToday: number; overdue: number;
};
