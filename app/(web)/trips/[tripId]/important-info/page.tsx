import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { serializeImportantInfo } from '@/lib/serializers';
import { isUuid } from '@/lib/uuid';
import { ImportantInfoForm } from '@/components/ImportantInfoForm';
import { ImportantInfoCard } from '@/components/ImportantInfoCard';

interface PageProps {
  params: Promise<{ tripId: string }>;
}

// FR-26, spec-important-info: list of ImportantInfo items, each
// independently editable/deletable -- same Server Component read pattern as
// ChecklistsPage (prisma directly, no fetch to its own API).
export default async function ImportantInfoPage({ params }: PageProps) {
  const { tripId } = await params;
  if (!isUuid(tripId)) notFound();

  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: { importantInfo: { orderBy: { createdAt: 'asc' } } },
  });
  if (!trip) notFound();

  const items = trip.importantInfo.map(serializeImportantInfo);

  return (
    <main className="page">
      <h2>Important Info</h2>
      <p className="text-soft">
        Insurance, passport copies, visa info, emergency contacts, embassy details, SIM/eSIM, addresses,
        and anything else worth keeping on hand for this Trip.
      </p>

      <div className="stack" style={{ marginBottom: 'var(--space-4)' }}>
        <ImportantInfoForm tripId={tripId} mode="create" />
      </div>

      {items.length === 0 ? (
        <div className="empty-state">No Important Info yet. Add one above.</div>
      ) : (
        <div className="stack">
          {items.map((item) => (
            <ImportantInfoCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </main>
  );
}
