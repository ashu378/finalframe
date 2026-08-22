export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

/**
 * FinalFrame — Database Types
 * Reference: MASTER_PRD.md § 8 — Project States
 * Reference: BUILD_PHASES.md — Phase 0 type definitions
 * 
 * Type definitions for database entities.
 * These align with Supabase table structures.
 */

// ... (Existing types preserved by using replace_file_content essentially, but here I am rewriting the file. 
// Ideally I should append or replace. I will use replace_file_content for safety next time.
// Since I have to write the whole file to append cleanly without complex diffs in this interface:)
// Wait, I can use replace_file_content to append at the end easily.

export interface UserProfile {
    id: string;
    email: string;
    full_name: string | null;
    avatar_url: string | null;
    onboarding_completed: boolean;
    is_admin: boolean;
    studio_name: string | null;
    role: string | null;
    created_at: string;
    updated_at: string;
}

export type ProjectState = 'draft' | 'blueprint_ready' | 'approved' | 'rendering' | 'rendered' | 'exported' | 'archived';

export interface Project {
    id: string;
    user_id: string;
    state: ProjectState;
    name: string;
    outcome_goal: OutcomeGoal | null;
    platform: Platform | null;
    content_type: ProjectContentType | null;
    project_description: string | null;
    context: ContentContext | null; // Legacy context for specific ad types
    identity_presence: IdentityPresence | null;
    actor_locked: boolean;
    created_at: string;
    updated_at: string;
}

export type ProjectContentType = 'commercial' | 'ugc' | 'explainer' | 'motion_graphics' | 'saas_demo' | 'avatar_video';

export type OutcomeGoal = 'get_attention' | 'explain_value' | 'convert_sales' | 'go_viral' | 'build_authority';
export type Platform = 'x_twitter' | 'tiktok_reels' | 'youtube' | 'website_landing';
export type ContentContext = 'organic_post' | 'paid_ad' | 'product_launch' | 'profile_header' | 'pitch_loop';
export type IdentityPresence = 'self' | 'ai_actor' | 'no_people';

export interface SceneAsset {
    asset_id: string;
    role: 'background' | 'foreground' | 'reference' | 'video_source';
}

export interface Scene {
    id: string;
    project_id: string;
    order_index: number;
    scene_goal: string;
    scene_text: string;
    scene_title: string;
    visual_description: string;
    action_sequence: string;
    emotional_beat: string;
    differentiation_note: string;
    camera_config: CameraConfig;
    motion_config: MotionConfig;
    scene_assets: SceneAsset[];
    asset_binding_id?: string | null;
    why_this_scene_exists?: string | null;
    created_at: string;
    updated_at: string;
}

export interface CameraConfig {
    angle?: 'eye_level' | 'low_angle' | 'high_angle' | 'drone' | 'macro';
    movement?: 'static' | 'pan_left' | 'pan_right' | 'tilt_up' | 'tilt_down' | 'zoom_in' | 'zoom_out' | 'orbit';
    lens?: 'wide' | 'standard' | 'telephoto';
}

export interface MotionConfig {
    speed?: 'slow' | 'normal' | 'fast';
    stability?: number; // 0-1
}

export interface CreativeDNASnapshot {
    brand_energy: string;
    editing_pace: string;
    visual_style: string;
    text_personality: string;
    music_energy: string;
}

export interface MessageBlocksSnapshot {
    value_proposition: string;
    emotional_promise: string;
    proof_point: string | null;
}

export interface FullProject {
    id: string;
    studio_id: string;
    name: string;
    state: ProjectState;
    outcome_goal: OutcomeGoal | null;
    platform: Platform | null;
    content_type: ProjectContentType | null;
    project_description: string | null;
    context: ContentContext | null;
    identity_presence: IdentityPresence | null;
    actor_id: string | null;
    actor_locked: boolean;
    creative_dna_snapshot: CreativeDNASnapshot | null;
    message_blocks_snapshot: MessageBlocksSnapshot | null;
    branding: ProjectBranding | null;
    execution_locked: boolean;
    aspect_ratio: string | null;
    is_shared: boolean;
    creative_dna_context: string | null;
    created_at: string;
    updated_at: string;
    archived_at: string | null;
    deleted_at: string | null;
}

