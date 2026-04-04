'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  GitBranch,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/lib/store/settings-store';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/workflows', label: 'Workflows', icon: GitBranch },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar } = useSettingsStore();

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          'fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-border bg-card transition-all duration-150',
          sidebarCollapsed ? 'w-12' : 'w-48'
        )}
        style={{ transitionTimingFunction: 'var(--ease-spring)' }}
      >
        {/* Wordmark */}
        <div className="flex h-[44px] items-center border-b border-border px-3">
          {!sidebarCollapsed ? (
            <span className="font-display text-[11px] uppercase tracking-[0.12em] text-dim">workshop</span>
          ) : (
            <span className="font-display text-[11px] uppercase tracking-[0.12em] text-dim w-full text-center">a</span>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-px px-1.5 py-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href ||
              (item.href !== '/' && pathname.startsWith(item.href));

            const linkContent = (
              <Link
                href={item.href}
                className={cn(
                  'relative flex items-center gap-2 rounded-[6px] px-2 h-7 text-[12px] font-medium transition-all duration-150',
                  isActive
                    ? 'text-foreground bg-hover'
                    : 'text-dim hover:bg-hover hover:text-foreground'
                )}
                style={{ transitionTimingFunction: 'var(--ease-spring)' }}
              >
                <item.icon className="h-3.5 w-3.5 shrink-0" />
                {!sidebarCollapsed && <span>{item.label}</span>}
              </Link>
            );

            if (sidebarCollapsed) {
              return (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              );
            }

            return <React.Fragment key={item.href}>{linkContent}</React.Fragment>;
          })}
        </nav>

        {/* Sign out + Collapse toggle */}
        <div className="border-t border-border p-1.5 space-y-px">
          {sidebarCollapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => { window.location.href = '/api/auth/signout'; }}
                  className="flex w-full items-center justify-center rounded-[6px] h-7 text-[12px] text-dim hover:bg-hover hover:text-foreground transition-all duration-150 cursor-pointer"
                >
                  <LogOut className="h-3.5 w-3.5 shrink-0" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Sign Out</TooltipContent>
            </Tooltip>
          ) : (
            <button
              onClick={() => { window.location.href = '/api/auth/signout'; }}
              className="flex w-full items-center gap-2 rounded-[6px] px-2 h-7 text-[12px] text-dim hover:bg-hover hover:text-foreground transition-all duration-150 cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5 shrink-0" />
              <span>Sign Out</span>
            </button>
          )}
          <button
            onClick={toggleSidebar}
            className="flex w-full items-center justify-center rounded-[6px] h-7 text-dim hover:bg-hover hover:text-foreground transition-all duration-150 cursor-pointer"
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="h-3.5 w-3.5" />
            ) : (
              <ChevronLeft className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </aside>
    </TooltipProvider>
  );
}
