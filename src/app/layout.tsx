import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { AppShell } from '@/components/layout/app-shell';

const body = Geist({
  subsets: ['latin'],
  variable: '--font-body',
});

const display = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-display',
});

export const metadata: Metadata = {
  title: {
    default: 'Workshop - Workflow Builder',
    template: '%s | Workshop',
  },
  description: 'Autonomous agent workflow orchestrator with graph-based visual editor',
  metadataBase: new URL(process.env.AUTH_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000'),
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${body.variable} ${display.variable}`} suppressHydrationWarning>
      <body>
        <div id="app-root"><AppShell>{children}</AppShell></div>
      </body>
    </html>
  );
}
