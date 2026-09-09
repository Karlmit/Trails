'use client';

import { useTranslations } from 'next-intl';
import { translateApiError } from '@/lib/api-error-messages';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { formatAttachmentSize } from '@/lib/attachments';
import { UrlImportField } from '@/components/UrlImportField';
import { OwnerCreateError, useOwnerIdResolver } from '@/lib/hooks/useOwnerId';

const FIELD_LABEL_STYLE = { fontSize: '0.8rem', textTransform: 'uppercase' as const };

export interface AttachmentDTO {
  id: string;
  tripId: string;
  ownerType: string;
  ownerId: string;
  mimeType: string;
  sizeBytes: number;
  originalFilename: string;
  createdAt: string;
}

interface AttachmentListProps {
  tripId: string;
  ownerType: string;
  // Empty while the owning row doesn't exist yet (a create form) -- see
  // `ensureOwnerId` below.
  ownerId: string;
  // spec-guest-access: not in the original spec-documents Code Map, but
  // required by this spec's Boundaries ("no mutation UI ... renders for a
  // Guest -- not merely disabled, not present in the DOM at all") since this
  // component is mounted on both Guest-eligible detail panels
  // (EntryDetailPanel, BlogPostDetailPanel) and otherwise offers
  // Upload/Delete unconditionally. Hides those affordances only -- the
  // read-only file list itself still renders (GET /api/v1/attachments stays
  // requireAuth-gated regardless, so a Guest's own fetch 401s and the list
  // simply renders empty; this prop only controls the UI, not the API call).
  readOnly?: boolean;
  // Lets a create form mount this before its own row exists: the first
  // upload (file or URL) creates the owner on demand and returns its id.
  // See lib/hooks/useOwnerId.ts.
  ensureOwnerId?: () => Promise<string>;
}

