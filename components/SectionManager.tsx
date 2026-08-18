'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import {
  sectionColor,
  sectionCustomColorBand,
  SECTION_COLOR_PALETTE,
  SECTION_EMOJI_OPTIONS,
} from '@/lib/section-colors';

interface SectionDTO {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  color: string | null;
  emoji: string | null;
}

interface SectionFormValues {
  name: string;
  startDate: string;
  endDate: string;
  color: string | null;
  emoji: string | null;
}

const EMPTY_FORM: SectionFormValues = {
  name: '',
  startDate: '',
  endDate: '',
  color: null,
  emoji: null,
};

// spec-sections-color-emoji: curated color-swatch picker -- a row of plain
// buttons, not a free hex input (spec's "Ask First" boundary) and not a
// new npm dependency (this app's existing no-heavy-dependency convention
// for its other pickers). A leading "no color" button clears back to the
// auto-cycled fallback.
function ColorSwatchPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (color: string | null) => void;
}) {
  return (
    <div className="color-swatch-picker" role="group" aria-label="Section color">
      <button
        type="button"
        className={`color-swatch-btn color-swatch-btn-none${value === null ? ' is-selected' : ''}`}
        onClick={() => onChange(null)}
        aria-pressed={value === null}
        aria-label="No color (auto)"
        title="No color (auto)"
      >
        ×
      </button>
      {SECTION_COLOR_PALETTE.map((swatch) => (
        <button
          key={swatch.value}
          type="button"
          className={`color-swatch-btn${value === swatch.value ? ' is-selected' : ''}`}
          style={{ ['--swatch-color' as string]: swatch.solid }}
          onClick={() => onChange(swatch.value)}
          aria-pressed={value === swatch.value}
          aria-label={`Color ${swatch.value}`}
          title={swatch.value}
        />
      ))}
    </div>
  );
}

