import { createClient } from '@/lib/supabase/server';
import { OnboardingStep } from './types';

export async function getCurrentOnboardingStep(): Promise<OnboardingStep> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return OnboardingStep.WELCOME;

    // 1. Check Studio
    const { data: studio } = await supabase
        .from('studios')
        .select('id')
        .eq('user_id', user.id)
        .single();

    if (!studio) return OnboardingStep.WELCOME;

    // 2. Check Defaults (Goal, Platform, Context, Identity)
    const { data: defaults } = await supabase
        .from('studio_defaults')
        .select('outcome_goal, platform, context, identity_presence')
        .eq('studio_id', studio.id)
        .single();

    if (!defaults || !defaults.outcome_goal) return OnboardingStep.GOAL;
    if (!defaults.platform || !defaults.context) return OnboardingStep.PLATFORM;

    // 3. Check Creative DNA
    const { data: dna } = await supabase
        .from('creative_dna')
        .select('id')
        .eq('studio_id', studio.id)
        .single();

    if (!dna) return OnboardingStep.CREATIVE_DNA;

    // 4. Check Identity (part of defaults but logical step 6)
    if (!defaults.identity_presence) return OnboardingStep.IDENTITY;

    // 5. Check Assets
    const { data: assets } = await supabase
        .from('studio_assets')
        .select('asset_type')
        .eq('studio_id', studio.id);

    const hasLogo = assets?.some(a => a.asset_type === 'logo');
    const hasVisual = assets?.some(a => a.asset_type === 'product_visual');

    if (!hasLogo || !hasVisual) return OnboardingStep.ASSETS;

    // 6. Check Message Blocks
    const { data: messages } = await supabase
        .from('message_blocks')
        .select('id')
        .eq('studio_id', studio.id)
        .single();

    if (!messages) return OnboardingStep.MESSAGE;

    // 7. All done, ready for confirmation
    return OnboardingStep.CONFIRM;
}
