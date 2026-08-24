'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

export interface PhotoDTO {
  id: string;
  tripId: string;
  ownerType: string;
  ownerId: string;
  mimeType: string;
  sizeBytes: number;
  originalFilename: string;
  isPrimary: boolean;
  isPrivate: boolean;
  createdAt: string;
}

interface PhotoGalleryProps {
  tripId: string;
  ownerType: string;
  ownerId: string;
  // spec-guest-access/spec-tags-links-photos: hides upload/delete/mark-
  // primary/mark-private affordances entirely for a Guest -- not merely
  // disabled, not present in the DOM. Unlike TagList/LinkList (never
  // Guest-facing at all), Photos genuinely render for a Guest (FR-3/FR-28),
  // so this component -- unlike those two -- does keep a `readOnly` prop,
  // same convention as AttachmentList.
  readOnly?: boolean;
  // The two Guest-eligible pages (entries/[entryId], blog/[entryId]) query
  // Photos directly via Prisma and pass an already-`filterForViewer`-
  // filtered list here (spec's Code Map) -- required for a Guest, since
  // that viewer has no session to self-fetch
  // `GET /api/v1/photos?ownerType=&ownerId=` with (that endpoint stays
  // ordinary requireAuth, unlike the per-photo file route). When given, this
  // component seeds its state from it and skips the initial self-fetch
  // entirely; every mutation still updates local state optimistically (same
  // pattern as AttachmentList), so no later re-fetch is needed either. When
  // omitted (IdeaCard/ImportantInfoCard, never Guest-reachable), falls back
  // to AttachmentList's plain self-fetching shape.
  initialPhotos?: PhotoDTO[];
}

const THUMB_SIZE = 140;

function fileUrl(photoId: string): string {
  return `/api/v1/photos/${photoId}/file`;
}

