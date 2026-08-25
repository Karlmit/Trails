'use client';

import { useTranslations } from 'next-intl';
import { translateApiError } from '@/lib/api-error-messages';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import {
  sectionColor,
  sectionCustomColorBand,
  SECTION_COLOR_PALETTE,
  SECTION_EMOJI_OPTIONS,
} from '@/lib/section-colors';
import { useAutoEndDate, type AutoEndDate } from '@/lib/hooks/useAutoEndDate';

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
  t,
}: {
  value: string | null;
  onChange: (color: string | null) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="color-swatch-picker" role="group" aria-label={t('colorGroupAriaLabel')}>
      <button
        type="button"
        className={`color-swatch-btn color-swatch-btn-none${value === null ? ' is-selected' : ''}`}
        onClick={() => onChange(null)}
        aria-pressed={value === null}
        aria-label={t('noColorLabel')}
        title={t('noColorLabel')}
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
          aria-label={t('colorSwatchAriaLabel', { value: swatch.value })}
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
  t,
}: {
  value: string | null;
  onChange: (emoji: string | null) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="emoji-picker" role="group" aria-label={t('emojiGroupAriaLabel')}>
      <button
        type="button"
        className={`emoji-picker-btn emoji-picker-btn-none${value === null ? ' is-selected' : ''}`}
        onClick={() => onChange(null)}
        aria-pressed={value === null}
        aria-label={t('noEmojiLabel')}
        title={t('noEmojiLabel')}
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
          aria-label={t('emojiOptionAriaLabel', { emoji })}
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
  autoEndDate,
  t,
}: {
  idPrefix: string;
  values: SectionFormValues;
  onChange: (values: SectionFormValues) => void;
  // spec-entry-fields-datepickers: shared end-date auto-fill -- the caller
  // owns a separate instance per form (create vs. each Section's own edit
  // form) so touched-tracking never bleeds between them.
  autoEndDate: AutoEndDate;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <>
      <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor={`${idPrefix}-name`}>{t('sectionNameLabel')}</label>
          <input
            id={`${idPrefix}-name`}
            value={values.name}
            onChange={(e) => onChange({ ...values, name: e.target.value })}
            required
          />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor={`${idPrefix}-start`}>{t('startLabel')}</label>
          <input
            id={`${idPrefix}-start`}
            type="date"
            value={values.startDate}
            onChange={(e) => {
              const startDate = e.target.value;
              // spec-entry-fields-datepickers: End auto-follows Start until
              // the User explicitly picks their own End.
              onChange({
                ...values,
                startDate,
                endDate: autoEndDate.touched() ? values.endDate : startDate,
              });
            }}
            required
          />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor={`${idPrefix}-end`}>{t('endLabel')}</label>
          <input
            id={`${idPrefix}-end`}
            type="date"
            value={values.endDate}
            onChange={(e) => {
              const endDate = e.target.value;
              // review-caught: only a genuinely complete End value counts
              // as a deliberate choice -- the browser's native clear button
              // producing '' must not permanently disarm auto-fill.
              if (endDate) autoEndDate.markTouched();
              onChange({ ...values, endDate });
            }}
            required
          />
        </div>
      </div>
      <div className="field" style={{ marginBottom: 0 }}>
        <label>{t('colorLabel')}</label>
        <ColorSwatchPicker value={values.color} onChange={(color) => onChange({ ...values, color })} t={t} />
      </div>
      <div className="field" style={{ marginBottom: 0 }}>
        <label>{t('emojiLabel')}</label>
        <EmojiPicker value={values.emoji} onChange={(emoji) => onChange({ ...values, emoji })} t={t} />
      </div>
    </>
  );
}

export function SectionManager({ tripId, sections }: { tripId: string; sections: SectionDTO[] }) {
  const t = useTranslations('errors');
  const tc = useTranslations('common');
  const ts = useTranslations('tripSections');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [createValues, setCreateValues] = useState<SectionFormValues>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // spec-entry-fields-datepickers: a brand-new Section form never starts
  // with an End already stored -- auto-fill starts armed, re-armed via
  // `.reset(false)` every time the create form's fields are cleared back to
  // EMPTY_FORM (after a successful create, or Cancel).
  const createAutoEndDate = useAutoEndDate(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<SectionFormValues>(EMPTY_FORM);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  // A Section's own End is always already stored (required field) --
  // re-armed (still to `true`) via `.reset()` in startEdit every time a
  // *different* Section's inline edit form is opened, so this one shared
  // instance's touched-tracking never bleeds across Sections.
  const editAutoEndDate = useAutoEndDate(true);

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
        setError(translateApiError(t, body?.error?.message) ?? ts('createError'));
        return;
      }

      setCreateValues(EMPTY_FORM);
      createAutoEndDate.reset(false);
      setOpen(false);
      router.refresh();
    } catch {
      setError(ts('networkError'));
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
      if (hasUnsavedChanges && !confirm(ts('discardUnsavedConfirm'))) {
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
    // spec-entry-fields-datepickers: a fresh "form instance" for whichever
    // Section is now being edited -- its End is always already stored, so
    // auto-fill never fires (matches "loading an edit form never
    // auto-overwrites an already-stored End").
    editAutoEndDate.reset(!!section.endDate);
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
        setEditError(translateApiError(t, body?.error?.message) ?? ts('updateError'));
        return;
      }

      setEditingId(null);
      router.refresh();
    } catch {
      setEditError(ts('networkError'));
    } finally {
      setEditSubmitting(false);
    }
  }

  async function handleDelete(sectionId: string) {
    if (!confirm(ts('deleteConfirm'))) return;
    setError(null);
    try {
      const response = await fetch(`/api/v1/sections/${sectionId}`, { method: 'DELETE' });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(translateApiError(t, body?.error?.message) ?? ts('deleteError'));
        return;
      }
      router.refresh();
    } catch {
      setError(ts('networkError'));
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
                  autoEndDate={editAutoEndDate}
                  t={ts}
                />
                <div className="row">
                  <button type="submit" className="btn btn-primary" disabled={editSubmitting}>
                    {editSubmitting ? tc('saving') : ts('saveChanges')}
                  </button>
                  <button type="button" className="btn btn-dark-outline" onClick={cancelEdit}>
                    {tc('cancel')}
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
                  {ts('editLink')}
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
                  {ts('removeLink')}
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
          <SectionFieldset
            idPrefix="section-create"
            values={createValues}
            onChange={setCreateValues}
            autoEndDate={createAutoEndDate}
            t={ts}
          />
          <div className="row">
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? ts('adding') : ts('addSection')}
            </button>
            <button
              type="button"
              className="btn btn-dark-outline"
              onClick={() => {
                setOpen(false);
                setCreateValues(EMPTY_FORM);
                createAutoEndDate.reset(false);
                setError(null);
              }}
            >
              {tc('cancel')}
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn btn-outline" onClick={() => setOpen(true)}>
          {ts('addSectionCta')}
        </button>
      )}
    </div>
  );
}
