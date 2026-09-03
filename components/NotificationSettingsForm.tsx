'use client';

import { useTranslations } from 'next-intl';
import { usePushNotifications } from '@/lib/hooks/usePushNotifications';

// spec-push-notifications: the permanent on/off switch, and -- unlike the
// Blog page's prompt card -- the one surface that always explains itself.
// A visitor who opened Settings asked the question, so every unavailable
// state (no HTTPS, iOS-not-installed, permission denied, server not
// configured) gets a real reason here rather than an absent control.
//
// Same shape/classes as LanguageSettingsForm, its neighbour on the page.

interface NotificationSettingsFormProps {
  /** VAPID public key, or null when the server has none configured. */
  publicKey: string | null;
}

export function NotificationSettingsForm({ publicKey }: NotificationSettingsFormProps) {
  const t = useTranslations('notifications');
  const { status, busy, error, needsHomeScreenInstall, enable, disable } =
    usePushNotifications(publicKey);

  const isOn = status === 'subscribed';

  function explanation(): string | null {
    switch (status) {
      case 'unconfigured':
        return t('unconfigured');
      case 'insecure':
        return t('insecure');
      case 'unsupported':
        // On iOS the same page can subscribe once installed to the Home
        // Screen, so this is a next step rather than a dead end.
        return needsHomeScreenInstall ? t('iosHint') : t('unsupported');
      case 'denied':
        return t('denied');
      default:
        return null;
    }
  }

  const reason = explanation();

  return (
    <div className="card" style={{ maxWidth: 380 }}>
      {error && (
        <div className="form-error-banner">
          {error === 'enableFailed' ? t('enableFailed') : t('disableFailed')}
        </div>
      )}
      <div className="field" style={{ marginBottom: 0 }}>
        <label>{t('settingsLabel')}</label>
        <p className="text-soft" style={{ marginTop: 0 }}>
          {t('settingsDescription')}
        </p>

        {reason ? (
          <p className="text-soft" style={{ margin: 0 }}>
            {reason}
          </p>
        ) : (
          <div className="row">
            <button
              type="button"
              className={isOn ? 'btn btn-primary' : 'btn btn-outline'}
              onClick={enable}
              disabled={busy || status === 'loading' || isOn}
            >
              {t('statusOn')}
            </button>
            <button
              type="button"
              className={isOn ? 'btn btn-outline' : 'btn btn-primary'}
              onClick={disable}
              disabled={busy || status === 'loading' || !isOn}
            >
              {t('statusOff')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
