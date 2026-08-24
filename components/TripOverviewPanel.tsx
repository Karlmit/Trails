'use client';

import { useState } from 'react';
import { EditTripForm } from '@/components/EditTripForm';

interface TripOverviewPanelProps {
  trip: {
    id: string;
    name: string;
    destination: string | null;
    startDate: string;
    endDate: string;
    timezone: string;
    description: string | null;
    coverImage: string | null;
    visibility: 'PUBLIC' | 'PRIVATE';
    pinnedActive: boolean;
    status: string;
    durationDays: number;
  };
  // spec-guest-access: hides the Edit button/state entirely for a Guest --
  // not merely disabled, not present in the DOM at all.
  readOnly?: boolean;
}

export function TripOverviewPanel({ trip, readOnly = false }: TripOverviewPanelProps) {
  const [editing, setEditing] = useState(false);

  if (editing && !readOnly) {
    return <EditTripForm trip={trip} onDone={() => setEditing(false)} />;
  }

  return (
    <div className="card stack">
      {trip.coverImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={trip.coverImage}
          alt=""
          style={{ width: '100%', borderRadius: 'var(--radius-card)', maxHeight: 280, objectFit: 'cover' }}
        />
      )}
      <div className="row-between">
        <h2 style={{ margin: 0 }}>{trip.name}</h2>
        {!readOnly && (
          <button type="button" className="btn btn-outline" onClick={() => setEditing(true)}>
            Edit
          </button>
        )}
      </div>
      {trip.destination && <p className="text-soft" style={{ margin: 0 }}>{trip.destination}</p>}
      <dl className="row" style={{ gap: 'var(--space-6)' }}>
        <div>
          <dt className="text-soft" style={{ fontSize: '0.8rem', textTransform: 'uppercase' }}>
            Start date
          </dt>
          <dd style={{ margin: 0 }}>{trip.startDate}</dd>
        </div>
        <div>
          <dt className="text-soft" style={{ fontSize: '0.8rem', textTransform: 'uppercase' }}>
            End date
          </dt>
          <dd style={{ margin: 0 }}>{trip.endDate}</dd>
        </div>
        <div>
          <dt className="text-soft" style={{ fontSize: '0.8rem', textTransform: 'uppercase' }}>
            Duration
          </dt>
          <dd style={{ margin: 0 }}>{trip.durationDays} days</dd>
        </div>
        <div>
          <dt className="text-soft" style={{ fontSize: '0.8rem', textTransform: 'uppercase' }}>
            Timezone
          </dt>
          <dd style={{ margin: 0 }}>{trip.timezone}</dd>
        </div>
        <div>
          <dt className="text-soft" style={{ fontSize: '0.8rem', textTransform: 'uppercase' }}>
            Visibility
          </dt>
          <dd style={{ margin: 0 }}>{trip.visibility === 'PUBLIC' ? 'Public' : 'Private'}</dd>
        </div>
      </dl>
      {trip.description && <p style={{ margin: 0 }}>{trip.description}</p>}
    </div>
  );
}
