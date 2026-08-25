'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

export interface StagedLink {
  url: string;
  label: string;
}

interface LinkStagingListProps {
  links: StagedLink[];
  onChange: (links: StagedLink[]) => void;
}

// spec-tags-links-photos: lets a *create*-mode form (IdeaForm/EntryForm)
// stage Links locally before the owning Idea/Entry has a real id.
// LinkList.tsx (the existing Links UI, mounted on every detail/edit view)
// POSTs to /api/v1/links immediately and therefore requires a real
// ownerId -- until now that meant a Link could only ever be added *after*
// creating the Idea/Entry, on its own edit/detail page. This is plain
// client-side staging with no network calls of its own; the owning form
// commits every staged Link via commitStagedLinks below, once its own
// create call returns the real id.
export function LinkStagingList({ links, onChange }: LinkStagingListProps) {
  const tShared = useTranslations('shared');
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');

  function handleAdd() {
    if (!url.trim()) return;
    onChange([...links, { url: url.trim(), label: label.trim() }]);
    setUrl('');
    setLabel('');
  }

  function handleRemove(index: number) {
    onChange(links.filter((_, i) => i !== index));
  }

  return (
    <div className="stack" style={{ gap: 'var(--space-2)' }}>
      <span className="text-soft" style={{ fontSize: '0.8rem', textTransform: 'uppercase' }}>
        {tShared('linkStagingListLabel')}
      </span>

      {links.length > 0 && (
        <div className="stack" style={{ gap: 'var(--space-2)' }}>
          {links.map((link, index) => (
            <div key={index} className="row-between">
              <span>{link.label || link.url}</span>
              <button
                type="button"
                className="btn-danger"
                style={{ border: 'none', background: 'none', padding: 0, fontSize: '0.8rem', cursor: 'pointer' }}
                onClick={() => handleRemove(index)}
              >
                {tShared('linkStagingListRemove')}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="row" style={{ gap: 'var(--space-2)' }}>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={tShared('linkStagingListUrlPlaceholder')}
          maxLength={2048}
          aria-label={tShared('linkStagingListUrlLabel')}
          style={{
            border: '1px solid #d6dbde',
            borderRadius: 'var(--radius-input)',
            padding: '0.4rem 0.8rem',
            fontSize: '0.9rem',
            flex: 1,
          }}
        />
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={tShared('linkStagingListLabelPlaceholder')}
          maxLength={200}
          aria-label={tShared('linkStagingListLabelAriaLabel')}
          style={{
            border: '1px solid #d6dbde',
            borderRadius: 'var(--radius-input)',
            padding: '0.4rem 0.8rem',
            fontSize: '0.9rem',
          }}
        />
        <button type="button" className="btn btn-outline" onClick={handleAdd} disabled={!url.trim()}>
          {tShared('linkStagingListAddButton')}
        </button>
      </div>
    </div>
  );
}

/**
 * POSTs every staged Link to `/api/v1/links` against the now-real owner.
 * Best-effort: an individual failure is swallowed (logged), never thrown --
 * the Idea/Entry itself is already safely created by the time this runs,
 * so a Link failure must not look like the whole save failed. Any Link that
 * fails to attach here can still be added afterward from the owner's own
 * detail/edit view (LinkList.tsx), same as before this feature existed.
 */
export async function commitStagedLinks(ownerType: string, ownerId: string, links: StagedLink[]): Promise<void> {
  await Promise.allSettled(
    links.map(async (link) => {
      const response = await fetch('/api/v1/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerType, ownerId, url: link.url, label: link.label || null }),
      });
      if (!response.ok) {
        // eslint-disable-next-line no-console
        console.error(`Failed to save staged link "${link.url}" for ${ownerType} ${ownerId}`);
      }
    }),
  );
}
