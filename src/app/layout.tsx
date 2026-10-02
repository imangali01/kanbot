import type { Metadata, Viewport } from 'next';
import { Onest } from 'next/font/google';
import Script from 'next/script';
import './globals.css';

const onest = Onest({ subsets: ['cyrillic', 'latin'], variable: '--font-ui', display: 'swap' });

export const metadata: Metadata = { title: 'kanbot' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 1, userScalable: false };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className={onest.variable}>
        {children}
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      </body>
    </html>
  );
}
