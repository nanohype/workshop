'use client';

import { useState, useEffect, useMemo } from 'react';
import { Search, Blocks, Package, Tag, ChevronDown, ChevronUp, User } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { TemplateManifest } from '@/lib/nanohype/catalog';

interface CatalogEntry {
  name: string;
  displayName: string;
  description: string;
  version: string;
  kind?: string;
  persona?: string[];
  category?: string;
  tags: string[];
}

interface CompositeCatalogEntry {
  name: string;
  displayName: string;
  description: string;
  version: string;
  tags: string[];
  templateCount: number;
}

interface TemplateBrowserProps {
  onSelectTemplate?: (templateName: string, manifest?: TemplateManifest) => void;
  onSelectComposite?: (compositeName: string) => void;
  mode?: 'templates' | 'composites' | 'all';
}

export function TemplateBrowser({ onSelectTemplate, onSelectComposite, mode = 'all' }: TemplateBrowserProps) {
  const [templates, setTemplates] = useState<CatalogEntry[]>([]);
  const [composites, setComposites] = useState<CompositeCatalogEntry[]>([]);
  const [search, setSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedPersona, setSelectedPersona] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);
  const [expandedManifest, setExpandedManifest] = useState<TemplateManifest | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const fetches: Promise<unknown>[] = [];
        if (mode !== 'composites') {
          fetches.push(
            fetch('/api/nanohype/templates').then(r => r.ok ? r.json() : []).then(setTemplates)
          );
        }
        if (mode !== 'templates') {
          fetches.push(
            fetch('/api/nanohype/composites').then(r => r.ok ? r.json() : []).then(setComposites)
          );
        }
        await Promise.all(fetches);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [mode]);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    for (const t of templates) t.tags.forEach(tag => tags.add(tag));
    for (const c of composites) c.tags.forEach(tag => tags.add(tag));
    return [...tags].sort();
  }, [templates, composites]);

  const allPersonas = useMemo(() => {
    const personas = new Set<string>();
    for (const t of templates) (t.persona || ['engineering']).forEach(p => personas.add(p));
    return [...personas].sort();
  }, [templates]);

  const allCategories = useMemo(() => {
    const categories = new Set<string>();
    for (const t of templates) if (t.category) categories.add(t.category);
    return [...categories].sort();
  }, [templates]);

  const filteredTemplates = useMemo(() => {
    return templates.filter(t => {
      if (selectedTag && !t.tags.includes(selectedTag)) return false;
      if (selectedPersona && !(t.persona || ['engineering']).includes(selectedPersona)) return false;
      if (selectedCategory && t.category !== selectedCategory) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return t.displayName.toLowerCase().includes(q)
        || t.description.toLowerCase().includes(q)
        || t.name.includes(q)
        || t.tags.some(tag => tag.includes(q));
    });
  }, [templates, search, selectedTag, selectedPersona, selectedCategory]);

  const filteredComposites = useMemo(() => {
    return composites.filter(c => {
      if (selectedTag && !c.tags.includes(selectedTag)) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return c.displayName.toLowerCase().includes(q)
        || c.description.toLowerCase().includes(q)
        || c.name.includes(q)
        || c.tags.some(tag => tag.includes(q));
    });
  }, [composites, search, selectedTag]);

  const handleExpandTemplate = async (name: string) => {
    if (expandedTemplate === name) {
      setExpandedTemplate(null);
      setExpandedManifest(null);
      return;
    }
    setExpandedTemplate(name);
    try {
      const res = await fetch(`/api/nanohype/templates/${name}`);
      if (res.ok) {
        const data = await res.json();
        setExpandedManifest(data.manifest);
      }
    } catch {
      setExpandedManifest(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-dim">
        Loading catalog...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search + filter */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-dim" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates..."
            className="pl-8 text-sm"
          />
        </div>
      </div>

      {/* Persona filter */}
      {allPersonas.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {allPersonas.map(persona => (
            <button
              key={persona}
              onClick={() => { setSelectedPersona(persona === selectedPersona ? null : persona); setSelectedCategory(null); }}
              className={cn(
                'text-[10px] px-2 py-0.5 rounded-full border transition-colors capitalize',
                persona === selectedPersona
                  ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30'
                  : 'bg-input text-dim border-border hover:text-foreground'
              )}
            >
              <User className="inline h-2.5 w-2.5 mr-0.5" />{persona.replace('-', ' ')}
            </button>
          ))}
        </div>
      )}

      {/* Category filter */}
      {allCategories.length > 1 && selectedPersona && (
        <div className="flex flex-wrap gap-1.5">
          {allCategories
            .filter(cat => templates.some(t =>
              t.category === cat && (t.persona || ['engineering']).includes(selectedPersona!)
            ))
            .map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat === selectedCategory ? null : cat)}
                className={cn(
                  'text-[10px] px-2 py-0.5 rounded-full border transition-colors',
                  cat === selectedCategory
                    ? 'bg-accent/20 text-accent border-accent/30'
                    : 'bg-input text-dim border-border hover:text-foreground'
                )}
              >
                {cat}
              </button>
            ))}
        </div>
      )}

      {/* Tags */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedTag && (
            <button
              onClick={() => setSelectedTag(null)}
              className="text-[10px] px-2 py-0.5 rounded-full bg-accent/20 text-accent border border-accent/30"
            >
              {selectedTag} ×
            </button>
          )}
          {allTags.slice(0, 20).map(tag => (
            <button
              key={tag}
              onClick={() => setSelectedTag(tag === selectedTag ? null : tag)}
              className={cn(
                'text-[10px] px-2 py-0.5 rounded-full border transition-colors',
                tag === selectedTag
                  ? 'bg-accent/20 text-accent border-accent/30'
                  : 'bg-input text-dim border-border hover:text-foreground'
              )}
            >
              <Tag className="inline h-2.5 w-2.5 mr-0.5" />{tag}
            </button>
          ))}
        </div>
      )}

      {/* Templates */}
      {mode !== 'composites' && filteredTemplates.length > 0 && (
        <div className="space-y-1.5">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-dim flex items-center gap-1.5">
            <Blocks className="h-3 w-3" />
            Templates ({filteredTemplates.length})
          </h3>
          <div className="space-y-1">
            {filteredTemplates.map(t => (
              <div key={t.name} className="border border-border rounded-md bg-card overflow-hidden">
                <button
                  onClick={() => handleExpandTemplate(t.name)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-hover transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground truncate">{t.displayName}</p>
                      <span className="text-[10px] text-dim font-mono">v{t.version}</span>
                      {t.kind === 'brief' && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-orange-500/15 text-orange-400">brief</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <p className="text-xs text-dim truncate flex-1">{t.description}</p>
                      {(t.persona || ['engineering']).map(p => (
                        <span key={p} className="text-[9px] px-1.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 shrink-0 capitalize">
                          {p.replace('-', ' ')}
                        </span>
                      ))}
                    </div>
                  </div>
                  {expandedTemplate === t.name ? (
                    <ChevronUp className="h-3.5 w-3.5 text-dim shrink-0" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-dim shrink-0" />
                  )}
                </button>

                {expandedTemplate === t.name && expandedManifest && (
                  <div className="border-t border-border px-3 py-2 space-y-2 bg-background/50">
                    {expandedManifest.variables.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase text-dim mb-1">Variables ({expandedManifest.variables.length})</p>
                        <div className="space-y-0.5">
                          {expandedManifest.variables.map(v => (
                            <div key={v.name} className="flex items-center gap-2 text-xs">
                              <span className="font-mono text-foreground">{v.name}</span>
                              <span className="text-dim">({v.type})</span>
                              {v.required && <span className="text-rose-400 text-[10px]">required</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {expandedManifest.composition?.pairsWith && expandedManifest.composition.pairsWith.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase text-dim mb-1">Pairs with</p>
                        <p className="text-xs text-dim font-mono">{expandedManifest.composition.pairsWith.join(', ')}</p>
                      </div>
                    )}
                    {onSelectTemplate && (
                      <Button
                        size="sm"
                        className="w-full"
                        onClick={() => onSelectTemplate(t.name, expandedManifest)}
                      >
                        Use in Scaffold Node
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Composites */}
      {mode !== 'templates' && filteredComposites.length > 0 && (
        <div className="space-y-1.5">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-dim flex items-center gap-1.5">
            <Package className="h-3 w-3" />
            Composites ({filteredComposites.length})
          </h3>
          <div className="space-y-1">
            {filteredComposites.map(c => (
              <div key={c.name} className="border border-border rounded-md bg-card px-3 py-2">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground truncate">{c.displayName}</p>
                      <span className="text-[10px] text-dim bg-input rounded px-1.5 py-0.5">
                        {c.templateCount} templates
                      </span>
                    </div>
                    <p className="text-xs text-dim truncate">{c.description}</p>
                  </div>
                  {onSelectComposite && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0 ml-2"
                      onClick={() => onSelectComposite(c.name)}
                    >
                      Generate Workflow
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {filteredTemplates.length === 0 && filteredComposites.length === 0 && (
        <p className="text-sm text-dim text-center py-8">No matching templates found.</p>
      )}
    </div>
  );
}
