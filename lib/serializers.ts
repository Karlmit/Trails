import type {
  Attachment,
  Checklist,
  ChecklistItem,
  Idea,
  ImportantInfo,
  Link,
  Photo,
  Section,
  Tag,
  TimelineEntry,
  Trip,
  User,
} from '@prisma/client';
import { computeTripStatus, tripDurationDays } from '@/lib/trip-status';

// FR-30, spec-admin-users: `role`/`createdAt` only, alongside `id`/`username`
// -- `passwordHash` is deliberately never included (spec's "Never" boundary).
export function serializeUser(user: User) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  };
}

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
    color: section.color,
    emoji: section.emoji,
    createdAt: section.createdAt.toISOString(),
    updatedAt: section.updatedAt.toISOString(),
  };
}

// AD-1: TimelineEntry's Decimal columns (location coordinates, Expense
// amount) come back from Prisma as Decimal.js instances -- converted to
// plain numbers over the wire (Consistency Conventions: no envelope, plain
// JSON values).
function decimalToNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return Number(value);
}

export function serializeTimelineEntry(entry: TimelineEntry) {
  return {
    id: entry.id,
    tripId: entry.tripId,
    entryType: entry.entryType,
    subtype: entry.subtype,
    title: entry.title,
    description: entry.description,
    startAt: entry.startAt.toISOString(),
    endAt: entry.endAt ? entry.endAt.toISOString() : null,
    locationName: entry.locationName,
    locationAddress: entry.locationAddress,
    locationLat: decimalToNumber(entry.locationLat),
    locationLng: decimalToNumber(entry.locationLng),
    locationMapLink: entry.locationMapLink,
    bookingReference: entry.bookingReference,
    website: entry.website,
    bookedVia: entry.bookedVia,
    expenseAmount: decimalToNumber(entry.expenseAmount),
    expenseCurrency: entry.expenseCurrency,
    expensePaymentStatus: entry.expensePaymentStatus,
    expensePaymentNote: entry.expensePaymentNote,
    contactName: entry.contactName,
    contactPhone: entry.contactPhone,
    contactEmail: entry.contactEmail,
    notes: entry.notes,
    postTripNotes: entry.postTripNotes,
    typeDetails: entry.typeDetails,
    publishedAt: entry.publishedAt ? entry.publishedAt.toISOString() : null,
    isPrivate: entry.isPrivate,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

// FR-16/FR-17, spec-ideas: same shape/conventions as serializeSection above.
export function serializeIdea(idea: Idea) {
  return {
    id: idea.id,
    tripId: idea.tripId,
    title: idea.title,
    category: idea.category,
    priority: idea.priority,
    weatherSuitability: idea.weatherSuitability,
    weatherTags: idea.weatherTags,
    locationName: idea.locationName,
    locationAddress: idea.locationAddress,
    locationLat: decimalToNumber(idea.locationLat),
    locationLng: decimalToNumber(idea.locationLng),
    locationMapLink: idea.locationMapLink,
    estimatedExpenseAmount: decimalToNumber(idea.estimatedExpenseAmount),
    estimatedExpenseCurrency: idea.estimatedExpenseCurrency,
    createdAt: idea.createdAt.toISOString(),
    updatedAt: idea.updatedAt.toISOString(),
  };
}

// FR-21, spec-checklists: same shape/conventions as serializeSection above.
export function serializeChecklist(checklist: Checklist) {
  return {
    id: checklist.id,
    tripId: checklist.tripId,
    title: checklist.title,
    description: checklist.description,
    createdAt: checklist.createdAt.toISOString(),
    updatedAt: checklist.updatedAt.toISOString(),
  };
}

export function serializeChecklistItem(item: ChecklistItem) {
  return {
    id: item.id,
    checklistId: item.checklistId,
    text: item.text,
    checked: item.checked,
    note: item.note,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

// FR-26, spec-important-info: same shape/conventions as serializeSection
// above.
export function serializeImportantInfo(item: ImportantInfo) {
  return {
    id: item.id,
    tripId: item.tripId,
    title: item.title,
    content: item.content,
    locationName: item.locationName,
    locationAddress: item.locationAddress,
    locationLat: decimalToNumber(item.locationLat),
    locationLng: decimalToNumber(item.locationLng),
    locationMapLink: item.locationMapLink,
    contactName: item.contactName,
    contactPhone: item.contactPhone,
    contactEmail: item.contactEmail,
    isPrivate: item.isPrivate,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

// FR-24/FR-25, spec-documents: same shape/conventions as serializeSection
// above. `filePath` (an on-disk path under AD-5's uploads volume) is
// deliberately never exposed here -- the client only ever needs the
// attachment id, to build the `/api/v1/attachments/[id]/file` download URL.
export function serializeAttachment(attachment: Attachment) {
  return {
    id: attachment.id,
    tripId: attachment.tripId,
    ownerType: attachment.ownerType,
    ownerId: attachment.ownerId,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    originalFilename: attachment.originalFilename,
    createdAt: attachment.createdAt.toISOString(),
  };
}

// FR-15/FR-16/FR-26, spec-tags-links-photos: same shape/conventions as
// serializeSection above.
export function serializeTag(tag: Tag) {
  return {
    id: tag.id,
    ownerType: tag.ownerType,
    ownerId: tag.ownerId,
    text: tag.text,
    createdAt: tag.createdAt.toISOString(),
  };
}

export function serializeLink(link: Link) {
  return {
    id: link.id,
    ownerType: link.ownerType,
    ownerId: link.ownerId,
    url: link.url,
    label: link.label,
    createdAt: link.createdAt.toISOString(),
  };
}

// Same "never expose filePath" convention as serializeAttachment above --
// the client only ever needs the photo id, to build the
// `/api/v1/photos/[id]/file` URL.
export function serializePhoto(photo: Photo) {
  return {
    id: photo.id,
    tripId: photo.tripId,
    ownerType: photo.ownerType,
    ownerId: photo.ownerId,
    mimeType: photo.mimeType,
    sizeBytes: photo.sizeBytes,
    originalFilename: photo.originalFilename,
    isPrimary: photo.isPrimary,
    isPrivate: photo.isPrivate,
    createdAt: photo.createdAt.toISOString(),
  };
}
