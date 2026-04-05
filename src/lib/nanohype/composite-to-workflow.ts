/**
 * Composite-to-workflow generator.
 *
 * Converts a nanohype CompositeManifest into a complete workshop workflow graph.
 * Each template entry becomes a scaffold node paired with a review or execution
 * agent. Brief templates pair with execution agents; regular templates pair with
 * persona-specific review agents.
 *
 * Entries are grouped by persona. Within a persona group, entries run sequentially.
 * Across groups, they run in parallel. A final integration agent reviews
 * cross-module consistency.
 *
 * Layout: Input → root scaffold/agent → persona-grouped parallel branches → integration → Output
 */
import type { WorkflowNode, WorkflowEdge } from '../engine/types';
import type { CompositeManifest } from '@nanohype/sdk';
import { resolveVariables } from '@nanohype/sdk';

interface GeneratedWorkflow {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  variables: Record<string, string>;
}

interface GeneratorOptions {
  defaultProvider?: string;
}

// Persona-specific review prompts
const REVIEW_PROMPTS: Record<string, string> = {
  engineering: 'Review the scaffolded code. Check for:\n- Correct imports and module resolution\n- Placeholder values that need customization\n- Missing dependencies in package.json\n- Any compilation or type errors\n\nFix any issues you find.',
  design: 'Review the scaffolded design artifacts. Check for:\n- Consistency in token naming and values\n- Completeness of component definitions\n- Accessibility annotations\n- Cross-references between documents\n\nFix any issues you find.',
  qa: 'Review the scaffolded QA artifacts. Check for:\n- Test coverage completeness\n- Traceability between tests and requirements\n- Environment configuration accuracy\n- Realistic test data definitions\n\nFix any issues you find.',
  product: 'Review the scaffolded product artifacts. Check for:\n- Clarity of problem statement and requirements\n- Completeness of user stories and acceptance criteria\n- Measurability of success metrics\n- Alignment between sections\n\nFix any issues you find.',
  marketing: 'Review the scaffolded marketing artifacts. Check for:\n- Messaging consistency across channels\n- Audience segment definition clarity\n- Timeline feasibility\n- KPI measurability\n\nFix any issues you find.',
  sales: 'Review the scaffolded sales artifacts. Check for:\n- Competitive positioning accuracy\n- Pricing structure clarity\n- Objection handling completeness\n- Proposal narrative coherence\n\nFix any issues you find.',
  operations: 'Review the scaffolded operations artifacts. Check for:\n- Procedure completeness and accuracy\n- Escalation path clarity\n- Dependency map correctness\n- Incident response coverage\n\nFix any issues you find.',
  'customer-success': 'Review the scaffolded customer success artifacts. Check for:\n- Milestone definition clarity\n- Health scoring criteria specificity\n- Handoff procedure completeness\n- Success criteria measurability\n\nFix any issues you find.',
};

function getReviewPrompt(template: string, persona: string, path?: string): string {
  const base = REVIEW_PROMPTS[persona] || REVIEW_PROMPTS.engineering;
  const location = path ? ` in the "${path}/" subdirectory` : '';
  return `Review the scaffolded "${template}"${location}. ${base}`;
}

function getExecutionPrompt(template: string): string {
  return `You have received a brief from the "${template}" template. Follow the instructions in the brief exactly and produce the requested deliverable. The brief contains Context, Brief, Output Specification, and Quality Criteria sections — follow all of them.`;
}

/**
 * Infer the primary persona of a template from its name.
 * This heuristic is used when the composite doesn't have persona info.
 */
function inferPersona(templateName: string): string {
  if (templateName.startsWith('brief-')) {
    const suffix = templateName.replace('brief-', '');
    if (suffix.includes('design')) return 'design';
    if (suffix.includes('test') || suffix.includes('qa')) return 'qa';
    if (suffix.includes('prd') || suffix.includes('research')) return 'product';
    if (suffix.includes('campaign') || suffix.includes('content')) return 'marketing';
    if (suffix.includes('proposal') || suffix.includes('battle')) return 'sales';
    if (suffix.includes('runbook') || suffix.includes('compliance')) return 'operations';
    if (suffix.includes('onboarding') || suffix.includes('qbr')) return 'customer-success';
  }
  if (['design-system', 'component-inventory', 'brand-guidelines', 'design-tokens'].includes(templateName)) return 'design';
  if (['test-plan', 'acceptance-criteria', 'test-automation', 'release-checklist'].includes(templateName)) return 'qa';
  if (['prd-template', 'research-framework'].includes(templateName)) return 'product';
  if (['campaign-brief', 'content-calendar'].includes(templateName)) return 'marketing';
  if (['proposal-template', 'battle-cards'].includes(templateName)) return 'sales';
  if (['runbook', 'compliance-checklist'].includes(templateName)) return 'operations';
  if (['onboarding-playbook', 'qbr-template'].includes(templateName)) return 'customer-success';
  return 'engineering';
}

function isBriefTemplate(templateName: string): boolean {
  return templateName.startsWith('brief-');
}

/**
 * Generate a Workshop workflow from a nanohype composite manifest.
 */
