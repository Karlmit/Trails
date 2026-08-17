import { redirect } from 'next/navigation';

interface PageProps {
  params: Promise<{ tripId: string }>;
}

// FR-6: opening a Trip lands on its Timeline first, never Overview.
export default async function TripRootPage({ params }: PageProps) {
  const { tripId } = await params;
  redirect(`/trips/${tripId}/timeline`);
}
