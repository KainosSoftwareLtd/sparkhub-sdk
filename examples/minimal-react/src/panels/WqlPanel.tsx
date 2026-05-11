/**
 * WQL test panel — runs a date-range query against allIntegrationEventsInDateRange.
 *
 * Two input fields drive the WQL PARAMETERS block (fromSecond, toSecond).
 * Defaults are yesterday / today.
 */

import { useState } from 'react';
import { useSparkhub, useActiveTenant } from '@sparkhub/react';

const QUERY_TEMPLATE = (fromSecond: string, toSecond: string) => `PARAMETERS
  fromSecond = "${fromSecond}",
  toSecond = "${toSecond}"
SELECT
  integrationSystem,
  submittedByUser,
  actualStartDateAndTime,
  actualCompletedDateAndTime,
  percentComplete
FROM
  allIntegrationEventsInDateRange`;

function defaultFromDate(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function defaultToDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function WqlPanel() {
  const { client } = useSparkhub();
  const { activeTenantId } = useActiveTenant();
  const [fromSecond, setFromSecond] = useState(defaultFromDate);
  const [toSecond, setToSecond] = useState(defaultToDate);
  const [isRunning, setIsRunning] = useState(false);
  const [rows, setRows] = useState<unknown[] | null>(null);
  const [totalRows, setTotalRows] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRun = async () => {
    if (!activeTenantId) {
      setError('Select a tenant first.');
      return;
    }
    setIsRunning(true);
    setError(null);
    setRows(null);
    setTotalRows(null);
    try {
      const query = QUERY_TEMPLATE(fromSecond, toSecond);
      const r = await client.tenants.wql(activeTenantId, { query, limit: 100 });
      if (r.ok) {
        setRows(r.rows);
        setTotalRows(r.totalRows);
      } else {
        setError(`${r.error ?? 'wql_failed'}: ${r.error_description ?? '(no detail)'}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <section className="card">
      <h2>WQL — allIntegrationEventsInDateRange</h2>
      <p className="muted">
        Lists Workday integration events between the two dates. Edit the date inputs to refine the
        window. Result capped at 100 rows.
      </p>
      <div className="form-row">
        <label>
          From <input type="date" value={fromSecond} onChange={(e) => setFromSecond(e.target.value)} />
        </label>
        <label>
          To <input type="date" value={toSecond} onChange={(e) => setToSecond(e.target.value)} />
        </label>
      </div>
      <details>
        <summary>Show query being sent</summary>
        <pre>{QUERY_TEMPLATE(fromSecond, toSecond)}</pre>
      </details>
      <div className="actions">
        <button
          type="button"
          className="primary"
          onClick={handleRun}
          disabled={isRunning || !activeTenantId}
        >
          {isRunning ? 'Running…' : 'Run WQL'}
        </button>
      </div>
      {error && <p className="status error">{error}</p>}
      {rows !== null && (
        <>
          <h3>
            Result {totalRows !== null && <span className="muted">({totalRows} total)</span>}
          </h3>
          {rows.length === 0 ? (
            <p className="muted">No rows.</p>
          ) : (
            <pre>{JSON.stringify(rows, null, 2)}</pre>
          )}
        </>
      )}
    </section>
  );
}
