import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';
import { prisma } from '@/lib/prisma';
import { getUserFromApiRequest } from '@/lib/auth';
import { Errors } from '@/lib/api-errors';
import { checklistUpdateSchema } from '@/lib/validation';
import { serializeChecklist, serializeChecklistItem } from '@/lib/serializers';
import { isRecordNotFoundError } from '@/lib/db-errors';
import { isUuid } from '@/lib/uuid';

interface RouteParams {
  params: Promise<{ checklistId: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const user = await getUserFromApiRequest(request);
  if (!user) return Errors.unauthorized();

  const { checklistId } = await params;
  if (!isUuid(checklistId)) return Errors.notFound('Checklist not found');

  const existing = await prisma.checklist.findUnique({ where: { id: checklistId } });
  if (!existing) return Errors.notFound('Checklist not found');

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Errors.validation('Request body must be valid JSON');
  }

  let parsed;
  try {
    parsed = checklistUpdateSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      return Errors.validation(err.issues[0]?.message ?? 'Invalid request body');
    }
    throw err;
  }

  try {
    const checklist = await prisma.checklist.update({
      where: { id: checklistId },
      data: {
        ...(parsed.title !== undefined && { title: parsed.title }),
        ...(parsed.description !== undefined && { description: parsed.description }),
        ...(parsed.isPrivate !== undefined && { isPrivate: parsed.isPrivate }),
      },
      include: { items: { orderBy: { createdAt: 'asc' } } },
    });

    revalidatePath(`/trips/${existing.tripId}/checklists`);

    return NextResponse.json({
      ...serializeChecklist(checklist),
      items: checklist.items.map(serializeChecklistItem),
    });
  } catch (err) {
    if (isRecordNotFoundError(err)) {
      return Errors.notFound('Checklist not found');
    }
    throw err;
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const user = await getUserFromApiRequest(request);
  if (!user) return Errors.unauthorized();

  const { checklistId } = await params;
  if (!isUuid(checklistId)) return Errors.notFound('Checklist not found');

  const existing = await prisma.checklist.findUnique({ where: { id: checklistId } });
  if (!existing) return Errors.notFound('Checklist not found');

  try {
    // Deleting a Checklist cascades to its Items at the database layer
    // (onDelete: Cascade, prisma/migrations/20260817164155_checklists) --
    // nothing to un-assign or delete separately here.
    await prisma.checklist.delete({ where: { id: checklistId } });
  } catch (err) {
    if (isRecordNotFoundError(err)) {
      revalidatePath(`/trips/${existing.tripId}/checklists`);
      return new NextResponse(null, { status: 204 });
    }
    throw err;
  }

  revalidatePath(`/trips/${existing.tripId}/checklists`);

  return new NextResponse(null, { status: 204 });
}
