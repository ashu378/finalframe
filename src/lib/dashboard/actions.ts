'use server';

import { api } from '../../../convex/_generated/api';
import { getAuthenticatedConvexClient } from '@/lib/convex/server';
import type { FullProject } from '@/lib/types/database';

export async function getDashboardOverview() {
  const convex = await getAuthenticatedConvexClient();
  const data = await convex.query(api.app.dashboard, {});
  const recentProjects = data.projects.map((project: any) => ({
    id: project.externalId,
    studio_id: project.studioExternalId,
    name: project.name,
    state: project.status === 'APPROVED' ? 'approved' : project.status === 'COMPLETED' ? 'rendered' : 'draft',
    outcome_goal: project.metadata?.outcomeGoal ?? null,
    platform: project.metadata?.platform ?? null,
    content_type: project.metadata?.contentType ?? null,
    project_description: project.description ?? null,
    context: project.metadata?.context ?? null,
    identity_presence: project.metadata?.identityPresence ?? null,
    actor_id: null,
    actor_locked: false,
    creative_dna_snapshot: null,
    message_blocks_snapshot: null,
    branding: null,
    execution_locked: false,
    aspect_ratio: project.metadata?.aspectRatio ?? null,
    is_shared: false,
    creative_dna_context: null,
    created_at: new Date(project.createdAt).toISOString(),
    updated_at: new Date(project.updatedAt).toISOString(),
    archived_at: null,
    deleted_at: null,
  })) as FullProject[];
  const activities = recentProjects.slice(0, 4).map(project => ({ id: project.id, type: 'project' as const, label: project.name, description: `Video project updated`, timestamp: project.updated_at }));
  return { stats: data.stats, recentProjects, activities };
}
