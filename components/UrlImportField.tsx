'use client';

import { useRef, useState, type KeyboardEvent } from 'react';

// User-requested: "Make it so anywhere I can upload a photo it's also
// possible to just post an image URL, that way the user does not have to
// actually download the photo first."
//
// The single "paste a URL instead" control, shared by every place that
// accepts a picked file: PhotoGallery (Ideas, Important Info, Entry and Blog
// Post detail), AttachmentList (Documents) and RichTextEditor's inline blog
// images. Sits next to the existing Upload button rather than replacing it
// -- picking a local file is still the primary path; this is the shortcut for
// an image the User has only as a link.
//
// Deliberately NOT a <form>: three of its four mount points are rendered
// *inside* another <form> (RichTextEditor lives inside BlogPostForm's form;
// AttachmentList inside the detail panels), and a nested <form> is invalid
// HTML -- a silent hydration mismatch in production. Enter-to-submit is
// wired by hand on the input instead, which is the only thing the <form>
// would have bought here. Same reasoning as IdeaForm's own comment about
// keeping LinkList/PhotoGallery outside its <form>.

interface UrlImportFieldProps {
  /** Text on the closed disclosure button, e.g. "Add from URL". */
  toggleLabel: string;
  placeholder: string;
  submitLabel: string;
  busyLabel: string;
  cancelLabel: string;
  /** Resolves to an error message to display, or null when the import succeeded. */
  onSubmit: (url: string) => Promise<string | null>;
  disabled?: boolean;
}

export function UrlImportField({
  toggleLabel,
  placeholder,
  submitLabel,
  busyLabel,
  cancelLabel,
  onSubmit,
  disabled = false,
}: UrlImportFieldProps) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function submit() {
    const trimmed = url.trim();
    if (trimmed.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    const message = await onSubmit(trimmed);
    setBusy(false);
    if (message) {
      setError(message);
      // Keep the field open and populated so the User can fix a typo rather
      // than re-paste the whole URL.
      inputRef.current?.focus();
      return;
    }
    setUrl('');
    setOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      void submit();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      setError(null);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="btn btn-outline url-import-toggle"
        onClick={() => {
          setOpen(true);
          // Autofocus so a paste-and-Enter is the whole interaction.
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
        disabled={disabled}
      >
        {toggleLabel}
      </button>
    );
  }

  return (
    <div className="url-import">
      <div className="url-import-row">
        <input
          ref={inputRef}
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          className="url-import-input"
          placeholder={placeholder}
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={busy}
        />
        <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={busy || url.trim().length === 0}>
          {busy ? busyLabel : submitLabel}
        </button>
        <button
          type="button"
          className="btn btn-outline"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          disabled={busy}
        >
          {cancelLabel}
        </button>
      </div>
      {error && <div className="field-error">{error}</div>}
    </div>
  );
}
