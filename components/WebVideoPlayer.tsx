'use client';

import { type MouseEvent, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { BufferingIndicator } from '@videojs/react';
import { I18nProvider } from '@videojs/react/i18n';
import swedish from '@videojs/react/i18n/locales/sv';
import { Video, VideoPlayer, VideoSkin } from '@videojs/react/video';
import '@videojs/react/video/skin.css';

function preventEditorSubmit(event: MouseEvent<HTMLDivElement>) {
  // Video.js controls can be inside the blog edit form, where a button
  // without an explicit type defaults to submitting the form.
  if (event.target instanceof Element && event.target.closest('button')?.type === 'submit') {
    event.preventDefault();
  }
}

export function WebVideoPlayer({ src, label }: { src: string; label?: string }) {
  const locale = useLocale();
  const t = useTranslations('shared');
  return (
    <div className="site-video" contentEditable={false} onClick={preventEditorSubmit}>
      <I18nProvider locale={locale} translations={locale === 'sv' ? swedish : undefined}>
        <VideoContent key={src} src={src} label={label ?? t('videoLabel')} />
      </I18nProvider>
    </div>
  );
}

function VideoContent({ src, label }: { src: string; label: string }) {
  const [started, setStarted] = useState(false);
  const t = useTranslations('shared');
  return (
    <VideoPlayer>
      <VideoSkin className="site-video-skin">
        <Video src={src} aria-label={label} playsInline preload="none" onPlaying={() => setStarted(true)} />
        <BufferingIndicator className="site-video-status" delay={500} role="status">
          {t(started ? 'videoBuffering' : 'videoLoading')}
        </BufferingIndicator>
      </VideoSkin>
    </VideoPlayer>
  );
}
