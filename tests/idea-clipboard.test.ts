import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement, ReactNode } from 'react';

const harness = vi.hoisted(() => ({
  effects: [] as (() => void | (() => void))[],
  setters: [] as ReturnType<typeof vi.fn>[],
  states: [] as unknown[],
  refresh: vi.fn(),
}));
vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useEffect: (effect: () => void | (() => void)) => harness.effects.push(effect),
  useRef: (current: unknown) => ({ current }),
  useState: (initial: unknown) => {
    const setter = vi.fn();
    const index = harness.setters.length;
    harness.setters.push(setter);
    return [index in harness.states ? harness.states[index] : initial, setter];
  },
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: harness.refresh }) }));

import { PhotoGallery } from '@/components/PhotoGallery';
import { IdeaCard, type IdeaDTO } from '@/components/IdeaCard';
import { IdeaForm } from '@/components/IdeaForm';

beforeEach(() => {
  harness.effects = [];
  harness.setters = [];
  harness.states = [];
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllGlobals());

function paste(target: EventTarget, items: { kind: string; type: string; getAsFile: () => File | null }[]) {
  const event = new Event('paste', { cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { items } });
  target.dispatchEvent(event);
  return event;
}
const image = () => {
  const file = new File(['image'], 'clipboard.png', { type: 'image/png' });
  return { kind: 'file', type: file.type, getAsFile: () => file };
};
function gallery(readOnly = false, ensureOwnerId = vi.fn(async () => 'draft-1')) {
  const target = new EventTarget();
  PhotoGallery({ tripId: 'trip-1', ownerType: 'IDEA', ownerId: '', initialPhotos: [],
    readOnly, ensureOwnerId, pasteTargetRef: { current: target as HTMLDivElement } });
  const cleanups = harness.effects.map((effect) => effect());
  return { target, ensureOwnerId, cleanup: () => cleanups.forEach((cleanup) => cleanup?.()) };
}

// Exercise the actual registered native paste listener and multipart upload,
// with hook state isolated from a browser and network responses controlled.
describe('Idea clipboard upload', () => {
  it('resolves a draft owner, uploads the pasted file and refreshes', async () => {
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ id: 'photo-1' }) }));
    vi.stubGlobal('fetch', fetcher);
    const { target, ensureOwnerId } = gallery();
    expect(paste(target, [image()]).defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(harness.refresh).toHaveBeenCalledOnce());
    expect(ensureOwnerId).toHaveBeenCalledOnce();
    const [url, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/photos');
    expect(options.method).toBe('POST');
    const body = options.body as FormData;
    expect(body.get('ownerType')).toBe('IDEA');
    expect(body.get('ownerId')).toBe('draft-1');
    expect((body.get('file') as File).type).toBe('image/png');
  });

  it('preserves text paste and unregisters the listener on cleanup', () => {
    const { target, ensureOwnerId, cleanup } = gallery();
    expect(paste(target, [{ kind: 'string', type: 'text/plain', getAsFile: () => null }]).defaultPrevented).toBe(false);
    cleanup();
    expect(paste(target, [image()]).defaultPrevented).toBe(false);
    expect(ensureOwnerId).not.toHaveBeenCalled();
  });

  it('does not attach a paste listener to read-only galleries', () => {
    const { target, ensureOwnerId } = gallery(true);
    expect(paste(target, [image()]).defaultPrevented).toBe(false);
    expect(ensureOwnerId).not.toHaveBeenCalled();
  });

  it('ignores repeated image pastes while an upload is in flight', async () => {
    const fetcher = vi.fn(() => new Promise(() => {}));
    vi.stubGlobal('fetch', fetcher);
    const { target, ensureOwnerId } = gallery();
    paste(target, [image()]);
    paste(target, [image()]);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    expect(ensureOwnerId).toHaveBeenCalledOnce();
  });

  it('keeps errors visible and permits retry after a failed upload', async () => {
    const fetcher = vi.fn(async () => ({ ok: false, json: async () => null }));
    vi.stubGlobal('fetch', fetcher);
    const { target } = gallery();
    paste(target, [image()]);
    await vi.waitFor(() => expect(harness.setters[3]).toHaveBeenCalledWith('Could not upload this photo.'));
    expect(harness.refresh).not.toHaveBeenCalled();
    paste(target, [image()]);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  });
});

function findElement(node: ReactNode, predicate: (element: ReactElement<Record<string, unknown>>) => boolean): ReactElement<Record<string, unknown>> | undefined {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) return node.map((child) => findElement(child, predicate)).find(Boolean);
  const element = node as ReactElement<Record<string, unknown>>;
  if (predicate(element)) return element;
  return findElement(element.props?.children as ReactNode, predicate);
}
const idea = { id: 'idea-1', tripId: 'trip-1', title: 'Museum' } as IdeaDTO;

describe('saving an Idea edit', () => {
  it('wires a successful save to closing the card editor', () => {
    harness.states = [true];
    const tree = IdeaCard({ idea, sections: [], categoryOptions: [] });
    const form = findElement(tree, (element) => element.type === IdeaForm)!;
    (form.props.onSaved as () => void)();
    expect(harness.setters[0]).toHaveBeenCalledWith(false);
  });

  it.each([true, false])('calls onSaved only on success (ok=%s)', async (ok) => {
    const onSaved = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok, json: async () => ok ? idea : null })));
    const tree = IdeaForm({ mode: 'edit', idea, tripId: 'trip-1', sections: [], categoryOptions: [], onSaved });
    const form = findElement(tree, (element) => element.type === 'form')!;
    await (form.props.onSubmit as (event: { preventDefault: () => void }) => Promise<void>)({ preventDefault: vi.fn() });
    expect(onSaved).toHaveBeenCalledTimes(ok ? 1 : 0);
  });
});
