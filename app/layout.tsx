import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { appFont } from '@/app/fonts';
import { getSessionUser } from '@/lib/auth';
import { TopNav } from '@/components/TopNav';
import './globals.css';

export const metadata: Metadata = {
  title: 'Trails',
  description: 'Trails — trip planning and travel journal.',
  icons: {
    icon: '/favicon.ico',
    apple: '/icon-192.png',
  },
  // spec-push-notifications: the Web App Manifest is what makes Trails
  // installable, and on iOS/iPadOS an installed Home Screen app is the
  // ONLY context in which Web Push can be granted at all -- so this is a
  // requirement of the notification feature, not decoration. Nothing else
  // about how the app loads changes (public/sw.js caches nothing).
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  themeColor: '#006241',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} className={appFont.variable}>
      <body>
        <NextIntlClientProvider messages={messages}>
          <TopNav username={user?.username ?? null} role={user?.role ?? null} />
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