export interface ProjectBranding {
    logo_url: string | null;
    brand_colors: string[] | null;
}

export type RenderStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
export type RenderStrategy = 'TEXT_TO_VIDEO' | 'IMAGE_TO_VIDEO' | 'MULTI_IMAGE_TO_VIDEO' | 'AVATAR_VIDEO' | 'VIDEO_TO_VIDEO';

// ... (previous)
export interface ProjectSignals {
    video_type: ProjectContentType;
    platform: Platform;
    context: ContentContext;
    goal: OutcomeGoal;
    description: string;
    creative_dna_snapshot: CreativeDNASnapshot;
    identity_presence: IdentityPresence;
    uploaded_assets: StudioAsset[];
    message_blocks?: MessageBlocksSnapshot; // Optional but often present
}

export interface RenderJob {
    id: string;
    project_id: string;
    scene_id: string | null;
    status: RenderStatus;
    render_strategy?: RenderStrategy;
    input_params: Record<string, any>;
    output_result: Record<string, any> | null;
    ai_models_used: Record<string, string> | null;
    ai_provider: string | null;
    cost_credits: number;
    error_message: string | null;
    remix_locked: boolean;
    created_at: string;
    updated_at: string;
    started_at: string | null;
    completed_at: string | null;
}

export type RemixStatus = 'queued' | 'processing' | 'completed' | 'failed';
export type UserRole = 'Marketer' | 'Founder' | 'Agency' | 'Creator';

export interface CreditLedgerEntry {
    id: string;
    studio_id: string;
    delta: number;
    reason: string;
    reference_id?: string;
    created_at: string;
}

export type ExportPlatform = 'tiktok' | 'reels' | 'youtube' | 'twitter' | 'linkedin';
export type ExportResolution = '720p' | '1080p' | '4k';
export type ExportStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface ExportJob {
    id: string;
    project_id: string;
    render_snapshot_id: string;
    platform: ExportPlatform;
    resolution: ExportResolution;
    status: ExportStatus;
    output_url?: string;
    credits_deducted: number;
    error_message?: string;
    created_at: string;
    updated_at: string;
}

export type RemixLayerType = 'background' | 'text' | 'motion' | 'actor' | 'audio' | 'overlay';
export type RemixOperation = 'text_change' | 'color_change' | 'motion_change' | 'asset_replace' | 'audio_adjust';

export interface RenderLayer {
    id: string;
    project_id: string;
    render_job_id: string;
    layer_type: RemixLayerType;
    asset_url: string;
    metadata: Record<string, any>;
    is_original: boolean;
    created_at: string;
}

export interface RemixJob {
    id: string;
    project_id: string;
    render_job_id: string;
    status: RemixStatus;
    intent: string;
    target_layer: RemixLayerType;
    operation: RemixOperation;
    parameters: Record<string, any>;
    ai_models_used: Record<string, string>;
    cost_credits: number;
    error_message: string | null;
    created_at: string;
    completed_at: string | null;
}

export interface LayerDiff {
    id: string;
    remix_job_id: string;
    original_layer_id: string | null;
    new_layer_id: string | null;
    diff_description: string | null;
    created_at: string;
}

export interface RenderSnapshot {
    id: string;
    project_id: string;
    render_job_id: string;
    label?: string;
    layer_manifest: Record<string, string>;
    is_validated: boolean;
    created_at: string;
}

/**
 * Phase 6: Asset Management
 */
export type AssetType = 'image' | 'video' | 'audio' | 'font' | 'model';

export interface StudioAsset {
    id: string;
    studio_id: string;
    name: string;
    url: string;
    type: AssetType;
    size: number;
    mime_type: string;
    tags: string[];
    folder_path: string;
    created_at: string;
}

export type StudioRole = 'owner' | 'editor' | 'reviewer' | 'viewer';

export interface StudioMember {
    id: string;
    studio_id: string;
    user_id?: string;
    role: StudioRole;
    created_at: string;
    status: 'active' | 'pending';
    // Joined fields (optional, populated when fetching with user details)
    email?: string;
    full_name?: string;
    avatar_url?: string;
}

