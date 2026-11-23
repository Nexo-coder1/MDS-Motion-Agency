import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import Admin from './Admin';
import AdminGate from './AdminGate';
import './styles.css';

// Hash routing: "#/admin" opens the Admin app behind Owner sign-in; anything else opens the User app (default).
function Root() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (!hash.startsWith('#/admin')) return <App />;

  return <AdminGate>{onSignOut => <Admin onSignOut={onSignOut} />}</AdminGate>;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
