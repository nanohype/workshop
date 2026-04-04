'use client';

import React, { useEffect, useRef, use, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Square, Zap, DollarSign, Loader2, CheckCircle2, XCircle, Clock, RotateCw, Download, ChevronDown, FolderOpen, FileText, Copy, Check } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatTokens, formatCost } from '@/lib/utils';

interface NodeState {
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  output?: string;
  error?: string;
  tokens?: { input: number; output: number };
  files?: { path: string; size: number }[];
  startedAt?: string;
  completedAt?: string;
}

interface RunData {
  status: string;
  nodeStates: Record<string, NodeState>;
  tokenUsage: { input: number; output: number; cost: number };
  startedAt?: string;
  completedAt?: string;
}

interface StreamEvent {
  time: string;
  type: string;
  message: string;
}

interface FileEntry {
  path: string;
  size: number;
  isDirectory: boolean;
}

const statusIcon = (status: string) => {
  switch (status) {
    case 'running': return <Loader2 className="h-4 w-4 animate-spin text-accent" />;
    case 'completed': return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
    case 'failed': return <XCircle className="h-4 w-4 text-rose-400" />;
    case 'skipped': return <Clock className="h-4 w-4 text-dim" />;
    default: return <Clock className="h-4 w-4 text-dim" />;
  }
};

const statusBadgeVariant = (status: string): 'success' | 'warning' | 'destructive' | 'secondary' => {
  switch (status) {
    case 'completed': return 'success';
    case 'running': return 'warning';
    case 'failed': return 'destructive';
    default: return 'secondary';
  }
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function getLanguageFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const langMap: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', rs: 'rust', go: 'go', java: 'java',
    json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml',
    md: 'markdown', html: 'html', css: 'css', scss: 'scss',
    sql: 'sql', sh: 'bash', bash: 'bash', zsh: 'bash',
    dockerfile: 'dockerfile', xml: 'xml', txt: 'text',
  };
  return langMap[ext] || 'text';
}

