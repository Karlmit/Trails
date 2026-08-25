'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslations } from 'next-intl';

interface TimezoneSelectProps {
  id: string;
  /** Uncontrolled starting value -- e.g. the Trip's current timezone (edit)
   *  or the browser's detected zone (new Trip). Not kept in sync with later
   *  prop changes; the field owns its own text/commit state after mount. */
  initialValue?: string;
  /** Called with the exact IANA string the moment a zone is picked from the
   *  list, and with `''` the moment the text no longer matches a committed
   *  selection (typing without picking) -- so a caller's `timezone` state is
   *  never anything other than "" or a real, list-backed zone. */
  onChange: (value: string) => void;
  required?: boolean;
}

// A short quick-pick list shown before the user types anything -- browsing
// ~400 IANA zones with no starting point is its own kind of "lookup the
// code manually." Purely a default ordering; typing still searches the
// full `zones` list, not just this shortlist.
const COMMON_TIMEZONES = [
  'UTC',
  'Europe/Stockholm',
  'Europe/London',
  'America/New_York',
  'America/Los_Angeles',
  'Asia/Bangkok',
  'Asia/Tokyo',
  'Australia/Sydney',
];

/** Exported for unit testing -- the actual filter predicate, independent of
 *  any DOM/React state. Case-insensitive substring match against the zone
 *  name; an empty query returns the curated common-zone shortlist first,
 *  matching the empty-state UX (see COMMON_TIMEZONES above). */
export function filterTimezones(zones: readonly string[], query: string): string[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    const commonPresent = COMMON_TIMEZONES.filter((zone) => zones.includes(zone));
    const rest = zones.filter((zone) => !commonPresent.includes(zone));
    return [...commonPresent, ...rest];
  }
  return zones.filter((zone) => zone.toLowerCase().includes(needle));
}

// spec-timeline-ux-and-timezone: shared searchable IANA-timezone combobox,
// hand-rolled with native elements + ARIA (role="combobox"/"listbox"/
// "option") -- no dependency added. `Intl.supportedValuesOf('timeZone')` is
// the full IANA zone list, so nobody has to look up a code by memory.
export function TimezoneSelect({ id, initialValue = '', onChange, required }: TimezoneSelectProps) {
  const t = useTranslations('shared');
  const zones = useMemo(() => {
    let list: string[];
    try {
      list = Intl.supportedValuesOf('timeZone');
    } catch {
      // Extremely old runtimes without Intl.supportedValuesOf -- degrade to
      // an empty list rather than crashing the form.
      list = [];
    }
    // Confirmed on real Chrome: `Intl.supportedValuesOf('timeZone')` omits
    // the plain "UTC" identifier entirely (no "UTC", no "Etc/UTC" alias),
    // even though `new Intl.DateTimeFormat(..., { timeZone: 'UTC' })` is
    // valid and this exact string is what the browser's own detected-zone
    // fallback (`|| 'UTC'` in NewTripForm) and any Trip already stored
    // with `timezone: 'UTC'` need to find. Without this, the single most
    // expected default value would be permanently unselectable.
    return list.includes('UTC') ? list : ['UTC', ...list];
  }, []);

  const [query, setQuery] = useState(initialValue);
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCommitted = useRef(initialValue);
  const listboxId = `${id}-listbox`;

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  const filtered = useMemo(() => filterTimezones(zones, query), [zones, query]);

  useEffect(() => {
    setHighlightIndex(0);
  }, [query]);

  function optionId(zone: string) {
    return `${id}-option-${zone.replace(/[^a-zA-Z0-9]/g, '-')}`;
  }

  function commit(zone: string) {
    setQuery(zone);
    lastCommitted.current = zone;
    onChange(zone);
    setOpen(false);
  }

  function handleInputChange(next: string) {
    setQuery(next);
    setOpen(true);
    // I/O matrix ("Timezone selection"): the field only commits an exact
    // IANA string when a zone is picked from the filtered list -- typed
    // text alone never becomes the committed value, so an
    // unselected/invalid value can't be submitted.
    onChange('');
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setHighlightIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter') {
      if (open && filtered[highlightIndex]) {
        event.preventDefault();
        commit(filtered[highlightIndex]);
      }
    } else if (event.key === 'Escape') {
      // Restore the last committed value rather than leaving unmatched,
      // uncommitted text sitting in the field with no visual cue.
      setQuery(lastCommitted.current);
      setOpen(false);
    }
  }

  const activeOption = open ? filtered[highlightIndex] : undefined;

  return (
    <div className="combobox">
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={activeOption ? optionId(activeOption) : undefined}
        autoComplete="off"
        required={required}
        value={query}
        placeholder={t('timezoneSelectSearchPlaceholder')}
        onChange={(event) => handleInputChange(event.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Delay the close so a listbox option's onMouseDown (which fires
          // before blur) can still commit the selection.
          closeTimer.current = setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={handleKeyDown}
      />
      {open && (
        <ul role="listbox" id={listboxId} className="combobox-listbox">
          {filtered.length === 0 ? (
            <li className="combobox-empty" role="presentation">
              {t('timezoneSelectNoMatch')}
            </li>
          ) : (
            filtered.map((zone, index) => (
              <li
                key={zone}
                id={optionId(zone)}
                role="option"
                aria-selected={index === highlightIndex}
                className={`combobox-option${index === highlightIndex ? ' is-highlighted' : ''}`}
                onMouseDown={(event) => {
                  // Prevent the input's blur from firing (and closing the
                  // list) before this click is registered.
                  event.preventDefault();
                  if (closeTimer.current) clearTimeout(closeTimer.current);
                  commit(zone);
                }}
                onMouseEnter={() => setHighlightIndex(index)}
              >
                {zone}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
