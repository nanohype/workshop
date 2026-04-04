'use client';

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Sidebar } from './sidebar';
import { Header } from './header';
import { ThemeProvider } from './theme-provider';
import { Toaster } from '@/components/ui/toaster';
import { ErrorBoundary } from './error-boundary';
import { useSettingsStore } from '@/lib/store/settings-store';
import { cn } from '@/lib/utils';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  // Global 401 handler: redirect to login when session expires
  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      if (response.status === 401) {
        const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url;
        // Only redirect for our API routes, not external requests
        if (url.startsWith('/api/') && !url.includes('/api/auth/')) {
          router.push(`/login?callbackUrl=${encodeURIComponent(pathname)}`);
        }
      }
      return response;
    };
    return () => {
      window.fetch = originalFetch;
    };
  }, [pathname, router]);
  const { sidebarCollapsed } = useSettingsStore();

  // Login page gets no shell
  const isLoginPage = pathname === '/login';

  if (isLoginPage) {
    return (
      <ThemeProvider defaultTheme="dark">
        {children}
        <Toaster />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider defaultTheme="dark">
      <div className="flex min-h-screen">
        <Sidebar />
        <div
          className={cn(
            'flex flex-1 flex-col transition-all duration-150',
            sidebarCollapsed ? 'pl-12' : 'pl-48'
          )}
        >
          <Header />
          <main className="flex-1 p-4">
            <ErrorBoundary>
              {children}
            </ErrorBoundary>
          </main>
        </div>
      </div>
      <Toaster />
    </ThemeProvider>
  );
}
