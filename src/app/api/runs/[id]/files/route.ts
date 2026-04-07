import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { runs } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getAuthUserId } from '@/lib/api-auth';
import { handleApiError } from '@/lib/api-error';
import { parseUuid } from '@/lib/validation';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, resolve, normalize } from 'path';

interface FileEntry {
  path: string;
  size: number;
  isDirectory: boolean;
}

function walkDir(baseDir: string, currentDir: string, entries: FileEntry[], maxDepth = 10): void {
  if (maxDepth <= 0 || entries.length >= 10_000) return;

  const items = readdirSync(currentDir, { withFileTypes: true });
  for (const item of items) {
    if (entries.length >= 10_000) return;

    const fullPath = join(currentDir, item.name);
    const relativePath = relative(baseDir, fullPath);
    if (item.isDirectory()) {
      if (item.name.startsWith('.') || item.name === 'node_modules') continue;
      entries.push({ path: relativePath, size: 0, isDirectory: true });
      walkDir(baseDir, fullPath, entries, maxDepth - 1);
    } else if (item.isFile()) {
      const stat = statSync(fullPath);
      entries.push({ path: relativePath, size: stat.size, isDirectory: false });
    }
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getAuthUserId();
    const { id } = await params;

    const check = parseUuid(id, 'run ID');
    if (!check.success) return check.response;

    // Fetch run and verify ownership
    const [run] = await db
      .select()
      .from(runs)
      .where(and(eq(runs.id, id), eq(runs.userId, userId)));

    if (!run) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 });
    }

    // Get workspace path from run context
    const context = (run.context || {}) as Record<string, unknown>;
    const workspacePath = context._workspacePath as string | undefined;

    if (!workspacePath) {
      return NextResponse.json({ files: [], workspacePath: null });
    }

    const url = new URL(request.url);
    const filePath = url.searchParams.get('path');

    if (filePath) {
      // Return file contents
      const resolved = resolve(workspacePath, normalize(filePath));
      // Prevent path traversal
      if (!resolved.startsWith(workspacePath + '/') && resolved !== workspacePath) {
        return NextResponse.json({ error: 'Invalid file path' }, { status: 400 });
      }

      try {
        const stat = statSync(resolved);
        // Limit file size for inline preview (1MB)
        if (stat.size > 1_048_576) {
          return NextResponse.json({
            path: filePath,
            size: stat.size,
            content: null,
            truncated: true,
            message: 'File too large for inline preview (>1MB)',
          });
        }

        const content = readFileSync(resolved, 'utf-8');
        return NextResponse.json({
          path: filePath,
          size: stat.size,
          content,
          truncated: false,
        });
      } catch {
        return NextResponse.json({ error: 'File not found' }, { status: 404 });
      }
    }

    // List all files in workspace
    const files: FileEntry[] = [];
    try {
      walkDir(workspacePath, workspacePath, files);
    } catch {
      // Workspace directory may not exist
    }

    return NextResponse.json({ files, workspacePath });
  } catch (error) {
    return handleApiError(error, 'GET /api/runs/:id/files');
  }
}
