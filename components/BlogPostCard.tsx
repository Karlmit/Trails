import Link from 'next/link';
import type { BlogPostDTO } from '@/components/BlogPostForm';

// spec-blog: one Blog Post's list-item on /trips/[tripId]/blog -- I/O
// matrix: "Both shown on /trips/[tripId]/blog, visually distinguished."
// The Draft/Published badge (.badge-draft / .badge-published, globals.css)
// is that distinction. Same "card + row of Link buttons out to a detail
// page" shape as TripsPage's trip-card (app/(web)/trips/page.tsx) --
// view/edit/publish/unpublish/delete all live on the detail page
// (/trips/[tripId]/blog/[entryId]), not inline here.
export function BlogPostCard({ post }: { post: BlogPostDTO }) {
  const isPublished = post.publishedAt !== null;
  const date = new Date(post.startAt).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="card stack">
      <div className="row-between">
        <h3 style={{ margin: 0 }}>{post.title}</h3>
        <span className={`badge ${isPublished ? 'badge-published' : 'badge-draft'}`}>
          {isPublished ? 'Published' : 'Draft'}
        </span>
      </div>
      <div className="text-soft">{date}</div>
      {post.description && (
        <p className="text-soft text-multiline" style={{ margin: 0 }}>
          {post.description.length > 240 ? `${post.description.slice(0, 240)}…` : post.description}
        </p>
      )}
      <div className="row">
        <Link href={`/trips/${post.tripId}/blog/${post.id}`} className="btn btn-outline">
          Open
        </Link>
      </div>
    </div>
  );
}
