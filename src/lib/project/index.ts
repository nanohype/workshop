import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'fs';
import { join, relative } from 'path';
import { randomUUID } from 'crypto';

export interface FileTreeEntry {
  path: string;
  size: number;
  mtimeMs: number;
}

export interface DependencyGraph {
  [manifestPath: string]: {
    type: 'npm' | 'go' | 'python' | 'unknown';
    dependencies: string[];
    devDependencies?: string[];
  };
}

export interface TemplateProvenance {
  template: string;
  displayName: string;
  outputSubdir: string;
  filesWritten: string[];
  variables: Record<string, unknown>;
  scaffoldedAt: string;
}

export interface DecisionEntry {
  id: string;
  text: string;
  source: string;
  createdAt: string;
}

export interface ConventionEntry {
  id: string;
  text: string;
  source: string;
  createdAt: string;
}

export interface KnownIssueEntry {
  id: string;
  text: string;
  source: string;
  resolved: boolean;
  createdAt: string;
}

export interface ProjectIndex {
  version: 1;
  updatedAt: string;
  fileTree: FileTreeEntry[];
  dependencies: DependencyGraph;
  templateProvenance: TemplateProvenance[];
  decisionLog: DecisionEntry[];
  conventions: ConventionEntry[];
  knownIssues: KnownIssueEntry[];
}

const SKIP_DIRS = new Set(['node_modules', '.workshop']);
const MAX_DEPTH = 10;
const MAX_FILES = 10_000;

function walkDir(root: string): FileTreeEntry[] {
  const entries: FileTreeEntry[] = [];

  try {
    const dirents = readdirSync(root, { withFileTypes: true, recursive: true });

    for (const dirent of dirents) {
      if (entries.length >= MAX_FILES) break;

      const fullPath = join(dirent.parentPath ?? dirent.path, dirent.name);
      const rel = relative(root, fullPath);
      const segments = rel.split('/');

      // Skip directories starting with '.' or in the skip list
      const shouldSkip = segments.some(
        (seg, i) =>
          i < segments.length - 1 &&
          (seg.startsWith('.') || SKIP_DIRS.has(seg)),
      );
      if (shouldSkip) continue;

      // Enforce max depth
      if (segments.length > MAX_DEPTH) continue;

      // Skip symlinks — prevents traversal outside workspace
      if (dirent.isSymbolicLink()) continue;

      if (dirent.isFile()) {
        // Also skip dotfiles at root that are directories matched above,
        // but allow dotfiles themselves as entries
        try {
          const stat = statSync(fullPath);
          entries.push({
            path: rel,
            size: stat.size,
            mtimeMs: stat.mtimeMs,
          });
        } catch {
          // File may have been removed between readdir and stat
        }
      }
    }
  } catch {
    // Root directory doesn't exist or isn't readable
  }

  return entries;
}

function parsePackageJson(workspacePath: string): DependencyGraph {
  const graph: DependencyGraph = {};
  const manifestPath = join(workspacePath, 'package.json');

  try {
    const raw = readFileSync(manifestPath, 'utf-8');
    const pkg = JSON.parse(raw);
    const deps = pkg.dependencies ? Object.keys(pkg.dependencies) : [];
    const devDeps = pkg.devDependencies
      ? Object.keys(pkg.devDependencies)
      : [];

    graph['package.json'] = {
      type: 'npm',
      dependencies: deps,
      ...(devDeps.length > 0 ? { devDependencies: devDeps } : {}),
    };
  } catch {
    // No package.json or invalid JSON
  }

  return graph;
}

function parseGoMod(workspacePath: string): DependencyGraph {
  const graph: DependencyGraph = {};
  const manifestPath = join(workspacePath, 'go.mod');

  try {
    const raw = readFileSync(manifestPath, 'utf-8');
    const requireBlock = raw.match(/require\s*\(([\s\S]*?)\)/);
    const deps: string[] = [];

    if (requireBlock) {
      const lines = requireBlock[1].split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('//')) {
          const moduleName = trimmed.split(/\s+/)[0];
          if (moduleName) deps.push(moduleName);
        }
      }
    }

    if (deps.length > 0) {
      graph['go.mod'] = { type: 'go', dependencies: deps };
    }
  } catch {
    // No go.mod or unreadable
  }

  return graph;
}

