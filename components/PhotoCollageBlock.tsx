'use client';

import { createReactBlockSpec } from '@blocknote/react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { createContext, useContext, useRef, useState, type ChangeEvent } from 'react';
import {
  decodeCollagePhotos,
  MAX_COLLAGE_PHOTOS,
  photoCollageRows,
  type CollagePhoto,
} from '@/lib/blog-photo-collage';
import type { BlogMediaItem } from './BlogMediaGallery';

const BlogMediaLightbox = dynamic(() => import('./BlogMediaLightbox').then((module) => module.BlogMediaLightbox), {
  ssr: false,
});

export type BeginCollageUpload = () => (() => void) | null;
export const CollageUploadContext = createContext<BeginCollageUpload | null>(null);

export const photoCollageBlock = createReactBlockSpec(
  {
    type: 'photoCollage',
    propSchema: { photos: { default: '[]' } },
    content: 'none',
  },
  {
    render: ({ block, editor }) => {
      const t = useTranslations('tripBlog');
      const photos = decodeCollagePhotos(block.props.photos);
      const items: BlogMediaItem[] = photos.map((photo, index) => ({
        id: photo.id ?? String(index),
        src: photo.props.url,
        filename: t('collagePhotoLabel', { number: index + 1 }),
        kind: 'photo',
      }));
      const input = useRef<HTMLInputElement>(null);
      const beginUpload = useContext(CollageUploadContext);
      const [activeIndex, setActiveIndex] = useState<number | null>(null);
      const [uploading, setUploading] = useState(false);
      const [uploadError, setUploadError] = useState(false);
      const [limitNotice, setLimitNotice] = useState(false);

      function updatePhotos(photos: CollagePhoto[]) {
        editor.updateBlock(block.id, { props: { photos: JSON.stringify(photos) } });
      }

      async function addPhotos(event: ChangeEvent<HTMLInputElement>) {
        const files = Array.from(event.target.files ?? []);
        event.target.value = '';
        if (!files.length || !editor.uploadFile || uploading || !beginUpload) return;
        const finishUpload = beginUpload();
        if (!finishUpload) return;

        const imageFiles = files.filter((file) => file.type.startsWith('image/'));
        const remaining = MAX_COLLAGE_PHOTOS - photos.length;
        setUploading(true);
        setUploadError(imageFiles.length !== files.length);
        setLimitNotice(imageFiles.length > remaining);
        try {
          for (const file of imageFiles.slice(0, remaining)) {
            if (editor.getBlock(block.id)?.type !== 'photoCollage') break;
            try {
              const url = await editor.uploadFile(file);
              const latest = editor.getBlock(block.id);
              if (latest?.type !== 'photoCollage') break;
              if (typeof url !== 'string') {
                setUploadError(true);
                continue;
              }
              const current = decodeCollagePhotos(latest.props.photos);
              if (current.length >= MAX_COLLAGE_PHOTOS) break;
              const photoId = url.split('/').at(-2);
              updatePhotos([...current, {
                id: `${block.id}-${photoId}`,
                type: 'layoutImage',
                props: { url, layout: 'block' },
                children: [],
              }]);
            } catch {
              setUploadError(true);
            }
          }
        } finally {
          setUploading(false);
          finishUpload();
        }
      }

      function tile(item: BlogMediaItem, index: number) {
        return (
          <button className="blog-collage-tile" type="button" aria-label={t('collageOpenPhoto', { name: item.filename })} onClick={() => setActiveIndex(index)}>
            <img src={item.src} alt="" loading="lazy" decoding="async" />
          </button>
        );
      }

      if (!editor.isEditable && items.length === 0) return null;

      let offset = 0;
      return (
        <div className="blog-collage" contentEditable={false}>
          {editor.isEditable && (
            <div className="blog-collage-controls">
              <span role="status">{t('collageCapacity', { count: photos.length, max: MAX_COLLAGE_PHOTOS })}</span>
              <button className="btn btn-outline" type="button" disabled={uploading || photos.length >= MAX_COLLAGE_PHOTOS} onClick={() => input.current?.click()}>
                {uploading ? t('uploading') : t('collageAddPhotos')}
              </button>
              <button className="btn btn-outline" type="button" disabled={uploading} aria-label={t('collageMoveUp')} onClick={() => editor.moveBlocksUp(block.id)}>↑</button>
              <button className="btn btn-outline" type="button" disabled={uploading} aria-label={t('collageMoveDown')} onClick={() => editor.moveBlocksDown(block.id)}>↓</button>
              <button className="btn btn-outline" type="button" disabled={uploading} onClick={() => editor.removeBlocks([block.id])}>{t('collageRemove')}</button>
              <input ref={input} type="file" accept="image/*" multiple hidden onChange={addPhotos} />
            </div>
          )}
          {uploadError && <div className="field-error" role="alert">{t('mediaUploadError')}</div>}
          {limitNotice && <div role="status">{t('collageLimitReached', { max: MAX_COLLAGE_PHOTOS })}</div>}
          {!editor.isEditable && items.length === 1 ? (
            <div className="rte-layout-image rte-layout-image-block">{tile(items[0], 0)}</div>
          ) : items.length > 0 && (
            <div className="blog-collage-grid">
              {photoCollageRows(items.length).map((columns, row) => {
                const rowStart = offset;
                offset += columns;
                return (
                  <div className="blog-collage-row" key={row}>
                    {items.slice(rowStart, offset).map((item, column) => {
                      const index = rowStart + column;
                      return (
                        <div className="blog-collage-slot" key={item.id}>
                          {tile(item, index)}
                          {editor.isEditable && (
                            <button
                              className="blog-collage-remove-photo"
                              type="button"
                              aria-label={t('collageRemovePhoto', { name: item.filename })}
                              disabled={uploading}
                              onClick={() => {
                                setLimitNotice(false);
                                updatePhotos(photos.filter((_, i) => i !== index));
                              }}
                            >×</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
          {activeIndex !== null && (
            <BlogMediaLightbox items={items} index={activeIndex} onClose={() => setActiveIndex(null)} />
          )}
        </div>
      );
    },
  },
);