// spec-sections-color-emoji: curated emoji picker -- same "plain buttons,
// no new dependency" shape as ColorSwatchPicker above.
function EmojiPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (emoji: string | null) => void;
}) {
  return (
    <div className="emoji-picker" role="group" aria-label="Section emoji">
      <button
        type="button"
        className={`emoji-picker-btn emoji-picker-btn-none${value === null ? ' is-selected' : ''}`}
        onClick={() => onChange(null)}
        aria-pressed={value === null}
        aria-label="No emoji"
        title="No emoji"
      >
        ×
      </button>
      {SECTION_EMOJI_OPTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          className={`emoji-picker-btn${value === emoji ? ' is-selected' : ''}`}
          onClick={() => onChange(emoji)}
          aria-pressed={value === emoji}
          aria-label={`Emoji ${emoji}`}
          title={emoji}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

// spec-sections-color-emoji: shared field shape for both the create form
// and each Section's inline Edit form -- same fields, just a different
// submit handler/label, per the spec's Code Map ("reusing the create
// form's field shape pre-filled with the Section's current values").
function SectionFieldset({
  idPrefix,
  values,
  onChange,
}: {
  idPrefix: string;
  values: SectionFormValues;
  onChange: (values: SectionFormValues) => void;
}) {
  return (
    <>
      <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor={`${idPrefix}-name`}>Section name</label>
          <input
            id={`${idPrefix}-name`}
            value={values.name}
            onChange={(e) => onChange({ ...values, name: e.target.value })}
            required
          />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor={`${idPrefix}-start`}>Start</label>
          <input
            id={`${idPrefix}-start`}
            type="date"
            value={values.startDate}
            onChange={(e) => onChange({ ...values, startDate: e.target.value })}
            required
          />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor={`${idPrefix}-end`}>End</label>
          <input
            id={`${idPrefix}-end`}
            type="date"
            value={values.endDate}
            onChange={(e) => onChange({ ...values, endDate: e.target.value })}
            required
          />
        </div>
      </div>
      <div className="field" style={{ marginBottom: 0 }}>
        <label>Color</label>
        <ColorSwatchPicker value={values.color} onChange={(color) => onChange({ ...values, color })} />
      </div>
      <div className="field" style={{ marginBottom: 0 }}>
        <label>Emoji</label>
        <EmojiPicker value={values.emoji} onChange={(emoji) => onChange({ ...values, emoji })} />
      </div>
    </>
  );
}

export function SectionManager({ tripId, sections }: { tripId: string; sections: SectionDTO[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [createValues, setCreateValues] = useState<SectionFormValues>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<SectionFormValues>(EMPTY_FORM);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/v1/sections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tripId, ...createValues }),
      });

      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(body?.error?.message ?? 'Could not create the Section.');
        return;
      }

      setCreateValues(EMPTY_FORM);
      setOpen(false);
      router.refresh();
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(section: SectionDTO) {
    // Switching to edit a different Section while another one's edit form
    // is already open (with possibly-unsaved changes) would otherwise
    // silently discard whatever was typed there -- editingId/editValues are
    // singleton state (only one inline edit form open at a time), so
    // opening a new one always replaces it. Warn only when there's
    // something to lose: compare the in-progress values against that
    // Section's own last-known-saved values, matching this component's
    // existing confirm()-before-destructive-action convention (handleDelete).
    if (editingId !== null && editingId !== section.id) {
      const beingEdited = sections.find((s) => s.id === editingId);
      const hasUnsavedChanges =
        beingEdited &&
        (editValues.name !== beingEdited.name ||
          editValues.startDate !== beingEdited.startDate ||
          editValues.endDate !== beingEdited.endDate ||
          editValues.color !== beingEdited.color ||
          editValues.emoji !== beingEdited.emoji);
      if (hasUnsavedChanges && !confirm('Discard unsaved changes to this Section?')) {
        return;
      }
    }

    setError(null);
    setEditError(null);
    setEditingId(section.id);
    setEditValues({
      name: section.name,
      startDate: section.startDate,
      endDate: section.endDate,
      color: section.color,
      emoji: section.emoji,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  async function handleEditSubmit(event: FormEvent, sectionId: string) {
    event.preventDefault();
    setEditSubmitting(true);
    setEditError(null);

    try {
      const response = await fetch(`/api/v1/sections/${sectionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editValues),
      });

      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setEditError(body?.error?.message ?? 'Could not update the Section.');
        return;
      }

      setEditingId(null);
      router.refresh();
    } catch {
      setEditError('Could not reach the server. Please try again.');
    } finally {
      setEditSubmitting(false);
    }
  }

  async function handleDelete(sectionId: string) {
    if (!confirm('Delete this Section? Its color band will be removed.')) return;
    setError(null);
    try {
      const response = await fetch(`/api/v1/sections/${sectionId}`, { method: 'DELETE' });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error?.message ?? 'Could not delete the Section.');
        return;
      }
      router.refresh();
    } catch {
      setError('Could not reach the server. Please try again.');
    }
  }

  return (
    <div className="stack" style={{ marginBottom: 'var(--space-4)' }}>
      {error && !open && <div className="form-error-banner">{error}</div>}
      {sections.length > 0 && (
        <div className="stack" style={{ gap: 'var(--space-2)' }}>
          {sections.map((section, index) =>
            editingId === section.id ? (
              <form
                key={section.id}
                onSubmit={(e) => handleEditSubmit(e, section.id)}
                className="card stack"
                style={{ alignItems: 'flex-start' }}
              >
                {editError && (
                  <div className="form-error-banner" style={{ width: '100%' }}>
                    {editError}
                  </div>
                )}
                <SectionFieldset
                  idPrefix={`section-edit-${section.id}`}
                  values={editValues}
                  onChange={setEditValues}
                />
                <div className="row">
                  <button type="submit" className="btn btn-primary" disabled={editSubmitting}>
                    {editSubmitting ? 'Saving…' : 'Save changes'}
                  </button>
                  <button type="button" className="btn btn-dark-outline" onClick={cancelEdit}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div key={section.id} className="section-legend-item">
                <span
                  className="section-legend-swatch"
                  style={{
                    ['--swatch-color' as string]:
                      (section.color && sectionCustomColorBand(section.color)) ?? sectionColor(index),
                  }}
                />
                <span>
                  {section.emoji && <span aria-hidden="true">{section.emoji} </span>}
                  {section.name} ({section.startDate} – {section.endDate})
                </span>
                <button
                  type="button"
                  onClick={() => startEdit(section)}
                  style={{
                    border: 'none',
                    background: 'none',
                    padding: 0,
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    color: 'var(--color-brand-accent)',
                  }}
                >
                  edit
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(section.id)}
                  className="btn-danger"
                  style={{
                    border: 'none',
                    background: 'none',
                    padding: 0,
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                  }}
                >
                  remove
                </button>
              </div>
            ),
          )}
        </div>
      )}

      {open ? (
        <form onSubmit={handleCreate} className="card stack" style={{ alignItems: 'flex-start' }}>
          {error && (
            <div className="form-error-banner" style={{ width: '100%' }}>
              {error}
            </div>
          )}
          <SectionFieldset idPrefix="section-create" values={createValues} onChange={setCreateValues} />
          <div className="row">
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Adding…' : 'Add Section'}
            </button>
            <button
              type="button"
              className="btn btn-dark-outline"
              onClick={() => {
                setOpen(false);
                setCreateValues(EMPTY_FORM);
                setError(null);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn btn-outline" onClick={() => setOpen(true)}>
          + Add Section
        </button>
      )}
    </div>
  );
}
