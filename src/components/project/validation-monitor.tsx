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
            label: 'Identity Selection Locked',
            status: project.identity_presence ? 'pass' : 'fail',
            message: project.identity_presence ? `Using: ${project.identity_presence}` : 'Identity presence must be defined.',
            icon: UserCheck
        },
        {
            id: 'logo',
            label: 'Primary Logo Detection',
            status: studioAssets.some(a => a.type === 'image' && a.tags?.includes('logo')) || project.branding?.logo_url ? 'pass' : 'warn',
            message: (studioAssets.some(a => a.type === 'image' && a.tags?.includes('logo')) || project.branding?.logo_url)
                ? 'Logo resolved.'
                : 'No explicit logo found. System will fallback to studio defaults.',
            icon: ShieldCheck
        },
        {
            id: 'scenes',
            label: 'Scene Count',
            status: scenes.length >= 4 ? 'pass' : 'fail',
            message: scenes.length >= 4 ? `Found ${scenes.length} ready scenes.` : `Minimum 4 scenes required (Current: ${scenes.length}).`,
            icon: LayoutList
        },
        {
            id: 'assets',
            label: 'Bound Assets Validated',
            status: scenes.some(s => s.asset_binding_id || (s.scene_assets && s.scene_assets.length > 0)) ? 'pass' : 'warn',
            message: scenes.some(s => s.asset_binding_id || (s.scene_assets && s.scene_assets.length > 0))
                ? 'Deterministic media binds found.'
                : 'No hard-bound assets detected. All visuals will be synthesized.',
            icon: ImageIcon
        }
    ];

    return (
        <div className="p-6 rounded-sm bg-black/40 border border-white/5 space-y-4">
            <div className="flex items-center justify-between mb-2">
                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400">Pre-Render_Checklist</h3>
                <span className={cn(
                    "text-[9px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded-sm border",
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
                            "p-4 rounded-sm border transition-all duration-300",
                            check.status === 'pass' && "bg-emerald-500/5 border-emerald-500/10",
                            check.status === 'warn' && "bg-amber-500/5 border-amber-500/10",
                            check.status === 'fail' && "bg-red-500/5 border-red-500/10"
                        )}
                    >
                        <div className="flex items-center gap-3 mb-2">
                            <div className={cn(
                                "flex items-center justify-center w-6 h-6 rounded-sm",
                                check.status === 'pass' && "bg-emerald-500/20 text-emerald-400",
                                check.status === 'warn' && "bg-amber-500/20 text-amber-400",
                                check.status === 'fail' && "bg-red-500/20 text-red-400"
                            )}>
                                <check.icon className="w-3.5 h-3.5" />
                            </div>
                            <span className="text-[9px] font-black uppercase tracking-[0.1em] text-zinc-300">
                                {check.label}
                            </span>
                        </div>
                        <p className={cn(
                            "text-[10px] font-medium leading-relaxed italic",
                            check.status === 'pass' && "text-zinc-500",
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
