'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { usePushNotifications } from '@/lib/hooks/usePushNotifications';

// spec-push-notifications: the "may we notify you?" ask itself, shown where
// a reader (Guest or User) actually is -- the Timeline they land on, and the
// Blog list/post pages -- rather than buried in Settings (the permanent
// on/off switch lives there too, see NotificationSettingsForm).
//
// Two deliberate restraints on how much this is allowed to nag:
//   - it renders NOTHING at all unless the opt-in is genuinely available
//     and not yet taken (no "your browser can't do this" noise on a page
//     nobody asked a question on -- those explanations belong in Settings,
//     which the visitor navigated to on purpose).
//   - "Not now" is remembered in localStorage, so the ask never comes back
//     on its own, on any surface. Turning notifications on from Settings
//     later, or clearing site data, is the way back -- the point is that
//     someone who said no once is not asked again on every visit.
//
// The browser's own permission dialog is only ever triggered by the Enable
// click here, never on page load: Safari and Firefox require a real user
// gesture (an unprompted call is simply ignored), and Chrome auto-blocks
// origins that ask without one. So "ask automatically on arrival" means
// showing THIS card automatically -- the native dialog stays one click away.
//
// `variant`:
//   'card' -- an in-flow block above the page's content (Blog surfaces).
//   'bar'  -- pinned to the bottom of the viewport (the Timeline). Required
//             there, not cosmetic: an Active Trip's Timeline auto-scrolls
//             to today on load (components/TimelineAutoScroll.tsx), so
//             anything sitting at the top of that document is scrolled past
//             before it is ever seen -- and an in-flow block appearing
//             above the graph after mount would shift the very row that
//             auto-scroll had just positioned.

const DISMISSED_KEY = 'trails_push_prompt_dismissed';

interface NotificationOptInCardProps {
  /** VAPID public key, or null when the server has none configured. */
  publicKey: string | null;
  variant?: 'card' | 'bar';
}

export function NotificationOptInCard({ publicKey, variant = 'card' }: NotificationOptInCardProps) {
  const t = useTranslations('notifications');
  const { status, busy, error, enable, disable } = usePushNotifications(publicKey);

  // `null` = not yet read. localStorage is read in an effect, not during
  // render, so the server-rendered and first client render agree
  // (a hydration mismatch otherwise).
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  // Only a subscription taken *here, just now* earns the confirmation
  // state; an already-subscribed browser sees no ask at all.
  const [justEnabled, setJustEnabled] = useState(false);
  const barRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(DISMISSED_KEY) === '1');
    } catch {
      // Private mode / storage disabled: treat as "not dismissed" and
      // simply lose the memory of the dismissal.
      setDismissed(false);
    }
  }, []);

  function handleDismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      // Nothing to do -- the ask is hidden for this page view either way.
    }
  }

  const handleEnable = useCallback(async () => {
    await enable();
    setJustEnabled(true);
  }, [enable]);

  const mode: 'hidden' | 'ask' | 'enabled' =
    dismissed === null
      ? 'hidden'
      : status === 'subscribed'
        ? justEnabled
          ? 'enabled'
          : 'hidden'
        : // Every remaining state is either "not offerable" (unsupported,
          // insecure, unconfigured, denied) or still loading -- all silent.
          status === 'idle' && !dismissed
          ? 'ask'
          : 'hidden';

  // The confirmation is an acknowledgement, not a control: as an in-flow
  // card it can sit there harmlessly, but PINNED over the Timeline it would
  // cover the graph until the reader happened to navigate away. So the bar
  // variant retires it on its own once it has been read.
  useEffect(() => {
    if (variant !== 'bar' || !justEnabled) return;
    const timer = window.setTimeout(() => setJustEnabled(false), 6000);
    return () => window.clearTimeout(timer);
  }, [variant, justEnabled]);

  // A fixed bar overlaps whatever is at the bottom of the page -- the FAB,
  // and the tail of the Timeline itself. Publish its real measured height
  // (it wraps to two rows on a phone) so the stylesheet can push both
  // clear of it, and only while it is actually on screen.
  useEffect(() => {
    if (variant !== 'bar' || mode === 'hidden') return;
    const node = barRef.current;
    if (!node) return;

    const body = document.body;
    body.classList.add('has-notify-bar');

    const publishHeight = () => {
      body.style.setProperty('--notify-bar-height', `${Math.round(node.offsetHeight)}px`);
    };
    publishHeight();

    const observer = new ResizeObserver(publishHeight);
    observer.observe(node);

    return () => {
      observer.disconnect();
      body.classList.remove('has-notify-bar');
      body.style.removeProperty('--notify-bar-height');
    };
  }, [variant, mode]);

  if (mode === 'hidden') return null;

  const className = variant === 'bar' ? 'notify-card notify-bar' : 'notify-card';

  if (mode === 'enabled') {
    return (
      <div ref={barRef} className={`${className} notify-card-on`} role="status">
        <span className="notify-card-icon" aria-hidden="true">
          🔔
        </span>
        <div className="notify-card-text">
          <strong>{t('enabledTitle')}</strong>
          <p className="text-soft">{t('enabledBody')}</p>
        </div>
        <div className="notify-card-actions">
          <button type="button" className="btn btn-dark-outline" onClick={disable} disabled={busy}>
            {busy ? t('turningOff') : t('turnOff')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={barRef} className={className}>
      <span className="notify-card-icon" aria-hidden="true">
        🔔
      </span>
      <div className="notify-card-text">
        <strong>{t('promptTitle')}</strong>
        <p className="text-soft">{t('promptBody')}</p>
        {error === 'enableFailed' && <p className="notify-card-error">{t('enableFailed')}</p>}
      </div>
      <div className="notify-card-actions">
        <button type="button" className="btn btn-primary" onClick={handleEnable} disabled={busy}>
          {busy ? t('enabling') : t('enable')}
        </button>
        <button type="button" className="btn btn-dark-outline" onClick={handleDismiss} disabled={busy}>
          {t('notNow')}
        </button>
      </div>
    </div>
  );
}
