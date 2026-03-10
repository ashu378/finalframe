/**
 * FinalFrame — Runway Video Engine Adapter
 * Reference: HARD CONSTRAINT DOCUMENT § 3
 * Reference: HARD CONSTRAINT DOCUMENT § 4 — Execution Profile Rule
 * 
 * This adapter is the ONLY location for video model selection.
 * Veo models are accessed THROUGH Runway (not a separate provider).
 * 
 * API Version: 2024-11-06
 */

import type { CameraConfig, MotionConfig, RenderStrategy, SceneAsset, StudioAsset } from '@/lib/types/database';
const RUNWAY_API_BASE = 'https://api.dev.runwayml.com/v1';
import { ExecutionProfile } from '@/lib/ai/model-registry';
const RUNWAY_API_KEY = process.env.RUNWAY_API_KEY;


/**
 * Model mapping — INTERNAL ONLY
 * Veo models are accessed through Runway API.
 * This mapping MUST NOT be exposed outside this adapter.
 * Reference: HARD CONSTRAINT DOCUMENT § 4
 */
function getModelForProfile(profile: ExecutionProfile): string {
    const modelMap: Record<ExecutionProfile, string> = {
        'FAST_SOCIAL': 'veo3.1_fast',
        'COMMERCIAL': 'gen4_turbo',
        'CINEMATIC': 'veo3.1',
        'PREMIUM': 'gen4_aleph',
    };
    return modelMap[profile];
}

export interface RunwayVideoRequest {
    prompt: string;
    initImageUrl?: string;
    initVideoUrl?: string;
    duration?: 4 | 6 | 8;
    ratio?: '16:9' | '9:16' | '1:1';
}

export interface RunwayVideoResult {
    taskId: string;
    status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
    videoUrl?: string;
    duration?: number;
    error?: string;
    executionProfile?: ExecutionProfile;
}

/**
 * Translate structured camera/motion configs into Runway-compatible prompt modifiers
 */
function translateConfigsToPrompt(camera?: CameraConfig, motion?: MotionConfig): string {
    const parts: string[] = [];

    if (camera) {
        if (camera.angle) {
            const angleMap: Record<string, string> = {
                'eye_level': 'shot at eye level',
                'low_angle': 'dramatic low angle shot',
                'high_angle': 'high angle overhead shot',
                'drone': 'aerial drone footage',
                'macro': 'extreme close-up macro shot'
            };
            parts.push(angleMap[camera.angle] || '');
        }

        if (camera.movement) {
            const movementMap: Record<string, string> = {
                'static': 'static camera, locked off',
                'pan_left': 'slow pan left',
                'pan_right': 'slow pan right',
                'tilt_up': 'gentle tilt up',
                'tilt_down': 'gentle tilt down',
                'zoom_in': 'smooth zoom in',
                'zoom_out': 'smooth zoom out',
                'orbit': 'orbiting camera movement'
            };
            parts.push(movementMap[camera.movement] || '');
        }

        if (camera.lens) {
            const lensMap: Record<string, string> = {
                'wide': 'wide angle lens',
                'standard': '35mm lens',
                'telephoto': 'telephoto compression'
            };
            parts.push(lensMap[camera.lens] || '');
        }
    }

    if (motion) {
        if (motion.speed === 'slow') parts.push('slow motion');
        if (motion.speed === 'fast') parts.push('fast paced dynamic motion');
        if (motion.stability && motion.stability > 0.8) parts.push('smooth stabilized footage');
    }

    return parts.filter(Boolean).join(', ');
}

/**
 * Translate bound assets and their roles into explicit prompt fragments for the AI
 */
function translateAssetsToPrompt(assets: SceneAsset[], studioAssets: StudioAsset[]): string {
    const fragments: string[] = [];

    for (const binding of assets) {
        const asset = studioAssets.find(a => a.id === binding.asset_id);
        if (!asset) continue;

        switch (binding.role) {
            case 'background':
                fragments.push(`Use the provided ${asset.type} ("${asset.name}") as the primary background and static context.`);
                break;
            case 'foreground':
                fragments.push(`Integrate components from the provided ${asset.type} ("${asset.name}") as foreground elements.`);
                break;
            case 'reference':
                fragments.push(`Adopt the specific visual style, lighting, and palette from the reference ${asset.type} ("${asset.name}").`);
                break;
            case 'video_source':
                fragments.push(`Use the provided video ("${asset.name}") as the motion source and core timing reference.`);
                break;
        }
    }

    if (fragments.length > 0) {
        return `CORE VISUAL REQUIREMENT: ${fragments.join(' ')} (STRICT COMPLIANCE REQUIRED — DO NOT HALLUCINATE ALTERNATIVES)`;
    }

    return '';
}

