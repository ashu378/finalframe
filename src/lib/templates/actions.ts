'use server';

import { type Template } from '@/lib/types/database';

const unsupported = (operation: string): never => {
    throw new Error(`UNSUPPORTED_CONVEX_OPERATION: ${operation} is not exposed by the current Convex API.`);
};

export async function getTemplates(studioId: string): Promise<Template[]> {
    void studioId;
    return unsupported('Template listing');
}

export async function createProjectFromTemplate(
    studioId: string,
    templateId: string,
    projectName: string
): Promise<{ success: boolean; projectId?: string; error?: string }> {
    void studioId;
    void templateId;
    void projectName;
    return unsupported('Template-based project creation');
}
