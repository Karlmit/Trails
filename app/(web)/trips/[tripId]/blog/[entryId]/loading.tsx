import { getTranslations } from 'next-intl/server';
import { BlogPageSkeleton } from '@/components/BlogSkeleton';

export default async function Loading() {
  const t = await getTranslations('tripBlog');
  return <BlogPageSkeleton article label={t('loading')} />;
}
