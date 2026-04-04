'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Terminal, Check, X, Loader2 } from 'lucide-react';
import { useSettingsStore } from '@/lib/store/settings-store';

export default function SettingsPage() {
  const { theme, setTheme } = useSettingsStore();
  const [cliStatus, setCliStatus] = useState<'checking' | 'ok' | 'error'>('checking');

  useEffect(() => {
    fetch('/api/health')
      .then(r => r.json())
      .then(data => {
        setCliStatus(data.checks?.claude_code === 'ok' ? 'ok' : 'error');
      })
      .catch(() => setCliStatus('error'));
  }, []);

  const handleCheckCli = () => {
    setCliStatus('checking');
    fetch('/api/health')
      .then(r => r.json())
      .then(data => {
        setCliStatus(data.checks?.claude_code === 'ok' ? 'ok' : 'error');
      })
      .catch(() => setCliStatus('error'));
  };

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div>
        <h1 className="text-[15px] font-semibold text-foreground">Settings</h1>
        <p className="text-[12px] text-muted-foreground mt-0.5">Claude Code and preferences</p>
      </div>

      {/* Claude Code Status */}
      <Card>
        <CardHeader>
          <CardTitle>Claude Code</CardTitle>
          <CardDescription>Uses your local Claude Code CLI installation and authentication.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-indigo-400" />
              <div>
                <Label className="text-[12px]">CLI Status</Label>
                <p className="text-[11px] text-dim">Claude Code terminal agent</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {cliStatus === 'checking' && (
                <Badge variant="outline" className="gap-0.5">
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  Checking
                </Badge>
              )}
              {cliStatus === 'ok' && (
                <Badge variant="success" className="gap-0.5">
                  <Check className="h-2.5 w-2.5" />
                  Available
                </Badge>
              )}
              {cliStatus === 'error' && (
                <Badge variant="destructive" className="gap-0.5">
                  <X className="h-2.5 w-2.5" />
                  Not found
                </Badge>
              )}
              <Button variant="outline" size="sm" onClick={handleCheckCli}>
                Recheck
              </Button>
            </div>
          </div>

          {cliStatus === 'error' && (
            <p className="text-[11px] text-rose-400">
              Claude Code CLI not found. Install it with: npm install -g @anthropic-ai/claude-code
            </p>
          )}
        </CardContent>
      </Card>

      {/* Preferences */}
      <Card>
        <CardHeader>
          <CardTitle>Preferences</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-[12px]">Dark Mode</Label>
              <p className="text-[11px] text-dim">Use dark theme</p>
            </div>
            <Switch
              checked={theme === 'dark'}
              onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
