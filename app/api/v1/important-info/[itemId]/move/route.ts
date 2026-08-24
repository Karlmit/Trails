import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getUserFromApiRequest } from '@/lib/auth';
import { Errors } from '@/lib/api-errors';
import { serializeImportantInfo } from '@/lib/serializers';
import { isUuid } from '@/lib/uuid';

interface RouteParams {
  params: Promise<{ itemId: string }>;
}

// User-requested manual reordering. Same small action-endpoint convention
// as app/api/v1/photos/[photoId]/primary/route.ts: load the Trip's own
// items in their current order, find the target's neighbor in the
// requested direction, and swap their two `sortOrder` values inside one
// `$transaction` -- a 400 (not a 404/500) when there's no such neighbor
// (already first/last), since that's a normal, expected outcome, not an
// error condition.
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const user = await getUserFromApiRequest(request);
  if (!user) return Errors.unauthorized();

  const { itemId } = await params;
  if (!isUuid(itemId)) return Errors.notFound('Important Info item not found');

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Errors.validation('Request body must be valid JSON');
  }

  const direction = (body as { direction?: unknown })?.direction;
  if (direction !== 'up' && direction !== 'down') {
    return Errors.validation('direction must be "up" or "down"');
  }

  const target = await prisma.importantInfo.findUnique({ where: { id: itemId } });
  if (!target) return Errors.notFound('Important Info item not found');

  const siblings = await prisma.importantInfo.findMany({
    where: { tripId: target.tripId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  const index = siblings.findIndex((item) => item.id === itemId);
  const neighborIndex = direction === 'up' ? index - 1 : index + 1;
  const neighbor = siblings[neighborIndex];
  if (!neighbor) {
    return Errors.validation(`This item is already ${direction === 'up' ? 'first' : 'last'}`);
  }

  await prisma.$transaction([
    prisma.importantInfo.update({ where: { id: target.id }, data: { sortOrder: neighbor.sortOrder } }),
    prisma.importantInfo.update({ where: { id: neighbor.id }, data: { sortOrder: target.sortOrder } }),
  ]);

  const updated = await prisma.importantInfo.findUnique({ where: { id: itemId } });
  revalidatePath(`/trips/${target.tripId}/important-info`);

  return NextResponse.json(serializeImportantInfo(updated!));
}
