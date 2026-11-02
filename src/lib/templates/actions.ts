'use server';

import { revalidatePath } from 'next/cache';
import { makeFunctionReference } from 'convex/server';
import { api } from '../../../convex/_generated/api';
import { getAuthenticatedConvexClient } from '@/lib/convex/server';
import type { Template } from '@/lib/types/database';
import { asTemplate, getStarterTemplate, type TemplateDefaults } from './catalog';

const listTemplates = makeFunctionReference<'query', { studioExternalId: string }, Array<{ id: string; saved: boolean }>>('templates:list');
const createFromTemplate = makeFunctionReference<'mutation', { studioExternalId: string; templateId: string; projectName: string; requestId: string }, { externalId: string }>('templates:createProject');
const saveTemplate = makeFunctionReference<'mutation', { studioExternalId: string; templateId: string; saved: boolean }, { saved: boolean }>('templates:setSaved');

export async function getTemplates(studioId: string): Promise<Template[]> {
    const rows = await (await getAuthenticatedConvexClient()).query(listTemplates, { studioExternalId: studioId });
    return rows.flatMap((row) => {
        const template = getStarterTemplate(row.id);
        return template ? [asTemplate(template, row.saved)] : [];
    });
}

export async function createProjectFromTemplate(studioId: string, templateId: string, projectName: string, requestId: string): Promise<{ success: boolean; projectId?: string; error?: string }> {
    try {
        const project = await (await getAuthenticatedConvexClient()).mutation(createFromTemplate, { studioExternalId: studioId, templateId, projectName, requestId });
        revalidatePath('/dashboard');
        return { success: true, projectId: project.externalId };
    } catch {
        return { success: false, error: 'We could not prepare this template project. Try again with the same selection.' };
    }
}

export async function setTemplateSaved(studioId: string, templateId: string, saved: boolean): Promise<{ success: boolean; error?: string }> {
    try {
        await (await getAuthenticatedConvexClient()).mutation(saveTemplate, { studioExternalId: studioId, templateId, saved });
        revalidatePath('/dashboard/templates');
        revalidatePath('/dashboard/assets');
        return { success: true };
    } catch {
        return { success: false, error: 'We could not save this preset. Please try again.' };
    }
}

export async function getTemplateDefaultsForProject(projectExternalId: string): Promise<TemplateDefaults | undefined> {
    const project = await (await getAuthenticatedConvexClient()).query(api.projects.getByExternalId, { externalId: projectExternalId });
    if (!project) return undefined;
    const metadata = project.metadata as { templateId?: string; templateDefaults?: TemplateDefaults } | undefined;
    if (!getStarterTemplate(metadata?.templateId)) return undefined;
    const defaults = metadata?.templateDefaults;
    return defaults ? { ...defaults, name: project.name } : undefined;
}
