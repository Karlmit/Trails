import { describe, expect, it, vi } from 'vitest';
import { OwnerCreateError, createOwnerIdResolver } from '@/lib/hooks/useOwnerId';

// User-reported: Tags/Links/Photos/Documents were only offered once their
// owning row existed, so a brand-new Important Info item had none of them.
// The lists now take an `ensureOwnerId` and resolve the id on the first
// attach -- unit-tested here against the pure core, independent of any
// React render (this codebase has no component/hook-rendering test setup,
// same arrangement as tests/use-auto-end-date.test.ts).
describe('createOwnerIdResolver', () => {
  it('returns an existing ownerId without creating anything', async () => {
    const ensureOwnerId = vi.fn();
    const resolve = createOwnerIdResolver({ ownerId: 'owner-1', ensureOwnerId });

    await expect(resolve()).resolves.toBe('owner-1');
    expect(ensureOwnerId).not.toHaveBeenCalled();
  });

  it('creates the owner on the first call and reuses that id afterwards', async () => {
    const ensureOwnerId = vi.fn().mockResolvedValue('created-1');
    const state = { ownerId: '', ensureOwnerId };
    const resolve = createOwnerIdResolver(state);

    await expect(resolve()).resolves.toBe('created-1');
    await expect(resolve()).resolves.toBe('created-1');
    expect(ensureOwnerId).toHaveBeenCalledTimes(1);
    // Written back into the shared state, so every other list component on
    // the same form attaches to that same row.
    expect(state.ownerId).toBe('created-1');
  });

  it('picks up a later ownerId/ensureOwnerId without being recreated', async () => {
    // The hook mutates this same object on every render, so a resolver
    // handed out once must never close over stale props.
    const state: { ownerId: string; ensureOwnerId?: () => Promise<string> } = { ownerId: '' };
    const resolve = createOwnerIdResolver(state);

    state.ensureOwnerId = vi.fn().mockResolvedValue('created-2');
    await expect(resolve()).resolves.toBe('created-2');

    state.ownerId = 'owner-2';
    await expect(resolve()).resolves.toBe('owner-2');
  });

  it('throws an OwnerCreateError when there is no owner and no way to create one', async () => {
    const resolve = createOwnerIdResolver({ ownerId: '' });

    await expect(resolve()).rejects.toBeInstanceOf(OwnerCreateError);
  });

  it("surfaces the creation failure as-is -- call sites show the creator's own message", async () => {
    const ensureOwnerId = vi.fn().mockRejectedValue(new OwnerCreateError('Kunde inte nå servern.'));
    const state = { ownerId: '', ensureOwnerId };
    const resolve = createOwnerIdResolver(state);

    await expect(resolve()).rejects.toThrow('Kunde inte nå servern.');
    // Nothing cached, so the next attempt tries again rather than attaching
    // to an owner that was never created.
    expect(state.ownerId).toBe('');
  });
});
