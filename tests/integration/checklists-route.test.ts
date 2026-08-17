import { NextRequest } from 'next/server';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { hasTestDatabase, resetDb, testPrisma } from '../helpers/db';
import { GET as listChecklists, POST as createChecklist } from '@/app/api/v1/checklists/route';
import {
  DELETE as deleteChecklist,
  PATCH as patchChecklist,
} from '@/app/api/v1/checklists/[checklistId]/route';
import { POST as createItem } from '@/app/api/v1/checklist-items/route';
import {
  DELETE as deleteItem,
  PATCH as patchItem,
} from '@/app/api/v1/checklist-items/[itemId]/route';
import { issueSession } from '@/lib/session';

function jsonRequest(url: string, method: string, body: unknown | undefined, token?: string) {
  return new NextRequest(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

function checklistParams(checklistId: string) {
  return { params: Promise.resolve({ checklistId }) };
}

function itemParams(itemId: string) {
  return { params: Promise.resolve({ itemId }) };
}

const UNKNOWN_ID = '11111111-1111-4111-8111-111111111111';

// FR-21, spec-checklists: Checklist + ChecklistItem CRUD, mirroring
// app/api/v1/sections' Route Handler conventions -- covers the spec's I/O
// matrix. Requires a live Postgres via DATABASE_URL.
describe.skipIf(!hasTestDatabase)('checklists route', () => {
  let token: string;
  let tripId: string;

  beforeEach(async () => {
    await resetDb();
    const user = await testPrisma().user.create({
      data: { username: 'sara', passwordHash: 'irrelevant', role: 'ADMIN' },
    });
    token = (await issueSession(user.id)).token;

    const trip = await testPrisma().trip.create({
      data: {
        name: 'Thailand',
        startDate: new Date('2026-08-01T00:00:00.000Z'),
        endDate: new Date('2026-08-20T00:00:00.000Z'),
        timezone: 'Asia/Bangkok',
      },
    });
    tripId = trip.id;
  });

  afterAll(async () => {
    await testPrisma().$disconnect();
  });

  it('creates a Checklist with a valid title (201, appears in the list)', async () => {
    const res = await createChecklist(
      jsonRequest('http://localhost/api/v1/checklists', 'POST', { tripId, title: 'Packing list' }, token),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.title).toBe('Packing list');
    expect(body.items).toEqual([]);

    const listRes = await listChecklists(
      jsonRequest(`http://localhost/api/v1/checklists?tripId=${tripId}`, 'GET', undefined, token),
    );
    const list = await listRes.json();
    expect(list.map((c: { id: string }) => c.id)).toContain(body.id);
  });

  it('rejects a missing title (400)', async () => {
    const res = await createChecklist(
      jsonRequest('http://localhost/api/v1/checklists', 'POST', { tripId }, token),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('404s when the parent Trip does not exist', async () => {
    const res = await createChecklist(
      jsonRequest('http://localhost/api/v1/checklists', 'POST', { tripId: UNKNOWN_ID, title: 'Orphan' }, token),
    );
    expect(res.status).toBe(404);
  });

  it('rejects an unauthenticated create (401)', async () => {
    const res = await createChecklist(
      jsonRequest('http://localhost/api/v1/checklists', 'POST', { tripId, title: 'Packing list' }),
    );
    expect(res.status).toBe(401);
  });

  describe('items', () => {
    let checklistId: string;

    beforeEach(async () => {
      const res = await createChecklist(
        jsonRequest('http://localhost/api/v1/checklists', 'POST', { tripId, title: 'Packing list' }, token),
      );
      checklistId = (await res.json()).id;
    });

    it('adds an item with valid text (201, appears unchecked)', async () => {
      const res = await createItem(
        jsonRequest('http://localhost/api/v1/checklist-items', 'POST', { checklistId, text: 'Passport' }, token),
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.text).toBe('Passport');
      expect(body.checked).toBe(false);
    });

    it('rejects a missing text (400)', async () => {
      const res = await createItem(
        jsonRequest('http://localhost/api/v1/checklist-items', 'POST', { checklistId }, token),
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('404s when the parent Checklist does not exist', async () => {
      const res = await createItem(
        jsonRequest('http://localhost/api/v1/checklist-items', 'POST', { checklistId: UNKNOWN_ID, text: 'Passport' }, token),
      );
      expect(res.status).toBe(404);
    });

    it('rejects an unauthenticated add (401)', async () => {
      const res = await createItem(
        jsonRequest('http://localhost/api/v1/checklist-items', 'POST', { checklistId, text: 'Passport' }),
      );
      expect(res.status).toBe(401);
    });

    describe('toggle + delete', () => {
      let item1Id: string;
      let item2Id: string;
      let item3Id: string;

      beforeEach(async () => {
        const res1 = await createItem(
          jsonRequest('http://localhost/api/v1/checklist-items', 'POST', { checklistId, text: 'Passport' }, token),
        );
        item1Id = (await res1.json()).id;
        const res2 = await createItem(
          jsonRequest('http://localhost/api/v1/checklist-items', 'POST', { checklistId, text: 'Sunscreen' }, token),
        );
        item2Id = (await res2.json()).id;
        const res3 = await createItem(
          jsonRequest('http://localhost/api/v1/checklist-items', 'POST', { checklistId, text: 'Charger' }, token),
        );
        item3Id = (await res3.json()).id;
      });

      it('flips only the toggled item\'s checked state, leaving siblings untouched', async () => {
        const res = await patchItem(
          jsonRequest(`http://localhost/api/v1/checklist-items/${item2Id}`, 'PATCH', { checked: true }, token),
          itemParams(item2Id),
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.checked).toBe(true);

        const item1 = await testPrisma().checklistItem.findUnique({ where: { id: item1Id } });
        const item3 = await testPrisma().checklistItem.findUnique({ where: { id: item3Id } });
        expect(item1?.checked).toBe(false);
        expect(item3?.checked).toBe(false);
      });

      it('returns 404 for a PATCH to an unknown/malformed item id', async () => {
        const res = await patchItem(
          jsonRequest(`http://localhost/api/v1/checklist-items/${UNKNOWN_ID}`, 'PATCH', { checked: true }, token),
          itemParams(UNKNOWN_ID),
        );
        expect(res.status).toBe(404);

        const malformedRes = await patchItem(
          jsonRequest('http://localhost/api/v1/checklist-items/not-a-uuid', 'PATCH', { checked: true }, token),
          itemParams('not-a-uuid'),
        );
        expect(malformedRes.status).toBe(404);
      });

      it('rejects an unauthenticated toggle (401)', async () => {
        const res = await patchItem(
          jsonRequest(`http://localhost/api/v1/checklist-items/${item1Id}`, 'PATCH', { checked: true }),
          itemParams(item1Id),
        );
        expect(res.status).toBe(401);
      });

      it('deletes a single item (204), leaving the Checklist and its siblings', async () => {
        const res = await deleteItem(
          jsonRequest(`http://localhost/api/v1/checklist-items/${item1Id}`, 'DELETE', undefined, token),
          itemParams(item1Id),
        );
        expect(res.status).toBe(204);

        const remainingItems = await testPrisma().checklistItem.count({ where: { checklistId } });
        expect(remainingItems).toBe(2);
        const checklist = await testPrisma().checklist.findUnique({ where: { id: checklistId } });
        expect(checklist).not.toBeNull();
      });

      it('returns 404 for a DELETE of an unknown item id', async () => {
        const res = await deleteItem(
          jsonRequest(`http://localhost/api/v1/checklist-items/${UNKNOWN_ID}`, 'DELETE', undefined, token),
          itemParams(UNKNOWN_ID),
        );
        expect(res.status).toBe(404);
      });

      it('deletes the Checklist (204) and cascades its items away', async () => {
        const res = await deleteChecklist(
          jsonRequest(`http://localhost/api/v1/checklists/${checklistId}`, 'DELETE', undefined, token),
          checklistParams(checklistId),
        );
        expect(res.status).toBe(204);

        const remainingChecklists = await testPrisma().checklist.count();
        expect(remainingChecklists).toBe(0);
        const remainingItems = await testPrisma().checklistItem.count();
        expect(remainingItems).toBe(0);
      });

      it('rejects an unauthenticated delete of the Checklist (401)', async () => {
        const res = await deleteChecklist(
          jsonRequest(`http://localhost/api/v1/checklists/${checklistId}`, 'DELETE', undefined),
          checklistParams(checklistId),
        );
        expect(res.status).toBe(401);

        const remaining = await testPrisma().checklist.count();
        expect(remaining).toBe(1);
      });
    });
  });

  describe('checklist PATCH', () => {
    let checklistId: string;

    beforeEach(async () => {
      const res = await createChecklist(
        jsonRequest('http://localhost/api/v1/checklists', 'POST', { tripId, title: 'Packing list' }, token),
      );
      checklistId = (await res.json()).id;
    });

    it('updates title/description via PATCH', async () => {
      const res = await patchChecklist(
        jsonRequest(`http://localhost/api/v1/checklists/${checklistId}`, 'PATCH', {
          title: 'Packing list (updated)',
          description: 'Everything for the trip',
        }, token),
        checklistParams(checklistId),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.title).toBe('Packing list (updated)');
      expect(body.description).toBe('Everything for the trip');
    });

    it('returns 404 for a PATCH to an unknown/malformed checklist id', async () => {
      const res = await patchChecklist(
        jsonRequest(`http://localhost/api/v1/checklists/${UNKNOWN_ID}`, 'PATCH', { title: 'Nope' }, token),
        checklistParams(UNKNOWN_ID),
      );
      expect(res.status).toBe(404);
    });
  });
});
