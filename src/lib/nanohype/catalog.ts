/**
 * nanohype SDK integration layer.
 *
 * Wraps @nanohype/sdk to provide template discovery, rendering, and file writing
 * for workshop's scaffold nodes. Supports two catalog sources:
 *   - LocalSource: reads from a sibling nanohype repo (dev default)
 *   - GitHubSource: fetches from the nanohype/nanohype GitHub repo (production)
 *
 * Environment:
 *   NANOHYPE_SOURCE      — "local" (default) or "github"
 *   NANOHYPE_LOCAL_PATH  — filesystem path to nanohype repo root
 *   NANOHYPE_GITHUB_REPO — GitHub repo (default: nanohype/nanohype)
 *   NANOHYPE_GITHUB_TOKEN — GitHub token for private repos or rate limits
 */
import { LocalSource, GitHubSource, renderTemplate, renderComposite } from '@nanohype/sdk';
import type {
  CatalogSource,
  CatalogEntry,
  CompositeCatalogEntry,
  CompositeManifest,
  TemplateManifest,
  SkeletonFile,
  RenderResult,
  CompositeRenderResult,
} from '@nanohype/sdk';
import { mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';

export type { CatalogEntry, CompositeCatalogEntry, CompositeManifest, TemplateManifest, RenderResult, CompositeRenderResult };

const NANOHYPE_SOURCE = process.env.NANOHYPE_SOURCE || 'local';
const NANOHYPE_LOCAL_PATH = process.env.NANOHYPE_LOCAL_PATH || join(process.cwd(), '..', 'nanohype', 'nanohype');
const NANOHYPE_GITHUB_REPO = process.env.NANOHYPE_GITHUB_REPO || 'nanohype/nanohype';
const NANOHYPE_GITHUB_TOKEN = process.env.NANOHYPE_GITHUB_TOKEN;

let _source: CatalogSource | null = null;

export function getCatalogSource(): CatalogSource {
  if (_source) return _source;

  if (NANOHYPE_SOURCE === 'github') {
    _source = new GitHubSource({
      repo: NANOHYPE_GITHUB_REPO,
      token: NANOHYPE_GITHUB_TOKEN,
    });
  } else {
    _source = new LocalSource({ rootDir: NANOHYPE_LOCAL_PATH });
  }

  return _source;
}

export async function listTemplates(): Promise<CatalogEntry[]> {
  return getCatalogSource().listTemplates();
}

export async function fetchTemplate(name: string): Promise<{ manifest: TemplateManifest; files: SkeletonFile[] }> {
  return getCatalogSource().fetchTemplate(name);
}

export async function listComposites(): Promise<CompositeCatalogEntry[]> {
  return getCatalogSource().listComposites();
}

export async function fetchComposite(name: string): Promise<CompositeManifest> {
  return getCatalogSource().fetchComposite(name);
}

export interface ScaffoldResult {
  filesWritten: string[];
  warnings: string[];
  hooks: { pre: { name: string; run: string }[]; post: { name: string; run: string }[] };
  templateName: string;
  templateDisplayName: string;
}

export interface BriefRenderResult {
  content: string;
  templateName: string;
  templateDisplayName: string;
  warnings: string[];
}

export async function scaffoldTemplate(
  templateName: string,
  variables: Record<string, string | boolean | number>,
  workspacePath: string,
  subdir?: string,
): Promise<ScaffoldResult> {
  const source = getCatalogSource();
  const { manifest, files } = await source.fetchTemplate(templateName);
  const result: RenderResult = renderTemplate(manifest, files, variables);

  const outputBase = subdir ? join(workspacePath, subdir) : workspacePath;
  const filesWritten: string[] = [];

  for (const file of result.files) {
    const fullPath = join(outputBase, file.path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, file.content, 'utf-8');
    filesWritten.push(file.path);
  }

  return {
    filesWritten,
    warnings: result.warnings,
    hooks: {
      pre: result.hooks.pre.map(h => ({ name: h.name, run: h.run })),
      post: result.hooks.post.map(h => ({ name: h.name, run: h.run })),
    },
    templateName: manifest.name,
    templateDisplayName: manifest.displayName,
  };
}

/**
 * Render a brief template: same placeholder substitution as scaffoldTemplate,
 * but returns concatenated text instead of writing files. Skips hooks.
 */
export async function renderBrief(
  templateName: string,
  variables: Record<string, string | boolean | number>,
): Promise<BriefRenderResult> {
  const source = getCatalogSource();
  const { manifest, files } = await source.fetchTemplate(templateName);
  const result: RenderResult = renderTemplate(manifest, files, variables);

  const content = result.files
    .map(f => f.content)
    .join('\n\n');

  return {
    content,
    templateName: manifest.name,
    templateDisplayName: manifest.displayName,
    warnings: result.warnings,
  };
}

/**
 * Fetch a template's kind field without rendering.
 */
export async function fetchTemplateKind(templateName: string): Promise<string> {
  const source = getCatalogSource();
  const { manifest } = await source.fetchTemplate(templateName);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const kind = (manifest as any).kind;
  return kind === 'brief' ? 'brief' : 'template';
}

/**
 * Fetch a template's persona field.
 */
export async function fetchTemplatePersona(templateName: string): Promise<string[]> {
  const source = getCatalogSource();
  const { manifest } = await source.fetchTemplate(templateName);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (manifest as any).persona || ['engineering'];
}

export async function scaffoldComposite(
  compositeName: string,
  variables: Record<string, string | boolean | number>,
  workspacePath: string,
): Promise<{ filesWritten: string[]; warnings: string[]; entries: { template: string; path?: string; fileCount: number }[] }> {
  const source = getCatalogSource();
  const manifest = await source.fetchComposite(compositeName);
  const result: CompositeRenderResult = await renderComposite(manifest, variables, source);

  const filesWritten: string[] = [];
  for (const file of result.files) {
    const fullPath = join(workspacePath, file.path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, file.content, 'utf-8');
    filesWritten.push(file.path);
  }

  return {
    filesWritten,
    warnings: result.warnings,
    entries: result.entries,
  };
}
