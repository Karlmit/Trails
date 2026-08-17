'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

export interface ChecklistItemDTO {
  id: string;
  checklistId: string;
  text: string;
  checked: boolean;
  note: string | null;
}

export interface ChecklistDTO {
  id: string;
  tripId: string;
  title: string;
  description: string | null;
  items: ChecklistItemDTO[];
}

// FR-21, spec-checklists: one Checklist, expandable with its Items inline
// (Code Map: "a single page, no separate item-management route needed
// given the small scope"). Toggling an Item's checked state is a single
// PATCH with no confirmation dialog (spec's "Always" boundary) -- the
// local `items` state updates immediately (optimistic), then
// `router.refresh()` keeps the Server Component cache in sync per AD-12
// without a full page reload.
export function ChecklistCard({ checklist }: { checklist: ChecklistDTO }) {
  const router = useRouter();
  const [items, setItems] = useState(checklist.items);
  const [newItemText, setNewItemText] = useState('');
  const [newItemNote, setNewItemNote] = useState('');
  const [addingItem, setAddingItem] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingChecklist, setDeletingChecklist] = useState(false);
  // Item ids with a toggle PATCH in flight -- disables that checkbox so a
  // fast double-click can't fire two overlapping requests that might
  // resolve out of order and leave the UI/DB disagreeing on the last click.
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());

  // Resync when the Server Component re-renders this card with fresh data
  // (this component isn't remounted across re-renders -- `key={checklist.id}`
  // is stable -- so without this, router.refresh() from anywhere else
  // touching this Checklist would never reach the local `items` array).
  useEffect(() => {
    setItems(checklist.items);
  }, [checklist.items]);

  async function handleToggle(item: ChecklistItemDTO) {
    if (togglingIds.has(item.id)) return;
    setError(null);
    const nextChecked = !item.checked;
    setTogglingIds((current) => new Set(current).add(item.id));
    // Optimistic update -- flips only this Item's state, immediately.
    setItems((current) => current.map((i) => (i.id === item.id ? { ...i, checked: nextChecked } : i)));

    try {
      const response = await fetch(`/api/v1/checklist-items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checked: nextChecked }),
      });

      if (!response.ok) {
        // Roll back on failure.
        setItems((current) => current.map((i) => (i.id === item.id ? { ...i, checked: item.checked } : i)));
        const body = await response.json().catch(() => null);
        setError(body?.error?.message ?? 'Could not update this item.');
        return;
      }

      router.refresh();
    } catch {
      setItems((current) => current.map((i) => (i.id === item.id ? { ...i, checked: item.checked } : i)));
      setError('Could not reach the server. Please try again.');
    } finally {
      setTogglingIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  }

  async function handleAddItem(event: FormEvent) {
    event.preventDefault();
    if (!newItemText.trim()) return;
    setError(null);
    setAddingItem(true);

    try {
      const response = await fetch('/api/v1/checklist-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checklistId: checklist.id,
          text: newItemText,
          note: newItemNote.trim() || undefined,
        }),
      });

      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(body?.error?.message ?? 'Could not add this item.');
        return;
      }

      setItems((current) => [...current, body as ChecklistItemDTO]);
      setNewItemText('');
      setNewItemNote('');
      router.refresh();
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setAddingItem(false);
    }
  }

  async function handleDeleteItem(itemId: string, itemText: string) {
    if (!confirm(`Remove "${itemText}" from this Checklist?`)) return;
    setError(null);
    const previous = items;
    setItems((current) => current.filter((i) => i.id !== itemId));

    try {
      const response = await fetch(`/api/v1/checklist-items/${itemId}`, { method: 'DELETE' });
      if (!response.ok) {
        setItems(previous);
        const body = await response.json().catch(() => null);
        setError(body?.error?.message ?? 'Could not delete this item.');
        return;
      }
      router.refresh();
    } catch {
      setItems(previous);
      setError('Could not reach the server. Please try again.');
    }
  }

  async function handleDeleteChecklist() {
    if (!confirm(`Delete "${checklist.title}"? Its items will be deleted too.`)) return;
    setError(null);
    setDeletingChecklist(true);
    try {
      const response = await fetch(`/api/v1/checklists/${checklist.id}`, { method: 'DELETE' });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error?.message ?? 'Could not delete this Checklist.');
        setDeletingChecklist(false);
        return;
      }
      router.refresh();
    } catch {
      setError('Could not reach the server. Please try again.');
      setDeletingChecklist(false);
    }
  }

  const checkedCount = items.filter((i) => i.checked).length;

  return (
    <div className="card stack">
      {error && <div className="form-error-banner">{error}</div>}

      <div className="row-between">
        <div>
          <h3 style={{ margin: 0 }}>{checklist.title}</h3>
          {checklist.description && <p className="text-soft text-multiline">{checklist.description}</p>}
        </div>
        <div className="row" style={{ gap: 'var(--space-2)' }}>
          <span className="text-soft">
            {checkedCount}/{items.length}
          </span>
          <button
            type="button"
            className="btn-danger"
            style={{ border: 'none', background: 'none', padding: 0, fontSize: '0.8rem', cursor: 'pointer' }}
            onClick={handleDeleteChecklist}
            disabled={deletingChecklist}
          >
            {deletingChecklist ? 'Deleting…' : 'Delete Checklist'}
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="text-soft">No items yet. Add one below.</p>
      ) : (
        <div>
          {items.map((item) => (
            <div key={item.id} className={`checklist-item${item.checked ? ' is-checked' : ''}`}>
              <input
                type="checkbox"
                className="checklist-item-checkbox"
                checked={item.checked}
                onChange={() => handleToggle(item)}
                disabled={togglingIds.has(item.id)}
                aria-label={item.text}
              />
              <div className="checklist-item-body">
                <span className="checklist-item-text">{item.text}</span>
                {item.note && <span className="checklist-item-note text-multiline">{item.note}</span>}
              </div>
              <button
                type="button"
                className="checklist-item-remove"
                onClick={() => handleDeleteItem(item.id, item.text)}
                aria-label={`Remove ${item.text}`}
              >
                remove
              </button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleAddItem} className="row" style={{ marginTop: 'var(--space-2)', alignItems: 'flex-start' }}>
        <div className="field" style={{ flex: 1, minWidth: '160px', marginBottom: 0 }}>
          <label htmlFor={`new-item-text-${checklist.id}`}>Item</label>
          <input
            id={`new-item-text-${checklist.id}`}
            value={newItemText}
            onChange={(e) => setNewItemText(e.target.value)}
            placeholder="Add an item…"
            maxLength={500}
          />
        </div>
        <div className="field" style={{ flex: 1, minWidth: '160px', marginBottom: 0 }}>
          <label htmlFor={`new-item-note-${checklist.id}`}>Note (optional)</label>
          <input
            id={`new-item-note-${checklist.id}`}
            value={newItemNote}
            onChange={(e) => setNewItemNote(e.target.value)}
            placeholder="e.g. size, quantity…"
            maxLength={1000}
          />
        </div>
        <button
          type="submit"
          className="btn btn-outline"
          style={{ marginTop: 'var(--space-4)' }}
          disabled={addingItem || !newItemText.trim()}
        >
          {addingItem ? 'Adding…' : 'Add item'}
        </button>
      </form>
    </div>
  );
}
