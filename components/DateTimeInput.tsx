'use client';

import { useEffect, useId, useState } from 'react';

interface DateTimeInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}

const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, m) => String(m).padStart(2, '0'));

/**
 * Pure combine helper -- exported for unit testing independent of the DOM.
 * Produces the exact `YYYY-MM-DDTHH:mm` shape EntryForm already works with
 * internally, or `''` the moment any one of the three parts is missing --
 * an incomplete selection (date picked but hour/minute not yet chosen, or
 * vice versa) must never submit as a malformed partial value.
 */
export function combineDateTime(date: string, hour: string, minute: string): string {
  if (!date || !hour || !minute) return '';
  return `${date}T${hour}:${minute}`;
}

/** Pure split helper -- inverse of combineDateTime, tolerant of `''` and of
 *  a partial/malformed string (treats anything it can't cleanly parse as
 *  the empty parts it visually is). */
export function splitDateTime(value: string): { date: string; hour: string; minute: string } {
  if (!value) return { date: '', hour: '', minute: '' };
  const [date, time] = value.split('T');
  if (!date || !time) return { date: date ?? '', hour: '', minute: '' };
  const [hour, minute] = time.split(':');
  return { date, hour: hour ?? '', minute: minute ?? '' };
}

// spec-entry-fields-datepickers: native `<input type="date">` + two
// zero-padded `<select>`s (hour 00-23, minute 00-59) -- the only way to
// *guarantee* 24-hour display regardless of the visiting browser's OS
// locale (native `datetime-local`/`time` inputs format AM/PM-vs-24h from OS
// locale with no reliable cross-browser override). Drop-in replacement for
// a native `<input type="datetime-local">`: consumes/produces the exact
// same `YYYY-MM-DDTHH:mm` string shape the rest of EntryForm already works
// with, so no change is needed to submit logic, validation, or the API.
//
// The three parts are kept as *internal* state (seeded from `value`, and
// re-synced whenever an externally-driven `value` change doesn't match what
// this component's own edits would have produced) rather than derived from
// `value` on every render -- an incomplete selection combines to `''`
// (see combineDateTime above), and `value` faithfully echoes that `''` back
// down; deriving the parts straight from `value` would then immediately
// wipe out whichever part (e.g. the date) the User had already picked the
// moment they moved on to Hour/Minute. The resync path is what makes an
// *external* write to `value` -- an edit-mode initial load, or End
// following a Start change (EntryForm's useAutoEndDate wiring) -- actually
// show up here.
export function DateTimeInput({ id, value, onChange, required }: DateTimeInputProps) {
  const autoId = useId();
  const baseId = id ?? autoId;

  const [date, setDate] = useState(() => splitDateTime(value).date);
  const [hour, setHour] = useState(() => splitDateTime(value).hour);
  const [minute, setMinute] = useState(() => splitDateTime(value).minute);

  useEffect(() => {
    // If `value` already matches what our own three parts combine to, this
    // change was this component's own edit echoed back down -- nothing to
    // resync. Otherwise it's an external write; adopt it.
    if (value === combineDateTime(date, hour, minute)) return;
    const next = splitDateTime(value);
    setDate(next.date);
    setHour(next.hour);
    setMinute(next.minute);
    // Only `value` (the external prop) should trigger a resync check --
    // `date`/`hour`/`minute` are read for their current (post-edit) values,
    // not to re-run this effect on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function update(nextDate: string, nextHour: string, nextMinute: string) {
    setDate(nextDate);
    setHour(nextHour);
    setMinute(nextMinute);
    onChange(combineDateTime(nextDate, nextHour, nextMinute));
  }

  return (
    <div className="row datetime-input">
      <input
        type="date"
        id={baseId}
        value={date}
        onChange={(e) => update(e.target.value, hour, minute)}
        required={required}
      />
      <select
        id={`${baseId}-hour`}
        aria-label="Hour"
        value={hour}
        onChange={(e) => update(date, e.target.value, minute)}
        required={required}
      >
        <option value="">HH</option>
        {HOURS.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <span aria-hidden="true">:</span>
      <select
        id={`${baseId}-minute`}
        aria-label="Minute"
        value={minute}
        onChange={(e) => update(date, hour, e.target.value)}
        required={required}
      >
        <option value="">MM</option>
        {MINUTES.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </div>
  );
}
