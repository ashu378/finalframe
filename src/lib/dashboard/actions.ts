'use server';

import { api } from '../../../convex/_generated/api';
import { getAuthenticatedConvexClient } from '@/lib/convex/server';
import { toLifecycleProjectCard } from '@/lib/project/lifecycle-presentation';

export async function getDashboardOverview() {
  try {
    const convex = await getAuthenticatedConvexClient();
    const data = await convex.query(api.app.dashboard, {});
    const recentProjects = data.projects.map((project: any) => ({ ...toLifecycleProjectCard(project), updated_at: new Date(project.updatedAt).toISOString() }));
    const activities = recentProjects.slice(0, 4).map(project => ({ id: project.id, type: 'project' as const, label: project.name, description: `Video project updated`, timestamp: project.updated_at }));
    return { stats: data.stats, recentProjects, activities };
  } catch (error) {
    console.error('Convex dashboard overview failed:', error);
    return { stats: { totalProjects: 0, activeJobs: 0, totalAssets: 0, creditsRemaining: 0 }, recentProjects: [], activities: [] };
  }
}
