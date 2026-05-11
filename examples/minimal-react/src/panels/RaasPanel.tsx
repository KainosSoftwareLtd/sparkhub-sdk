/**
 * RAAS test panel — runs a custom report given the partner-supplied
 * `{owner}/{name}` path. Server resolves serviceHost + tenant from the
 * SparkHub connection.
 */

import { useState } from 'react';
import { useSparkhub, useActiveTenant } from '@sparkhub/react';

export function RaasPanel() {
  const { client } = useSparkhub();
  const { activeTenantId } = useActiveTenant();
  const [reportUrl, setReportUrl] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRun = async () => {
    if (!activeTenantId) {
      setError('Select a tenant first.');
      return;
    }
    if (!reportUrl.trim()) {
      setError('Provide a report path (e.g. `username/Worker_Report`).');
      return;
    }
    setIsRunning(true);
    setError(null);
    setResult(null);
    try {
      const r = await client.tenants.raas(activeTenantId, {
        reportUrl: reportUrl.trim(),
        format: 'json',
      });
      if (r.ok) {
        setResult(r.data);
      } else {
        setError(`${r.error ?? 'raas_failed'}: ${r.error_description ?? '(no detail)'}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <section className="card">
      <h2>RAAS — custom report</h2>
      <p className="muted">
        Provide the report path as <code>{'{owner}/{name}'}</code> (e.g.{' '}
        <code>username/Worker_Report</code>). SparkHub resolves the host + tenant from the stored
        connection.
      </p>
      <div className="form-row">
        <label style={{ flex: 1 }}>
          Report path
          <input
            type="text"
            value={reportUrl}
            placeholder="owner/report_name"
            onChange={(e) => setReportUrl(e.target.value)}
          />
        </label>
      </div>
      <div className="actions">
        <button
          type="button"
          className="primary"
          onClick={handleRun}
          disabled={isRunning || !activeTenantId}
        >
          {isRunning ? 'Running…' : 'Run RAAS'}
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
