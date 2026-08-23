import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';
import { prisma } from '@/lib/prisma';
import { getUserFromApiRequest } from '@/lib/auth';
import { Errors } from '@/lib/api-errors';
import { checklistItemCreateSchema } from '@/lib/validation';
import { serializeChecklistItem } from '@/lib/serializers';
import { isForeignKeyViolationError } from '@/lib/db-errors';
import { isUuid } from '@/lib/uuid';
import { canViewChecklist } from '@/lib/checklist-access';

// FR-21, spec-checklists: ChecklistItem create (+ list-by-checklist), same
// conventions as app/api/v1/checklists.

export async function GET(request: NextRequest) {
  const user = await getUserFromApiRequest(request);
  if (!user) return Errors.unauthorized();

  const checklistId = request.nextUrl.searchParams.get('checklistId');
  if (!checklistId) return Errors.validation('checklistId query parameter is required');
  if (!isUuid(checklistId)) {
    return Errors.validation('checklistId query parameter must be a valid UUID');
  }

  // A private Checklist's Items are just as invisible to a non-creator as
  // the Checklist itself -- otherwise this endpoint would leak them
  // straight past the list endpoint's own filtering.
  const checklist = await prisma.checklist.findUnique({ where: { id: checklistId } });
  if (!checklist || !canViewChecklist(checklist, user)) return Errors.notFound('Checklist not found');

  const items = await prisma.checklistItem.findMany({
    where: { checklistId },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json(items.map(serializeChecklistItem));
}

export async function POST(request: NextRequest) {
  const user = await getUserFromApiRequest(request);
  if (!user) return Errors.unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Errors.validation('Request body must be valid JSON');
  }

  let parsed;
  try {
    parsed = checklistItemCreateSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      return Errors.validation(err.issues[0]?.message ?? 'Invalid request body');
    }
    throw err;
  }

  const checklist = await prisma.checklist.findUnique({ where: { id: parsed.checklistId } });
  if (!checklist) return Errors.notFound('Checklist not found');
  if (!canViewChecklist(checklist, user)) return Errors.notFound('Checklist not found');

  try {
    const item = await prisma.checklistItem.create({
      data: {
        checklistId: parsed.checklistId,
        text: parsed.text,
        note: parsed.note ?? null,
        // New items always start unchecked (I/O matrix: "appears
        // unchecked in the list") -- `checked` is never accepted on create.
      },
    });

    revalidatePath(`/trips/${checklist.tripId}/checklists`);

    return NextResponse.json(serializeChecklistItem(item), { status: 201 });
  } catch (err) {
    if (isForeignKeyViolationError(err)) {
      // The parent Checklist existed at the check above but was deleted by
      // another request before this insert committed.
      return Errors.notFound('Checklist not found');
    }
    throw err;
  }
}
