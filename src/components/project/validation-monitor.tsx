'use client';

import { CheckCircle2, XCircle, AlertTriangle, ShieldCheck, Image as ImageIcon, UserCheck, LayoutList } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FullProject, Scene, StudioAsset } from '@/lib/types/database';

interface ValidationMonitorProps {
    project: FullProject;
    scenes: Scene[];
    studioAssets: StudioAsset[];
}

export function ValidationMonitor({ project, scenes, studioAssets }: ValidationMonitorProps) {
    const checks = [
        {
            id: 'identity',
            label: 'People selected',
            status: project.identity_presence ? 'pass' : 'fail',
            message: project.identity_presence ? `Using: ${project.identity_presence}` : 'Choose who appears in this video.',
            icon: UserCheck
        },
        {
            id: 'logo',
            label: 'Logo available',
            status: studioAssets.some(a => a.type === 'image' && a.tags?.includes('logo')) || project.branding?.logo_url ? 'pass' : 'warn',
            message: (studioAssets.some(a => a.type === 'image' && a.tags?.includes('logo')) || project.branding?.logo_url)
                ? 'A logo is available.'
                : 'No logo is linked here. Check the project media before continuing.',
            icon: ShieldCheck
        },
        {
            id: 'scenes',
            label: 'Scene count',
            status: scenes.length >= 4 ? 'pass' : 'fail',
            message: scenes.length >= 4 ? `Found ${scenes.length} ready scenes.` : `Minimum 4 scenes required (Current: ${scenes.length}).`,
            icon: LayoutList
        },
        {
            id: 'assets',
            label: 'Linked media',
            status: scenes.some(s => s.asset_binding_id || (s.scene_assets && s.scene_assets.length > 0)) ? 'pass' : 'warn',
            message: scenes.some(s => s.asset_binding_id || (s.scene_assets && s.scene_assets.length > 0))
                ? 'Scenes have linked media.'
                : 'No media is linked to these scenes yet. Review what needs to be created.',
            icon: ImageIcon
        }
    ];

    return (
        <div className="p-6 rounded-xl bg-black/40 border border-white/5 space-y-4">
            <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold  tracking-normal text-muted-foreground">Before making your video</h3>
                <span className={cn(
                    "text-xs font-semibold  tracking-normal px-3 py-1 rounded-xl border",
                    checks.every(c => c.status !== 'fail')
                        ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                        : "bg-red-500/10 text-red-500 border-red-500/20"
                )}>
                    {checks.every(c => c.status !== 'fail') ? 'Status: READY' : 'Status: NOT READY'}
                </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {checks.map(check => (
                    <div
                        key={check.id}
                        className={cn(
                            "p-4 rounded-xl border transition-all duration-300",
                            check.status === 'pass' && "bg-emerald-500/5 border-emerald-500/10",
                            check.status === 'warn' && "bg-amber-500/5 border-amber-500/10",
                            check.status === 'fail' && "bg-red-500/5 border-red-500/10"
                        )}
                    >
                        <div className="flex items-center gap-3 mb-2">
                            <div className={cn(
                                "flex items-center justify-center w-6 h-6 rounded-xl",
                                check.status === 'pass' && "bg-emerald-500/20 text-emerald-400",
                                check.status === 'warn' && "bg-amber-500/20 text-amber-400",
                                check.status === 'fail' && "bg-red-500/20 text-red-400"
                            )}>
                                <check.icon className="w-3.5 h-3.5" />
                            </div>
                            <span className="text-xs font-semibold  tracking-normal text-zinc-300">
                                {check.label}
                            </span>
                        </div>
                        <p className={cn(
                            "text-xs font-medium leading-relaxed ",
                            check.status === 'pass' && "text-muted-foreground",
                            check.status === 'warn' && "text-amber-500/70",
                            check.status === 'fail' && "text-red-500/70"
                        )}>
                            {check.message}
                        </p>
                    </div>
                ))}
            </div>
        </div>
    );
}
