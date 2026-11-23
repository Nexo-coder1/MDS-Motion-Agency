import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { User } from 'firebase/auth';
import { isOwner, signInOwner, signOutCurrentUser, subscribeToAuth } from './services/auth';
import './admin.css';

/**
 * Owner-only gate for the Admin Panel.
 * - Waits for Firebase to restore the existing session before showing anything.
 * - Shows the Admin Panel only when the signed-in UID is the configured Owner UID (auth.ts).
 * - This is a UI gate. Real data protection must be enforced by Firestore Security Rules (separate task).
 */

type Props = {
  children: (onSignOut: () => void) => ReactNode;
};

function errorMessage(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : '';

  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email':
      return 'Email or password is incorrect.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a few minutes and try again.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.';
    case 'auth/unauthorized-domain':
      return 'This domain is not authorized in Firebase Authentication settings.';
    case 'auth/user-disabled':
      return 'This account is disabled.';
    default:
      return error instanceof Error && error.message ? error.message : 'Sign-in failed. Please try again.';
  }
}

export default function AdminGate({ children }: Props) {
  const [checking, setChecking] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Fires once with the restored session (or null), then on every sign-in / sign-out.
    const unsubscribe = subscribeToAuth(next => {
      setUser(next);
      setChecking(false);
    });
    return unsubscribe;
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      // signInOwner() signs out any account whose UID is not the Owner UID and throws.
      await signInOwner(email, password);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPassword('');
      setBusy(false);
    }
  };

  const signOut = async () => {
    setError('');
    try {
      await signOutCurrentUser();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  if (checking) {
    return (
      <div className="adm-gate" role="status" aria-live="polite">
        <div>
          <div className="adm-spinner" aria-hidden="true" />
          <p className="muted small">Checking Admin session…</p>
        </div>
      </div>
    );
  }

  const signedIn = user !== null;
  const owner = isOwner(user);

  if (owner) {
    return <>{children(() => { void signOut(); })}</>;
  }

  if (signedIn) {
    return (
      <div className="adm-gate">
        <div className="adm-login card" role="alert">
          <div className="brand">
            <span className="logo">M</span>
            <div><div className="brand-name">MDS Admin</div><div className="brand-sub">Access denied</div></div>
          </div>
          <h2>Not authorized</h2>
          <p className="muted small">
            This account is signed in but is not the Owner account. The Admin Panel is available only to the Owner.
          </p>
          {error && <div className="notice err">{error}</div>}
          <button type="button" className="btn btn-primary" onClick={() => void signOut()}>Sign out</button>
        </div>
      </div>
    );
  }

  return (
    <div className="adm-gate">
      <form className="adm-login card" onSubmit={submit} aria-label="Admin sign in">
        <div className="brand">
          <span className="logo">M</span>
          <div><div className="brand-name">MDS Admin</div><div className="brand-sub">Owner sign-in</div></div>
        </div>
        <label className="field">
          <span className="field-label">Email</span>
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            disabled={busy}
            onChange={e => setEmail(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">Password</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            disabled={busy}
            onChange={e => setPassword(e.target.value)}
          />
        </label>
        {error && <div className="notice err" role="alert">{error}</div>}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="muted small">The Admin Panel is restricted to the Owner account.</p>
      </form>
    </div>
  );
}
