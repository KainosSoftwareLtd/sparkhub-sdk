import { useSparkhub } from '@sparkhub/react';

export function App() {
  const { isAuthenticated, me, meError, isLoading, login, logout, refreshMe } = useSparkhub();

  if (isLoading) {
    return <main className="container"><p>Initializing&hellip;</p></main>;
  }

  return (
    <main className="container">
      <header>
        <h1>SparkHub partner-app — minimal React example</h1>
        <p className="lead">
          Reference implementation of the OAuth round-trip wrapped in a React
          provider + hook. Copy <code>src/sparkhub-provider.tsx</code> as a
          starting point for your own app.
        </p>
      </header>

      {meError && (
        <div className="status error">
          <strong>Error:</strong> {meError.message}
        </div>
      )}

      {isAuthenticated ? (
        <section>
          <div className="status ok">Signed in</div>
          <h3>/api/partner-app/me</h3>
          <pre>{JSON.stringify(me, null, 2)}</pre>
          <div className="actions">
            <button type="button" onClick={refreshMe}>Re-fetch /me</button>
            <button type="button" className="primary" onClick={logout}>
              Sign out
            </button>
          </div>
        </section>
      ) : (
        <section>
          <div className="status info">Not signed in</div>
          <p>Click below to redirect to SparkHub for sign-in &amp; consent.</p>
          <div className="actions">
            <button type="button" className="primary" onClick={login}>
              Sign in with SparkHub
            </button>
          </div>
        </section>
      )}

      <footer>
        <small>
          Token refresh fires <code>onTokenRefresh</code> &mdash; check the
          browser console. Multi-tab refresh coordination is handled
          automatically by the SDK.
        </small>
      </footer>
    </main>
  );
}
