import { mkdtempSync, rmSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProjectIndexManager, type ProjectIndex } from '../../project/index.js';
import { renderProjectContext } from '../../project/context-renderer.js';

// ---------------------------------------------------------------------------
// ProjectIndexManager
// ---------------------------------------------------------------------------

describe('ProjectIndexManager', () => {
  let tmp: string;
  let mgr: ProjectIndexManager;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'workshop-test-'));
    mgr = new ProjectIndexManager(tmp);
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('build() creates index from empty workspace', () => {
    const index = mgr.build();

    expect(index.version).toBe(1);
    expect(index.fileTree).toEqual([]);
    expect(index.templateProvenance).toEqual([]);
    expect(index.decisionLog).toEqual([]);
    expect(index.conventions).toEqual([]);
    expect(index.knownIssues).toEqual([]);
    expect(Object.keys(index.dependencies)).toHaveLength(0);
  });

  it('build() captures files', () => {
    writeFileSync(join(tmp, 'hello.txt'), 'hello world');

    const index = mgr.build();

    const entry = index.fileTree.find((f) => f.path === 'hello.txt');
    expect(entry).toBeDefined();
    expect(entry!.size).toBeGreaterThan(0);
  });

  it('build() parses package.json', () => {
    writeFileSync(
      join(tmp, 'package.json'),
      JSON.stringify({
        dependencies: { react: '^18.0.0', zod: '^3.0.0' },
        devDependencies: { vitest: '^1.0.0' },
      }),
    );

    const index = mgr.build();

    expect(index.dependencies['package.json']).toBeDefined();
    expect(index.dependencies['package.json'].type).toBe('npm');
    expect(index.dependencies['package.json'].dependencies).toContain('react');
    expect(index.dependencies['package.json'].dependencies).toContain('zod');
    expect(index.dependencies['package.json'].devDependencies).toContain('vitest');
  });

  it('load() returns null when no index', () => {
    const result = mgr.load();
    expect(result).toBeNull();
  });

  it('save() and load() round-trip', () => {
    const index = mgr.build();
    mgr.save(index);

    const loaded = mgr.load();
    expect(loaded).not.toBeNull();
    expect(loaded!.version).toBe(index.version);
    expect(loaded!.fileTree).toEqual(index.fileTree);
    expect(loaded!.templateProvenance).toEqual(index.templateProvenance);
    expect(loaded!.decisionLog).toEqual(index.decisionLog);
    expect(loaded!.conventions).toEqual(index.conventions);
    expect(loaded!.knownIssues).toEqual(index.knownIssues);
  });

  it('refresh() picks up new files', () => {
    writeFileSync(join(tmp, 'original.txt'), 'original');
    const index = mgr.build();
    mgr.save(index);

    writeFileSync(join(tmp, 'added.txt'), 'new file');
    const refreshed = mgr.refresh(index);

    const paths = refreshed.fileTree.map((f) => f.path);
    expect(paths).toContain('original.txt');
    expect(paths).toContain('added.txt');
  });

  it('refresh() preserves decision log', () => {
    const index = mgr.build();
    mgr.appendDecision(index, { text: 'Use vitest', source: 'human' });
    mgr.save(index);

    const refreshed = mgr.refresh(index);

    expect(refreshed.decisionLog).toHaveLength(1);
    expect(refreshed.decisionLog[0].text).toBe('Use vitest');
  });

  it('addTemplateProvenance() appends', () => {
    const index = mgr.build();

    const provenance = (name: string) => ({
      template: name,
      displayName: name,
      outputSubdir: './',
      filesWritten: [],
      variables: {},
      scaffoldedAt: new Date().toISOString(),
    });

    mgr.addTemplateProvenance(index, provenance('template-a'));
    mgr.addTemplateProvenance(index, provenance('template-b'));

    expect(index.templateProvenance).toHaveLength(2);
  });

  it('appendDecision() is append-only', () => {
    const index = mgr.build();

    mgr.appendDecision(index, { text: 'Decision A', source: 'human' });
    mgr.appendDecision(index, { text: 'Decision B', source: 'agent' });
    mgr.appendDecision(index, { text: 'Decision C', source: 'human' });

    expect(index.decisionLog).toHaveLength(3);
    expect(index.decisionLog[0].text).toBe('Decision A');
    expect(index.decisionLog[1].text).toBe('Decision B');
    expect(index.decisionLog[2].text).toBe('Decision C');

    const ids = new Set(index.decisionLog.map((d) => d.id));
    expect(ids.size).toBe(3);
  });

  it('addConvention() deduplicates', () => {
    const index = mgr.build();

    mgr.addConvention(index, { text: 'Use single quotes', source: 'human' });
    mgr.addConvention(index, { text: 'Use single quotes', source: 'human' });

    expect(index.conventions).toHaveLength(1);
  });

  it('addKnownIssue() deduplicates', () => {
    const index = mgr.build();

    mgr.addKnownIssue(index, { text: 'Flaky CI on arm64', source: 'agent' });
    mgr.addKnownIssue(index, { text: 'Flaky CI on arm64', source: 'agent' });

    expect(index.knownIssues).toHaveLength(1);
  });

  it('gc() removes stale entries', () => {
    writeFileSync(join(tmp, 'keep.txt'), 'keep');
    writeFileSync(join(tmp, 'remove.txt'), 'remove');

    const index = mgr.build();
    expect(index.fileTree).toHaveLength(2);

    unlinkSync(join(tmp, 'remove.txt'));
    mgr.gc(index);

    const paths = index.fileTree.map((f) => f.path);
    expect(paths).toContain('keep.txt');
    expect(paths).not.toContain('remove.txt');
    expect(index.fileTree).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// renderProjectContext
// ---------------------------------------------------------------------------

describe('renderProjectContext', () => {
  function emptyIndex(): ProjectIndex {
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      fileTree: [],
      dependencies: {},
      templateProvenance: [],
      decisionLog: [],
      conventions: [],
      knownIssues: [],
    };
  }

  it('returns empty string for empty index', () => {
    const result = renderProjectContext(emptyIndex());
    expect(result).toBe('');
  });

  it('respects token budget', () => {
    const index = emptyIndex();

    // Add many conventions to produce a large output
    for (let i = 0; i < 100; i++) {
      index.conventions.push({
        id: `conv-${i}`,
        text: `Convention number ${i} with some extra padding text to fill space`,
        source: 'human',
        createdAt: new Date().toISOString(),
      });
    }

    const result = renderProjectContext(index, { tokenBudget: 50 });

    // tokenBudget 50 * charsPerToken 4 = 200 chars max
    expect(result.length).toBeLessThanOrEqual(200);
  });

  it('includes template provenance', () => {
    const index = emptyIndex();
    index.templateProvenance.push({
      template: 'next-app',
      displayName: 'Next.js App',
      outputSubdir: './',
      filesWritten: ['package.json'],
      variables: {},
      scaffoldedAt: new Date().toISOString(),
    });

    const result = renderProjectContext(index);

    expect(result).toContain('Next.js App');
  });

  it('includes conventions', () => {
    const index = emptyIndex();
    index.conventions.push({
      id: 'c1',
      text: 'Always use strict TypeScript',
      source: 'human',
      createdAt: new Date().toISOString(),
    });

    const result = renderProjectContext(index);

    expect(result).toContain('Always use strict TypeScript');
  });

  it('includes [Project Context] header', () => {
    const index = emptyIndex();
    index.conventions.push({
      id: 'c1',
      text: 'A convention',
      source: 'human',
      createdAt: new Date().toISOString(),
    });

    const result = renderProjectContext(index);

    expect(result).toMatch(/^\[Project Context\]/);
  });
});

// ---------------------------------------------------------------------------
// Marker extraction regex patterns
// ---------------------------------------------------------------------------

describe('decision marker regex', () => {
  const DECISION_RE = /<!--\s*decision:\s*([\s\S]*?)\s*-->/g;

  it('extracts decision markers from text', () => {
    const text = '<!-- decision: Use Zustand for state -->';
    const matches = [...text.matchAll(DECISION_RE)];

    expect(matches).toHaveLength(1);
    expect(matches[0][1]).toBe('Use Zustand for state');
  });

  it('extracts multiple markers', () => {
    const text = [
      '<!-- decision: Use Zustand for state -->',
      'Some prose in between.',
      '<!-- decision: Prefer server components -->',
    ].join('\n');

    const matches = [...text.matchAll(DECISION_RE)];

    expect(matches).toHaveLength(2);
    expect(matches[0][1]).toBe('Use Zustand for state');
    expect(matches[1][1]).toBe('Prefer server components');
  });

  it('handles extra whitespace', () => {
    const text = '<!--  decision:  some text  -->';
    const matches = [...text.matchAll(DECISION_RE)];

    expect(matches).toHaveLength(1);
    expect(matches[0][1]).toBe('some text');
  });

  it('handles multiline marker content', () => {
    const text = '<!-- decision:\n  chose Drizzle over Prisma\n  for type safety\n-->';
    const matches = [...text.matchAll(DECISION_RE)];

    expect(matches).toHaveLength(1);
    expect(matches[0][1]).toBe('chose Drizzle over Prisma\n  for type safety');
  });
});
