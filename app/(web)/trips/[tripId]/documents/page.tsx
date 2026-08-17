import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { entryDetailHref, timelineVisibleEntryWhere } from '@/lib/entry-types';
import { ENTRY_TYPE_LABELS } from '@/lib/entry-types/labels';
import { formatAttachmentSize } from '@/lib/attachments';
import { isUuid } from '@/lib/uuid';

interface PageProps {
  params: Promise<{ tripId: string }>;
}

// FR-24/FR-25, spec-documents: Trip-wide aggregation of every Attachment on
// this Trip (AD-5's `tripId` column resolved once at upload time makes this
// a single flat query, not a per-owner-type union), grouped by owning Entry
// Type, each row linking back to `entryDetailHref()` -- same "Server
// Component reads Prisma directly" read path as Budget/Timeline.
export default async function DocumentsPage({ params }: PageProps) {
  const { tripId } = await params;
  if (!isUuid(tripId)) notFound();

  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) notFound();

  const attachments = await prisma.attachment.findMany({
    where: { tripId },
    orderBy: { createdAt: 'desc' },
  });

  // Attachment.ownerId isn't a declarable Prisma relation (AD-4's owner_type
  // is polymorphic) -- resolve the owning TimelineEntry rows in one
  // follow-up query rather than per-row.
  const entryIds = attachments
    .filter((attachment) => attachment.ownerType === 'TIMELINE_ENTRY')
    .map((attachment) => attachment.ownerId);
  const entries = await prisma.timelineEntry.findMany({
    // AD-10: exclude Draft Blog Posts from this aggregation the same way
    // Budget's aggregation does (timelineVisibleEntryWhere() -- the one
    // shared predicate). A Draft Blog Post's Attachments must not surface
    // here before the post is published, even though they were uploaded on
    // its own (auth-gated) editing surface.
    where: { id: { in: entryIds }, ...timelineVisibleEntryWhere() },
    select: { id: true, entryType: true, title: true },
  });
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));

  type Row = { attachment: (typeof attachments)[number]; owner: (typeof entries)[number] };
  const groups = new Map<string, Row[]>();
  for (const attachment of attachments) {
    // An Attachment whose owner isn't in `entryById` is either a Draft Blog
    // Post's (filtered out above, by design) or -- in principle -- a row
    // whose owner Entry was deleted through a race the write path can't
    // fully prevent (Attachment.ownerId has no DB-level FK; see
    // app/api/v1/attachments/route.ts). Either way, silently drop it here
    // rather than rendering a raw enum string as a group heading.
    if (attachment.ownerType !== 'TIMELINE_ENTRY') continue;
    const owner = entryById.get(attachment.ownerId);
    if (!owner) continue;
    const rows = groups.get(owner.entryType) ?? [];
    rows.push({ attachment, owner });
    groups.set(owner.entryType, rows);
  }

  return (
    <main className="page">
      <h2 style={{ margin: 0 }}>Documents</h2>
      <p className="text-soft">
        Every file uploaded anywhere on this Trip, grouped by the Entry it&rsquo;s attached to.
      </p>

      {groups.size === 0 ? (
        <div className="empty-state">No documents uploaded on this Trip yet.</div>
      ) : (
        <div className="stack">
          {[...groups.entries()].map(([groupKey, rows]) => (
            <div key={groupKey} className="card stack">
              <h3 style={{ margin: 0 }}>{ENTRY_TYPE_LABELS[groupKey] ?? groupKey}</h3>
              <div className="stack" style={{ gap: 'var(--space-2)' }}>
                {rows.map(({ attachment, owner }) => (
                  <div key={attachment.id} className="row-between">
                    <div className="stack" style={{ gap: 0 }}>
                      <a href={`/api/v1/attachments/${attachment.id}/file`} target="_blank" rel="noreferrer">
                        {attachment.originalFilename}
                      </a>
                      <Link href={entryDetailHref(tripId, owner.entryType, owner.id)} className="text-soft">
                        {owner.title}
                      </Link>
                    </div>
                    <span className="text-soft">{formatAttachmentSize(attachment.sizeBytes)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
