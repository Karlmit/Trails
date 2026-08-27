'use client';

import { useRouter } from 'next/navigation';
import { IdeaForm } from '@/components/IdeaForm';
import type { IdeaDTO } from '@/components/IdeaCard';

// The one bit IdeaForm can't do generically: after a *plain* create it
// stays put (an inline collapsible form on the Ideas list, per its own
// comment), but after a convert it should leave this now-gone Entry's page
// behind and land on the Ideas list where the new Idea now lives -- same
// destination change EntryForm makes internally for the opposite
// direction (router.push to the new Entry's own page). Kept as this thin
// 'use client' wrapper rather than making the whole convert page a Client
// Component, so the page itself stays a plain Server Component read.
export function ConvertEntryToIdeaForm({
  tripId,
  entryId,
  sections,
  categoryOptions,
  initialValues,
}: {
  tripId: string;
  entryId: string;
  sections: { id: string; name: string }[];
  categoryOptions: string[];
  initialValues: Partial<IdeaDTO>;
}) {
  const router = useRouter();

  return (
    <IdeaForm
      tripId={tripId}
      sections={sections}
      categoryOptions={categoryOptions}
      mode="create"
      startOpen
      initialValues={initialValues}
      apiUrl={`/api/v1/timeline-entries/${entryId}/convert-to-idea`}
      onSaved={() => router.push(`/trips/${tripId}/ideas`)}
    />
  );
}
