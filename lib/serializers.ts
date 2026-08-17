import type { Section, Trip } from '@prisma/client';
import { computeTripStatus, tripDurationDays } from '@/lib/trip-status';

export function serializeTrip(trip: Trip) {
  return {
    id: trip.id,
    name: trip.name,
    destination: trip.destination,
    startDate: trip.startDate.toISOString().slice(0, 10),
    endDate: trip.endDate.toISOString().slice(0, 10),
    timezone: trip.timezone,
    description: trip.description,
    coverImage: trip.coverImage,
    visibility: trip.visibility,
    status: computeTripStatus(trip),
    durationDays: tripDurationDays(trip),
    createdAt: trip.createdAt.toISOString(),
    updatedAt: trip.updatedAt.toISOString(),
  };
}

export function serializeSection(section: Section) {
  return {
    id: section.id,
    tripId: section.tripId,
    name: section.name,
    startDate: section.startDate.toISOString().slice(0, 10),
    endDate: section.endDate.toISOString().slice(0, 10),
    createdAt: section.createdAt.toISOString(),
    updatedAt: section.updatedAt.toISOString(),
  };
}
