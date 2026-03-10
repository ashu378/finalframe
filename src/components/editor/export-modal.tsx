'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Download, AlertCircle, CheckCircle } from 'lucide-react';
import { EXPORT_RESOLUTIONS, EXPORT_PLATFORMS, EXPORT_COSTS } from '@/lib/export/constants';
import type { ExportPlatform, ExportResolution } from '@/lib/types/database';
import { submitExportJob, getStudioCredits } from '@/lib/export/actions';

interface ExportModalProps {
    isOpen: boolean;
    onClose: () => void;
    projectId: string;
    snapshotId: string;
    snapshotLabel?: string;
}

export function ExportModal({ isOpen, onClose, projectId, snapshotId, snapshotLabel }: ExportModalProps) {
    const [platform, setPlatform] = useState<ExportPlatform>('tiktok');
    const [resolution, setResolution] = useState<ExportResolution>('1080p');
    const [loading, setLoading] = useState(false);
    const [credits, setCredits] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [successUrl, setSuccessUrl] = useState<string | null>(null);

    // Calculate Cost
    const cost = EXPORT_COSTS[platform][resolution];

    // Fetch credits on open
    useEffect(() => {
        if (isOpen) {
            getStudioCredits(projectId).then(setCredits).catch(console.error);
            setSuccessUrl(null);
            setError(null);
        }
    }, [isOpen, projectId]);

    async function handleExport() {
        if (credits !== null && credits < cost) {
            setError("Insufficient credits.");
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const result = await submitExportJob(projectId, snapshotId, platform, resolution);

            if (result.success && result.outputUrl) {
                setSuccessUrl(result.outputUrl);
            } else if (!result.success) {
                throw new Error(result.error || 'Export failed');
            } else {
                throw new Error('Export completed but no download link was generated');
            }

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Export failed');
        } finally {
            setLoading(false);
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="bg-zinc-950 border-zinc-800 text-white sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-[11px] font-black uppercase tracking-[0.2em] text-white">Production Export</DialogTitle>
                    <DialogDescription className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">
                        Finalizing and Encoding Master File
                    </DialogDescription>
                </DialogHeader>

                {!successUrl ? (
                    <div className="space-y-4 py-4">
                        {/* Snapshot Info */}
                        <div className="bg-black/60 border border-white/5 p-3 rounded-sm text-[10px] uppercase font-bold tracking-widest">
                            <span className="text-zinc-400">Source:</span> <span className="text-white">{snapshotLabel || 'LIVE_MANIFEST'}</span>
                        </div>

                        {/* Platform Selection */}
                        <div className="space-y-2">
                            <label className="text-[9px] font-black tracking-[0.2em] text-zinc-400 uppercase">Target Platform</label>
                            <Select value={platform} onValueChange={(v: any) => setPlatform(v)}>
                                <SelectTrigger className="bg-zinc-900 border-zinc-800">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-zinc-900 border-zinc-800">
                                    {EXPORT_PLATFORMS.map(p => (
                                        <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Resolution Selection */}
                        <div className="space-y-2">
                            <label className="text-[9px] font-black tracking-[0.2em] text-zinc-400 uppercase">Mastering Resolution</label>
                            <Select value={resolution} onValueChange={(v: any) => setResolution(v)}>
                                <SelectTrigger className="bg-zinc-900 border-zinc-800">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-zinc-900 border-zinc-800">
                                    {EXPORT_RESOLUTIONS.map(r => (
                                        <SelectItem key={r} value={r}>{r}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Cost & Credits */}
                        <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest pt-2">
                            <div className="text-zinc-400">
                                Credits: <span className={credits !== null && credits < cost ? "text-red-500" : "text-white"}>
                                    {credits !== null ? credits : '...'}
                                </span>
                            </div>
                            <div className="bg-primary/10 px-3 py-1 rounded-sm border border-primary/20 text-primary font-black">
                                {cost} CRD
                            </div>
                        </div>

                        {error && (
                            <div className="bg-red-500/10 border border-red-500/20 p-3 rounded text-red-400 text-sm flex items-center gap-2">
                                <AlertCircle className="w-4 h-4" />
                                {error}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="py-8 flex flex-col items-center justify-center text-center space-y-4">
                        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                            <CheckCircle className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-white">Execution Complete</h3>
                            <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Your master file is ready for download.</p>
                        </div>
                        <a
                            href={successUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-primary hover:bg-primary/90 text-black px-6 py-2 rounded-sm flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.2em] transition-all shadow-lg shadow-primary/20"
                        >
                            <Download className="w-3.5 h-3.5" />
                            Download Master MP4
                        </a>
                    </div>
                )}

                <DialogFooter>
                    {!successUrl && (
                        <>
                            <Button variant="ghost" onClick={onClose} disabled={loading} className="text-[10px] font-bold uppercase tracking-widest rounded-sm">Cancel</Button>
                            <Button variant="primary" onClick={handleExport} disabled={loading || (credits !== null && credits < cost)} className="bg-primary text-black font-black text-[10px] uppercase tracking-[0.2em] rounded-sm px-6">
                                {loading ? (
                                    <>
                                        <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                                        PROD_EXEC...
                                    </>
                                ) : (
                                    'EXECUTE MASTER'
                                )}
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
