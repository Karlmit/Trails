'use client';

import { useRef } from 'react';

// User-reported: Tags/Links/Photos/Documents used to be offered only once
// their owning row already existed ("the links section is only missing when
// creating a new item, it becomes visible when editing an existing one --
// same for photos and documents"). Each of those rows needs a real ownerId
// to attach to, so an owner form that doesn't have one yet passes an
// `ensureOwnerId` callback instead: the very first attach attempt silently
// creates the owner and every later one reuses that id. Same shape as
// BlogPostForm's own `ensurePostId`, which solved the identical "add an
// image before the post exists" problem -- factored out here because four
// separate list components (TagList, LinkList, PhotoGallery,
// AttachmentList) each need it.

/**
 * Thrown by `ensureOwnerId` (and by the resolver, when there is no owner
 * and no way to create one) carrying an already-translated, user-facing
 * message. Call sites distinguish it from a plain network failure so they
 * show the create error itself rather than their own generic "could not
 * reach the server."
 */
export class OwnerCreateError extends Error {}

export interface OwnerIdState {
  /** Empty string while the owner does not exist yet. */
  ownerId: string;
  ensureOwnerId?: () => Promise<string>;
}

/**
 * Pure core behind `useOwnerIdResolver` -- exported for unit testing
 * independent of React (this codebase has no component/hook-rendering test
 * setup, same arrangement as lib/hooks/useAutoEndDate.ts). Reads `state`
 * on every call rather than closing over its fields, so a long-lived
 * resolver always sees the latest props; writes the created id back into it
 * so one owner is created per form, not per list component.
 */
export function createOwnerIdResolver(state: OwnerIdState): () => Promise<string> {
  return async function resolveOwnerId() {
    if (state.ownerId) return state.ownerId;
    if (!state.ensureOwnerId) {
      throw new OwnerCreateError('Could not create the item to attach this to.');
    }
    // Concurrent calls are deduplicated by `ensureOwnerId` itself (it owns
    // the in-flight create promise, and has to -- all four list components
    // must end up attaching to the same row).
    const created = await state.ensureOwnerId();
    state.ownerId = created;
    return created;
  };
}

/**
 * Returns a stable resolver: the owner's id if it already exists, otherwise
 * the id of the owner created on demand via `ensureOwnerId`. Throws
 * `OwnerCreateError` if that creation fails.
 */
export function useOwnerIdResolver(ownerId: string, ensureOwnerId?: () => Promise<string>): () => Promise<string> {
  const stateRef = useRef<OwnerIdState>({ ownerId, ensureOwnerId });
  // Keep the latest props visible to the resolver closure below, which is
  // created exactly once. Idempotent, so doing it during render is safe --
  // and it has to happen before any event handler can call the resolver.
  stateRef.current.ensureOwnerId = ensureOwnerId;
  if (ownerId) stateRef.current.ownerId = ownerId;

  const resolverRef = useRef<(() => Promise<string>) | null>(null);
  if (!resolverRef.current) resolverRef.current = createOwnerIdResolver(stateRef.current);
  return resolverRef.current;
}
