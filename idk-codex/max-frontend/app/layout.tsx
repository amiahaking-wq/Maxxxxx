import type { Metadata, Viewport } from 'next';
import './globals.css';
import '@/lib/i18n';

export const metadata: Metadata = {
  title: 'MAX — Your Autonomous AI Agent',
  description: 'MAX is your personal AI agent that can code, browse, automate, and more',
  manifest: '/manifest.json',
  icons: {
    icon: '/icon-192x192.png',
    apple: '/apple-touch-icon.png'
  }
};

export const viewport: Viewport = {
  themeColor: '#0f0f0f',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#0f0f0f] text-white" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}>
        {children}
      </body>
    </html>
  );
}
