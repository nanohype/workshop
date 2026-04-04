'use client';

import { useState, useEffect } from 'react';
import { FolderOpen, FileText, ChevronRight, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TemplatePreviewProps {
  templateName: string;
}

interface FileTree {
  name: string;
  path: string;
  isDir: boolean;
  children?: FileTree[];
}

function buildTree(paths: string[]): FileTree[] {
  const root: FileTree[] = [];
  const dirs = new Map<string, FileTree>();

  for (const path of paths.sort()) {
    const parts = path.split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const fullPath = parts.slice(0, i + 1).join('/');
      const isFile = i === parts.length - 1;

      if (isFile) {
        current.push({ name, path: fullPath, isDir: false });
      } else {
        let dir = dirs.get(fullPath);
        if (!dir) {
          dir = { name, path: fullPath, isDir: true, children: [] };
          dirs.set(fullPath, dir);
          current.push(dir);
        }
        current = dir.children!;
      }
    }
  }

  return root;
}

function TreeItem({ node, depth = 0 }: { node: FileTree; depth?: number }) {
  const [open, setOpen] = useState(depth < 2);

  return (
    <div>
      <button
        className={cn(
          'flex items-center gap-1 w-full text-left py-0.5 hover:bg-hover rounded-sm transition-colors',
          node.isDir ? 'text-foreground' : 'text-dim'
        )}
        style={{ paddingLeft: `${depth * 14 + 4}px` }}
        onClick={() => node.isDir && setOpen(!open)}
      >
        {node.isDir ? (
          <>
            {open ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
            <FolderOpen className="h-3 w-3 text-amber-400 shrink-0" />
          </>
        ) : (
          <>
            <span className="w-3" />
            <FileText className="h-3 w-3 text-dim shrink-0" />
          </>
        )}
        <span className="text-[11px] font-mono truncate">{node.name}</span>
      </button>
      {node.isDir && open && node.children?.map(child => (
        <TreeItem key={child.path} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

export function TemplatePreview({ templateName }: TemplatePreviewProps) {
  const [filePaths, setFilePaths] = useState<string[] | null>(null);

  useEffect(() => {
    if (!templateName) return;
    let cancelled = false;
    fetch(`/api/nanohype/templates/${templateName}`)
      .then(r => r.ok ? r.json() : { filePaths: [] })
      .then(data => { if (!cancelled) setFilePaths(data.filePaths || []); })
      .catch(() => { if (!cancelled) setFilePaths([]); });
    return () => { cancelled = true; };
  }, [templateName]);

  if (filePaths === null) return <p className="text-xs text-dim py-2">Loading preview...</p>;
  if (filePaths.length === 0) return <p className="text-xs text-dim py-2">No files</p>;

  const tree = buildTree(filePaths);

  return (
    <div className="border border-border rounded-md bg-background/50 p-2 max-h-[300px] overflow-y-auto">
      <p className="text-[10px] font-semibold uppercase text-dim mb-1">{filePaths.length} files</p>
      {tree.map(node => (
        <TreeItem key={node.path} node={node} />
      ))}
    </div>
  );
}
