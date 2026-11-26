'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import Lightbox, { type GenericSlide, type Slide } from 'yet-another-react-lightbox';
import Counter from 'yet-another-react-lightbox/plugins/counter';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';
import 'yet-another-react-lightbox/styles.css';
import 'yet-another-react-lightbox/plugins/counter.css';
import { WebVideoPlayer } from './WebVideoPlayer';
import type { BlogMediaItem } from './BlogMediaGallery';
import styles from './BlogMediaGallery.module.css';

interface BlogVideoSlide extends GenericSlide {
  type: 'blog-video';
  src: string;
  label: string;
}

declare module 'yet-another-react-lightbox' {
  interface SlideTypes {
    'blog-video': BlogVideoSlide;
  }
}

export function BlogMediaLightbox({ items, index, onClose }: {
  items: BlogMediaItem[];
  index: number;
  onClose: () => void;
}) {
  const t = useTranslations('tripPhotos');
  const slides = useMemo<Slide[]>(() => items.map(({ src, filename, kind }) =>
    kind === 'photo' ? { src, alt: filename } : { type: 'blog-video', src, label: filename },
  ), [items]);

  return (
    <Lightbox
      open
      close={onClose}
      index={index}
      slides={slides}
      plugins={[Counter, Zoom]}
      carousel={{ finite: true, preload: 1 }}
      controller={{ closeOnBackdropClick: true, aria: true }}
      labels={{
        Close: t('close'),
        Next: t('next'),
        Previous: t('previous'),
        'Zoom in': t('zoomIn'),
        'Zoom out': t('zoomOut'),
      }}
      render={{
        slide: ({ slide, offset }) => slide.type === 'blog-video' ? (
          <div className={styles.videoSlide} onKeyDown={(event) => {
            // Give the video player's seek controls the arrow keys.
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') event.stopPropagation();
          }}>
            {offset === 0 && <WebVideoPlayer src={slide.src} label={slide.label} />}
          </div>
        ) : undefined,
      }}
    />
  );
}
