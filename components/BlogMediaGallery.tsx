'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import styles from './BlogMediaGallery.module.css';

const BlogMediaLightbox = dynamic(() => import('./BlogMediaLightbox').then((module) => module.BlogMediaLightbox), {
  ssr: false,
});

export interface BlogMediaItem {
  id: string;
  src: string;
  filename: string;
  kind: 'photo' | 'video';
}

interface MediaGroup {
  id: string;
  title: string;
  items: BlogMediaItem[];
}

type Filter = 'all' | BlogMediaItem['kind'];
const filters: Filter[] = ['all', 'photo', 'video'];

export function BlogMediaGallery({ groups, tripId }: { groups: MediaGroup[]; tripId: string }) {
  const t = useTranslations('tripPhotos');
  const [filter, setFilter] = useState<Filter>('all');
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const filteredGroups = useMemo(() => groups.flatMap((group) => {
    const items = group.items.filter(({ kind }) => filter === 'all' || kind === filter);
    return items.length ? [{ ...group, items }] : [];
  }), [groups, filter]);
  const visibleItems = useMemo(() => filteredGroups.flatMap((group) => group.items), [filteredGroups]);
  const indices = useMemo(() => new Map(visibleItems.map((item, index) => [item.id, index])), [visibleItems]);

  return (
    <div className={styles.gallery}>
      <div className={styles.filters} role="group" aria-label={t('filter')}>
        {filters.map((option) => (
          <button
            className={`btn ${filter === option ? 'btn-primary' : 'btn-outline'}`}
            key={option}
            type="button"
            aria-pressed={filter === option}
            onClick={() => { setActiveIndex(null); setFilter(option); }}
          >
            {t(option)}
          </button>
        ))}
      </div>
      {filteredGroups.length === 0 && <p className="empty-state">{t('emptyFilter')}</p>}
      {filteredGroups.map((group) => (
        <section key={group.id} aria-labelledby={`blog-photos-${group.id}`}>
          <h3 id={`blog-photos-${group.id}`} className={styles.postTitle}>
            <Link href={`/trips/${tripId}/blog/${group.id}`}>{group.title}</Link>
          </h3>
          <ul className={styles.grid}>
            {group.items.map((item) => (
              <li key={item.id}>
                <button
                  aria-label={t(item.kind === 'photo' ? 'openPhoto' : 'openVideo', { name: item.filename })}
                  className={styles.tile}
                  type="button"
                  onClick={() => setActiveIndex(indices.get(item.id) ?? null)}
                >
                  {item.kind === 'photo' ? (
                    <img className={styles.image} src={item.src} alt="" loading="lazy" decoding="async" />
                  ) : (
                    <span className={styles.videoTile} aria-hidden="true">
                      <span className={styles.play}>▶</span>
                      <span className={styles.filename}>{item.filename}</span>
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {activeIndex !== null && (
        <BlogMediaLightbox items={visibleItems} index={activeIndex} onClose={() => setActiveIndex(null)} />
      )}
    </div>
  );
}
