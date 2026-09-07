'use client';

import { useTranslations } from 'next-intl';
import { translateApiError } from '@/lib/api-error-messages';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { IdeaForm } from '@/components/IdeaForm';

const PRIORITY_CHIP_CLASS: Record<string, string> = {
  MUST_DO: 'idea-chip-must-do',
  WOULD_LIKE: 'idea-chip-would-like',
  MAYBE: 'idea-chip-maybe',
};

export interface IdeaCardLink {
  id: string;
  url: string;
  label: string | null;
}

/**
 * An unlabelled Link falls back to its own hostname, which is a friendlier
 * thing to click than a full URL. `new URL()` throws on a malformed value --
 * lib/links.ts validates on the way in, so this is defensive only, and a
 * row that predates that validation should still render as *something*
 * rather than blanking the whole Ideas page.
 */
function linkText(link: IdeaCardLink): string {
  if (link.label) return link.label;
  try {
    return new URL(link.url).hostname.replace(/^www\./, '');
  } catch {
    return link.url;
  }
}

export interface IdeaDTO {
  id: string;
  tripId: string;
  sectionId?: string | null;
  title: string;
  category: string | null;
  description: string | null;
  priority: string;
  weatherSuitability: string;
  locationName: string | null;
  locationAddress: string | null;
  locationMapLink: string | null;
  estimatedExpenseAmount: number | null;
  estimatedExpenseCurrency: string | null;
  // spec-tags-links-photos: the owning Idea's Cover Photo id, if any
  // (app/(web)/trips/[tripId]/ideas/page.tsx queries Photo directly and
  // attaches this per Idea) -- FR-15's "thumbnail in list views", rendered
  // via the same `/api/v1/photos/[id]/file` URL PhotoGallery uses.
  primaryPhotoId?: string | null;
  // How many Photos the Idea has in total. The card face shows only the
  // Cover, so >1 is worth saying out loud rather than hiding.
  photoCount?: number;
  // Passed down from the page's own Prisma query rather than self-fetched
  // per card -- see that file's comment.
  links?: IdeaCardLink[];
}

