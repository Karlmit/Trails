import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';
import { prisma } from '@/lib/prisma';
import { getUserFromApiRequest } from '@/lib/auth';
import { Errors } from '@/lib/api-errors';
import { checklistItemUpdateSchema } from '@/lib/validation';
import { serializeChecklistItem } from '@/lib/serializers';
import { isRecordNotFoundError } from '@/lib/db-errors';
import { isUuid } from '@/lib/uuid';

interface RouteParams {
  params: Promise<{ itemId: string }>;
}

// FR-21, spec-checklists: general Item edits AND the checked toggle share
// this one PATCH -- toggling is just a PATCH whose body is `{ checked }`,
// a single request with no confirmation step (spec's "Always" boundary /
// PRD's "single-tap action" consequence). The client fires the request and
// updates its own UI state immediately rather than waiting to re-render
// from the response, but the response still reflects the new state.
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const user = await getUserFromApiRequest(request);
  if (!user) return Errors.unauthorized();

  const { itemId } = await params;
  if (!isUuid(itemId)) return Errors.notFound('Checklist item not found');

  const existing = await prisma.checklistItem.findUnique({ where: { id: itemId } });
  if (!existing) return Errors.notFound('Checklist item not found');

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Errors.validation('Request body must be valid JSON');
  }

  let parsed;
  try {
    parsed = checklistItemUpdateSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      return Errors.validation(err.issues[0]?.message ?? 'Invalid request body');
    }
    throw err;
  }

  try {
    const item = await prisma.checklistItem.update({
      where: { id: itemId },
      data: {
        ...(parsed.text !== undefined && { text: parsed.text }),
        ...(parsed.checked !== undefined && { checked: parsed.checked }),
        ...(parsed.note !== undefined && { note: parsed.note }),
      },
      include: { checklist: true },
    });

    revalidatePath(`/trips/${item.checklist.tripId}/checklists`);

    return NextResponse.json(serializeChecklistItem(item));
  } catch (err) {
    if (isRecordNotFoundError(err)) {
      return Errors.notFound('Checklist item not found');
    }
    throw err;
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const user = await getUserFromApiRequest(request);
  if (!user) return Errors.unauthorized();

  const { itemId } = await params;
  if (!isUuid(itemId)) return Errors.notFound('Checklist item not found');

  const existing = await prisma.checklistItem.findUnique({
    where: { id: itemId },
    include: { checklist: true },
  });
  if (!existing) return Errors.notFound('Checklist item not found');

  try {
    await prisma.checklistItem.delete({ where: { id: itemId } });
  } catch (err) {
    if (isRecordNotFoundError(err)) {
      revalidatePath(`/trips/${existing.checklist.tripId}/checklists`);
      return new NextResponse(null, { status: 204 });
    }
    throw err;
  }

  revalidatePath(`/trips/${existing.checklist.tripId}/checklists`);

  return new NextResponse(null, { status: 204 });
}
