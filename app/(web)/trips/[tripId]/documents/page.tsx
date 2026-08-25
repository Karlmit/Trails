import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
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

  const t = await getTranslations('tripDocuments');

  const attachments = await prisma.attachment.findMany({
    where: { tripId },
    orderBy: { createdAt: 'desc' },
  });

  // Attachment.ownerId isn't a declarable Prisma relation (AD-4's owner_type
  // is polymorphic) -- resolve the owning TimelineEntry/ImportantInfo rows
  // in one follow-up query per owner type rather than per-row.
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

  // FR-26, spec-important-info: IMPORTANT_INFO-owned Attachments get their
  // own single group (label "Important Info", every row linking to the
  // Important Info list page -- items have no individual detail page of
  // their own to link to). No Draft-style visibility filter applies here
  // (ImportantInfo has no analogous published/draft state).
  const importantInfoIds = attachments
    .filter((attachment) => attachment.ownerType === 'IMPORTANT_INFO')
    .map((attachment) => attachment.ownerId);
  const importantInfoItems = await prisma.importantInfo.findMany({
    where: { id: { in: importantInfoIds } },
    select: { id: true, title: true },
  });
  const importantInfoById = new Map(importantInfoItems.map((item) => [item.id, item]));

  type Row = { attachment: (typeof attachments)[number]; title: string; href: string };
  const groups = new Map<string, { label: string; rows: Row[] }>();
  for (const attachment of attachments) {
    if (attachment.ownerType === 'TIMELINE_ENTRY') {
      // An Attachment whose owner isn't in `entryById` is either a Draft
      // Blog Post's (filtered out above, by design) or -- in principle -- a
      // row whose owner Entry was deleted through a race the write path
      // can't fully prevent (Attachment.ownerId has no DB-level FK; see
      // app/api/v1/attachments/route.ts). Either way, silently drop it here
      // rather than rendering a raw enum string as a group heading.
      const owner = entryById.get(attachment.ownerId);
      if (!owner) continue;
      const group = groups.get(owner.entryType) ?? {
        label: ENTRY_TYPE_LABELS[owner.entryType] ?? owner.entryType,
        rows: [],
      };
      group.rows.push({ attachment, title: owner.title, href: entryDetailHref(tripId, owner.entryType, owner.id) });
      groups.set(owner.entryType, group);
      continue;
    }
    if (attachment.ownerType === 'IMPORTANT_INFO') {
      const owner = importantInfoById.get(attachment.ownerId);
      if (!owner) continue;
      const group = groups.get('IMPORTANT_INFO') ?? { label: t('importantInfoGroupLabel'), rows: [] };
      group.rows.push({ attachment, title: owner.title, href: `/trips/${tripId}/important-info` });
      groups.set('IMPORTANT_INFO', group);
    }
  }

  return (
    <main className="page">
      <h2 style={{ margin: 0 }}>{t('pageTitle')}</h2>
      <p className="text-soft">{t('pageDescription')}</p>

      {groups.size === 0 ? (
        <div className="empty-state">{t('emptyStatePage')}</div>
      ) : (
        <div className="stack">
          {[...groups.entries()].map(([groupKey, group]) => (
            <div key={groupKey} className="card stack">
              <h3 style={{ margin: 0 }}>{group.label}</h3>
              <div className="stack" style={{ gap: 'var(--space-2)' }}>
                {group.rows.map(({ attachment, title, href }) => (
                  <div key={attachment.id} className="row-between">
                    <div className="stack" style={{ gap: 0 }}>
                      <a href={`/api/v1/attachments/${attachment.id}/file`} target="_blank" rel="noreferrer">
                        {attachment.originalFilename}
                      </a>
                      <Link href={href} className="text-soft">
                        {title}
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