export function compositeToWorkflow(
  manifest: CompositeManifest,
  values: Record<string, string | boolean | number>,
  options: GeneratorOptions = {},
): GeneratedWorkflow {
  const resolved = resolveVariables(manifest.variables, values);

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

  let nodeCounter = 0;
  const nextEdgeId = () => `e-${++edgeCounter}`;
  const nextNodeSuffix = () => `${++nodeCounter}`;

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

  const rootEntries = activeEntries.filter(e => e.root);
  const subEntries = activeEntries.filter(e => !e.root);

  let currentY = startY + yGap;
  let lastNodeIds: string[] = [inputId];

  // Helper: resolve entry variables
  function resolveEntryVars(entry: typeof activeEntries[0]): Record<string, string | boolean | number> {
    const entryVars: Record<string, string | boolean | number> = {};
    for (const [key, val] of Object.entries(entry.variables || {})) {
      if (typeof val === 'string' && val.startsWith('${') && val.endsWith('}')) {
        const varRef = val.slice(2, -1);
        entryVars[key] = resolved[varRef] ?? val;
      } else {
        entryVars[key] = val;
      }
    }
    return entryVars;
  }

  // Helper: create scaffold + agent pair
  function createPair(entry: typeof activeEntries[0], x: number, y: number, connectFrom: string[]): { lastId: string; endY: number } {
    const n = nextNodeSuffix();
    const scaffoldId = `scaffold-${entry.template}-${n}`;
    const agentId = `agent-${isBriefTemplate(entry.template) ? 'exec' : 'review'}-${entry.template}-${n}`;
    const persona = inferPersona(entry.template);
    const isBrief = isBriefTemplate(entry.template);
    const entryVars = resolveEntryVars(entry);

    // Scaffold node
    nodes.push({
      id: scaffoldId,
      type: 'scaffold',
      position: { x, y },
      data: {
        label: `${isBrief ? 'Brief' : 'Scaffold'}: ${entry.template}`,
        templateName: entry.template,
        templateVariables: entryVars,
        outputSubdir: entry.root ? undefined : (entry.path || entry.template),
        workspace: 'full',
      },
    });
    for (const prevId of connectFrom) {
      edges.push({ id: nextEdgeId(), source: prevId, target: scaffoldId });
    }

    // Agent node — execution for briefs, review for templates
    const agentData: WorkflowNode['data'] = isBrief
      ? {
          label: `Execute: ${entry.template}`,
          systemPrompt: getExecutionPrompt(entry.template),
          workspace: 'full',
          maxTurns: 15,
          provider: options.defaultProvider,
        }
      : {
          label: `Review: ${entry.template}`,
          systemPrompt: getReviewPrompt(entry.template, persona, entry.root ? undefined : (entry.path || entry.template)),
          workspace: 'full',
          maxTurns: 10,
          provider: options.defaultProvider,
        };

    nodes.push({
      id: agentId,
      type: 'agent',
      position: { x, y: y + yGap },
      data: agentData,
    });
    edges.push({ id: nextEdgeId(), source: scaffoldId, target: agentId });

    return { lastId: agentId, endY: y + yGap };
  }

  // 2. Root entries (sequential)
  for (const entry of rootEntries) {
    const { lastId, endY } = createPair(entry, startX, currentY, lastNodeIds);
    currentY = endY + yGap;
    lastNodeIds = [lastId];
  }

  // 3. Non-root entries — group by persona, sequential within group, parallel across groups
  if (subEntries.length > 0) {
    const personaGroups = new Map<string, typeof subEntries>();
    for (const entry of subEntries) {
      const persona = inferPersona(entry.template);
      const group = personaGroups.get(persona) || [];
      group.push(entry);
      personaGroups.set(persona, group);
    }

    const groups = Array.from(personaGroups.entries());
    const branchStartIds = [...lastNodeIds];
    const branchEndIds: string[] = [];
    const totalWidth = (groups.length - 1) * xGap;
    const branchStartX = startX - totalWidth / 2;

    let maxBranchY = currentY;

    for (let gi = 0; gi < groups.length; gi++) {
      const [, entries] = groups[gi];
      const branchX = branchStartX + gi * xGap;
      let branchY = currentY;
      let connectFrom = branchStartIds;

      for (const entry of entries) {
        const { lastId, endY } = createPair(entry, branchX, branchY, connectFrom);
        branchY = endY + yGap;
        connectFrom = [lastId];
      }

      branchEndIds.push(connectFrom[0]);
      if (branchY > maxBranchY) maxBranchY = branchY;
    }

    currentY = maxBranchY + yGap;

    // 4. Integration agent
    const integrationId = 'agent-integration';
    nodes.push({
      id: integrationId,
      type: 'agent',
      position: { x: startX, y: currentY },
      data: {
        label: 'Integration Review',
        systemPrompt: 'Review the entire scaffolded project for cross-module integration:\n- Verify all import paths between modules are correct\n- Check package.json has all dependencies\n- Ensure shared types and interfaces are consistent\n- Run any available build/typecheck commands\n- Fix any integration issues found.',
        workspace: 'full',
        maxTurns: 15,
        provider: options.defaultProvider,
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

  const workflowVars: Record<string, string> = {};
  for (const v of manifest.variables) {
    workflowVars[v.name] = String(resolved[v.name] ?? v.default ?? '');
  }

  return { nodes, edges, variables: workflowVars };
}