export function PhotoGallery({ tripId, ownerType, ownerId, readOnly = false, initialPhotos }: PhotoGalleryProps) {
  const router = useRouter();
  const [photos, setPhotos] = useState<PhotoDTO[]>(initialPhotos ?? []);
  const [loading, setLoading] = useState(initialPhotos === undefined);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const uploadInFlight = useRef(false);

  useEffect(() => {
    if (initialPhotos !== undefined) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/v1/photos?ownerType=${encodeURIComponent(ownerType)}&ownerId=${encodeURIComponent(ownerId)}`,
        );
        if (!response.ok) return;
        const body = (await response.json()) as PhotoDTO[];
        if (!cancelled) setPhotos(body);
      } catch {
        // Leave the gallery empty -- not a blocking error for the rest of the page.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerType, ownerId]);

  function withBusy(id: string, on: boolean) {
    setBusyIds((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || uploadInFlight.current) return;
    uploadInFlight.current = true;
    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('ownerType', ownerType);
      formData.append('ownerId', ownerId);
      formData.append('file', file);

      const response = await fetch('/api/v1/photos', { method: 'POST', body: formData });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(body?.error?.message ?? 'Could not upload this photo.');
        return;
      }
      setPhotos((current) => [...current, body as PhotoDTO]);
      router.refresh();
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setUploading(false);
      uploadInFlight.current = false;
    }
  }

  async function handleDelete(photo: PhotoDTO) {
    if (!confirm('Delete this photo?')) return;
    setError(null);
    withBusy(photo.id, true);
    const previous = photos;
    setPhotos((current) => current.filter((p) => p.id !== photo.id));

    try {
      const response = await fetch(`/api/v1/photos/${photo.id}`, { method: 'DELETE' });
      if (!response.ok) {
        setPhotos(previous);
        const body = await response.json().catch(() => null);
        setError(body?.error?.message ?? 'Could not delete this photo.');
        return;
      }
      router.refresh();
    } catch {
      setPhotos(previous);
      setError('Could not reach the server. Please try again.');
    } finally {
      withBusy(photo.id, false);
    }
  }

  async function handleMarkPrimary(photo: PhotoDTO) {
    if (photo.isPrimary) return;
    setError(null);
    withBusy(photo.id, true);
    const previous = photos;
    // Optimistic: exactly one isPrimary true, matching the atomic swap the
    // server performs (I/O matrix: "never two primaries at once").
    setPhotos((current) => current.map((p) => ({ ...p, isPrimary: p.id === photo.id })));

    try {
      const response = await fetch(`/api/v1/photos/${photo.id}/primary`, { method: 'PUT' });
      if (!response.ok) {
        setPhotos(previous);
        const body = await response.json().catch(() => null);
        setError(body?.error?.message ?? 'Could not mark this photo primary.');
        return;
      }
      router.refresh();
    } catch {
      setPhotos(previous);
      setError('Could not reach the server. Please try again.');
    } finally {
      withBusy(photo.id, false);
    }
  }

  async function handleTogglePrivate(photo: PhotoDTO) {
    setError(null);
    const nextPrivate = !photo.isPrivate;
    withBusy(photo.id, true);
    const previous = photos;
    setPhotos((current) => current.map((p) => (p.id === photo.id ? { ...p, isPrivate: nextPrivate } : p)));

    try {
      const response = await fetch(`/api/v1/photos/${photo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPrivate: nextPrivate }),
      });
      if (!response.ok) {
        setPhotos(previous);
        const body = await response.json().catch(() => null);
        setError(body?.error?.message ?? 'Could not update this photo.');
        return;
      }
      router.refresh();
    } catch {
      setPhotos(previous);
      setError('Could not reach the server. Please try again.');
    } finally {
      withBusy(photo.id, false);
    }
  }

  void tripId; // kept for interface parity with AttachmentList's mount signature; not needed by any call here.

  // User-requested compactness: a read-only mount with nothing to show
  // renders nothing at all.
  if (readOnly && !loading && photos.length === 0) return null;

  return (
    <div className="stack" style={{ gap: 'var(--space-2)' }}>
      <div className="row-between">
        <span className="text-soft" style={{ fontSize: '0.8rem', textTransform: 'uppercase' }}>
          Photos
        </span>
        {!readOnly && (
          <label className="btn btn-outline" style={{ cursor: uploading ? 'default' : 'pointer', margin: 0 }}>
            {uploading ? 'Uploading…' : 'Upload'}
            <input
              type="file"
              accept="image/jpeg,image/png"
              onChange={handleUpload}
              disabled={uploading}
              style={{ display: 'none' }}
            />
          </label>
        )}
      </div>

      {error && <div className="form-error-banner">{error}</div>}

      {loading ? (
        <p className="text-soft">Loading…</p>
      ) : photos.length === 0 ? (
        <p className="text-soft">No photos yet. JPEG or PNG.</p>
      ) : (
        <div className="photo-gallery">
          {photos.map((photo) => (
            <div key={photo.id} className="photo-thumb-wrap">
              <Image
                src={fileUrl(photo.id)}
                alt={photo.originalFilename}
                width={THUMB_SIZE}
                height={THUMB_SIZE}
                className="photo-thumb"
                // DISCLOSED DEVIATION from AD-5's literal "rely on Next.js
                // <Image> on-the-fly optimization" -- verified live against
                // the built-in Docker stack: Next's Image Optimization API
                // fetches the `url` param via its own internal request,
                // which does not forward the browser's session cookie (a
                // Next.js platform limitation, not a choice made here). For
                // a Photo behind auth (any non-Public-Trip, non-Guest-
                // eligible context), that internal fetch 404s inside our own
                // Route Handler, and the optimizer then serves a broken
                // image instead of the original -- confirmed by a live
                // cookie-attached request to /_next/image for an
                // authenticated User's own Private-Trip Photo returning 400.
                // `unoptimized` renders a plain <img src> instead, which the
                // browser requests directly (carrying its own cookies
                // normally) -- still no custom server-side thumbnailing
                // service (AD-5's actual "Prevents"), just no on-the-fly
                // resize on top of the stored original.
                unoptimized
              />
              {photo.isPrimary && <span className="badge photo-thumb-primary-badge">Cover</span>}
              {!readOnly && (
                <div className="photo-thumb-controls">
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => handleMarkPrimary(photo)}
                    disabled={photo.isPrimary || busyIds.has(photo.id)}
                  >
                    {photo.isPrimary ? 'Cover photo' : 'Set as cover'}
                  </button>
                  <label className="row" style={{ gap: 'var(--space-1)', alignItems: 'center', margin: 0 }}>
                    <input
                      type="checkbox"
                      checked={photo.isPrivate}
                      onChange={() => handleTogglePrivate(photo)}
                      disabled={busyIds.has(photo.id)}
                      aria-label="Private"
                    />
                    <span className="text-soft">Private</span>
                  </label>
                  <button
                    type="button"
                    className="btn-danger"
                    style={{ border: 'none', background: 'none', padding: 0, fontSize: '0.8rem', cursor: 'pointer' }}
                    onClick={() => handleDelete(photo)}
                    disabled={busyIds.has(photo.id)}
                  >
                    {busyIds.has(photo.id) ? 'Working…' : 'Delete'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
