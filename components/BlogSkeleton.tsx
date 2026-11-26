import type { ReactNode } from 'react';

function Skeleton({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="blog-skeleton" role="status" aria-label={label}>
      <div className="blog-skeleton-shapes" aria-hidden="true">{children}</div>
    </div>
  );
}

export function BlogBodySkeleton({ label }: { label: string }) {
  return (
    <Skeleton label={label}>
      <ArticleLines />
    </Skeleton>
  );
}

function ArticleLines() {
  return (
    <>
      <div className="blog-skeleton-line" />
      <div className="blog-skeleton-line blog-skeleton-line-long" />
      <div className="blog-skeleton-line blog-skeleton-line-short" />
      <div className="blog-skeleton-media" />
    </>
  );
}

export function BlogPageSkeleton({ label, article = false }: { label: string; article?: boolean }) {
  return (
    <main className={article ? 'page blog-reader-page' : 'page'}>
      <Skeleton label={label}>
        {article ? (
          <div className="card stack blog-reader-card">
            <div className="blog-skeleton-title" />
            <div className="blog-skeleton-line blog-skeleton-line-short" />
            <ArticleLines />
          </div>
        ) : (
          <>
            <div className="blog-skeleton-title" />
            {[1, 2, 3].map((card) => (
              <div className="card stack" key={card}>
                <div className="blog-skeleton-line blog-skeleton-line-short" />
                <div className="blog-skeleton-line" />
                <div className="blog-skeleton-line blog-skeleton-line-long" />
              </div>
            ))}
          </>
        )}
      </Skeleton>
    </main>
  );
}
