/** Project lifecycle is independent of each episode's immutable production
 * version, timeline and export. Never infer production progress from this row. */
export type ProjectLifecycle = 'active' | 'archived' | 'deleted' | 'unknown';
export type ProjectLifecycleInput = {
  status?: string | null;
  archivedAt?: number | null;
  deletedAt?: number | null;
  moderationStatus?: string | null;
};
export type LifecycleProjectCard = ProjectLifecycleInput & { id: string; name: string };
const activeStatuses = new Set(['ACTIVE', 'DRAFT', 'PLANNING', 'BLUEPRINT_READY', 'PLAN_READY', 'READY', 'APPROVED', 'IN_PROGRESS', 'REVIEW', 'REQUESTED', 'CHANGES_REQUESTED', 'QUEUED', 'PROCESSING', 'RETRYING', 'RENDERING', 'RENDERED', 'EXPORTED', 'COMPLETED', 'FAILED', 'CANCELED', 'CANCELLED']);
const timestamp = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export function projectLifecycle(input: ProjectLifecycleInput): ProjectLifecycle {
  const status = input.status?.trim().toUpperCase();
  if (status === 'DELETED' || timestamp(input.deletedAt)) return 'deleted';
  if (status === 'ARCHIVED' || timestamp(input.archivedAt)) return 'archived';
  return status && activeStatuses.has(status) ? 'active' : 'unknown';
}
export function projectLifecyclePresentation(input: ProjectLifecycleInput) {
  const kind = projectLifecycle(input);
  if (kind === 'deleted') return { kind, label: 'Deleted', description: 'This project is deleted; its media and history are retained.' };
  if (kind === 'archived') return { kind, label: 'Archived', description: 'This project is archived; its media and history are retained.' };
  if (input.moderationStatus === 'RESTRICTED') return { kind, label: 'Restricted project', description: 'Content review restricts production and media access.' };
  if (kind === 'active') return { kind, label: 'Active project', description: 'Open the project to see its episodes and current progress.' };
  return { kind, label: 'Open project', description: 'Episode progress is shown inside the project workspace.' };
}
/** Counts describe exactly the supplied page, never the whole workspace or
 * completed episodes. Restricted active projects still belong to active lifecycle. */
export function countProjectLifecycles(projects: readonly ProjectLifecycleInput[]) {
  const counts = { total: projects.length, active: 0, archived: 0, deleted: 0, unknown: 0 };
  for (const project of projects) counts[projectLifecycle(project)]++;
  return counts;
}
/** Whitelist only card metadata; production/export facts are deliberately not
 * consulted, including misleading legacy `state` or freeform metadata fields. */
export function toLifecycleProjectCard(project: ProjectLifecycleInput & { externalId: string; name: string }): LifecycleProjectCard {
  return { id: project.externalId, name: project.name,
    ...(typeof project.status === 'string' ? { status: project.status } : {}),
    ...(timestamp(project.archivedAt) ? { archivedAt: project.archivedAt } : {}),
    ...(timestamp(project.deletedAt) ? { deletedAt: project.deletedAt } : {}),
    ...(project.moderationStatus === 'RESTRICTED' ? { moderationStatus: 'RESTRICTED' } : {}),
  };
}
