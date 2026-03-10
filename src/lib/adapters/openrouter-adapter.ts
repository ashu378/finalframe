import OpenAI from 'openai';
import { getModelForCapability, AICapability } from '@/lib/ai/model-registry';
import type { CameraConfig, MotionConfig } from '@/lib/types/database';

// Initialize OpenAI client pointing to OpenRouter
const openRouter = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY,
    defaultHeaders: {
        'HTTP-Referer': 'https://finalframe.ai',
        'X-Title': 'FinalFrame',
    },
});

export interface AIResponse {
    content: string | null;
    modelUsed: string;
    usage?: OpenAI.CompletionUsage;
}

/**
 * Execute an AI task using the architecturally assigned model for a Capability.
 * Reference: HARD CONSTRAINT DOCUMENT § 3
 */
export async function executeAITask(
    capability: AICapability,
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    options?: {
        temperature?: number;
        jsonMode?: boolean;
        cameraConfig?: CameraConfig;
        motionConfig?: MotionConfig;
    }
): Promise<AIResponse> {
    const modelConfig = getModelForCapability(capability);

    // Inject Camera & Motion Configs via Adapter Translation
    let finalMessages = [...messages];
    if (options?.cameraConfig || options?.motionConfig) {
        finalMessages = appendConfigsToPrompt(finalMessages, options.cameraConfig, options.motionConfig);
    }

    try {
        const response = await openRouter.chat.completions.create({
            model: modelConfig.id,
            messages: finalMessages,
            temperature: options?.temperature || 0.7,
            response_format: options?.jsonMode ? { type: 'json_object' } : undefined,
        });

        return {
            content: response.choices[0]?.message?.content || null,
            modelUsed: response.model,
            usage: response.usage,
        };
    } catch (error) {
        console.error(`OpenRouter Error [${capability}]:`, error);
        throw new Error(`AI Execution failed for capability ${capability}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Helper: Translates structured config into natural language for the model.
 * This is the ONLY place where provider-specific prompting for camera/motion should live.
 */
function appendConfigsToPrompt(
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    camera?: CameraConfig,
    motion?: MotionConfig
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    const instructions: string[] = [];

    if (camera) {
        if (camera.angle) instructions.push(`CAMERA ANGLE: ${camera.angle.replace('_', ' ')}`);
        if (camera.movement) instructions.push(`CAMERA MOVEMENT: ${camera.movement.replace('_', ' ')}`);
        if (camera.lens) instructions.push(`LENS TYPE: ${camera.lens}`);
    }

    if (motion) {
        if (motion.speed) instructions.push(`MOTION SPEED: ${motion.speed}`);
        if (motion.stability) instructions.push(`STABILITY: ${motion.stability}`);
    }

    if (instructions.length === 0) return messages;

    const technicalDirectives = `\n[TECHNICAL DIRECTIVES]\n${instructions.join('\n')}\nExecute these technical parameters precisely.`;

    // Append to the last user message, or system message if no user message
    const lastMsg = messages[messages.length - 1];

    if (lastMsg.role === 'user') {
        const newContent = typeof lastMsg.content === 'string'
            ? lastMsg.content + technicalDirectives
            : lastMsg.content;

        return [
            ...messages.slice(0, -1),
            { ...lastMsg, content: newContent as string }
        ];
    }

    return [
        ...messages,
        { role: 'system', content: technicalDirectives }
    ];
}
