'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Brain, FileText, Code, BarChart3, Languages, ArrowRight, Plus, Loader2, RefreshCw, MessageSquare, Blocks, Package } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from '@/components/ui/use-toast';
import { VariableForm } from '@/components/nanohype/variable-form';

const templates = [
  { id: 'blank', name: 'Blank Workflow', description: 'Start from scratch with an empty canvas', icon: Plus, color: 'text-muted-foreground bg-input', nodes: [], edges: [] },
  {
    id: 'research', name: 'Research Pipeline', description: 'Multi-step research with search and summarization', icon: Brain, color: 'text-orange-500 bg-orange-500/10',
    nodes: [
      { id: 'input-1', type: 'input', position: { x: 250, y: 50 }, data: { label: 'Research Topic' } },
      { id: 'agent-1', type: 'agent', position: { x: 200, y: 200 }, data: { label: 'Researcher', systemPrompt: 'You are a thorough research assistant. Analyze the given topic and provide key findings.' } },
      { id: 'agent-2', type: 'agent', position: { x: 200, y: 400 }, data: { label: 'Summarizer', systemPrompt: 'Summarize the research findings into a clear, concise report.' } },
      { id: 'output-1', type: 'output', position: { x: 250, y: 580 }, data: { label: 'Research Report' } },
    ],
    edges: [
      { id: 'e1', source: 'input-1', target: 'agent-1' },
      { id: 'e2', source: 'agent-1', target: 'agent-2' },
      { id: 'e3', source: 'agent-2', target: 'output-1' },
    ],
  },
  {
    id: 'code-review', name: 'Code Review', description: 'Automated code review with suggestions', icon: Code, color: 'text-green-500 bg-green-500/10',
    nodes: [
      { id: 'input-1', type: 'input', position: { x: 250, y: 50 }, data: { label: 'Code Input' } },
      { id: 'agent-1', type: 'agent', position: { x: 100, y: 250 }, data: { label: 'Bug Detector', systemPrompt: 'Analyze the code for potential bugs, security issues, and logic errors.' } },
      { id: 'agent-2', type: 'agent', position: { x: 400, y: 250 }, data: { label: 'Style Reviewer', systemPrompt: 'Review the code for style, readability, and best practices.' } },
      { id: 'agent-3', type: 'agent', position: { x: 250, y: 450 }, data: { label: 'Report Writer', systemPrompt: 'Combine the bug and style review findings into a cohesive code review report with actionable suggestions.' } },
      { id: 'output-1', type: 'output', position: { x: 250, y: 630 }, data: { label: 'Review Report' } },
    ],
    edges: [
      { id: 'e1', source: 'input-1', target: 'agent-1' },
      { id: 'e2', source: 'input-1', target: 'agent-2' },
      { id: 'e3', source: 'agent-1', target: 'agent-3' },
      { id: 'e4', source: 'agent-2', target: 'agent-3' },
      { id: 'e5', source: 'agent-3', target: 'output-1' },
    ],
  },
  {
    id: 'content', name: 'Content Generator', description: 'Generate polished content with tone control', icon: FileText, color: 'text-purple-500 bg-purple-500/10',
    nodes: [
      { id: 'input-1', type: 'input', position: { x: 250, y: 50 }, data: { label: 'Content Brief' } },
      { id: 'agent-1', type: 'agent', position: { x: 200, y: 200 }, data: { label: 'Writer', systemPrompt: 'Write high-quality content based on the brief. Be creative and engaging.' } },
      { id: 'agent-2', type: 'agent', position: { x: 200, y: 400 }, data: { label: 'Editor', systemPrompt: 'Edit the content for clarity, grammar, and tone. Suggest improvements.' } },
      { id: 'output-1', type: 'output', position: { x: 250, y: 580 }, data: { label: 'Final Content' } },
    ],
    edges: [
      { id: 'e1', source: 'input-1', target: 'agent-1' },
      { id: 'e2', source: 'agent-1', target: 'agent-2' },
      { id: 'e3', source: 'agent-2', target: 'output-1' },
    ],
  },
  {
    id: 'analysis', name: 'Data Analysis', description: 'Conditional analysis pipeline with depth routing', icon: BarChart3, color: 'text-blue-500 bg-blue-500/10',
    nodes: [
      { id: 'input-1', type: 'input', position: { x: 250, y: 50 }, data: { label: 'Raw Data' } },
      { id: 'agent-1', type: 'agent', position: { x: 200, y: 220 }, data: { label: 'Data Analyzer', systemPrompt: 'Analyze the provided data. If it requires deep statistical analysis, include the word "complex" in your response. Otherwise provide a straightforward overview.' } },
      { id: 'condition-1', type: 'condition', position: { x: 200, y: 440 }, data: { label: 'Complex Data?', condition: "output.includes('complex')" } },
      { id: 'agent-2', type: 'agent', position: { x: 50, y: 640 }, data: { label: 'Deep Analyst', systemPrompt: 'Perform in-depth statistical analysis. Identify trends, correlations, and anomalies. Be thorough and detailed.' } },
      { id: 'agent-3', type: 'agent', position: { x: 400, y: 640 }, data: { label: 'Quick Summarizer', systemPrompt: 'Provide a brief, clear summary of the key data points and takeaways.' } },
      { id: 'output-1', type: 'output', position: { x: 250, y: 840 }, data: { label: 'Analysis Report' } },
    ],
    edges: [
      { id: 'e1', source: 'input-1', target: 'agent-1' },
      { id: 'e2', source: 'agent-1', target: 'condition-1' },
      { id: 'e3', source: 'condition-1', target: 'agent-2', label: 'true', condition: 'true' },
      { id: 'e4', source: 'condition-1', target: 'agent-3', label: 'false', condition: 'false' },
      { id: 'e5', source: 'agent-2', target: 'output-1' },
      { id: 'e6', source: 'agent-3', target: 'output-1' },
    ],
  },
  {
    id: 'translation', name: 'Translation Flow', description: 'Parallel multi-language translation with review', icon: Languages, color: 'text-cyan-500 bg-cyan-500/10',
    nodes: [
      { id: 'input-1', type: 'input', position: { x: 280, y: 50 }, data: { label: 'Source Text' } },
      { id: 'agent-1', type: 'agent', position: { x: 50, y: 250 }, data: { label: 'Spanish', systemPrompt: 'Translate the text to Spanish. Preserve tone, meaning, and nuance.' } },
      { id: 'agent-2', type: 'agent', position: { x: 280, y: 250 }, data: { label: 'French', systemPrompt: 'Translate the text to French. Preserve tone, meaning, and nuance.' } },
      { id: 'agent-3', type: 'agent', position: { x: 510, y: 250 }, data: { label: 'German', systemPrompt: 'Translate the text to German. Preserve tone, meaning, and nuance.' } },
      { id: 'agent-4', type: 'agent', position: { x: 250, y: 480 }, data: { label: 'Quality Reviewer', systemPrompt: 'Review all translations for accuracy, natural phrasing, and consistency. Flag any issues and provide corrected versions if needed.' } },
      { id: 'output-1', type: 'output', position: { x: 280, y: 680 }, data: { label: 'Translations' } },
    ],
    edges: [
      { id: 'e1', source: 'input-1', target: 'agent-1' },
      { id: 'e2', source: 'input-1', target: 'agent-2' },
      { id: 'e3', source: 'input-1', target: 'agent-3' },
      { id: 'e4', source: 'agent-1', target: 'agent-4' },
      { id: 'e5', source: 'agent-2', target: 'agent-4' },
      { id: 'e6', source: 'agent-3', target: 'agent-4' },
      { id: 'e7', source: 'agent-4', target: 'output-1' },
    ],
  },
  {
    id: 'support', name: 'Support Triage', description: 'Classify and route customer queries with conditions', icon: MessageSquare, color: 'text-amber-500 bg-amber-500/10',
    nodes: [
      { id: 'input-1', type: 'input', position: { x: 250, y: 50 }, data: { label: 'Customer Query' } },
      { id: 'agent-1', type: 'agent', position: { x: 200, y: 220 }, data: { label: 'Intent Classifier', systemPrompt: 'Classify the customer query into one category. Respond with exactly one word: "technical" or "general".' } },
      { id: 'condition-1', type: 'condition', position: { x: 200, y: 420 }, data: { label: 'Technical Issue?', condition: "output.includes('technical')" } },
      { id: 'agent-2', type: 'agent', position: { x: 50, y: 620 }, data: { label: 'Tech Support', systemPrompt: 'Provide detailed technical support. Include step-by-step troubleshooting instructions and potential solutions.' } },
      { id: 'agent-3', type: 'agent', position: { x: 400, y: 620 }, data: { label: 'General Support', systemPrompt: 'Provide a helpful, friendly response to the customer query. Be empathetic and solution-oriented.' } },
      { id: 'output-1', type: 'output', position: { x: 250, y: 820 }, data: { label: 'Support Response' } },
    ],
    edges: [
      { id: 'e1', source: 'input-1', target: 'agent-1' },
      { id: 'e2', source: 'agent-1', target: 'condition-1' },
      { id: 'e3', source: 'condition-1', target: 'agent-2', label: 'true', condition: 'true' },
      { id: 'e4', source: 'condition-1', target: 'agent-3', label: 'false', condition: 'false' },
      { id: 'e5', source: 'agent-2', target: 'output-1' },
      { id: 'e6', source: 'agent-3', target: 'output-1' },
    ],
  },
  {
    id: 'iterative', name: 'Iterative Refiner', description: 'Loop-based draft refinement with critique cycles', icon: RefreshCw, color: 'text-pink-500 bg-pink-500/10',
    nodes: [
      { id: 'input-1', type: 'input', position: { x: 250, y: 50 }, data: { label: 'Writing Prompt' } },
      { id: 'agent-1', type: 'agent', position: { x: 200, y: 220 }, data: { label: 'Draft Writer', systemPrompt: 'Write an initial draft based on the prompt. Focus on getting the ideas down clearly.' } },
      { id: 'loop-1', type: 'loop', position: { x: 200, y: 420 }, data: { label: 'Refine x3', condition: 'iteration < 3' } },
      { id: 'agent-2', type: 'agent', position: { x: 200, y: 620 }, data: { label: 'Critic & Refiner', systemPrompt: 'Critically review the draft. Improve clarity, flow, and impact. Fix any issues. Output the complete revised version.' } },
      { id: 'output-1', type: 'output', position: { x: 250, y: 820 }, data: { label: 'Final Draft' } },
    ],
    edges: [
      { id: 'e1', source: 'input-1', target: 'agent-1' },
      { id: 'e2', source: 'agent-1', target: 'loop-1' },
      { id: 'e3', source: 'loop-1', target: 'agent-2' },
      { id: 'e4', source: 'agent-2', target: 'output-1' },
    ],
  },
];

