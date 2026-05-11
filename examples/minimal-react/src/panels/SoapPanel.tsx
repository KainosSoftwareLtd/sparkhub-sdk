/**
 * SOAP test panel — runs `Get_Server_Timestamp` against the active tenant.
 *
 * This is the same SOAP operation SparkHub's internal Dev Tools → Ping
 * Workday feature uses (Recruiting / v46.0 / Get_Server_Timestamp). Tiny,
 * no inputs required, and verified to work across the tenants we test.
 */

import { useState } from 'react';
import { useSparkhub, useActiveTenant } from '@sparkhub/react';

export function SoapPanel() {
  const { client } = useSparkhub();
  const { activeTenantId } = useActiveTenant();
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRun = async () => {
    if (!activeTenantId) {
      setError('Select a tenant first.');
      return;
    }
    setIsRunning(true);
    setError(null);
    setResult(null);
    try {
      const r = await client.tenants.soap(activeTenantId, {
        webservice: 'Recruiting',
        operation: 'Get_Server_Timestamp',
        version: 'v46.0',
        data: {},
      });
      setResult(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <section className="card">
      <h2>SOAP — Get_Server_Timestamp</h2>
      <p className="muted">
        Same operation as Dev Tools → Ping Workday (Recruiting / v46.0). Lowest-impact heartbeat —
        confirms auth + connection + envelope plumbing end-to-end.
      </p>
      <div className="actions">
        <button
          type="button"
          className="primary"
          onClick={handleRun}
          disabled={isRunning || !activeTenantId}
        >
          {isRunning ? 'Running…' : 'Ping Workday'}
        </button>
      </div>
      {error && <p className="status error">{error}</p>}
      {result !== null && (
        <>
          <h3>Result</h3>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </>
      )}
    </section>
  );
}
