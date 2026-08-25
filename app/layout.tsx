import type { Metadata } from 'next';
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
  },
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
