import { useSparkhub } from '@sparkhub/react';
import { TenantSection } from './panels/TenantSection';
import { SoapPanel } from './panels/SoapPanel';
import { WqlPanel } from './panels/WqlPanel';
import { RaasPanel } from './panels/RaasPanel';
import { DataPanel } from './panels/DataPanel';

export function App() {
  const { isAuthenticated, me, meError, isLoading, login, logout, refreshMe } = useSparkhub();

  if (isLoading) {
    return <main className="container"><p>Initializing&hellip;</p></main>;
  }

  return (
    <main className="container">
      <header>
        <h1>SparkHub partner-app — M2 demo</h1>
        <p className="lead">
          End-to-end example of <code>@sparkhub/sdk</code> + <code>@sparkhub/react</code>.
          Showcases auth, tenants, the three Workday runners (SOAP / RAAS / WQL), and managed storage.
        </p>
      </header>

      {meError && (
        <div className="status error">
          <strong>Error:</strong> {meError.message}
        </div>
      )}

      <section className="card">
        <h2>Authentication</h2>
        {isAuthenticated ? (
          <>
            <div className="status ok">Signed in</div>
            <h3>/api/partner-app/me</h3>
            <pre>{JSON.stringify(me, null, 2)}</pre>
            <div className="actions">
              <button type="button" onClick={refreshMe}>Re-fetch /me</button>
              <button type="button" className="primary" onClick={logout}>
                Sign out
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="status info">Not signed in</div>
            <div className="actions">
              <button type="button" className="primary" onClick={login}>
                Sign in with SparkHub
              </button>
            </div>
          </>
        )}
      </section>

      {isAuthenticated && (
        <>
          <TenantSection />
          <SoapPanel />
          <RaasPanel />
          <WqlPanel />
          <DataPanel />
        </>
      )}

      <footer>
        <small>
          Token refresh + multi-tab coordination handled by the SDK. Open browser console for{' '}
          <code>onTokenRefresh</code> log lines.
        </small>
      </footer>
    </main>
  );
}
