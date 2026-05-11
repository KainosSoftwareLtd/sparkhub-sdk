/**
 * Managed-storage demo — exercises `client.data.collection('notes')`.
 *
 * v1 of cluster A has no schema validation (per CLAUDE_CONTEXT), so any
 * shape is accepted. This demo just inserts simple `{ body, createdAt }`
 * docs into a `notes` collection in the per-app DB.
 */

import { useEffect, useState } from 'react';
import { useSparkhub } from '@sparkhub/react';

interface NoteDoc {
  _id?: string;
  body: string;
  createdAt: string;
}

const COLLECTION = 'notes';

export function DataPanel() {
  const { client, isAuthenticated } = useSparkhub();
  const [newBody, setNewBody] = useState('');
  const [notes, setNotes] = useState<NoteDoc[] | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    if (!isAuthenticated) return;
    setError(null);
    try {
      const data = client.data.collection(COLLECTION);
      const [rows, total] = await Promise.all([
        data.find<NoteDoc>({}).sort({ createdAt: -1 }).limit(20).run(),
        data.count(),
      ]);
      setNotes(rows);
      setCount(total);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    if (isAuthenticated) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const handleInsert = async () => {
    if (!newBody.trim()) return;
    setIsBusy(true);
    setError(null);
    try {
      await client.data.collection(COLLECTION).insertOne({
        body: newBody.trim(),
        createdAt: new Date().toISOString(),
      });
      setNewBody('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsBusy(false);
    }
  };

  const handleDelete = async (id: string | undefined) => {
    if (!id) return;
    setIsBusy(true);
    setError(null);
    try {
      await client.data.collection(COLLECTION).deleteOne({ _id: { $oid: id } });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <section className="card">
      <h2>Managed storage — notes</h2>
      <p className="muted">
        SparkHub-managed Mongo, scoped to this app + org (DB: <code>{'{orgCode}_{appCode}'}</code>).
        Inserts a doc with a body + timestamp; lists recent 20.
      </p>
      <div className="form-row">
        <input
          type="text"
          value={newBody}
          placeholder="Type a note and press Add"
          onChange={(e) => setNewBody(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleInsert()}
          style={{ flex: 1 }}
        />
        <button
          type="button"
          className="primary"
          onClick={handleInsert}
          disabled={isBusy || !newBody.trim()}
        >
          Add
        </button>
        <button type="button" onClick={refresh} disabled={isBusy}>
          Refresh
        </button>
      </div>
      {error && <p className="status error">{error}</p>}
      {count !== null && <p className="muted">{count} total in collection.</p>}
      {notes === null ? (
        <p className="muted">Loading…</p>
      ) : notes.length === 0 ? (
        <p className="muted">No notes yet — add one above.</p>
      ) : (
        <ul className="note-list">
          {notes.map((n) => (
            <li key={n._id ? String(n._id) : n.createdAt}>
              <div className="note-body">{n.body}</div>
              <div className="note-meta">
                <span className="muted">{new Date(n.createdAt).toLocaleString()}</span>
                <button
                  type="button"
                  onClick={() => handleDelete(n._id ? String(n._id) : undefined)}
                  disabled={isBusy}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
