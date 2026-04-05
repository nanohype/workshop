import type { ProjectIndex } from './index.js';

export interface RenderOptions {
  tokenBudget?: number;
  charsPerToken?: number;
}

function buildTemplateSection(index: ProjectIndex): string {
  if (!index.templateProvenance?.length) return '';

  const lines = ['Templates used:'];
  for (const t of index.templateProvenance) {
    const fileCount = t.filesWritten?.length ?? 0;
    lines.push(
      `- ${t.displayName} (output: ${t.outputSubdir || './'}) \u2014 ${fileCount} files`,
    );
  }
  return lines.join('\n');
}

function buildConventionsSection(index: ProjectIndex): string {
  if (!index.conventions?.length) return '';

  const lines = ['Conventions:'];
  for (const c of index.conventions) {
    lines.push(`- ${c.text}`);
  }
  return lines.join('\n');
}

function buildKnownIssuesSection(index: ProjectIndex): string {
  const unresolved = (index.knownIssues ?? []).filter((i) => !i.resolved);
  if (!unresolved.length) return '';

  const lines = ['Known issues:'];
  for (const issue of unresolved) {
    lines.push(`- ${issue.text}`);
  }
  return lines.join('\n');
}

function buildDecisionLogSection(index: ProjectIndex): string {
  if (!index.decisionLog?.length) return '';

  const sorted = [...index.decisionLog]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 10);

  const lines = ['Recent decisions:'];
  for (const d of sorted) {
    const date = d.createdAt.slice(0, 10);
    lines.push(`- [${date}] ${d.text} (source: ${d.source})`);
  }
  return lines.join('\n');
}

function buildDependencySection(index: ProjectIndex): string {
  const manifests = Object.entries(index.dependencies ?? {});
  if (!manifests.length) return '';

  const lines: string[] = [];
  for (const [, info] of manifests) {
    const allDeps = [
      ...info.dependencies,
      ...(info.devDependencies ?? []),
    ];
    if (allDeps.length) {
      lines.push(`Dependencies (${info.type}): ${allDeps.join(', ')}`);
    }
  }
  return lines.length ? lines.join('\n') : '';
}

function buildFileTreeSection(index: ProjectIndex): string {
  if (!index.fileTree?.length) return '';

  const totalFiles = index.fileTree.length;
  const dirCounts = new Map<string, number>();
  let rootFileCount = 0;

  for (const entry of index.fileTree) {
    const firstSlash = entry.path.indexOf('/');
    if (firstSlash === -1) {
      rootFileCount++;
    } else {
      const topDir = entry.path.slice(0, firstSlash);
      dirCounts.set(topDir, (dirCounts.get(topDir) ?? 0) + 1);
    }
  }

  const lines = [`Project structure (${totalFiles} files):`];

  const sorted = Array.from(dirCounts.entries()).sort((a, b) => b[1] - a[1]);
  for (const [dir, count] of sorted) {
    lines.push(`  ${dir}/`.padEnd(16) + `\u2014 ${count} files`);
  }

  if (rootFileCount > 0) {
    lines.push(`  ${rootFileCount} root files`);
  }

  return lines.join('\n');
}

function isEmptyIndex(index: ProjectIndex): boolean {
  return (
    (!index.templateProvenance || index.templateProvenance.length === 0) &&
    (!index.conventions || index.conventions.length === 0) &&
    (!index.knownIssues || index.knownIssues.length === 0) &&
    (!index.decisionLog || index.decisionLog.length === 0) &&
    (!index.fileTree || index.fileTree.length === 0) &&
    Object.keys(index.dependencies ?? {}).length === 0
  );
}

export function renderProjectContext(
  index: ProjectIndex,
  options?: RenderOptions,
): string {
  if (isEmptyIndex(index)) return '';

  const charBudget =
    (options?.tokenBudget ?? 2000) * (options?.charsPerToken ?? 4);

  const header = `[Project Context]\nLast updated: ${index.updatedAt}`;

  const sectionBuilders = [
    buildTemplateSection,
    buildConventionsSection,
    buildKnownIssuesSection,
    buildDecisionLogSection,
    buildDependencySection,
    buildFileTreeSection,
  ];

  const sections: string[] = [header];
  let accumulated = header.length;

  for (const builder of sectionBuilders) {
    const section = builder(index);
    if (!section) continue;

    const sectionWithSeparator = '\n\n' + section;
    if (accumulated + sectionWithSeparator.length > charBudget) break;

    sections.push(section);
    accumulated += sectionWithSeparator.length;
  }

  return sections.join('\n\n');
}
