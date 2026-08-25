import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth';
import { serializeChecklist, serializeChecklistItem } from '@/lib/serializers';
import { isUuid } from '@/lib/uuid';
import { filterChecklistsForUser } from '@/lib/checklist-access';
import { ChecklistForm } from '@/components/ChecklistForm';
import { ChecklistCard } from '@/components/ChecklistCard';

interface PageProps {
  params: Promise<{ tripId: string }>;
}

// FR-21, spec-checklists: list of Checklists, each expandable with its
// Items inline (single page, no separate item-management route) -- same
// Server Component read pattern as SectionsPage/IdeasPage (prisma directly,
// no fetch to its own API).
export default async function ChecklistsPage({ params }: PageProps) {
  const { tripId } = await params;
  if (!isUuid(tripId)) notFound();

  // This page is fully requireAuth (proxy.ts never lists it as
  // Guest-eligible), so a null user here should be unreachable in
  // practice -- but a private Checklist's own visibility depends on
  // knowing who's asking, so this page needs the real User, not just the
  // fact that *someone* is signed in.
  const user = await getSessionUser();
  if (!user) notFound();

  const t = await getTranslations('tripChecklists');

  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      checklists: {
        orderBy: { createdAt: 'asc' },
        include: { items: { orderBy: { createdAt: 'asc' } } },
      },
    },
  });
  if (!trip) notFound();

  const checklists = filterChecklistsForUser(trip.checklists, user).map((checklist) => ({
    ...serializeChecklist(checklist),
    items: checklist.items.map(serializeChecklistItem),
  }));

  return (
    <main className="page">
      <h2>{t('title')}</h2>
      <p className="text-soft">{t('subtitle')}</p>

      <div className="stack" style={{ marginBottom: 'var(--space-4)' }}>
        <ChecklistForm tripId={tripId} />
      </div>

      {checklists.length === 0 ? (
        <div className="empty-state">{t('emptyState')}</div>
      ) : (
        <div className="stack">
          {checklists.map((checklist) => (
            <ChecklistCard key={checklist.id} checklist={checklist} />
          ))}
        </div>
      )}
    </main>
  );
}
