'use client';

import { useTranslations } from 'next-intl';
import { translateApiError } from '@/lib/api-error-messages';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function DeleteTripButton({ tripId, tripName }: { tripId: string; tripName: string }) {
  const t = useTranslations('errors');
  const tTrips = useTranslations('trips');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!confirm(tTrips('confirmDelete', { name: tripName }))) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/trips/${tripId}`, { method: 'DELETE' });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(translateApiError(t, body?.error?.message) ?? tTrips('deleteFailed'));
        return;
      }
      router.refresh();
    } catch {
      setError(tTrips('networkError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack" style={{ gap: 'var(--space-1)' }}>
      {error && <div className="form-error-banner">{error}</div>}
      <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={busy}>
        {busy ? tTrips('deleting') : tTrips('delete')}
      </button>
    </div>
  );
}
