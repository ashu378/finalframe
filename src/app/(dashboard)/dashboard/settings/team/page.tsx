import { requireAuth } from '@/lib/guards';
import { getTeamMembers } from '@/lib/teams/actions';
import { MemberList } from '@/components/team/member-list';
// Breakdown component to avoid client/server boundary issues
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowLeft, Users } from 'lucide-react';

export const metadata = {
    title: 'Team_Registry',
    description: 'Manage studio personnel and authorization matrix',
};

// We need a client component wrapper for the header button to open the dialog
import { TeamHeader } from './team-header';
import { createClient } from '@/lib/supabase/server'; // Import here to fix scope issue in bootstrap

export default async function TeamSettingsPage() {
    const { user } = await requireAuth();

    // In MVP, User ID = Studio ID for the "Personal Studio"
    const studioId = user.id;

    // Fetch members
    let result = await getTeamMembers(studioId);

    // Bootstrap: If no members found, it means the user hasn't initialized their studio.
    // We must insert them as the OWNER.
    // The previous check might have failed if `result.data` was undefined.
    const hasMembers = result.success && result.data && result.data.length > 0;

    if (!hasMembers) {
        console.log(`[TeamBootstrap] Bootstrapping studio for user ${user.id}...`);
        const supabase = await createClient();

        // Use RPC to bypass RLS complexity and ensure atomic insert
        const { error: bootstrapError } = await supabase.rpc('bootstrap_studio_owner', {
            studio_uuid: studioId
        });

        if (bootstrapError) {
            console.error('[TeamBootstrap] RPC Failed:', bootstrapError);
        } else {
            // Retry fetch
            console.log('[TeamBootstrap] Success. Refetching members...');
            result = await getTeamMembers(studioId);
        }
    }

    const members = result.success && result.data ? result.data : [];

    return (
        <div className="team-theme mx-auto max-w-6xl space-y-10 py-5 sm:py-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-10 pb-10 border-b border-zinc-800">
                <div className="space-y-4">
                    <div className="flex items-center gap-4">
                        <Link href="/dashboard/settings" className="text-zinc-600 hover:text-zinc-50 transition-all p-2 -ml-2 rounded-sm hover:bg-zinc-900 border border-transparent hover:border-zinc-800">
                            <ArrowLeft className="w-6 h-6" />
                        </Link>
                        <h2 className="text-sm font-black uppercase tracking-[0.4em] text-zinc-50 underline underline-offset-[14px] decoration-primary/50 italic flex items-center gap-5">
                            <div className="p-3 rounded-sm bg-primary/10 text-primary border border-primary/20 shadow-2xl shadow-primary/5">
                                <Users className="w-6 h-6" />
                            </div>
                            People who can help make videos
                        </h2>
                    </div>
                    <p className="text-metadata font-bold text-zinc-500 max-w-xl uppercase tracking-[0.2em] leading-relaxed pl-20 italic">
                        Invite teammates, reviewers, or clients and choose what they can access.
                    </p>
                </div>

                <div className="shrink-0 pt-2 lg:pt-4">
                    <TeamHeader studioId={studioId} />
                </div>
            </div>

            {/* Members List */}
            <div className="relative z-0">
                <MemberList members={members} currentUserId={user.id} />
            </div>

            {!members.length && (
                <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-200 text-sm text-center">
                    Error loading team members. Please try refreshing or contact support.
                </div>
            )}
        </div>
    );
}
