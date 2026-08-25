export type ProductionGraphNodeKind =
  | 'production' | 'plan' | 'productionVersion' | 'sequence' | 'scene' | 'shot'
  | 'videoTake' | 'image' | 'imageEdit' | 'voice' | 'audio' | 'transcript'
  | 'captions' | 'timeline' | 'review' | 'export';

export type ProductionGraphNodeState = 'ready' | 'working' | 'needsApproval' | 'outdated' | 'failed' | 'blocked' | 'locked';

export type ProductionGraphNode = {
  id: string;
  kind: ProductionGraphNodeKind | string;
  label: string;
  state: ProductionGraphNodeState;
  resourceType: string;
  resourceId: string;
  detail?: string;
};

export type ProductionGraphEdge = { id: string; source: string; target: string; kind: string };

export const WORKSPACE_SECTIONS = [
  { slug: 'overview', label: 'Overview' }, { slug: 'plan', label: 'Plan' },
  { slug: 'storyboard', label: 'Storyboard' }, { slug: 'canvas', label: 'Canvas' },
  { slug: 'media', label: 'Media' }, { slug: 'takes', label: 'Takes' },
  { slug: 'edit', label: 'Edit' }, { slug: 'review', label: 'Review' }, { slug: 'export', label: 'Export' },
] as const;

export type WorkspaceSection = (typeof WORKSPACE_SECTIONS)[number]['slug'];

export function graphStateLabel(state: ProductionGraphNodeState) {
  return { ready: 'Ready', working: 'In progress', needsApproval: 'Needs your decision', outdated: 'Outdated', failed: 'Needs attention', blocked: 'Blocked', locked: 'Locked' }[state];
}

export function graphStateClass(state: ProductionGraphNodeState) {
  return {
    ready: 'border-[hsl(var(--success)/.3)] bg-[hsl(var(--success)/.08)] text-[hsl(var(--success))]',
    working: 'border-primary/30 bg-primary/10 text-foreground', needsApproval: 'border-accent/30 bg-accent/10 text-foreground',
    outdated: 'border-orange-400/30 bg-orange-400/10 text-orange-800', failed: 'border-destructive/30 bg-destructive/10 text-destructive',
    blocked: 'border-destructive/30 bg-destructive/10 text-destructive', locked: 'border-border bg-secondary text-muted-foreground',
  }[state];
}