// FR-24, spec-documents: reusable upload form + file list + delete, mounted
// on both Entry detail panels (EntryDetailPanel, BlogPostDetailPanel) --
// both are TimelineEntry rows per AD-1, so one `ownerType="TIMELINE_ENTRY"`
// covers Stay/Transport/Activity/Note/Blog Post uniformly. Self-fetches its
// own list on mount (unlike ChecklistCard, which receives Server-Component-
// fetched data as a prop) -- the Code Map's mount call passes only
// ownerType/ownerId/tripId, no initial list. Same error-banner + in-flight-
// request-guarding conventions as ChecklistCard.tsx.
export function AttachmentList({
  tripId,
  ownerType,
  ownerId,
  readOnly = false,
  ensureOwnerId,
}: AttachmentListProps) {
  const t = useTranslations('errors');
  const tc = useTranslations('common');
  const td = useTranslations('tripDocuments');
  const router = useRouter();
  const [attachments, setAttachments] = useState<AttachmentDTO[]>([]);
  // Nothing to load for an owner that doesn't exist yet -- start settled
  // rather than flashing "Loading…" once.
  const [loading, setLoading] = useState(Boolean(ownerId));
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  // Guards a fast double-select from firing two overlapping uploads.
  const uploadInFlight = useRef(false);
  const resolveOwnerId = useOwnerIdResolver(ownerId, ensureOwnerId);

  useEffect(() => {
    if (!ownerId) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/v1/attachments?ownerType=${encodeURIComponent(ownerType)}&ownerId=${encodeURIComponent(ownerId)}`,
        );
        if (!response.ok) return;
        const body = (await response.json()) as AttachmentDTO[];
        if (!cancelled) setAttachments(body);
      } catch {
        // Leave the list empty -- not a blocking error for the rest of the page.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [ownerType, ownerId]);

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
      formData.append('ownerId', await resolveOwnerId());
      formData.append('file', file);

      const response = await fetch('/api/v1/attachments', { method: 'POST', body: formData });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(translateApiError(t, body?.error?.message) ?? td('uploadError'));
        return;
      }
      setAttachments((current) => [body as AttachmentDTO, ...current]);
      router.refresh();
    } catch (err) {
      setError(err instanceof OwnerCreateError ? err.message : td('networkError'));
    } finally {
      setUploading(false);
      uploadInFlight.current = false;
    }
  }

  // User-requested URL import ("anywhere I can upload a photo it's also
  // possible to just post an image URL") -- an Attachment can be a JPEG/PNG
  // just as much as a PDF, so Documents is one of those places. Same
  // endpoint as the multipart upload above, selected by Content-Type; the
  // server fetches the bytes and stores them exactly like a picked file, so
  // the row that comes back is indistinguishable from an uploaded one.
  async function handleImportUrl(sourceUrl: string): Promise<string | null> {
    setError(null);
    try {
      const resolvedOwnerId = await resolveOwnerId();
      const response = await fetch('/api/v1/attachments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerType, ownerId: resolvedOwnerId, sourceUrl }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        return translateApiError(t, body?.error?.message) ?? td('urlError');
      }
      setAttachments((current) => [body as AttachmentDTO, ...current]);
      router.refresh();
      return null;
    } catch (err) {
      // UrlImportField shows whatever string comes back inline, so the
      // owner-create failure travels the same path as any other error here.
      return err instanceof OwnerCreateError ? err.message : td('networkError');
    }
  }

  async function handleDelete(attachment: AttachmentDTO) {
    if (!confirm(td('deleteConfirm', { filename: attachment.originalFilename }))) return;
    setError(null);
    setDeletingIds((current) => new Set(current).add(attachment.id));
    const previous = attachments;
    setAttachments((current) => current.filter((a) => a.id !== attachment.id));

    try {
      const response = await fetch(`/api/v1/attachments/${attachment.id}`, { method: 'DELETE' });
      if (!response.ok) {
        setAttachments(previous);
        const body = await response.json().catch(() => null);
        setError(translateApiError(t, body?.error?.message) ?? td('deleteError'));
        return;
      }
      router.refresh();
    } catch {
      setAttachments(previous);
      setError(td('networkError'));
    } finally {
      setDeletingIds((current) => {
        const next = new Set(current);
        next.delete(attachment.id);
        return next;
      });
    }
  }

  // User-requested compactness: a read-only mount with nothing to show
  // renders nothing at all.
  if (readOnly && !loading && attachments.length === 0) return null;

  return (
    <div className="stack" style={{ gap: 'var(--space-2)' }}>
      <div className="row-between">
        <span className="text-soft" style={FIELD_LABEL_STYLE}>
          {td('label')}
        </span>
        {!readOnly && (
          <div className="media-actions">
            <label className="btn btn-outline" style={{ cursor: uploading ? 'default' : 'pointer', margin: 0 }}>
              {uploading ? td('uploading') : td('upload')}
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                onChange={handleUpload}
                disabled={uploading}
                style={{ display: 'none' }}
              />
            </label>
            <UrlImportField
              toggleLabel={td('urlToggle')}
              placeholder={td('urlPlaceholder')}
              submitLabel={td('urlSubmit')}
              busyLabel={td('urlFetching')}
              cancelLabel={td('urlCancel')}
              onSubmit={handleImportUrl}
              disabled={uploading}
            />
          </div>
        )}
      </div>

      {error && <div className="form-error-banner">{error}</div>}

      {loading ? (
        <p className="text-soft">{tc('loading')}</p>
      ) : attachments.length === 0 ? (
        <p className="text-soft">{td('emptyState')}</p>
      ) : (
        <div className="stack" style={{ gap: 'var(--space-2)' }}>
          {attachments.map((attachment) => (
            <div key={attachment.id} className="row-between">
              <a href={`/api/v1/attachments/${attachment.id}/file`} target="_blank" rel="noreferrer">
                {attachment.originalFilename}
              </a>
              <span className="row" style={{ gap: 'var(--space-2)' }}>
                <span className="text-soft">{formatAttachmentSize(attachment.sizeBytes)}</span>
                {!readOnly && (
                  <button
                    type="button"
                    className="btn-danger"
                    style={{ border: 'none', background: 'none', padding: 0, fontSize: '0.8rem', cursor: 'pointer' }}
                    onClick={() => handleDelete(attachment)}
                    disabled={deletingIds.has(attachment.id)}
                  >
                    {deletingIds.has(attachment.id) ? td('deleting') : tc('delete')}
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
