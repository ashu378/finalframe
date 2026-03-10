/**
 * FinalFrame — Onboarding Types
 * Reference: MASTER_PRD.md § 6 — Onboarding Flow
 * Reference: BUILD_PHASES.md — Phase 1
 */

export enum OnboardingStep {
    WELCOME = 'welcome',
    STUDIO = 'studio',
    GOAL = 'goal',
    PLATFORM = 'platform',
    CREATIVE_DNA = 'creative-dna',
    IDENTITY = 'identity',
    ASSETS = 'assets',
    MESSAGE = 'message',
    CONFIRM = 'confirm',
}

export const ONBOARDING_STEPS = [
    OnboardingStep.WELCOME,
    OnboardingStep.STUDIO,
    OnboardingStep.GOAL,
    OnboardingStep.PLATFORM,
    OnboardingStep.CREATIVE_DNA,
    OnboardingStep.IDENTITY,
    OnboardingStep.ASSETS,
    OnboardingStep.MESSAGE,
    OnboardingStep.CONFIRM,
] as const;

// Outcome Goals (PRD § 4.1)
export const OUTCOME_GOALS = [
    { id: 'get_attention', label: 'Get Attention', description: 'High-energy, fast-paced hook' },
    { id: 'explain_value', label: 'Explain Value', description: 'Clear, structured explanation' },
    { id: 'convert_sales', label: 'Convert Sales', description: 'Strong CTA and urgency' },
    { id: 'go_viral', label: 'Go Viral on X', description: 'Meme-style, edgy, rapid cuts' },
    { id: 'build_authority', label: 'Build Authority', description: 'Professional, calm, confident' },
] as const;

// Platforms (PRD § 4.2)
export const PLATFORMS = [
    { id: 'x_twitter', label: 'X (Twitter)' },
    { id: 'tiktok_reels', label: 'TikTok / Reels' },
    { id: 'youtube', label: 'YouTube' },
    { id: 'website_landing', label: 'Website / Landing Page' },
] as const;

// Contexts (PRD § 4.2)
export const CONTEXTS = [
    { id: 'organic_post', label: 'Organic Post' },
    { id: 'paid_ad', label: 'Paid Ad' },
    { id: 'product_launch', label: 'Product Launch' },
    { id: 'profile_header', label: 'Profile Header' },
    { id: 'pitch_loop', label: 'Pitch Loop' },
] as const;

// Identity Presence (PRD § 4.4)
export enum IdentityPresence {
    SELF = 'self',
    AI_ACTOR = 'ai_actor',
    NO_PEOPLE = 'no_people',
}

// Creative DNA Options (Constraint: No free text)
export const CREATIVE_DNA_OPTIONS = {
    brand_energy: ['Calm', 'Balanced', 'High Energy', 'Chaos'],
    editing_pace: ['Slow & Deliberate', 'Standard', 'Fast', 'Hyper-Fast'],
    visual_style: ['Minimalist', 'Corporate', 'Bold/Colorful', 'Cinematic'],
    text_personality: ['Professional', 'Friendly', 'Witty', 'Aggressive'],
    music_energy: ['Background', 'Upbeat', 'Intense', 'Epic'],
} as const;

export interface OnboardingState {
    currentStep: OnboardingStep;
    // Data for each step will be fetched from DB, this interface tracks progress
}