function parseRequirementsTxt(workspacePath: string): DependencyGraph {
  const graph: DependencyGraph = {};
  const manifestPath = join(workspacePath, 'requirements.txt');

  try {
    const raw = readFileSync(manifestPath, 'utf-8');
    const deps: string[] = [];

    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('-')) {
        // Strip version specifiers: ==, >=, <=, ~=, !=, >, <, [extras]
        const name = trimmed
          .split(/[=<>!~;@\[]/)[0]
          .trim();
        if (name) deps.push(name);
      }
    }

    if (deps.length > 0) {
      graph['requirements.txt'] = { type: 'python', dependencies: deps };
    }
  } catch {
    // No requirements.txt or unreadable
  }

  return graph;
}

function scanDependencies(workspacePath: string): DependencyGraph {
  return {
    ...parsePackageJson(workspacePath),
    ...parseGoMod(workspacePath),
    ...parseRequirementsTxt(workspacePath),
  };
}

export class ProjectIndexManager {
  private indexPath: string;
  private workspacePath: string;

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
    this.indexPath = join(workspacePath, '.workshop', 'project.json');
  }

  load(): ProjectIndex | null {
    try {
      const raw = readFileSync(this.indexPath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || parsed.version !== 1) return null;
      // Ensure required arrays exist (guards against hand-edited or corrupt files)
      parsed.fileTree ??= [];
      parsed.dependencies ??= {};
      parsed.templateProvenance ??= [];
      parsed.decisionLog ??= [];
      parsed.conventions ??= [];
      parsed.knownIssues ??= [];
      return parsed as ProjectIndex;
    } catch {
      return null;
    }
  }

  save(index: ProjectIndex): void {
    index.updatedAt = new Date().toISOString();

    const dir = join(this.workspacePath, '.workshop');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const tmpPath = `${this.indexPath}.tmp`;
    writeFileSync(tmpPath, JSON.stringify(index, null, 2), 'utf-8');
    renameSync(tmpPath, this.indexPath);
  }

  build(): ProjectIndex {
    const fileTree = walkDir(this.workspacePath);
    const dependencies = scanDependencies(this.workspacePath);

    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      fileTree,
      dependencies,
      templateProvenance: [],
      decisionLog: [],
      conventions: [],
      knownIssues: [],
    };
  }

  refresh(index: ProjectIndex): ProjectIndex {
    const fileTree = walkDir(this.workspacePath);
    const dependencies = scanDependencies(this.workspacePath);

    return {
      ...index,
      updatedAt: new Date().toISOString(),
      fileTree,
      dependencies,
      templateProvenance: index.templateProvenance ?? [],
      decisionLog: index.decisionLog ?? [],
      conventions: index.conventions ?? [],
      knownIssues: index.knownIssues ?? [],
    };
  }

  addTemplateProvenance(
    index: ProjectIndex,
    provenance: TemplateProvenance,
  ): ProjectIndex {
    index.templateProvenance.push(provenance);
    return index;
  }

  appendDecision(
    index: ProjectIndex,
    entry: Omit<DecisionEntry, 'id' | 'createdAt'>,
  ): ProjectIndex {
    index.decisionLog.push({
      ...entry,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    });
    return index;
  }

  addConvention(
    index: ProjectIndex,
    entry: Omit<ConventionEntry, 'id' | 'createdAt'>,
  ): ProjectIndex {
    const exists = index.conventions.some(
      (c) => c.text.toLowerCase() === entry.text.toLowerCase(),
    );
    if (exists) return index;

    index.conventions.push({
      ...entry,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    });
    return index;
  }

  addKnownIssue(
    index: ProjectIndex,
    entry: Omit<KnownIssueEntry, 'id' | 'createdAt' | 'resolved'>,
  ): ProjectIndex {
    const exists = index.knownIssues.some(
      (i) => i.text.toLowerCase() === entry.text.toLowerCase(),
    );
    if (exists) return index;

    index.knownIssues.push({
      ...entry,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      resolved: false,
    });
    return index;
  }

  gc(index: ProjectIndex): ProjectIndex {
    index.fileTree = index.fileTree.filter((entry) =>
      existsSync(join(this.workspacePath, entry.path)),
    );
    return index;
  }
}
