'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Share2, Loader2, Copy, Check, X, Calendar, Link as LinkIcon } from 'lucide-react';
import { createReviewLink, getReviewLinks, deleteReviewLink, getReviewCandidates } from '@/lib/review/actions';
import { type ReviewLink } from '@/lib/types/database';

interface ShareDialogProps {
    projectId: string;
    onClose: () => void;
}

export function ShareDialog({ projectId, onClose }: ShareDialogProps) {
    const [snapshots, setSnapshots] = useState<any[]>([]);
    const [links, setLinks] = useState<ReviewLink[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [selectedSnapshot, setSelectedSnapshot] = useState<string>('');
    const [label, setLabel] = useState('');
    const [copied, setCopied] = useState<string | null>(null);
    const [error, setError] = useState<string>();

    useEffect(() => {
        async function load() {
            setLoading(true);
            try {
            const [s, l] = await Promise.all([
                getReviewCandidates(projectId),
                getReviewLinks(projectId)
            ]);
            setSnapshots(s);
            setLinks(l);
            if (s.length > 0) setSelectedSnapshot(s[0].id);
            } catch { setError("Review links could not be loaded."); } finally { setLoading(false); }
        }
        load();
    }, [projectId]);

    const handleCreate = async () => {
        if (!selectedSnapshot) return;
        setCreating(true); setError(undefined);
        const res = await createReviewLink(projectId, selectedSnapshot, label || 'Client Review');
        if (res.success && res.link) {
            setLinks([res.link, ...links]);
            setLabel('');
        }
        if (!res.success) setError(res.error);
        setCreating(false);
    };

    const handleDelete = async (id: string) => {
        const res = await deleteReviewLink(id, projectId);
        if (res.success) setLinks(links.filter(l => l.id !== id));
        else setError(res.error);
    };

    const copyToClipboard = (token: string) => {
        const url = `${window.location.origin}/review/${token}`;
        navigator.clipboard.writeText(url);
        setCopied(token);
        setTimeout(() => setCopied(null), 2000);
    };

    return (
        <div role="dialog" aria-modal="true" aria-labelledby="review-sharing-title" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-3xl animate-in fade-in duration-500">
            <div className="w-full max-w-xl bg-zinc-950 border border-white/10 rounded-sm shadow-3xl overflow-hidden animate-in zoom-in-95 duration-500 relative">
                <div className="absolute top-0 left-0 w-full h-[1px] bg-primary/30" />
                {/* Header */}
                <div className="p-8 border-b border-white/5 flex items-center justify-between bg-black/40">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-sm bg-black/60 border border-white/5 flex items-center justify-center shadow-2xl relative">
                            <div className="absolute inset-0 border border-primary/20 animate-pulse rounded-sm" />
                            <Share2 className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                            <h2 id="review-sharing-title" className="text-[18px] font-black text-white uppercase tracking-[0.3em] italic">Client review</h2>
                            <p className="text-[9px] font-bold text-zinc-600 uppercase tracking-[0.2em] mt-1">Share one completed export for feedback</p>
                        </div>
                    </div>
                    <button aria-label="Close review sharing" onClick={onClose} className="p-3 hover:bg-white/5 rounded-sm text-zinc-700 hover:text-white transition-all">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-8 space-y-8">
                    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                    <p className="text-xs text-muted-foreground">Copy a new link now. Its secret is shown only once. Links expire after seven days and can be revoked here.</p>
                    {/* Create New Link Section */}
                    <div className="space-y-6">
                        <h3 className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.3em]">Channel_Authorization</h3>

                        {snapshots.length === 0 ? (
                            <div className="p-6 bg-black border border-dashed border-white/5 rounded-sm text-center">
                                <p className="text-[10px] font-bold text-zinc-700 uppercase tracking-widest leading-loose">No completed project exports. Complete an export before creating a client review link.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-3">
                                    <label className="text-[9px] font-black text-zinc-600 uppercase tracking-[0.2em] px-1">Export version</label>
                                    <select
                                        value={selectedSnapshot}
                                        onChange={(e) => setSelectedSnapshot(e.target.value)}
                                        className="w-full bg-black border border-white/5 rounded-sm px-4 py-3 text-[11px] font-bold text-white uppercase tracking-widest focus:border-primary/50 outline-none hover:border-white/10 transition-all appearance-none cursor-pointer"
                                    >
                                        {snapshots.map(s => (
                                            <option key={s.id} value={s.id}>{s.label?.toUpperCase() || `OUTPUT_${new Date(s.created_at).toLocaleDateString().replace(/\//g, '_')}`}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[9px] font-black text-zinc-600 uppercase tracking-[0.2em] px-1">Review label</label>
                                    <input
                                        value={label}
                                        onChange={(e) => setLabel(e.target.value)}
                                        placeholder="CLIENT_MANIFEST_ALPHA"
                                        className="w-full bg-black border border-white/5 rounded-sm px-4 py-3 text-[11px] font-bold text-white uppercase tracking-widest focus:border-primary/50 outline-none placeholder:text-zinc-800 transition-all"
                                    />
                                </div>
                            </div>
                        )}

                        <Button
                            onClick={handleCreate}
                            disabled={creating || snapshots.length === 0}
                            className="w-full h-14 gap-3 rounded-sm bg-primary text-black font-black uppercase tracking-[0.2em] text-[11px] shadow-2xl shadow-primary/20 hover:bg-white active:scale-[0.98] transition-all border-none"
                        >
                            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <LinkIcon className="w-4 h-4" />}
                            Create private review link
                        </Button>
                    </div>

                    {/* Active Links List */}
                    <div className="space-y-6 pt-8 border-t border-white/5">
                        <h3 className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.3em]">Channel_Registry</h3>

                        <div className="max-h-[220px] overflow-y-auto space-y-4 pr-3 scrollbar-thin scrollbar-thumb-white/5">
                            {loading ? (
                                <div className="flex justify-center p-12">
                                    <Loader2 className="w-8 h-8 text-primary/50 animate-spin" />
                                </div>
                            ) : links.length === 0 ? (
                                <p className="text-center text-[10px] font-bold text-zinc-800 uppercase tracking-widest py-12 italic">No active distribution channels</p>
                            ) : (
                                links.map(link => (
                                    <div key={link.id} className="p-5 bg-black border border-white/5 rounded-sm flex items-center justify-between group hover:border-white/20 transition-all shadow-2xl">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-3 mb-2">
                                                <h4 className="text-[12px] font-black text-white uppercase tracking-widest italic">{link.label}</h4>
                                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)] animate-pulse" />
                                            </div>
                                            <div className="flex items-center gap-4 text-[9px] text-zinc-700 uppercase tracking-[0.25em] font-black italic">
                                                <span className="flex items-center gap-1.5"><Calendar className="w-3 h-3" /> {new Date(link.created_at).toLocaleDateString().replace(/\//g, '.')}</span>
                                                <span className="truncate max-w-[120px]">CH_ID: {link.id.slice(-8).toUpperCase()}</span>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 ml-4">
                                            <button
                                                disabled={!link.access_token || !link.is_active}
                                                onClick={() => copyToClipboard(link.access_token)}
                                                className="h-10 px-4 rounded-sm bg-black border border-white/5 text-zinc-700 hover:text-primary hover:border-primary/50 transition-all flex items-center gap-3 text-[9px] font-black uppercase tracking-widest shadow-2xl"
                                            >
                                                {copied === link.access_token ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                                                {!link.access_token ? 'Secret hidden' : copied === link.access_token ? 'Copied' : 'Copy link'}
                                            </button>
                                            <button
                                                aria-label={`Revoke ${link.label || "client"} review link`}
                                                onClick={() => handleDelete(link.id)}
                                                className="h-10 w-10 flex items-center justify-center rounded-sm bg-black border border-white/5 text-zinc-800 hover:text-red-500 hover:border-red-500/30 transition-all shadow-2xl"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
