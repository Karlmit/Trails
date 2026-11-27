import { describe, expect, it } from 'vitest';
import {
  decodeCollagePhotos,
  MAX_COLLAGE_PHOTOS,
  persistPhotoCollages,
  photoCollageRows,
  projectPhotoCollages,
} from '../lib/blog-photo-collage';

function photo(id: string) {
  return { id, type: 'layoutImage', props: { url: `/api/v1/photos/${id}/file`, layout: 'block' }, children: [] };
}

function group(children: unknown[]) {
  return { id: 'wall', type: 'layoutImage', props: { collage: true, url: '' }, children };
}

describe('blog photo collages', () => {
  it('projects and restores the ordered original photo blocks alongside ordinary media', () => {
    const photos = [photo('first'), photo('second')];
    const video = { ...photo('clip'), props: { ...photo('clip').props, mediaKind: 'video' } };
    const document = [photo('standalone'), group(photos), video];
    const projected = projectPhotoCollages(document);

    expect(projected.map((block) => block.type)).toEqual(['layoutImage', 'photoCollage', 'layoutImage']);
    expect(decodeCollagePhotos(projected[1].props?.photos)).toEqual(photos);
    expect(persistPhotoCollages(projected)).toEqual(document);
  });

  it('keeps empty and singleton collages editable and round-trips nested groups', () => {
    const empty = group([]);
    const singleton = { ...group([photo('solo')]), id: 'single' };
    const nested = [{ type: 'paragraph', children: [empty, singleton] }];
    const projected = projectPhotoCollages(nested);

    expect(projected[0].children).toMatchObject([
      { type: 'photoCollage', props: { photos: '[]' } },
      { type: 'photoCollage' },
    ]);
    expect(persistPhotoCollages(projected)).toEqual(nested);
  });

  it('keeps content accidentally nested under a collage in document order', () => {
    const collage = group([photo('one'), photo('two')]);
    const paragraph = { type: 'paragraph', content: 'Keep this text' };
    const [projected] = projectPhotoCollages([collage]);

    expect(persistPhotoCollages([{ ...projected, children: [paragraph] }])).toEqual([collage, paragraph]);
  });

  it('limits guest tiles to authorized originals without filtering ordinary media or the author view', () => {
    const ordinary = photo('standalone');
    const photos = [photo('private'), photo('visible'), photo('deleted')];
    const [author] = projectPhotoCollages([group(photos)]);
    const [guest, guestOrdinary] = projectPhotoCollages([group(photos), ordinary], new Set(['visible']));
    const [emptyGuest] = projectPhotoCollages([group(photos)], new Set());

    expect(decodeCollagePhotos(author.props?.photos)).toEqual(photos);
    expect(decodeCollagePhotos(guest.props?.photos)).toEqual([photos[1]]);
    expect(decodeCollagePhotos(emptyGuest.props?.photos)).toEqual([]);
    expect(guestOrdinary).toEqual(ordinary);
  });

  it('leaves malformed, interrupted and mixed-media groups available to ordinary traversal', () => {
    const video = { ...photo('clip'), props: { ...photo('clip').props, mediaKind: 'video' } };
    const paragraph = { type: 'paragraph', content: 'Nested text' };
    const groups = [
      group([photo('first'), { ...photo('incomplete'), props: { url: '' } }]),
      group([photo('first'), video]),
      group([{ ...photo('first'), children: [paragraph] }]),
      group(Array.from({ length: MAX_COLLAGE_PHOTOS + 1 }, (_, index) => photo(String(index)))),
      { ...group([photo('first')]), props: { collage: true, url: '/api/v1/photos/cover/file' } },
    ];
    expect(projectPhotoCollages(groups)).toEqual(groups);
  });

  it('uses the same ordered row sizes as Android up to the picker capacity', () => {
    expect(Array.from({ length: MAX_COLLAGE_PHOTOS }, (_, index) => photoCollageRows(index + 1))).toEqual([
      [1], [1, 1], [1, 2], [2, 2], [2, 3], [2, 2, 2], [2, 2, 3], [2, 3, 3], [3, 3, 3],
    ]);
    expect(photoCollageRows(0)).toEqual([]);
    expect(photoCollageRows(MAX_COLLAGE_PHOTOS + 1)).toEqual([]);
  });
});
