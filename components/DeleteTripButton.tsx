'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function DeleteTripButton({ tripId, tripName }: { tripId: string; tripName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!confirm(`Delete "${tripName}"? This cannot be undone.`)) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/trips/${tripId}`, { method: 'DELETE' });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error?.message ?? 'Could not delete the Trip.');
        return;
      }
      router.refresh();
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack" style={{ gap: 'var(--space-1)' }}>
      {error && <div className="form-error-banner">{error}</div>}
      <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={busy}>
        {busy ? 'Deleting…' : 'Delete'}
      </button>
    </div>
  );
}
