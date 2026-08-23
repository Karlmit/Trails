import type { User } from '@prisma/client';

// User-clarified: "Guests can't see checklists. they are only for signed in
// users. With private checklist, its only visible to the user who created
// it. If not marked as private, the checklist can be seen and edited by all
// signed in users." Guest exclusion needs nothing extra -- every Checklist/
// ChecklistItem route already requires a session (no Guest branch exists),
// so an unauthenticated request never reaches this predicate at all. This
// is the one place `Checklist.isPrivate`/`createdByUserId` are evaluated,
// mirroring lib/viewer.ts's own "no page/route re-implements the check
// inline" convention.

/** A signed-in User may see a Checklist unless it's private and they didn't create it. */
export function canViewChecklist(checklist: { isPrivate: boolean; createdByUserId: string }, user: User): boolean {
  return !checklist.isPrivate || checklist.createdByUserId === user.id;
}

/** Same predicate, applied to a list -- used by the Checklists list endpoint/page. */
export function filterChecklistsForUser<T extends { isPrivate: boolean; createdByUserId: string }>(
  checklists: T[],
  user: User,
): T[] {
  return checklists.filter((checklist) => canViewChecklist(checklist, user));
}
