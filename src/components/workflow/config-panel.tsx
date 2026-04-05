'use client';

import { useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useWorkflowStore } from '@/lib/store/workflow-store';
import { TemplateBrowser } from '@/components/nanohype/template-browser';
import { PROVIDERS } from '@/lib/providers';

export function ConfigPanel() {
  const { selectedNodeId, nodes, edges, updateNode, selectNode, removeNode } = useWorkflowStore();
  const node = nodes.find((n) => n.id === selectedNodeId);

  if (!node) return null;

  const incomingEdges = edges.filter((e) => e.target === node.id).length;
  const outgoingEdges = edges.filter((e) => e.source === node.id).length;

  return (
    <div className="w-80 border-l border-border bg-card flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground font-display">Node Configuration</h3>
          <p className="text-xs text-dim font-mono mt-0.5">{node.id}</p>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => selectNode(null)}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Config form */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Node info */}
        <div className="flex items-center gap-4 text-xs text-dim">
          <span className="capitalize">{node.type}</span>
          <span>{incomingEdges} in / {outgoingEdges} out</span>
        </div>

        {/* Label */}
        <div className="space-y-2">
          <Label>Label <span className="text-rose-400">*</span></Label>
          <Input
            value={node.data.label || ''}
            onChange={(e) => updateNode(node.id, { label: e.target.value.slice(0, 100) })}
            placeholder="Node label"
          />
          {!node.data.label?.trim() && (
            <p className="text-xs text-rose-400">Label is required</p>
          )}
        </div>

        {/* Agent config */}
        {node.type === 'agent' && (
          <>
            <Separator />

            {/* Provider */}
            <div className="space-y-2">
              <Label>Provider</Label>
              <Select
                value={node.data.provider || 'claude-code'}
                onValueChange={(value) => updateNode(node.id, { provider: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* System Prompt */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>System Prompt</Label>
                <span className={`text-xs ${(node.data.systemPrompt || '').length > 10000 ? 'text-rose-400' : 'text-dim'}`}>
                  {(node.data.systemPrompt || '').length}/10000
                </span>
              </div>
              <Textarea
                value={node.data.systemPrompt || ''}
                onChange={(e) => {
                  if (e.target.value.length <= 10000) {
                    updateNode(node.id, { systemPrompt: e.target.value });
                  }
                }}
                placeholder="You are a helpful assistant..."
                rows={4}
              />
            </div>

            {/* Max Turns */}
            <div className="space-y-2">
              <Label>Max Turns</Label>
              <Input
                type="number"
                min={1}
                max={50}
                value={node.data.maxTurns || 10}
                onChange={(e) => updateNode(node.id, { maxTurns: Math.min(50, Math.max(1, parseInt(e.target.value) || 10)) })}
              />
              <p className="text-xs text-dim">
                Limits agentic turns (tool calls). Default 10. Higher = more thorough but slower.
              </p>
            </div>

            {/* Timeout */}
            <div className="space-y-2">
              <Label>Timeout (seconds)</Label>
              <Input
                type="number"
                min={5}
                max={3600}
                value={node.data.timeout || 600}
                onChange={(e) => {
                  updateNode(node.id, { timeout: Math.min(3600, Math.max(5, parseInt(e.target.value) || 600)) });
                }}
              />
              <p className="text-xs text-dim">Max execution time (5–3600s)</p>
            </div>

            {/* Retries */}
            <div className="space-y-2">
              <Label>Retries on Error</Label>
              <Input
                type="number"
                min={0}
                max={5}
                value={node.data.retries || 0}
                onChange={(e) => updateNode(node.id, { retries: parseInt(e.target.value) || 0 })}
              />
            </div>

            {/* Permission Mode */}
            <div className="space-y-2">
              <Label>Permission Mode</Label>
              <Select
                value={node.data.permissionMode || 'default'}
                onValueChange={(value) => updateNode(node.id, { permissionMode: value } as Record<string, unknown>)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default</SelectItem>
                  <SelectItem value="accept-edits">Accept Edits</SelectItem>
                  <SelectItem value="full">Full Autonomy</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-dim">
                {node.data.permissionMode === 'full'
                  ? 'Skips all permission prompts. Use with caution.'
                  : node.data.permissionMode === 'accept-edits'
                  ? 'Auto-accepts file edits, prompts for other actions.'
                  : 'Prompts for all potentially destructive actions.'}
              </p>
            </div>

            {/* Workspace */}
            <div className="space-y-2">
              <Label>Workspace</Label>
              <Select
                value={node.data.workspace || 'off'}
                onValueChange={(value) => updateNode(node.id, { workspace: value as 'off' | 'safe' | 'full' })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select workspace mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="off">Off</SelectItem>
                  <SelectItem value="safe">Safe</SelectItem>
                  <SelectItem value="full">Full Autonomy</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-dim">
                {node.data.workspace === 'safe'
                  ? 'Node runs in workspace directory. Output saved to file.'
                  : node.data.workspace === 'full'
                  ? 'Full autonomy — skips permission prompts.'
                  : 'No file I/O. Text output only.'}
              </p>
            </div>
          </>
        )}

        {/* Loop-specific config */}
        {node.type === 'loop' && (
          <>
            <Separator />
            <div className="space-y-2">
              <Label>Loop Condition</Label>
              <Textarea
                value={node.data.condition || ''}
                onChange={(e) => updateNode(node.id, { condition: e.target.value })}
                placeholder="context.iteration < 5"
                rows={3}
                className="font-mono text-xs"
              />
              {node.data.condition && (() => {
                try { new Function('context', `return (${node.data.condition})`); return null; }
                catch { return <p className="text-xs text-rose-400">Invalid JavaScript expression</p>; }
              })()}
              <p className="text-xs text-dim">
                Loops while this expression is true. Max 10 iterations.
              </p>
            </div>
          </>
        )}

        {/* Input node config */}
        {node.type === 'input' && (
          <>
            <Separator />
            <div className="space-y-2">
              <Label>Input Variable Name</Label>
              <Input
                value={(node.data as Record<string, unknown>).variableName as string || ''}
                onChange={(e) => updateNode(node.id, { variableName: e.target.value } as Record<string, unknown>)}
                placeholder="userQuery"
                className="font-mono text-xs"
              />
              <p className="text-xs text-dim">The variable name used to reference this input in the workflow context.</p>
            </div>
            <div className="space-y-2">
              <Label>Default Value</Label>
              <Textarea
                value={(node.data as Record<string, unknown>).defaultValue as string || ''}
                onChange={(e) => updateNode(node.id, { defaultValue: e.target.value } as Record<string, unknown>)}
                placeholder="Default input value..."
                rows={3}
              />
            </div>
          </>
        )}

        {/* Output node config */}
        {node.type === 'output' && (
          <>
            <Separator />
            <div className="space-y-2">
              <Label>Output Format</Label>
              <Select
                value={(node.data as Record<string, unknown>).format as string || 'text'}
                onValueChange={(value) => updateNode(node.id, { format: value } as Record<string, unknown>)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select format" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Plain Text</SelectItem>
                  <SelectItem value="json">JSON</SelectItem>
                  <SelectItem value="markdown">Markdown</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Output Variable</Label>
              <Input
                value={(node.data as Record<string, unknown>).variableName as string || 'result'}
                onChange={(e) => updateNode(node.id, { variableName: e.target.value } as Record<string, unknown>)}
                placeholder="result"
                className="font-mono text-xs"
              />
              <p className="text-xs text-dim">The context variable to capture as the final output.</p>
            </div>
          </>
        )}

        {/* Condition-specific config */}
        {node.type === 'condition' && (
          <>
            <Separator />
            <div className="space-y-2">
              <Label>Condition Expression</Label>
              <Textarea
                value={node.data.condition || ''}
                onChange={(e) => updateNode(node.id, { condition: e.target.value })}
                placeholder="context.output.includes('yes')"
                rows={3}
                className="font-mono text-xs"
              />
              {node.data.condition && (() => {
                try { new Function('context', `return (${node.data.condition})`); return null; }
                catch { return <p className="text-xs text-rose-400">Invalid JavaScript expression</p>; }
              })()}
              <p className="text-xs text-dim">
                JavaScript expression evaluated against the run context.
              </p>
            </div>
          </>
        )}

        {/* Router-specific config */}
        {node.type === 'router' && (
          <>
            <Separator />
            <div className="space-y-2">
              <Label>Routes</Label>
              {(node.data.routes || []).map((route: { label: string; condition?: string }, i: number) => (
                <div key={i} className="space-y-1 p-2 rounded-md border border-border">
                  <div className="flex items-center gap-1.5">
                    <Input
                      value={route.label}
                      onChange={(e) => {
                        const routes = [...(node.data.routes || [])];
                        routes[i] = { ...routes[i], label: e.target.value };
                        updateNode(node.id, { routes } as Record<string, unknown>);
                      }}
                      placeholder="Route label"
                      className="text-xs"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => {
                        const routes = (node.data.routes || []).filter((_: unknown, j: number) => j !== i);
                        updateNode(node.id, { routes } as Record<string, unknown>);
                      }}
                    >
                      <span className="text-xs text-rose-400">×</span>
                    </Button>
                  </div>
                  <Textarea
                    value={route.condition || ''}
                    onChange={(e) => {
                      const routes = [...(node.data.routes || [])];
                      routes[i] = { ...routes[i], condition: e.target.value };
                      updateNode(node.id, { routes } as Record<string, unknown>);
                    }}
                    placeholder="Optional condition expression"
                    rows={1}
                    className="font-mono text-xs"
                  />
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  const routes = [...(node.data.routes || []), { label: `Route ${(node.data.routes || []).length + 1}` }];
                  updateNode(node.id, { routes } as Record<string, unknown>);
                }}
              >
                Add Route
              </Button>
              <p className="text-xs text-dim">
                Each route can have an optional condition. First matching route wins. Routes without conditions act as defaults.
              </p>
            </div>
          </>
        )}

        {/* Transform-specific config */}
        {node.type === 'transform' && (
          <>
            <Separator />
            <div className="space-y-2">
              <Label>Template</Label>
              <Textarea
                value={node.data.template || ''}
                onChange={(e) => updateNode(node.id, { template: e.target.value } as Record<string, unknown>)}
                placeholder="Summary: {{node_id_output}}"
                rows={4}
                className="font-mono text-xs"
              />
              <p className="text-xs text-dim">
                {"Use {{variable}} to interpolate context values. No LLM call — pure text transformation."}
              </p>
            </div>
          </>
        )}

        {/* Gate-specific config */}
        {node.type === 'gate' && (
          <>
            <Separator />
            <div className="space-y-2">
              <Label>Approval Message</Label>
              <Textarea
                value={node.data.gateMessage || ''}
                onChange={(e) => updateNode(node.id, { gateMessage: e.target.value } as Record<string, unknown>)}
                placeholder="Review the changes before continuing..."
                rows={3}
              />
              <p className="text-xs text-dim">
                Pauses execution until manually approved or rejected in the run monitor.
              </p>
            </div>
          </>
        )}

        {/* Scaffold-specific config */}
        {node.type === 'scaffold' && (
          <>
            <Separator />
            <div className="space-y-2">
              <Label>Template Name <span className="text-rose-400">*</span></Label>
              <div className="flex items-center gap-1.5">
                <Input
                  value={node.data.templateName || ''}
                  onChange={(e) => updateNode(node.id, { templateName: e.target.value } as Record<string, unknown>)}
                  placeholder="agentic-loop"
                  className="font-mono text-xs flex-1"
                />
                <TemplatePicker
                  onSelect={(name, manifest) => {
                    const updates: Record<string, unknown> = { templateName: name };
                    if (manifest?.variables) {
                      const vars: Record<string, string | boolean | number> = {};
                      for (const v of manifest.variables) {
                        if (v.default !== undefined) vars[v.name] = v.default;
                        else if (v.type === 'bool') vars[v.name] = false;
                        else if (v.type === 'int') vars[v.name] = 0;
                        else vars[v.name] = '';
                      }
                      updates.templateVariables = vars;
                    }
                    updateNode(node.id, updates);
                  }}
                />
              </div>
              {!node.data.templateName?.trim() && (
                <p className="text-xs text-rose-400">Template name is required</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Output Subdirectory</Label>
              <Input
                value={(node.data as Record<string, unknown>).outputSubdir as string || ''}
                onChange={(e) => updateNode(node.id, { outputSubdir: e.target.value } as Record<string, unknown>)}
                placeholder="Optional — defaults to workspace root"
                className="font-mono text-xs"
              />
              <p className="text-xs text-dim">
                Subdirectory within the workspace for scaffolded files.
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Run Post-Hooks</Label>
                <p className="text-xs text-dim">Execute template hooks (e.g. npm install) after scaffolding.</p>
              </div>
              <Switch
                checked={(node.data as Record<string, unknown>).runPostHooks !== false}
                onCheckedChange={(checked) => updateNode(node.id, { runPostHooks: checked } as Record<string, unknown>)}
              />
            </div>

            <Separator />
            <div className="space-y-2">
              <Label>Template Variables</Label>
              <p className="text-xs text-dim mb-2">
                {"Key-value pairs passed to the template. Use {{nodeId}} syntax to bind to upstream outputs."}
              </p>
              <ScaffoldVariableEditor
                variables={(node.data as Record<string, unknown>).templateVariables as Record<string, string | boolean | number> || {}}
                bindings={(node.data as Record<string, unknown>).templateVariableBindings as Record<string, string> || {}}
                onVariablesChange={(vars) => updateNode(node.id, { templateVariables: vars } as Record<string, unknown>)}
                onBindingsChange={(binds) => updateNode(node.id, { templateVariableBindings: binds } as Record<string, unknown>)}
              />
            </div>
          </>
        )}

        <Separator />

        {/* Delete button */}
        <Button
          variant="destructive"
          size="sm"
          className="w-full"
          onClick={() => {
            removeNode(node.id);
            selectNode(null);
          }}
        >
          Delete Node
        </Button>
      </div>
    </div>
  );
}

function ScaffoldVariableEditor({
  variables,
  bindings,
  onVariablesChange,
  onBindingsChange,
}: {
  variables: Record<string, string | boolean | number>;
  bindings: Record<string, string>;
  onVariablesChange: (vars: Record<string, string | boolean | number>) => void;
  onBindingsChange: (binds: Record<string, string>) => void;
}) {
  const [newKey, setNewKey] = useState('');

  const allKeys = [...new Set([...Object.keys(variables), ...Object.keys(bindings)])];

  const addVariable = () => {
    const key = newKey.trim();
    if (!key || allKeys.includes(key)) return;
    onVariablesChange({ ...variables, [key]: '' });
    setNewKey('');
  };

  const removeVariable = (key: string) => {
    const nextVars = { ...variables };
    delete nextVars[key];
    onVariablesChange(nextVars);
    const nextBinds = { ...bindings };
    delete nextBinds[key];
    onBindingsChange(nextBinds);
  };

  const toggleBinding = (key: string) => {
    if (bindings[key] !== undefined) {
      // Switch to static
      const nextBinds = { ...bindings };
      delete nextBinds[key];
      onBindingsChange(nextBinds);
      if (variables[key] === undefined) {
        onVariablesChange({ ...variables, [key]: '' });
      }
    } else {
      // Switch to binding
      onBindingsChange({ ...bindings, [key]: `{{${key}}}` });
    }
  };

  return (
    <div className="space-y-2">
      {allKeys.map((key) => {
        const isBound = bindings[key] !== undefined;
        return (
          <div key={key} className="flex items-center gap-1.5">
            <span className="text-xs font-mono text-dim w-24 truncate shrink-0" title={key}>{key}</span>
            {isBound ? (
              <Input
                value={bindings[key]}
                onChange={(e) => onBindingsChange({ ...bindings, [key]: e.target.value })}
                placeholder="{{nodeId}}"
                className="font-mono text-xs flex-1"
              />
            ) : (
              <Input
                value={String(variables[key] ?? '')}
                onChange={(e) => onVariablesChange({ ...variables, [key]: e.target.value })}
                placeholder="Value"
                className="text-xs flex-1"
              />
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              title={isBound ? 'Switch to static value' : 'Bind to context'}
              onClick={() => toggleBinding(key)}
            >
              <span className={`text-[10px] font-mono ${isBound ? 'text-indigo-400' : 'text-dim'}`}>
                {isBound ? '{{}}' : 'val'}
              </span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={() => removeVariable(key)}
            >
              <Trash2 className="h-3 w-3 text-rose-400" />
            </Button>
          </div>
        );
      })}
      <div className="flex items-center gap-1.5">
        <Input
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          placeholder="VariableName"
          className="font-mono text-xs flex-1"
          onKeyDown={(e) => e.key === 'Enter' && addVariable()}
        />
        <Button variant="outline" size="icon" className="h-7 w-7 shrink-0" onClick={addVariable} disabled={!newKey.trim()}>
          <Plus className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

interface TemplateManifest {
  variables: { name: string; type: string; default?: string | boolean | number }[];
}

function TemplatePicker({ onSelect }: { onSelect: (name: string, manifest?: TemplateManifest) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="shrink-0 text-xs gap-1">
          Browse
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Select Template</DialogTitle>
        </DialogHeader>
        <TemplateBrowser
          mode="templates"
          onSelectTemplate={(name, manifest) => {
            onSelect(name, manifest as TemplateManifest | undefined);
            setOpen(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