/**
 * Submit a video generation task to Runway
 */
async function submitTask(
    strategy: RenderStrategy,
    prompt: string,
    executionProfile: ExecutionProfile,
    options: {
        initImageUrl?: string;
        initVideoUrl?: string;
        cameraConfig?: CameraConfig;
        motionConfig?: MotionConfig;
        duration?: 4 | 6 | 8;
        sceneAssets?: SceneAsset[];
        studioAssets?: StudioAsset[];
    }
): Promise<{ taskId: string }> {
    if (!RUNWAY_API_KEY) {
        throw new Error('RUNWAY_API_KEY environment variable is not set');
    }

    // Get model based on ExecutionProfile (INTERNAL SELECTION ONLY)
    const model = getModelForProfile(executionProfile);
    console.log(`[VideoEngine] Profile: ${executionProfile} → Model: ${model}`);

    // Build enhanced prompt with camera/motion modifiers
    const technicalModifiers = translateConfigsToPrompt(options.cameraConfig, options.motionConfig);
    const assetInstructions = translateAssetsToPrompt(options.sceneAssets || [], options.studioAssets || []);

    let enhancedPrompt = prompt;
    if (technicalModifiers) enhancedPrompt += `. ${technicalModifiers}`;
    if (assetInstructions) enhancedPrompt = `${assetInstructions}. ${enhancedPrompt}`;

    let endpoint = `${RUNWAY_API_BASE}/text_to_video`;
    if (strategy === 'IMAGE_TO_VIDEO') endpoint = `${RUNWAY_API_BASE}/image_to_video`;
    if (strategy === 'VIDEO_TO_VIDEO') endpoint = `${RUNWAY_API_BASE}/video_to_video`;

    const body: Record<string, any> = {
        model: model,
        promptText: enhancedPrompt.substring(0, 1000),
        duration: options.duration || 6,
        ratio: '1280:720', // Supported by Image, Text, and Video endpoints
    };

    if (strategy === 'IMAGE_TO_VIDEO' && options.initImageUrl) {
        body.promptImage = options.initImageUrl;
        body.position = 'first'; // Required for imageToVideo
    }
    if (strategy === 'VIDEO_TO_VIDEO' && options.initVideoUrl) {
        body.videoUri = options.initVideoUrl;
    }

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${RUNWAY_API_KEY}`,
            'Content-Type': 'application/json',
            'X-Runway-Version': '2024-11-06'
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const errorText = await response.text();
        if (errorText.toLowerCase().includes('not have enough credits')) {
            throw new Error('RUNWAY_ACCOUNT_EXHAUSTED: Your Runway account has run out of credits. Please refill your account to continue production.');
        }
        throw new Error(`Runway API Error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return { taskId: data.id };
}

/**
 * Poll for task completion
 */
async function pollTask(taskId: string, maxAttempts = 60): Promise<RunwayVideoResult> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const response = await fetch(`${RUNWAY_API_BASE}/tasks/${taskId}`, {
            headers: {
                'Authorization': `Bearer ${RUNWAY_API_KEY}`,
                'X-Runway-Version': '2024-11-06'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to poll task: ${response.status}`);
        }

        const data = await response.json();

        if (data.status === 'SUCCEEDED') {
            return {
                taskId,
                status: 'SUCCEEDED',
                videoUrl: data.output?.[0] || data.artifacts?.[0]?.url,
                duration: data.duration || 6
            };
        }

        if (data.status === 'FAILED') {
            return {
                taskId,
                status: 'FAILED',
                error: data.error || 'Unknown error'
            };
        }

        await new Promise(resolve => setTimeout(resolve, 3000));
    }

    throw new Error('Task polling timeout');
}

/**
 * Main entry point: Generate video using Runway
 */
export async function generateVideo(
    strategy: RenderStrategy,
    prompt: string,
    executionProfile: ExecutionProfile,
    options: {
        initImageUrl?: string;
        initVideoUrl?: string;
        cameraConfig?: CameraConfig;
        motionConfig?: MotionConfig;
        duration?: 4 | 6 | 8;
        sceneAssets?: SceneAsset[];
        studioAssets?: StudioAsset[];
    }
): Promise<RunwayVideoResult> {
    console.log(`[VideoEngine] Starting ${strategy} with profile ${executionProfile}...`);

    const { taskId } = await submitTask(strategy, prompt, executionProfile, options);
    const result = await pollTask(taskId);
    result.executionProfile = executionProfile;

    return result;
}
