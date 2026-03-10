import { executeAITask } from '@/lib/ai/engine';
import type { RemixLayerType, RemixOperation } from '@/lib/types/database';

export interface ParsedRemixIntent {
    target_layer: RemixLayerType;
    operation: RemixOperation;
    parameters: Record<string, any>;
    explanation: string; // Why this op was chosen
}

/**
 * Parses a user's natural language query into a strict Remix Intent.
 * Uses a fast reasoning model (REMIX_PARSER).
 * Reference: Phase 4 Requirement - Strict Enum Parsing
 */
export async function parseRemixIntent(userQuery: string): Promise<ParsedRemixIntent> {
    const prompt = `
    You are a strict technical parser for a video editor.
    Convert the USER QUERY into a JSON object matching the schema below.
    
    STRICT ENUMS for 'target_layer':
    - 'background' (changing environment, scenery, backdrop)
    - 'text' (changing copy, font, typos, captions)
    - 'motion' (changing speed, camera movement, transitions, pacing)
    - 'actor' (ONLY if explicitly referring to the character/person. Valid: "change actor outfit". Invalid: "swap face" -> Blocked by other guards, but parse it as actor.)
    - 'audio' (music, sound effects, voiceover)
    - 'overlay' (logo, watermark, overlay graphics)

    STRICT ENUMS for 'operation':
    - 'text_change'
    - 'color_change'
    - 'motion_change'
    - 'asset_replace'
    - 'audio_adjust'

    OUTPUT SCHEMA:
    {
        "target_layer": "Enum value",
        "operation": "Enum value",
        "parameters": { ...key-value pairs describing specific changes... },
        "explanation": "Brief reasoning"
    }

    RULES:
    1. If the query is ambiguous, try to infer the most logical layer.
    2. If the query implies changing the Blueprint (scening, script structure), output "INVALID_SCOPE" in explanation or fail gracefully (but here try to map to closest visual change).
    3. 'parameters' should capture the specific new values (e.g. { "color": "blue" }).
    
    USER QUERY: "${userQuery}"
    `;

    try {
        const response = await executeAITask('AI_BRAIN', [
            { role: 'system', content: 'You are a parsing engine. Output STRICT JSON only. No markdown.' },
            { role: 'user', content: prompt }
        ]);

        const content = response.content?.trim() || '';
        if (!content) throw new Error('Empty response from Remix Parser');

        // Handle potential markdown formatting from LLM
        const jsonStr = content.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '');

        const parsed = JSON.parse(jsonStr);

        // Runtime Validation
        const validLayers = ['background', 'text', 'motion', 'actor', 'audio', 'overlay'];
        const validOps = ['text_change', 'color_change', 'motion_change', 'asset_replace', 'audio_adjust'];

        if (!validLayers.includes(parsed.target_layer)) {
            throw new Error(`Invalid target layer detected: ${parsed.target_layer}`);
        }
        if (!validOps.includes(parsed.operation)) {
            throw new Error(`Invalid operation detected: ${parsed.operation}`);
        }

        return parsed as ParsedRemixIntent;

    } catch (error) {
        console.error('Remix Parsing Failed:', error);
        throw new Error('Failed to understand remix request. Please be more specific about what to change.');
    }
}
