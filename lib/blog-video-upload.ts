import { createSHA256 } from 'hash-wasm';

const CHUNK_BYTES = 256 * 1024;

export async function uploadBlogVideo(file: File, postId: string): Promise<string> {
  const hash = await createSHA256();
  for (let offset = 0; offset < file.size; offset += CHUNK_BYTES) {
    hash.update(new Uint8Array(await file.slice(offset, offset + CHUNK_BYTES).arrayBuffer()));
  }
  const random = crypto.getRandomValues(new Uint8Array(16));
  random[6] = (random[6] & 15) | 64;
  random[8] = (random[8] & 63) | 128;
  const hex = Array.from(random, (byte) => byte.toString(16).padStart(2, '0')).join('');
  const uploadId = [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
  const url = `/api/v1/blog-photo-uploads/${postId}/${uploadId}?size=${file.size}`;
  const headers = {
    'X-Photo-Name': encodeURIComponent(file.name.slice(0, 255)),
    'X-Photo-Mime': file.type,
    'X-Photo-Sha256': hash.digest('hex'),
  };

  let part = 0;
  while (part * CHUNK_BYTES < file.size) {
    const body = file.slice(part * CHUNK_BYTES, (part + 1) * CHUNK_BYTES, 'application/octet-stream');
    const response = await fetch(`${url}&part=${part}`, { method: 'PUT', headers, body });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.error?.message ?? 'Could not upload this video.');
    if (result?.photo?.id) return `/api/v1/photos/${result.photo.id}/file`;
    if (!Number.isSafeInteger(result?.nextPart) || result.nextPart <= part) break;
    part = result.nextPart;
  }
  throw new Error('The video upload did not finish.');
}