interface CompositeEntry {
  name: string;
  displayName: string;
  description: string;
  version: string;
  tags: string[];
  templateCount: number;
}

interface CompositeManifestData {
  variables: {
    name: string;
    type: 'string' | 'bool' | 'enum' | 'int';
    placeholder: string;
    description: string;
    prompt?: string;
    default?: string | boolean | number;
    required?: boolean;
    options?: string[];
  }[];
}

export default function NewWorkflowPage() {
  const router = useRouter();
  const [creating, setCreating] = useState<string | null>(null);
  const [composites, setComposites] = useState<CompositeEntry[]>([]);
  const [workflowTemplates, setWorkflowTemplates] = useState<{ name: string; displayName: string; description: string; version: string; tags: string[] }[]>([]);
  const [loadingComposites, setLoadingComposites] = useState(true);
  const [selectedComposite, setSelectedComposite] = useState<CompositeEntry | null>(null);
  const [compositeManifest, setCompositeManifest] = useState<CompositeManifestData | null>(null);
  const [compositeVarValues, setCompositeVarValues] = useState<Record<string, string | boolean | number>>({});

  useEffect(() => {
    Promise.all([
      fetch('/api/nanohype/composites').then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('/api/nanohype/templates').then(r => r.ok ? r.json() : []).catch(() => []),
    ]).then(([comps, tmpls]) => {
      setComposites(comps);
      setWorkflowTemplates(tmpls.filter((t: { tags: string[] }) => t.tags.includes('workshop-workflow')));
    }).finally(() => setLoadingComposites(false));
  }, []);

  const handleSelect = async (template: typeof templates[number]) => {
    setCreating(template.id);
    try {
      const res = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: template.id === 'blank' ? 'Untitled Workflow' : template.name,
          description: template.description,
          graphData: { nodes: template.nodes, edges: template.edges },
        }),
      });

      if (!res.ok) throw new Error('Failed to create workflow');

      const workflow = await res.json();
      router.push(`/workflows/${workflow.id}`);
    } catch {
      toast({ title: 'Failed to create workflow', variant: 'destructive' });
      setCreating(null);
    }
  };

  const openCompositeDialog = async (composite: CompositeEntry) => {
    setSelectedComposite(composite);
    setCompositeVarValues({});
    setCompositeManifest(null);
    try {
      const res = await fetch(`/api/nanohype/composites/${composite.name}`);
      if (res.ok) {
        const manifest = await res.json();
        setCompositeManifest(manifest);
        // Pre-fill defaults
        const defaults: Record<string, string | boolean | number> = {};
        for (const v of manifest.variables || []) {
          if (v.default !== undefined) defaults[v.name] = v.default;
        }
        setCompositeVarValues(defaults);
      }
    } catch {
      // Dialog will show without variables
    }
  };

  const handleCompositeGenerate = async () => {
    if (!selectedComposite) return;
    setCreating(`composite-${selectedComposite.name}`);
    try {
      const genRes = await fetch(`/api/nanohype/composites/${selectedComposite.name}/workflow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variables: compositeVarValues }),
      });

      if (!genRes.ok) throw new Error('Failed to generate workflow');

      const graphData = await genRes.json();

      const res = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: selectedComposite.displayName,
          description: selectedComposite.description,
          graphData: { nodes: graphData.nodes, edges: graphData.edges },
          variables: graphData.variables,
        }),
      });

      if (!res.ok) throw new Error('Failed to create workflow');

      const workflow = await res.json();
      setSelectedComposite(null);
      setCreating(null);
      router.push(`/workflows/${workflow.id}`);
    } catch {
      toast({ title: 'Failed to create workflow from composite', variant: 'destructive' });
      setCreating(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-[15px] font-semibold text-foreground">Create Workflow</h1>
        <p className="text-[12px] text-muted-foreground mt-0.5">Start from a template or create a blank workflow</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.map((template) => (
          <Card
            key={template.id}
            className="group cursor-pointer hover:border-accent/30 transition-all"
            onClick={() => !creating && handleSelect(template)}
          >
            <CardContent className="p-5">
              <div className={`w-11 h-11 rounded-xl ${template.color} flex items-center justify-center mb-3`}>
                {creating === template.id ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <template.icon className="h-5 w-5" />
                )}
              </div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-foreground">{template.name}</h3>
                {template.nodes.length > 0 && (
                  <span className="text-xs text-dim bg-input rounded px-1.5 py-0.5">
                    {template.nodes.length} nodes
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground mb-3">{template.description}</p>
              <Button variant="ghost" size="sm" className="gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity p-0 h-auto text-accent">
                Select <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* nanohype Composites */}
      {!loadingComposites && composites.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-emerald-500" />
            <h2 className="text-[13px] font-semibold text-foreground">From nanohype Composite</h2>
            <span className="text-[11px] text-dim">Auto-generated scaffold + review workflows</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {composites.map((composite) => (
              <Card
                key={composite.name}
                className="group cursor-pointer hover:border-emerald-500/30 transition-all"
                onClick={() => !creating && openCompositeDialog(composite)}
              >
                <CardContent className="p-5">
                  <div className="w-11 h-11 rounded-xl text-emerald-500 bg-emerald-500/10 flex items-center justify-center mb-3">
                    {creating === `composite-${composite.name}` ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Blocks className="h-5 w-5" />
                    )}
                  </div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-foreground">{composite.displayName}</h3>
                    <span className="text-xs text-dim bg-input rounded px-1.5 py-0.5">
                      {composite.templateCount} templates
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">{composite.description}</p>
                  <div className="flex flex-wrap gap-1 mb-3">
                    {composite.tags.slice(0, 4).map(tag => (
                      <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full bg-input text-dim border border-border">
                        {tag}
                      </span>
                    ))}
                  </div>
                  <Button variant="ghost" size="sm" className="gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity p-0 h-auto text-emerald-500">
                    Generate <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Workflow templates from nanohype catalog */}
      {!loadingComposites && workflowTemplates.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Blocks className="h-4 w-4 text-indigo-400" />
            <h2 className="text-[13px] font-semibold text-foreground">Workflow Templates</h2>
            <span className="text-[11px] text-dim">Pre-built workflow patterns from the nanohype catalog</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {workflowTemplates.map((wt) => (
              <Card
                key={wt.name}
                className="group cursor-pointer hover:border-indigo-500/30 transition-all"
                onClick={async () => {
                  if (creating) return;
                  setCreating(`wt-${wt.name}`);
                  try {
                    const res = await fetch('/api/workflows', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ name: wt.displayName, description: wt.description, graphData: { nodes: [], edges: [] } }),
                    });
                    if (!res.ok) throw new Error('Failed to create workflow');
                    const workflow = await res.json();
                    setCreating(null);
                    router.push(`/workflows/${workflow.id}`);
                  } catch {
                    toast({ title: 'Failed to create workflow from template', variant: 'destructive' });
                    setCreating(null);
                  }
                }}
              >
                <CardContent className="p-5">
                  <div className="w-11 h-11 rounded-xl text-indigo-400 bg-indigo-500/10 flex items-center justify-center mb-3">
                    {creating === `wt-${wt.name}` ? <Loader2 className="h-5 w-5 animate-spin" /> : <Blocks className="h-5 w-5" />}
                  </div>
                  <h3 className="font-semibold text-foreground mb-1">{wt.displayName}</h3>
                  <p className="text-sm text-muted-foreground mb-3">{wt.description}</p>
                  <Button variant="ghost" size="sm" className="gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity p-0 h-auto text-indigo-400">
                    Use <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Composite variable configuration dialog */}
      <Dialog open={!!selectedComposite} onOpenChange={(open) => !open && setSelectedComposite(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedComposite?.displayName}</DialogTitle>
          </DialogHeader>
          {compositeManifest && compositeManifest.variables.length > 0 ? (
            <VariableForm
              variables={compositeManifest.variables}
              values={compositeVarValues}
              onChange={setCompositeVarValues}
            />
          ) : compositeManifest ? (
            <p className="text-sm text-dim">No variables to configure. Using defaults.</p>
          ) : (
            <p className="text-sm text-dim">Loading...</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedComposite(null)}>Cancel</Button>
            <Button
              onClick={handleCompositeGenerate}
              disabled={!!creating}
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Generate Workflow
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