// FR-16/FR-17, spec-ideas: a single Idea's card in the shortlist grid, same
// view<->edit toggle pattern as ImportantInfoCard (edit mode swaps in
// IdeaForm, which itself owns Links/Photos -- see that component).
// User-requested: Section reassignment, Delete, and Links/Photos are only
// available while editing -- the card face is read-only except for its two
// actions. Ideas have no Tags at all (user-requested removal -- redundant
// with Category).
//
// User-reported redesign ("the cover image is weirdly placed, the convert
// button is not matching the other buttons"). What changed on this face,
// and why (full rationale in .design/PLAN.md):
//
//   * The Cover Photo is now the card's own 4:3 header image, rendered
//     once. It used to render *twice* -- an 80px `float: right` thumbnail
//     wedged beside the metadata (which left a dead gap on any card whose
//     text was too short to wrap around it -- the "weirdly placed" report),
//     plus a whole read-only PhotoGallery at the card foot repeating the
//     same image under a `FOTON` label with an `OMSLAG` badge on it.
//   * Edit and Convert are one matched pair in the footer: same size, same
//     pill geometry, differing only in fill. Convert was a full-width solid
//     green bar -- the loudest element on the page, on every card, for its
//     rarest and most consequential action (it consumes the Idea) -- while
//     Edit was a small outline pill beside the title. Convert keeps the
//     fill because it is the affirmative action here; what made it shout
//     was the full-bleed width, not the color.
//   * Section name is gone from the card: the page groups by Section under
//     that Section's own heading, so repeating it per card was noise.
//   * Weather suitability is gone from the card: it is a filter axis (the
//     bar above covers it), not something worth a line on every candidate.
//   * `locationName` is suppressed when it merely repeats the title, which
//     is what the reported screenshot showed ("Hong Island" / "Hong
//     Island").
export function IdeaCard({
  idea,
  sections,
  categoryOptions,
  accentColor,
}: {
  idea: IdeaDTO;
  sections: { id: string; name: string }[];
  categoryOptions: string[];
  // The owning Section's color, already resolved by the page (custom
  // swatch, else the auto-cycled fallback). Used for the thin accent edge a
  // photo-less card gets in place of its image, so such a card still reads
  // as belonging to its group instead of as a broken photo card.
  accentColor?: string;
}) {
  const t = useTranslations('errors');
  const ti = useTranslations('tripIdeas');
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!confirm(ti('confirmDelete', { title: idea.title }))) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/ideas/${idea.id}`, { method: 'DELETE' });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(translateApiError(t, body?.error?.message) ?? ti('couldNotDeleteIdea'));
        return;
      }
      router.refresh();
    } catch {
      setError(ti('networkError'));
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    // Editing takes the Idea out of the grid and gives it the full row --
    // IdeaForm is a tall multi-column form with Links and Photos below it,
    // and it cannot live inside a 276px grid track.
    return (
      <div className="stack idea-card-editing">
        <IdeaForm
          mode="edit"
          idea={idea}
          tripId={idea.tripId}
          sections={sections}
          categoryOptions={categoryOptions}
          onCancel={() => setEditing(false)}
        />
        {error && <div className="form-error-banner">{error}</div>}
        <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={busy}>
          {busy ? ti('deleting') : ti('deleteIdea')}
        </button>
      </div>
    );
  }

  const extraPhotoCount = (idea.photoCount ?? 0) - 1;
  // Suppress a location that says nothing the title hasn't already said.
  const placeParts = [idea.locationName, idea.locationAddress]
    .filter((part): part is string => Boolean(part))
    .filter((part) => part.trim().toLowerCase() !== idea.title.trim().toLowerCase());
  const place = placeParts.join(', ');
  const links = idea.links ?? [];
  const hasCost = idea.estimatedExpenseAmount != null && Boolean(idea.estimatedExpenseCurrency);
  const hasFacts = hasCost || links.length > 0 || Boolean(idea.locationMapLink);

  return (
    <article className="idea-card">
      {idea.primaryPhotoId ? (
        <div className="idea-card-media">
          {/* eslint-disable-next-line @next/next/no-img-element -- see
              components/PhotoGallery.tsx's identical comment: Next's built-in
              optimizer cannot authenticate against this auth-gated route
              (verified live), so `next/image` serves a broken image here. */}
          <img src={`/api/v1/photos/${idea.primaryPhotoId}/file`} alt="" loading="lazy" />
          {extraPhotoCount > 0 && (
            <span className="idea-card-photo-count">
              {ti('morePhotos', { count: extraPhotoCount })}
            </span>
          )}
        </div>
      ) : (
        // No Cover Photo: a thin edge in the Section's own color rather than
        // a placeholder pretending to be an image. The card simply sits
        // shorter in the grid (which is `align-items: start`).
        <div className="idea-card-edge" style={{ background: accentColor }} aria-hidden="true" />
      )}

      <div className="idea-card-body">
        {error && <div className="form-error-banner">{error}</div>}

        <h3 className="idea-card-title">{idea.title}</h3>

        <div className="idea-card-chips">
          <span className={`idea-chip ${PRIORITY_CHIP_CLASS[idea.priority] ?? 'idea-chip-maybe'}`}>
            {ti(`priority.${idea.priority}`)}
          </span>
          {idea.category && <span className="idea-chip idea-chip-category">{idea.category}</span>}
        </div>

        {place && <p className="idea-card-place">{place}</p>}

        {idea.description && <p className="idea-card-description">{idea.description}</p>}

        <div className="idea-card-footer">
          {hasFacts && (
            <div className="idea-card-facts">
              {hasCost && (
                <p className="idea-card-cost">
                  {ti('estimatedExpense', {
                    amount: idea.estimatedExpenseAmount!,
                    currency: idea.estimatedExpenseCurrency!,
                  })}
                </p>
              )}
              {(links.length > 0 || idea.locationMapLink) && (
                <span className="idea-card-links">
                  {idea.locationMapLink && (
                    <a href={idea.locationMapLink} target="_blank" rel="noreferrer">
                      {ti('map')}
                    </a>
                  )}
                  {links.map((link) => (
                    <a key={link.id} href={link.url} target="_blank" rel="noreferrer">
                      {linkText(link)}
                    </a>
                  ))}
                </span>
              )}
            </div>
          )}

          <div className="idea-card-actions">
            <button type="button" className="btn btn-outline btn-compact" onClick={() => setEditing(true)}>
              {ti('edit')}
            </button>
            <Link
              href={`/trips/${idea.tripId}/ideas/${idea.id}/convert`}
              className="btn btn-primary btn-compact"
            >
              {ti('convertToEntryShort')}
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}
