'use client';

import dynamic from 'next/dynamic';
import { useLocale, useTranslations } from 'next-intl';
import { BlogBodySkeleton } from '@/components/BlogSkeleton';
import { formatEntryEndpointDateOnly } from '@/lib/trip-status';

const RichTextView = dynamic(() => import('@/components/RichTextEditor').then((m) => m.RichTextView), {
  ssr: false,
  loading: () => {
    const t = useTranslations('tripBlog');
    return <BlogBodySkeleton label={t('loading')} />;
  },
});

export function BlogReaderContent({ title, startAt, description, visibleCollagePhotoIds }: {
  title: string;
  startAt: string;
  description: string | null;
  visibleCollagePhotoIds?: ReadonlySet<string>;
}) {
  const t = useTranslations('tripBlog');
  const locale = useLocale();

  return (
    <>
      <h2 style={{ margin: 0 }}>{title}</h2>
      {startAt && (
        <dl style={{ margin: 0 }}>
          <dt className="text-soft" style={{ fontSize: '0.8rem', textTransform: 'uppercase' }}>{t('dateLabel')}</dt>
          <dd style={{ margin: 0 }}>{formatEntryEndpointDateOnly(new Date(startAt), null, locale)}</dd>
        </dl>
      )}
      {description && <RichTextView content={description} visibleCollagePhotoIds={visibleCollagePhotoIds} />}
    </>
  );
}
