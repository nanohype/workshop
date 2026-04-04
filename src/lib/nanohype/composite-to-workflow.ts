/**
 * Composite-to-workflow generator.
 *
 * Converts a nanohype CompositeManifest into a complete workshop workflow graph.
 * Each template entry in the composite becomes a scaffold node paired with a
 * review agent node. Root entries scaffold at workspace root; non-root entries
 * scaffold into subdirectories. Parallel branches merge into a final integration
 * agent that checks cross-module consistency.
 *
 * Layout: Input → root scaffold/agent → parallel sub-scaffolds → integration → Output
 */
import type { WorkflowNode, WorkflowEdge } from '../engine/types';
import type { CompositeManifest } from '@nanohype/sdk';
import { resolveVariables } from '@nanohype/sdk';

interface GeneratedWorkflow {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  variables: Record<string, string>;
}

/**
 * Generate a Workshop workflow from a nanohype composite manifest.
 *
 * Each active template entry becomes a scaffold node + review agent pair.
 * Root entries scaffold at workspace root; non-root entries scaffold into subdirectories.
 * A final integration agent reviews cross-module integration.
 */
export function compositeToWorkflow(
  manifest: CompositeManifest,
  values: Record<string, string | boolean | number>,
): GeneratedWorkflow {
  // Resolve composite-level variables
  const resolved = resolveVariables(manifest.variables, values);

  // Filter active entries (evaluate conditions)
  const activeEntries = manifest.templates.filter(entry => {
    if (!entry.condition) return true;
    return resolved[entry.condition] === 'true';
  });

  if (activeEntries.length === 0) {
    throw new Error('No active template entries in composite after condition evaluation');
  }

  const nodes: WorkflowNode[] = [];
  const edges: WorkflowEdge[] = [];
  let edgeCounter = 0;

  const nextEdgeId = () => `e-${++edgeCounter}`;

  // Layout constants
  const startX = 250;
  const startY = 50;
  const yGap = 200;
  const xGap = 300;

  // 1. Input node
  const inputId = 'input-1';
  nodes.push({
    id: inputId,
    type: 'input',
    position: { x: startX, y: startY },
    data: { label: manifest.displayName },
  });

  // Separate root and non-root entries
  const rootEntries = activeEntries.filter(e => e.root);
  const subEntries = activeEntries.filter(e => !e.root);

  let currentY = startY + yGap;
  let lastNodeIds: string[] = [inputId];

  // 2. Root entries (sequential, at workspace root)
  for (const entry of rootEntries) {
    const suffix = entry.path || 'root';
    const scaffoldId = `scaffold-${entry.template}-${suffix}`;
    const agentId = `agent-review-${entry.template}-${suffix}`;

    // Resolve entry-level variables
    const entryVars: Record<string, string | boolean | number> = {};
    for (const [key, val] of Object.entries(entry.variables || {})) {
      if (typeof val === 'string' && val.startsWith('${') && val.endsWith('}')) {
        const varRef = val.slice(2, -1);
        entryVars[key] = resolved[varRef] ?? val;
      } else {
        entryVars[key] = val;
      }
    }

    // Scaffold node
    nodes.push({
      id: scaffoldId,
      type: 'scaffold',
      position: { x: startX, y: currentY },
      data: {
        label: `Scaffold: ${entry.template}`,
        templateName: entry.template,
        templateVariables: entryVars,
        workspace: 'full',
      },
    });
    for (const prevId of lastNodeIds) {
      edges.push({ id: nextEdgeId(), source: prevId, target: scaffoldId });
    }

    currentY += yGap;

    // Review agent node
    nodes.push({
      id: agentId,
      type: 'agent',
      position: { x: startX, y: currentY },
      data: {
        label: `Review: ${entry.template}`,
        systemPrompt: `Review the scaffolded "${entry.template}" code. Check for:\n- Correct imports and module resolution\n- Placeholder values that need customization\n- Missing dependencies in package.json\n- Any compilation or type errors\n\nFix any issues you find.`,
        workspace: 'full',
        maxTurns: 10,
      },
    });
    edges.push({ id: nextEdgeId(), source: scaffoldId, target: agentId });

    currentY += yGap;
    lastNodeIds = [agentId];
  }

  // 3. Non-root entries (parallel branches)
  if (subEntries.length > 0) {
    const branchStartIds = [...lastNodeIds];
    const branchEndIds: string[] = [];
    const totalWidth = (subEntries.length - 1) * xGap;
    const branchStartX = startX - totalWidth / 2;

    for (let i = 0; i < subEntries.length; i++) {
      const entry = subEntries[i];
      const branchX = branchStartX + i * xGap;
      const suffix = entry.path || entry.template;
      const scaffoldId = `scaffold-${entry.template}-${suffix}`;
      const agentId = `agent-review-${entry.template}-${suffix}`;

      const entryVars: Record<string, string | boolean | number> = {};
      for (const [key, val] of Object.entries(entry.variables || {})) {
        if (typeof val === 'string' && val.startsWith('${') && val.endsWith('}')) {
          const varRef = val.slice(2, -1);
          entryVars[key] = resolved[varRef] ?? val;
        } else {
          entryVars[key] = val;
        }
      }

      // Scaffold node
      nodes.push({
        id: scaffoldId,
        type: 'scaffold',
        position: { x: branchX, y: currentY },
        data: {
          label: `Scaffold: ${entry.template}`,
          templateName: entry.template,
          templateVariables: entryVars,
          outputSubdir: entry.path || entry.template,
          workspace: 'full',
        },
      });
      for (const prevId of branchStartIds) {
        edges.push({ id: nextEdgeId(), source: prevId, target: scaffoldId });
      }

      // Review agent
      nodes.push({
        id: agentId,
        type: 'agent',
        position: { x: branchX, y: currentY + yGap },
        data: {
          label: `Review: ${entry.template}`,
          systemPrompt: `Review the scaffolded "${entry.template}" code in the "${entry.path || entry.template}/" subdirectory. Verify it integrates correctly with the root project. Fix any import paths, missing dependencies, or configuration issues.`,
          workspace: 'full',
          maxTurns: 10,
        },
      });
      edges.push({ id: nextEdgeId(), source: scaffoldId, target: agentId });

      branchEndIds.push(agentId);
    }

    currentY += yGap * 2 + yGap;

    // 4. Integration agent (merges all branches)
    const integrationId = 'agent-integration';
    nodes.push({
      id: integrationId,
      type: 'agent',
      position: { x: startX, y: currentY },
      data: {
        label: 'Integration Review',
        systemPrompt: `Review the entire scaffolded project for cross-module integration:\n- Verify all import paths between modules are correct\n- Check package.json has all dependencies\n- Ensure shared types and interfaces are consistent\n- Run any available build/typecheck commands\n- Fix any integration issues found.`,
        workspace: 'full',
        maxTurns: 15,
      },
    });
    for (const branchId of branchEndIds) {
      edges.push({ id: nextEdgeId(), source: branchId, target: integrationId });
    }

    currentY += yGap;
    lastNodeIds = [integrationId];
  }

  // 5. Output node
  const outputId = 'output-1';
  nodes.push({
    id: outputId,
    type: 'output',
    position: { x: startX, y: currentY },
    data: { label: 'Scaffolded Project' },
  });
  for (const prevId of lastNodeIds) {
    edges.push({ id: nextEdgeId(), source: prevId, target: outputId });
  }

  // Build workflow variables from composite variables
  const workflowVars: Record<string, string> = {};
  for (const v of manifest.variables) {
    workflowVars[v.name] = String(resolved[v.name] ?? v.default ?? '');
  }

  return { nodes, edges, variables: workflowVars };
}
