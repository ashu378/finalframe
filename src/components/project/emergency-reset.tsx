'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { resetStuckRender, resumeStuckJob } from '@/lib/render/actions';
import { toast } from 'sonner';
import { AlertTriangle, RefreshCcw, Zap } from 'lucide-react';

export function EmergencyReset({ projectId }: { projectId: string }) {
    const [isResetting, setIsResetting] = useState(false);
    const [isRebooting, setIsRebooting] = useState(false);

    const handleReset = async () => {
        if (!confirm('EMERGENCY_OVERRIDE: This will forcefully unlock the project and cancel ongoing jobs. Proceed?')) {
            return;
        }

        setIsResetting(true);
        try {
            const result = await resetStuckRender(projectId);
            if (result.success) {
                toast.success('Project reset successful.');
                setTimeout(() => window.location.reload(), 1000);
            } else {
                toast.error(`Reset failed: ${result.error}`);
                setIsResetting(false);
            }
        } catch (err: any) {
            toast.error(`System error: ${err.message}`);
            setIsResetting(false);
        }
    };

    const handleReboot = async () => {
        setIsRebooting(true);
        try {
            const result = await resumeStuckJob(projectId);
            if (result.success) {
                toast.success('Signal re-triggered. Orchestration engine is rebooting...');
            } else {
                toast.error(`Reboot failed: ${result.error}`);
            }
        } catch (err: any) {
            toast.error(`System error: ${err.message}`);
        } finally {
            setIsRebooting(false);
        }
    };

    return (
        <div className="pt-8 border-t border-white/5 mt-8">
            <div className="flex flex-col gap-4">
                <div className="flex items-center gap-2 text-red-500/50">
                    <AlertTriangle className="w-3 h-3" />
                    <span className="text-[9px] font-black uppercase tracking-[0.2em]">Maintenance Terminal</span>
                </div>
                <div className="flex gap-4">
                    <Button
                        variant="ghost"
                        size="sm"
                        disabled={isResetting || isRebooting}
                        onClick={handleReboot}
                        className="h-9 w-fit px-6 text-[10px] font-black uppercase tracking-[0.2em] border border-emerald-500/10 hover:bg-emerald-500/5 text-emerald-500/40 hover:text-emerald-500 transition-all gap-3"
                    >
                        <Zap className={`w-3 h-3 ${isRebooting ? 'animate-pulse' : ''}`} />
                        {isRebooting ? 'Rebooting Engine...' : 'Help Desk: Reboot AI Engine'}
                    </Button>

                    <Button
                        variant="ghost"
                        size="sm"
                        disabled={isResetting || isRebooting}
                        onClick={handleReset}
                        className="h-9 w-fit px-6 text-[10px] font-black uppercase tracking-[0.2em] border border-red-500/10 hover:bg-red-500/5 text-red-500/40 hover:text-red-500 transition-all gap-3"
                    >
                        <RefreshCcw className={`w-3 h-3 ${isResetting ? 'animate-spin' : ''}`} />
                        {isResetting ? 'Executing Reset...' : 'Force System Reinitialization'}
                    </Button>
                </div>
            </div>
        </div>
    );
}
