import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { serializeSection } from '@/lib/serializers';
import { isUuid } from '@/lib/uuid';
import { SectionManager } from '@/components/SectionManager';

interface PageProps {
  params: Promise<{ tripId: string }>;
}

// spec-timeline-ux-and-timezone: Section add/remove is relocated here, off
// the Timeline, which stays a pure read-only viewing surface. Same
// SectionManager component, same API contracts (AD-2 unchanged) -- only the
// page it's hosted on has moved.
export default async function SectionsPage({ params }: PageProps) {
  const { tripId } = await params;
  if (!isUuid(tripId)) notFound();

  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: { sections: { orderBy: { startDate: 'asc' } } },
  });
  if (!trip) notFound();

  const sections = trip.sections.map(serializeSection);

  return (
    <main className="page">
      <h2>Sections</h2>
      <p className="text-soft">
        Group this Trip&rsquo;s days into named legs. Sections appear as color bands on the Timeline.
      </p>
      <SectionManager tripId={tripId} sections={sections} />
    </main>
  );
}
