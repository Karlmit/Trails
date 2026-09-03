'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { usePushNotifications } from '@/lib/hooks/usePushNotifications';

// spec-push-notifications: the "may we notify you?" ask itself, shown on a
// Trip's Blog list -- where a reader (Guest or User) actually is when new
// posts are the thing they care about, rather than buried in Settings (the
// permanent on/off switch lives there too, see NotificationSettingsForm).
//
// Two deliberate restraints on how much this is allowed to nag:
//   - it renders NOTHING at all unless the opt-in is genuinely available
//     and not yet taken (no "your browser can't do this" noise on a page
//     nobody asked a question on -- those explanations belong in Settings,
//     which the visitor navigated to on purpose).
//   - "Not now" is remembered in localStorage, so the card never comes
//     back on its own. Turning notifications on from Settings later, or
//     clearing site data, is the way back -- the point is that a Guest who
//     said no once is not asked again on every visit.
//
// The browser's own permission prompt is only ever triggered by the Enable
// click inside this card (see the hook) -- never on page load, which
// browsers punish by permanently blocking the origin.

const DISMISSED_KEY = 'trails_push_prompt_dismissed';

interface NotificationOptInCardProps {
  /** VAPID public key, or null when the server has none configured. */
  publicKey: string | null;
}

export function NotificationOptInCard({ publicKey }: NotificationOptInCardProps) {
  const t = useTranslations('notifications');
  const { status, busy, error, enable, disable } = usePushNotifications(publicKey);

  // `null` = not yet read. localStorage is read in an effect, not during
  // render, so the server-rendered and first client render agree
  // (a hydration mismatch otherwise).
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  // Only a subscription taken *here, just now* earns the confirmation
  // state; an already-subscribed browser sees no card at all.
  const [justEnabled, setJustEnabled] = useState(false);

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
      // Nothing to do -- the card is hidden for this page view either way.
    }
  }

  async function handleEnable() {
    await enable();
    setJustEnabled(true);
  }

  if (dismissed === null) return null;

  if (status === 'subscribed') {
    if (!justEnabled) return null;
    return (
      <div className="notify-card notify-card-on" role="status">
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

  // Every remaining state is either "not offerable" (unsupported, insecure,
  // unconfigured, denied) or still loading -- all silent here by design.
  if (status !== 'idle' || dismissed) return null;

  return (
    <div className="notify-card">
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
