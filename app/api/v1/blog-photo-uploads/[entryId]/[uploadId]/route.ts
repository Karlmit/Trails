import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { access, link, mkdir, readFile, readdir, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getUserFromApiRequest } from '@/lib/auth';
import { Errors } from '@/lib/api-errors';
import { isForeignKeyViolationError, isUniqueConstraintViolationError } from '@/lib/db-errors';
import { buildUploadPath, isAllowedMimeType, isBlogVideoMimeType, UPLOAD_ROOT } from '@/lib/photos';
import { prisma } from '@/lib/prisma';
import { serializePhoto } from '@/lib/serializers';
import { isUuid } from '@/lib/uuid';

const PART_BYTES = 256 * 1024;
const STAGING_ROOT = path.join(UPLOAD_ROOT, '.blog-photo-uploads');
const STALE_MS = 7 * 24 * 60 * 60 * 1000;
let nextSweep = 0;

type RouteParams = { params: Promise<{ entryId: string; uploadId: string }> };

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function photoIdFor(values: Array<string | number>): string {
  const hex = sha256(JSON.stringify(values)).slice(0, 32);
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}

async function listParts(directory: string): Promise<Set<string>> {
  try {
    return new Set(await readdir(directory));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new Set();
    throw error;
  }
}

async function sweepOldUploads() {
  const now = Date.now();
  if (now < nextSweep) return;
  nextSweep = now + 60 * 60 * 1000;
  for (const id of await listParts(STAGING_ROOT)) {
    if (!isUuid(id)) continue;
    const directory = path.join(STAGING_ROOT, id);
    const info = await stat(directory).catch(() => null);
    // A directory's mtime advances whenever a new part is added.
    if (info?.isDirectory() && now - info.mtimeMs > STALE_MS) {
      await rm(directory, { recursive: true, force: true });
    }
  }
}

async function putPart(directory: string, index: number, bytes: Buffer) {
  await mkdir(directory, { recursive: true });
  const temporary = path.join(directory, randomUUID() + '.tmp');
  try {
    await writeFile(temporary, bytes, { flag: 'wx' });
    await link(temporary, path.join(directory, String(index))).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'EEXIST') throw error;
    });
  } finally {
    await unlink(temporary).catch(() => {});
  }
}

async function uploadCheckpoint(directory: string, parts: number): Promise<number> {
  const marker = path.join(directory, 'checkpoint');
  let next = 0;
  try {
    const saved = Number(await readFile(marker, 'utf8'));
    if (Number.isSafeInteger(saved) && saved >= 0 && saved <= parts) next = saved;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  while (next < parts) {
    try {
      await access(path.join(directory, String(next)));
      next++;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      break;
    }
  }
  if (next < parts) {
    const temp = path.join(directory, randomUUID() + '.tmp');
    try {
      await writeFile(temp, String(next), { flag: 'wx' });
      await rename(temp, marker);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    } finally {
      await unlink(temp).catch(() => {});
    }
  }
  return next;
}

async function handle(request: NextRequest, params: RouteParams['params']) {
  const user = await getUserFromApiRequest(request);
  if (!user) return Errors.unauthorized();

  const { entryId, uploadId } = await params;
  if (!isUuid(entryId) || !isUuid(uploadId)) return Errors.validation('Invalid upload identifier');

  const query = request.nextUrl.searchParams;
  let filename: string;
  try {
    filename = decodeURIComponent(request.headers.get('x-photo-name') ?? '');
  } catch {
    return Errors.validation('Invalid photo filename');
  }
  const mime = request.headers.get('x-photo-mime') ?? '';
  const digest = request.headers.get('x-photo-sha256') ?? '';
  const size = Number(query.get('size'));
  if (!filename || filename.length > 255 || (!isAllowedMimeType(mime) && !isBlogVideoMimeType(mime)) || !/^[a-f0-9]{64}$/.test(digest) ||
      !Number.isSafeInteger(size) || size < 1) {
    return Errors.validation('Invalid photo upload metadata');
  }
  const owner = await prisma.timelineEntry.findFirst({
    where: { id: entryId, entryType: 'BLOG_POST' },
    select: { tripId: true },
  });
  if (!owner) return Errors.notFound('Blog post not found');

  const id = photoIdFor([user.id, entryId, uploadId, digest, size, mime, filename]);
  const parts = Math.ceil(size / PART_BYTES);
  const directory = path.join(STAGING_ROOT, id);
  const existing = await prisma.photo.findUnique({ where: { id } });
  if (existing) return NextResponse.json({ nextPart: parts, photo: serializePhoto(existing) });

  await sweepOldUploads().catch(() => {});
  if (request.method === 'PUT') {
    const indexText = query.get('part') ?? '';
    const index = Number(indexText);
    if (!/^\d+$/.test(indexText) || !Number.isSafeInteger(index) || index >= parts) {
      return Errors.validation('Invalid photo upload chunk');
    }
    const expected = Math.min(PART_BYTES, size - index * PART_BYTES);
    if (Number(request.headers.get('content-length')) !== expected) {
      return Errors.validation('Incorrect photo chunk size');
    }
    const bytes = Buffer.from(await request.arrayBuffer());
    if (bytes.length !== expected) return Errors.validation('Incomplete photo chunk');
    await putPart(directory, index, bytes);
  }

  let nextPart: number;
  if (request.method === 'PUT') {
    nextPart = await uploadCheckpoint(directory, parts);
  } else {
    const stored = await listParts(directory);
    nextPart = 0;
    while (nextPart < parts && stored.has(String(nextPart))) nextPart++;
  }
  if (nextPart < parts) {
    // A concurrent finalizer may already have committed and removed the chunks.
    const completed = await prisma.photo.findUnique({ where: { id } });
    return NextResponse.json(completed ? { nextPart: parts, photo: serializePhoto(completed) } : { nextPart });
  }

  if (request.method === 'GET') return NextResponse.json({ nextPart: parts - 1 });

  const filePath = buildUploadPath(owner.tripId, 'TIMELINE_ENTRY', entryId, filename);
  await mkdir(path.dirname(filePath), { recursive: true });
  let photo;
  try {
    const hash = createHash('sha256');
    let written = 0;
    async function* verifiedParts() {
      for (let index = 0; index < parts; index++) {
        const chunk = await readFile(path.join(directory, String(index)));
        written += chunk.length;
        hash.update(chunk);
        yield chunk;
      }
    }
    await pipeline(verifiedParts(), createWriteStream(filePath, { flags: 'wx' }));
    if (written !== size || hash.digest('hex') !== digest) {
      await rm(directory, { recursive: true, force: true });
      await unlink(filePath);
      return Errors.validation('Photo verification failed. Retry the upload.');
    }
    photo = await prisma.photo.create({
      data: {
        id, tripId: owner.tripId, ownerType: 'TIMELINE_ENTRY', ownerId: entryId, filePath,
        mimeType: mime, sizeBytes: BigInt(size), originalFilename: filename,
      },
    });
  } catch (error) {
    await unlink(filePath).catch(() => {});
    if (isForeignKeyViolationError(error)) return Errors.notFound('Blog post not found');
    if (isUniqueConstraintViolationError(error) || (error as NodeJS.ErrnoException).code === 'ENOENT') {
      photo = await prisma.photo.findUnique({ where: { id } });
    }
    if (!photo) throw error;
  }

  await rm(directory, { recursive: true, force: true }).catch(() => {});
  revalidatePath(`/trips/${owner.tripId}/blog/${entryId}`);
  return NextResponse.json({ nextPart: parts, photo: serializePhoto(photo) });
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  return handle(request, params);
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  return handle(request, params);
}
