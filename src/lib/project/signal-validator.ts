import { createClient } from '@/lib/supabase/server';
import { ProjectSignals, ProjectContentType, Platform, ContentContext, OutcomeGoal, IdentityPresence, StudioAsset, MessageBlocksSnapshot } from '@/lib/types/database';

/**
 * FinalFrame — Signal Validation Gate
 * Reference: MASTER_PRD Section 5 & Implementation Task
 * 
 * This gate ensures that all signals collected during project creation
 * are present and validated before Blueprint Finalization or Render Execution.
 * No silent signal loss is allowed.
 */

export interface ValidationResult {
    success: boolean;
    signals?: ProjectSignals;
    error?: string;
    auditLog: string[];
}

export async function validateProjectSignals(projectId: string, supabaseClient?: any): Promise<ValidationResult> {
    const supabase = supabaseClient || await createClient();
    const auditLog: string[] = [];

    auditLog.push(`[Signal Gate] Starting validation for project: ${projectId}`);

    // 1. Fetch Project with Snapshots
    const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single();

    if (projectError || !project) {
        return { success: false, error: 'Project not found', auditLog };
    }

    // 2. Fetch Assets for this project/studio
    const { data: assets, error: assetsError } = await supabase
        .from('studio_assets')
        .select('*')
        .eq('studio_id', project.studio_id);

    const studioAssets = (assets || []) as StudioAsset[];
    auditLog.push(`[Signal Gate] Found ${studioAssets.length} studio assets.`);

    // 3. Map to ProjectSignals Contract
    const signals: ProjectSignals = {
        video_type: project.content_type as ProjectContentType,
        platform: project.platform as Platform,
        context: project.context as ContentContext,
        goal: project.outcome_goal as OutcomeGoal,
        description: project.project_description || '',
        creative_dna_snapshot: project.creative_dna_snapshot,
        identity_presence: project.identity_presence as IdentityPresence,
        uploaded_assets: studioAssets,
        message_blocks: project.message_blocks_snapshot as MessageBlocksSnapshot
    };

    // 4. MANDATORY INTEGRITY CHECKS (Section 5 of PRD)
    const failures: string[] = [];

    // Check Core Metadata
    if (!signals.video_type) failures.push('Missing video_type (Content Type)');
    if (!signals.platform) failures.push('Missing platform');
    if (!signals.goal) failures.push('Missing outcome_goal');
    if (!signals.description || signals.description.length < 10) failures.push('Missing or insufficient description');
    if (!signals.identity_presence) failures.push('Missing identity_presence selection');

    // Check Creative DNA
    if (!signals.creative_dna_snapshot) {
        failures.push('Missing Creative DNA snapshot (Brand DNA is required)');
    } else {
        const dna = signals.creative_dna_snapshot;
        if (!dna.visual_style) failures.push('Missing DNA: visual_style');
        if (!dna.editing_pace) failures.push('Missing DNA: editing_pace');
    }

    // Check Mandatory Assets (PRD § 5.5)
    const hasLogo = studioAssets.some(a => a.type === 'image' && a.tags?.includes('logo'));
    const hasProductVisual = studioAssets.some(a => a.type === 'image' || a.type === 'video'); // Simple check for now

    if (!hasLogo) auditLog.push('[Signal Gate] WARNING: No explicit logo asset found. Using project branding if available.');
    if (!hasProductVisual) failures.push('MANDATORY ASSET MISSING: At least one product visual (image/video) is required (PRD § 5.5)');

    // 5. Final Decision
    if (failures.length > 0) {
        const errorMsg = `SIGNAL VALIDATION FAILED: ${failures.join('; ')}`;
        auditLog.push(`[Signal Gate] REJECTED: ${errorMsg}`);
        return { success: false, error: errorMsg, auditLog };
    }

    auditLog.push('[Signal Gate] PASSED: All mandatory signals validated.');
    return { success: true, signals, auditLog };
}