export default function RunMonitorPage({ params }: { params: Promise<{ id: string; runId: string }> }) {
  const { id: workflowId, runId } = use(params);
  const router = useRouter();
  const [runData, setRunData] = useState<RunData | null>(null);
  const [isRerunning, setIsRerunning] = useState(false);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Files tab state
  const [workspaceFiles, setWorkspaceFiles] = useState<FileEntry[]>([]);
  const [workspacePath, setWorkspacePath] = useState<string | null>(null);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [fileContents, setFileContents] = useState<Record<string, string | null>>({});
  const [copiedPath, setCopiedPath] = useState(false);

  // Fetch workspace files
  const fetchFiles = useCallback(async () => {
    try {
      const res = await fetch(`/api/runs/${runId}/files`);
      if (res.ok) {
        const data = await res.json();
        setWorkspaceFiles(data.files || []);
        setWorkspacePath(data.workspacePath || null);
      }
    } catch { /* ignore */ }
  }, [runId]);

  // Fetch initial run data via REST (SSE fallback for completed runs)
  useEffect(() => {
    async function fetchRun() {
      try {
        const res = await fetch(`/api/runs/${runId}`);
        if (res.ok) {
          const data = await res.json();
          setRunData({
            status: data.status,
            nodeStates: data.nodeStates || {},
            tokenUsage: data.tokenUsage || { input: 0, output: 0, cost: 0 },
            startedAt: data.startedAt,
            completedAt: data.completedAt,
          });
          if (['completed', 'failed', 'cancelled'].includes(data.status)) {
            setIsDone(true);
            fetchFiles();
          }
        }
      } catch { /* SSE will provide data */ }
    }
    fetchRun();
  }, [runId, fetchFiles]);

  // Connect to SSE stream
  useEffect(() => {
    const eventSource = new EventSource(`/api/runs/${runId}/stream`);
    eventSourceRef.current = eventSource;

    eventSource.addEventListener('state', (e) => {
      try {
        const data = JSON.parse(e.data) as RunData;
        setRunData(data);
        setIsConnected(true);

        // Add event for status changes
        const time = new Date().toLocaleTimeString();
        if (data.nodeStates) {
          Object.entries(data.nodeStates).forEach(([nodeId, state]) => {
            if (state.status === 'running') {
              setEvents((prev) => {
                const key = `start-${nodeId}`;
                if (prev.some((e) => e.message.includes(key))) return prev;
                return [...prev, { time, type: 'node-start', message: `[${key}] Node ${nodeId} started` }];
              });
            } else if (state.status === 'completed') {
              setEvents((prev) => {
                const key = `done-${nodeId}`;
                if (prev.some((e) => e.message.includes(key))) return prev;
                const tokens = state.tokens ? ` (${state.tokens.input + state.tokens.output} tokens)` : '';
                return [...prev, { time, type: 'node-complete', message: `[${key}] Node ${nodeId} completed${tokens}` }];
              });
            } else if (state.status === 'failed') {
              setEvents((prev) => {
                const key = `fail-${nodeId}`;
                if (prev.some((e) => e.message.includes(key))) return prev;
                return [...prev, { time, type: 'node-error', message: `[${key}] Node ${nodeId} failed: ${state.error || 'Unknown error'}` }];
              });
            }
          });
        }
      } catch { /* ignore parse errors */ }
    });

    eventSource.addEventListener('done', (e) => {
      setIsDone(true);
      eventSource.close();
      fetchFiles();
      try {
        const data = JSON.parse(e.data);
        setEvents((prev) => [...prev, {
          time: new Date().toLocaleTimeString(),
          type: 'run-done',
          message: `Run ${data.status}`,
        }]);
      } catch { /* ignore */ }
    });

    eventSource.addEventListener('error', () => {
      setEvents((prev) => [...prev, {
        time: new Date().toLocaleTimeString(),
        type: 'error',
        message: 'Connection error',
      }]);
    });

    eventSource.onerror = () => {
      setIsConnected(false);
    };

    return () => {
      eventSource.close();
    };
  }, [runId, fetchFiles]);

  // Warn before leaving during an active run
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isDone) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDone]);

  // Auto scroll events
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  const overallStatus = runData?.status || 'pending';
  const tokens = runData?.tokenUsage || { input: 0, output: 0, cost: 0 };
  const nodeEntries = Object.entries(runData?.nodeStates || {});

  const computeDuration = (startedAt?: string, completedAt?: string): string => {
    if (!startedAt) return '-';
    const start = new Date(startedAt).getTime();
    const end = completedAt ? new Date(completedAt).getTime() : new Date().getTime();
    const ms = end - start;
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
  };
  const duration = computeDuration(runData?.startedAt, runData?.completedAt);

  // Build combined output from all node outputs
  const combinedOutput = nodeEntries
    .filter(([, state]) => state.output)
    .map(([nodeId, state]) => `--- ${nodeId} ---\n${state.output}`)
    .join('\n\n');

  // Count total files across all nodes
  const totalFiles = nodeEntries.reduce((acc, [, state]) => acc + (state.files?.length || 0), 0);

  const handleDownloadOutput = () => {
    if (!combinedOutput) return;
    const blob = new Blob([combinedOutput], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `run-${runId.slice(0, 8)}-output.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleViewFile = async (filePath: string) => {
    if (expandedFiles.has(filePath)) {
      setExpandedFiles((prev) => {
        const next = new Set(prev);
        next.delete(filePath);
        return next;
      });
      return;
    }

    // Fetch file content
    try {
      const res = await fetch(`/api/runs/${runId}/files?path=${encodeURIComponent(filePath)}`);
      if (res.ok) {
        const data = await res.json();
        setFileContents((prev) => ({ ...prev, [filePath]: data.content }));
      }
    } catch { /* ignore */ }

    setExpandedFiles((prev) => {
      const next = new Set(prev);
      next.add(filePath);
      return next;
    });
  };

  const handleCopyPath = () => {
    if (workspacePath) {
      navigator.clipboard.writeText(workspacePath);
      setCopiedPath(true);
      setTimeout(() => setCopiedPath(false), 2000);
    }
  };

  const handleDownloadAll = async () => {
    // Download each file content and create a combined text file
    // For a proper implementation, this would create a zip via the API
    const parts: string[] = [];
    for (const file of workspaceFiles.filter(f => !f.isDirectory)) {
      try {
        const res = await fetch(`/api/runs/${runId}/files?path=${encodeURIComponent(file.path)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.content) {
            parts.push(`=== ${file.path} ===\n${data.content}`);
          }
        }
      } catch { /* skip */ }
    }
    if (parts.length > 0) {
      const blob = new Blob([parts.join('\n\n')], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `workspace-${runId.slice(0, 8)}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="space-y-4 h-[calc(100vh-7rem)] flex flex-col -m-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <Link href={`/workflows/${workflowId}/runs`}>
            <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div>
            <h1 className="text-[15px] font-semibold text-foreground font-display">Run Monitor</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge variant={statusBadgeVariant(overallStatus)}>{overallStatus}</Badge>
              {!isDone && isConnected && (
                <span className="flex items-center gap-1 text-xs text-accent">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                  Live
                </span>
              )}
              <span className="text-xs text-dim font-mono">{runId.slice(0, 8)}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-6 text-sm">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Zap className="h-4 w-4 text-accent" />
              <span className="font-display">{formatTokens(tokens.input + tokens.output)} tokens</span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <DollarSign className="h-4 w-4 text-emerald-400" />
              <span className="font-display">{formatCost(tokens.cost)}</span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="h-4 w-4 text-amber-400" />
              <span className="font-display">{duration}</span>
            </div>
          </div>
          {!isDone && (
            <Button
              variant="destructive"
              size="sm"
              className="gap-1.5"
              onClick={async () => {
                try {
                  const res = await fetch(`/api/runs/${runId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'cancel' }),
                  });
                  if (res.ok) {
                    setIsDone(true);
                    setRunData((prev) => prev ? { ...prev, status: 'cancelled' } : prev);
                    eventSourceRef.current?.close();
                    setEvents((prev) => [...prev, {
                      time: new Date().toLocaleTimeString(),
                      type: 'run-cancelled',
                      message: 'Run cancelled by user',
                    }]);
                  }
                } catch { /* ignore */ }
              }}
            >
              <Square className="h-3.5 w-3.5" />
              Cancel
            </Button>
          )}
          {isDone && combinedOutput && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={handleDownloadOutput}
              title="Download output"
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </Button>
          )}
          {isDone && (
            <Button
              variant="secondary"
              size="sm"
              className="gap-1.5"
              disabled={isRerunning}
              onClick={async () => {
                setIsRerunning(true);
                try {
                  const res = await fetch(`/api/workflows/${workflowId}/run`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({}),
                  });
                  if (res.ok) {
                    const { runId: newRunId } = await res.json();
                    router.push(`/workflows/${workflowId}/runs/${newRunId}`);
                  }
                } catch { /* ignore */ }
                setIsRerunning(false);
              }}
            >
              {isRerunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
              Re-run
            </Button>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 grid grid-cols-2 gap-4 min-h-0">
        {/* Left: Node status */}
        <Card className="flex flex-col">
          <CardHeader className="pb-3 shrink-0">
            <CardTitle className="text-sm">Execution Graph</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 min-h-0">
            <ScrollArea className="h-full">
              {nodeEntries.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Loader2 className="h-6 w-6 animate-spin text-dim mb-2" />
                  <p className="text-sm text-muted-foreground">Waiting for execution data...</p>
                </div>
              )}
              <div className="space-y-2">
                {nodeEntries.map(([nodeId, state]) => (
                  <div
                    key={nodeId}
                    className={`rounded-lg border px-4 py-3 transition-all ${
                      state.status === 'running'
                        ? 'border-accent/50 bg-accent/5'
                        : state.status === 'completed'
                        ? 'border-emerald-500/30 bg-emerald-950/10'
                        : state.status === 'failed'
                        ? 'border-rose-500/30 bg-rose-950/10'
                        : 'border-border bg-card-50'
                    }`}
                  >
                    <div
                      className="flex items-center justify-between cursor-pointer"
                      onClick={() => setExpandedNodes((prev) => {
                        const next = new Set(prev);
                        if (next.has(nodeId)) next.delete(nodeId);
                        else next.add(nodeId);
                        return next;
                      })}
                    >
                      <div className="flex items-center gap-2">
                        {statusIcon(state.status)}
                        <span className="text-sm font-medium text-foreground font-display">{nodeId}</span>
                        {state.output && (
                          <ChevronDown className={`h-3 w-3 text-dim transition-transform ${expandedNodes.has(nodeId) ? 'rotate-180' : ''}`} />
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {state.files && state.files.length > 0 && (
                          <span className="flex items-center gap-1 text-xs text-indigo-400">
                            <FileText className="h-3 w-3" />
                            {state.files.length}
                          </span>
                        )}
                        {state.tokens && (
                          <span className="text-xs text-dim font-display">
                            {formatTokens(state.tokens.input + state.tokens.output)} tokens
                          </span>
                        )}
                        <Badge variant={statusBadgeVariant(state.status)} className="text-xs">
                          {state.status}
                        </Badge>
                      </div>
                    </div>
                    {state.error && (
                      <p className="text-xs text-rose-400 mt-2 font-mono">{state.error}</p>
                    )}
                    {expandedNodes.has(nodeId) && state.output && (
                      <pre className="text-xs text-muted-foreground mt-2 bg-input rounded-md p-2 font-mono whitespace-pre-wrap max-h-40 overflow-y-auto">
                        {state.output}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Right: Output */}
        <Card className="flex flex-col">
          <CardHeader className="pb-3 shrink-0">
            <CardTitle className="text-sm">Output</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 min-h-0">
            <Tabs defaultValue="output" className="h-full flex flex-col">
              <TabsList className="shrink-0">
                <TabsTrigger value="output">Output</TabsTrigger>
                <TabsTrigger value="files">
                  Files{totalFiles > 0 && ` (${totalFiles})`}
                </TabsTrigger>
                <TabsTrigger value="events">Events ({events.length})</TabsTrigger>
                <TabsTrigger value="context">Context</TabsTrigger>
              </TabsList>
              <TabsContent value="output" className="flex-1 min-h-0 mt-2">
                <ScrollArea className="h-full">
                  <div className="rounded-lg bg-input p-4 font-display text-sm text-muted-foreground min-h-[200px] whitespace-pre-wrap">
                    {combinedOutput || (
                      <span className="text-dim">
                        {isDone ? 'No output produced.' : 'Waiting for output...'}
                        {!isDone && <span className="inline-block w-2 h-4 bg-accent animate-pulse ml-1" />}
                      </span>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>
              <TabsContent value="files" className="flex-1 min-h-0 mt-2">
                <ScrollArea className="h-full">
                  <div className="space-y-3">
                    {/* Workspace path */}
                    {workspacePath && (
                      <div className="flex items-center gap-2 rounded-lg bg-input px-3 py-2">
                        <FolderOpen className="h-4 w-4 text-indigo-400 shrink-0" />
                        <code className="text-xs text-muted-foreground flex-1 truncate">{workspacePath}</code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0"
                          onClick={handleCopyPath}
                        >
                          {copiedPath ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                        </Button>
                      </div>
                    )}

                    {/* File list */}
                    {workspaceFiles.filter(f => !f.isDirectory).length === 0 && (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <FolderOpen className="h-6 w-6 text-dim mb-2" />
                        <p className="text-sm text-muted-foreground">
                          {isDone ? 'No workspace files produced.' : 'Files will appear here after the run completes.'}
                        </p>
                      </div>
                    )}

                    {workspaceFiles.filter(f => !f.isDirectory).map((file) => (
                      <div key={file.path} className="rounded-lg border border-border overflow-hidden">
                        <div
                          className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-input/50 transition-colors"
                          onClick={() => handleViewFile(file.path)}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <FileText className="h-4 w-4 text-indigo-400 shrink-0" />
                            <span className="text-sm text-foreground font-mono truncate">{file.path}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs text-dim">{formatFileSize(file.size)}</span>
                            <ChevronDown className={`h-3 w-3 text-dim transition-transform ${expandedFiles.has(file.path) ? 'rotate-180' : ''}`} />
                          </div>
                        </div>
                        {expandedFiles.has(file.path) && (
                          <div className="border-t border-border">
                            {fileContents[file.path] !== undefined ? (
                              fileContents[file.path] !== null ? (
                                <pre className="text-xs text-muted-foreground p-3 font-mono whitespace-pre-wrap max-h-60 overflow-y-auto bg-input/30">
                                  <code className={`language-${getLanguageFromPath(file.path)}`}>
                                    {fileContents[file.path]}
                                  </code>
                                </pre>
                              ) : (
                                <p className="text-xs text-dim p-3">File too large for inline preview.</p>
                              )
                            ) : (
                              <div className="flex items-center justify-center py-4">
                                <Loader2 className="h-4 w-4 animate-spin text-dim" />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Download All button */}
                    {workspaceFiles.filter(f => !f.isDirectory).length > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full gap-1.5"
                        onClick={handleDownloadAll}
                      >
                        <Download className="h-3.5 w-3.5" />
                        Download All
                      </Button>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>
              <TabsContent value="events" className="flex-1 min-h-0 mt-2">
                <ScrollArea className="h-full">
                  <div ref={scrollRef} className="space-y-1">
                    {events.length === 0 && (
                      <p className="text-sm text-dim py-8 text-center">No events yet</p>
                    )}
                    {events.map((event, i) => (
                      <div
                        key={i}
                        className="text-xs font-mono text-muted-foreground bg-input-50 rounded px-3 py-2"
                      >
                        <span className={
                          event.type.includes('error') || event.type.includes('fail')
                            ? 'text-rose-400'
                            : event.type.includes('complete') || event.type.includes('done')
                            ? 'text-emerald-400'
                            : 'text-accent'
                        }>
                          [{event.time}]
                        </span>{' '}
                        {event.message}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>
              <TabsContent value="context" className="flex-1 min-h-0 mt-2">
                <ScrollArea className="h-full">
                  <pre className="rounded-lg bg-input p-4 font-mono text-xs text-muted-foreground whitespace-pre-wrap">
                    {JSON.stringify(runData?.nodeStates || {}, null, 2)}
                  </pre>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
