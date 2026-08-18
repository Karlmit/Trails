import Image from 'next/image';
import Link from 'next/link';
import type { BlogPostDTO } from '@/components/BlogPostForm';

// spec-blog: one Blog Post's list-item on /trips/[tripId]/blog -- I/O
// matrix: "Both shown on /trips/[tripId]/blog, visually distinguished."
// The Draft/Published badge (.badge-draft / .badge-published, globals.css)
// is that distinction. Same "card + row of Link buttons out to a detail
// page" shape as TripsPage's trip-card (app/(web)/trips/page.tsx) --
// view/edit/publish/unpublish/delete all live on the detail page
// (/trips/[tripId]/blog/[entryId]), not inline here.
// spec-guest-access: `readOnly` accepted for interface parity with
// EntryDetailPanel/BlogPostDetailPanel (Code Map) -- currently a no-op
// since this card has never exposed an edit/delete affordance of its own
// (view/edit/publish/delete all live on the detail page it links to); kept
// so a future inline action added here can't accidentally ship without
// also being Guest-gated.
export function BlogPostCard({ post, readOnly = false }: { post: BlogPostDTO; readOnly?: boolean }) {
  void readOnly;
  const isPublished = post.publishedAt !== null;
  // post.startAt is the Post's own recorded date -- its literal digits, per
  // the same never-timezone-converted contract as a TimelineEntry's own
  // startAt (dateTimeField's comment) -- pinned to UTC explicitly so it's
  // never shifted by the viewer's browser timezone.
  const date = new Date(post.startAt).toLocaleDateString(undefined, {
    timeZone: 'UTC',
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
      {post.primaryPhotoId && (
        <Image
          src={`/api/v1/photos/${post.primaryPhotoId}/file`}
          alt=""
          width={80}
          height={80}
          className="card-cover-photo"
          // See components/PhotoGallery.tsx's identical comment.
          unoptimized
        />
      )}
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
