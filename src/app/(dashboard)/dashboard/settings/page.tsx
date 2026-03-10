/**
 * FinalFrame — Settings Page
 * Reference: MASTER_PRD.md § 5.II — Settings
 * 
 * UI shell only. No mock data per user requirements.
 */

import { requireAuth } from '@/lib/guards';
import { Users } from 'lucide-react';
// import styles from './page.module.css'; // Removed in favor of premium Tailwind

export const metadata = {
    title: 'Settings',
    description: 'FinalFrame Settings',
};

export default async function SettingsPage() {
    // Ensure user is authenticated (server-side guard)
    const { user } = await requireAuth();

    return (
        <div className="max-w-5xl mx-auto py-20 px-10 space-y-20 animate-in fade-in duration-700">
            <header className="space-y-8">
                <h1 className="text-sm font-black uppercase tracking-[0.4em] text-zinc-50 underline underline-offset-[16px] decoration-primary/50 italic">
                    Studio_Configuration_Registry
                </h1>
                <p className="text-metadata font-bold text-zinc-500 uppercase tracking-[0.2em] mt-12 italic leading-relaxed">Manage account parameters, team authorization, and studio preferences.</p>
            </header>

            <div className="grid gap-12">
                {/* Profile Section */}
                <section className="space-y-8">
                    <h2 className="text-sm font-black text-primary uppercase tracking-[0.4em] flex items-center gap-4 italic">
                        <div className="w-2 h-2 rounded-full bg-primary shadow-[0_0_12px_rgba(251,191,36,0.6)]" />
                        Identity_Profile
                    </h2>
                    <div className="p-12 rounded-sm bg-zinc-900 border border-zinc-800 shadow-3xl">
                        <div className="grid gap-10 md:grid-cols-2">
                            <div className="space-y-4">
                                <label className="text-metadata font-black text-zinc-500 uppercase tracking-[0.3em]">Master_Email_ID</label>
                                <div className="text-zinc-50 font-black text-sm bg-zinc-950 px-6 py-4 rounded-sm border border-zinc-800 inline-block w-full tracking-wider shadow-inner">
                                    {user.email}
                                </div>
                            </div>
                            <div className="space-y-4">
                                <label className="text-metadata font-black text-zinc-500 uppercase tracking-[0.3em]">Operational_UID</label>
                                <div className="text-zinc-600 font-black text-metadata bg-zinc-950 px-6 py-4 rounded-sm border border-zinc-800 truncate tracking-widest uppercase shadow-inner">
                                    {user.id}
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Team Section */}
                <section className="space-y-8">
                    <h2 className="text-sm font-black text-primary uppercase tracking-[0.4em] flex items-center gap-4 italic">
                        <div className="w-2 h-2 rounded-full bg-primary shadow-[0_0_12px_rgba(251,191,36,0.6)]" />
                        Authorization_Matrix
                    </h2>
                    <div className="rounded-sm bg-zinc-900 border border-zinc-800 overflow-hidden group shadow-3xl">
                        <div className="p-12 relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-10 opacity-[0.05] group-hover:opacity-[0.1] transition-opacity duration-1000">
                                <Users className="w-40 h-40 text-primary" />
                            </div>

                            <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-10">
                                <div className="space-y-4">
                                    <h3 className="text-lg font-black text-zinc-50 uppercase tracking-[0.2em] italic">Personnel_Registry</h3>
                                    <p className="text-sm font-bold text-zinc-500 max-w-md uppercase tracking-widest leading-relaxed italic">
                                        Configure collaboration parameters. Authorize personnel, assign operational roles, and manage signal permissions.
                                    </p>
                                </div>
                                <a
                                    href="/dashboard/settings/team"
                                    className="shrink-0 inline-flex items-center justify-center h-14 px-10 rounded-sm bg-primary text-black font-black text-metadata uppercase tracking-[0.2em] transition-all hover:bg-white active:scale-[0.98] shadow-2xl shadow-primary/20"
                                >
                                    Manage_Personnel
                                </a>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Billing Section (Placeholder) */}
                <section className="space-y-8 opacity-40 grayscale group hover:opacity-100 hover:grayscale-0 transition-all duration-1000">
                    <h2 className="text-sm font-black text-zinc-600 group-hover:text-primary uppercase tracking-[0.4em] flex items-center gap-4 italic">
                        <div className="w-2 h-2 rounded-full bg-zinc-800 group-hover:bg-primary shadow-[0_0_12px_rgba(251,191,36,0.4)]" />
                        Fiscal_Registry
                    </h2>
                    <div className="p-20 rounded-sm bg-zinc-950/50 border border-dashed border-zinc-800 flex items-center justify-center shadow-inner">
                        <div className="text-center space-y-8">
                            <p className="text-metadata font-black text-zinc-700 uppercase tracking-[0.4em] italic leading-loose">Fiscal parameter controls pending declassification.</p>
                            <span className="inline-block text-metadata font-black text-primary uppercase tracking-[0.5em] border border-primary/20 px-6 py-2 rounded-sm bg-primary/5 shadow-2xl">
                                Protocol_Stage_07
                            </span>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}
