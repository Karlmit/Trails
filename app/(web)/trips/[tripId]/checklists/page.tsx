import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { serializeChecklist, serializeChecklistItem } from '@/lib/serializers';
import { isUuid } from '@/lib/uuid';
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

  const checklists = trip.checklists.map((checklist) => ({
    ...serializeChecklist(checklist),
    items: checklist.items.map(serializeChecklistItem),
  }));

  return (
    <main className="page">
      <h2>Checklists</h2>
      <p className="text-soft">
        Packing lists, pre-departure tasks, and anything else worth tracking for this Trip.
      </p>

      <div className="stack" style={{ marginBottom: 'var(--space-4)' }}>
        <ChecklistForm tripId={tripId} />
      </div>

      {checklists.length === 0 ? (
        <div className="empty-state">No Checklists yet. Add one above.</div>
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
