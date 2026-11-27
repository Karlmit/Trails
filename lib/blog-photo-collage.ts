export const MAX_COLLAGE_PHOTOS = 9;

const collageRows: readonly (readonly number[])[] = [
  [1], [1, 1], [1, 2],
  [2, 2], [2, 3], [2, 2, 2],
  [2, 2, 3], [2, 3, 3], [3, 3, 3],
];

export function photoCollageRows(count: number): readonly number[] {
  return collageRows[count - 1] ?? [];
}

interface BlogDocumentBlock {
  id?: string;
  type?: string;
  props?: Record<string, unknown>;
  content?: unknown;
  children?: unknown;
}

export interface CollagePhoto extends BlogDocumentBlock {
  type: 'layoutImage';
  props: { url: string; [key: string]: unknown };
}

function isBlock(value: unknown): value is BlogDocumentBlock {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isEmptyChildren(value: unknown): boolean {
  return value == null || (Array.isArray(value) && value.length === 0);
}

function isEmptyContent(value: unknown): boolean {
  return isEmptyChildren(value) || value === '';
}

const photoUrl = /^(?:https?:\/\/[^/?#]+)?\/api\/v1\/photos\/([^/?#]+)\/file$/;

function isCollagePhoto(block: unknown): block is CollagePhoto {
  if (!isBlock(block) || block.type !== 'layoutImage') return false;
  const { url, mediaKind, collage } = block.props ?? {};
  return typeof url === 'string' && photoUrl.test(url) &&
    (mediaKind === undefined || mediaKind === 'image') && collage !== true &&
    isEmptyContent(block.content) && isEmptyChildren(block.children);
}

function readPhotos(value: unknown): CollagePhoto[] | null {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > MAX_COLLAGE_PHOTOS || !value.every(isCollagePhoto)) return null;
  return value;
}

export function decodeCollagePhotos(encoded: unknown): CollagePhoto[] {
  if (typeof encoded !== 'string') return [];
  try {
    return readPhotos(JSON.parse(encoded)) ?? [];
  } catch {
    return [];
  }
}

/** Project only groups that can safely be rendered as a wall of still photos. */
export function projectPhotoCollages(
  blocks: readonly BlogDocumentBlock[],
  visiblePhotoIds?: ReadonlySet<string>,
): BlogDocumentBlock[] {
  return blocks.map((block) => {
    if (!isBlock(block)) return block;
    if (block.type === 'layoutImage' && block.props?.collage === true &&
        (block.props.url == null || block.props.url === '') && isEmptyContent(block.content)) {
      const photos = readPhotos(block.children);
      if (photos !== null) {
        const visiblePhotos = visiblePhotoIds ? photos.filter((photo) => {
          const id = photoUrl.exec(photo.props.url)?.[1];
          return id !== undefined && visiblePhotoIds.has(id);
        }) : photos;
        return { id: block.id, type: 'photoCollage', props: { photos: JSON.stringify(visiblePhotos) }, children: [] };
      }
    }
    return Array.isArray(block.children) ? { ...block, children: projectPhotoCollages(block.children, visiblePhotoIds) } : block;
  });
}

/** Persist ordinary media children so older readers can still traverse the photos in order. */
export function persistPhotoCollages(blocks: readonly BlogDocumentBlock[]): BlogDocumentBlock[] {
  return blocks.flatMap((block) => {
    const children = Array.isArray(block.children) ? persistPhotoCollages(block.children) : [];
    if (block.type === 'photoCollage') {
      const collage = {
        id: block.id,
        type: 'layoutImage',
        props: { collage: true, url: '' },
        children: decodeCollagePhotos(block.props?.photos),
      };
      return [collage, ...children];
    }
    return Array.isArray(block.children) ? { ...block, children } : block;
  });
}