/**
 * Phase 6: Templates
 */
export type TemplateCategory = 'social_ad' | 'explainer' | 'ugc' | 'custom';

export interface Template {
    id: string;
    studio_id: string | null;
    name: string;
    description: string | null;
    thumbnail_url: string | null;
    blueprint_data: Record<string, any>;
    category: TemplateCategory;
    is_public: boolean;
    created_at: string;
    updated_at: string;
}

/**
 * Phase 6: Client Review
 */
export interface ReviewLink {
    id: string;
    project_id: string;
    snapshot_id: string | null;
    access_token: string;
    label: string | null;
    is_active: boolean;
    expires_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface ReviewComment {
    id: string;
    review_link_id: string;
    author_name: string;
    content: string;
    timestamp: number;
    scene_id: string | null;
    is_resolved: boolean;
    created_at: string;
}

/**
 * Production foundation types. These are additive to the legacy project,
 * scene, and render types above so existing screens remain compatible while
 * the new shot-based pipeline is introduced.
 */
export type ProductionWorkflow = 'SOCIAL' | 'COMEDY' | 'BUSINESS_AD' | 'FOOTAGE_TRANSFORM';
export type ProductionInputMode = 'IDEA' | 'SCRIPT' | 'VOICE' | 'IMAGES' | 'FOOTAGE' | 'AD';
export type OutputPreset = 'SOCIAL_VERTICAL' | 'SQUARE' | 'LANDSCAPE';
export type QualityTier = 'ECONOMY' | 'STANDARD' | 'PREMIUM';
export type ProductionStatus = 'DRAFT' | 'PLANNED' | 'APPROVED' | 'GENERATING' | 'REVIEW' | 'EXPORTED' | 'FAILED';
export type GenerationJobStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface CreateIntent {
    projectId?: string;
    mode: ProductionInputMode;
    prompt?: string;
    script?: string;
    inputAssetIds: string[];
    requestedDurationSeconds: number;
    outputPreset: OutputPreset;
    language?: string;
    workflow?: ProductionWorkflow;
    qualityTier?: QualityTier;
}

export interface DirectorShotPlan {
    title: string;
    prompt: string;
    durationSeconds: number;
    orderIndex: number;
    requiredAssetIds: string[];
    camera?: CameraConfig;
}

export interface DirectorScenePlan {
    title: string;
    purpose: string;
    visualDirection: string;
    orderIndex: number;
    shots: DirectorShotPlan[];
}

export interface DirectorPlan {
    summary: string;
    assumptions: string[];
    questions: string[];
    workflow: ProductionWorkflow;
    bible: {
        projectContext: Record<string, unknown>;
        characters: Record<string, unknown>[];
        locations: Record<string, unknown>[];
        products: Record<string, unknown>[];
        style: Record<string, unknown>;
        story: Record<string, unknown>;
    };
    sequences: Array<{
        title: string;
        description: string;
        orderIndex: number;
        scenes: DirectorScenePlan[];
    }>;
    operations: Array<{
        operation: string;
        quantity: number;
        unit: string;
        qualityTier: QualityTier;
    }>;
}

export interface CostLineItem {
    operation: string;
    quantity: number;
    unit: string;
    credits: number;
    description: string;
}

export interface CostEstimate {
    totalCredits: number;
    qualityTier: QualityTier;
    lineItems: CostLineItem[];
    estimateVersion: string;
    expiresAt: string;
}

export interface Production {
    id: string;
    project_id: string;
    workflow: ProductionWorkflow;
    requested_duration_seconds: number;
    language: string;
    output_preset: OutputPreset;
    current_version_id: string | null;
    created_at: string;
    updated_at: string;
}

export interface GenerationJob {
    id: string;
    production_id: string;
    shot_id: string | null;
    shot_version_id: string | null;
    modality: string;
    provider: string;
    model: string | null;
    provider_job_id: string | null;
    status: GenerationJobStatus;
    progress: number;
    estimated_cost: number;
    actual_cost: number | null;
    idempotency_key: string;
    error_code: string | null;
    error_message: string | null;
    created_at: string;
    started_at: string | null;
    completed_at: string | null;
}
