'use server';

import { makeFunctionReference } from 'convex/server';
import { revalidatePath } from 'next/cache';
import { api } from '../../../convex/_generated/api';
import { getAuthenticatedConvexClient } from '@/lib/convex/server';
import type { ProjectLibraryMode, ProjectLibraryPage } from './library';

const libraryQuery = makeFunctionReference<'query', { studioExternalId: string; mode: ProjectLibraryMode; search?: string; cursor?: string; limit?: number }, ProjectLibraryPage>('projects:library');

/** Each Convex query is bounded; sparse search pages keep their cursor. */
export async function getProjectLibraryPage(options: { mode: ProjectLibraryMode; search?: string; cursor?: string; preview?: boolean }): Promise<ProjectLibraryPage> {
  const client = await getAuthenticatedConvexClient();
  const current = await client.query(api.account.current, {});
  if (!current.studio) throw new Error('Your studio could not be found.');
  let cursor = options.cursor;
  let scanned = 0;
  const rows: ProjectLibraryPage['page'] = [];
  let result: ProjectLibraryPage;
  let requests = 0;
  do {
    result = await client.query(libraryQuery, { studioExternalId: current.studio.externalId, mode: options.mode, search: options.search, cursor, limit: 20 });
    rows.push(...result.page);
    scanned += result.scanned;
    cursor = result.continueCursor ?? undefined;
    requests++;
  } while (!result.isDone && rows.length < 20 && scanned < (options.preview ? 40 : 200) && requests < (options.preview ? 3 : 12));
  return { page: rows, scanned, isDone: result.isDone, continueCursor: result.continueCursor };
}

export async function changeLibraryProject(input: { projectId: string; action: 'rename' | 'archive' | 'delete' | 'restore'; name?: string }): Promise<{ success: boolean; error?: string }> {
  try {
    const client = await getAuthenticatedConvexClient();
    const projectId = input.projectId as never;
    switch (input.action) {
      case 'rename':
        if (!input.name?.trim() || input.name.trim().length > 200) return { success: false, error: 'Use a project name between 1 and 200 characters.' };
        await client.mutation(api.projects.update, { projectId, name: input.name.trim() }); break;
      case 'archive': await client.mutation(api.projects.archive, { projectId }); break;
      case 'delete': await client.mutation(api.projects.softDelete, { projectId }); break;
      case 'restore': await client.mutation(api.projects.restore, { projectId }); break;
      default: return { success: false, error: 'Choose an available project action.' };
    }
    revalidatePath('/dashboard/projects');
    revalidatePath('/dashboard');
    return { success: true };
  } catch {
    return { success: false, error: 'This project could not be changed. Check your access and refresh the page before trying again.' };
  }
}
