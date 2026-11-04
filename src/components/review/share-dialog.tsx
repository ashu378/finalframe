'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Share2, Loader2, Copy, Check, X, Calendar, Link as LinkIcon } from 'lucide-react';
import { createReviewLink, getReviewLinks, deleteReviewLink, getReviewCandidates, getReviewFeedback, resolveComment } from '@/lib/review/actions';
import { type ReviewLink } from '@/lib/types/database';

interface ShareDialogProps {
    projectId: string;
    onClose: () => void;
}

export function ShareDialog({ projectId, onClose }: ShareDialogProps) {
    const dialog = useRef<HTMLDialogElement>(null);
    const [snapshots, setSnapshots] = useState<Array<{ id: string; label: string; created_at: string }>>([]);
    const [links, setLinks] = useState<ReviewLink[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [selectedSnapshot, setSelectedSnapshot] = useState<string>('');
    const [label, setLabel] = useState('');
    const [copied, setCopied] = useState<string | null>(null);
    const [manualUrl, setManualUrl] = useState<string>();
    const [revokingId, setRevokingId] = useState<string>();
    const [feedback, setFeedback] = useState<{ linkId: string; data: Awaited<ReturnType<typeof getReviewFeedback>> }>();
    const [feedbackBusy, setFeedbackBusy] = useState(false);
    const [error, setError] = useState<string>();

    useEffect(() => { if (dialog.current && !dialog.current.open) dialog.current.showModal(); }, []);
    const close = () => { dialog.current?.close(); onClose(); };

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
        try {
            const res = await createReviewLink(projectId, selectedSnapshot, label || 'Client Review');
            if (res.success && res.link) {
                const newLink = res.link;
                setLinks(previous => [newLink, ...previous]);
                setLabel('');
            }
            if (!res.success) setError(res.error);
        } catch { setError('The review link could not be created. Reload the link list before trying again.'); }
        finally { setCreating(false); }
    };

    const handleDelete = async (id: string) => {
        setError(undefined); setRevokingId(id);
        try {
            const res = await deleteReviewLink(id, projectId);
            if (res.success) {
                setLinks(previous => previous.map(link => link.id === id ? { ...link, access_token: '', is_active: false } : link));
                setManualUrl(undefined);
            } else setError(res.error);
        } catch { setError('The review link status could not be confirmed. Reload the link list before trying again.'); }
        finally { setRevokingId(undefined); }
    };

    const copyToClipboard = async (token: string) => {
        const url = `${window.location.origin}/review/${token}`;
        setCopied(null); setManualUrl(undefined);
        try {
            await navigator.clipboard.writeText(url);
            setCopied(token);
        } catch { setManualUrl(url); }
    };

    async function showFeedback(linkId: string) {
        setError(undefined); setFeedbackBusy(true);
        try { setFeedback({ linkId, data: await getReviewFeedback(projectId, linkId) }); }
        catch { setError('Feedback could not be loaded for this review. Try again.'); }
        finally { setFeedbackBusy(false); }
    }

    async function updateComment(id: string, resolved: boolean) {
        setError(undefined); setFeedbackBusy(true);
        try {
            const result = await resolveComment(id, resolved, projectId);
            if (!result.success) { setError(result.error); return; }
            setFeedback(previous => previous && { ...previous, data: { ...previous.data, comments: previous.data.comments.map(comment => comment.id === id ? { ...comment, resolved } : comment) } });
        } catch { setError('The comment status could not be confirmed. Reload the feedback before trying again.'); }
        finally { setFeedbackBusy(false); }
    }

    return (
        <dialog ref={dialog} onCancel={event => { event.preventDefault(); close(); }} aria-labelledby="review-sharing-title" className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl overflow-auto bg-transparent text-foreground backdrop:bg-black/60 backdrop:backdrop-blur-3xl">
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
                    <button aria-label="Close review sharing" onClick={close} className="p-3 hover:bg-white/5 rounded-sm text-zinc-700 hover:text-white transition-all">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-8 space-y-8">
                    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                    {manualUrl && <label className="block space-y-2 text-sm">Clipboard unavailable. Select and copy this link.<input className="w-full rounded-lg border border-border bg-background p-3" readOnly value={manualUrl} onFocus={event => event.currentTarget.select()} /></label>}
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
                                    <label htmlFor="review-export-version" className="text-[9px] font-black text-zinc-600 uppercase tracking-[0.2em] px-1">Export version</label>
                                    <select
                                        id="review-export-version"
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
                                    <label htmlFor="review-link-label" className="text-[9px] font-black text-zinc-600 uppercase tracking-[0.2em] px-1">Review label</label>
                                    <input
                                        id="review-link-label"
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
                                <p className="text-center text-[10px] font-bold text-zinc-800 uppercase tracking-widest py-12 italic">No review links</p>
                            ) : (
                                links.map(link => (
                                    <div key={link.id} className="flex flex-col gap-3 rounded-sm border border-white/5 bg-black p-5 shadow-2xl transition-all hover:border-white/20 sm:flex-row sm:items-center sm:justify-between">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-3 mb-2">
                                                <h4 className="break-all text-[12px] font-black text-white uppercase tracking-widest italic">{link.label}</h4>
                                                <span className="text-xs text-muted-foreground">{link.is_active ? 'Active' : 'Inactive'}</span>
                                            </div>
                                            <div className="flex items-center gap-4 text-[9px] text-zinc-700 uppercase tracking-[0.25em] font-black italic">
                                                <span className="flex items-center gap-1.5"><Calendar className="w-3 h-3" /> {new Date(link.created_at).toLocaleDateString().replace(/\//g, '.')}</span>
                                                <span className="truncate max-w-[120px]">CH_ID: {link.id.slice(-8).toUpperCase()}</span>
                                            </div>
                                            {link.snapshot_id && <button type="button" disabled={feedbackBusy} onClick={() => showFeedback(link.id)} className="ff-link mt-2 inline-flex min-h-11 items-center text-sm">View feedback</button>}
                                        </div>

                                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                                            <button
                                                disabled={!link.access_token || !link.is_active}
                                                onClick={() => copyToClipboard(link.access_token)}
                                                className="h-10 px-4 rounded-sm bg-black border border-white/5 text-zinc-700 hover:text-primary hover:border-primary/50 transition-all flex items-center gap-3 text-[9px] font-black uppercase tracking-widest shadow-2xl"
                                            >
                                                {copied === link.access_token ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                                                {!link.is_active ? 'Unavailable' : !link.access_token ? 'Secret hidden' : copied === link.access_token ? 'Copied' : 'Copy link'}
                                            </button>
                                            <button
                                                aria-label={`Revoke ${link.label || "client"} review link`}
                                                disabled={!link.is_active || Boolean(revokingId)}
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
                        {feedback && <section aria-label="Client feedback" className="space-y-3 border-t border-border pt-4">
                            <h3 className="text-sm font-semibold">{links.find(link => link.id === feedback.linkId)?.label ?? 'Client review'} · Timeline v{feedback.data.timelineVersionNumber}</h3>
                            <p className="text-sm text-muted-foreground">{feedback.data.status === 'APPROVED' ? 'Approved' : feedback.data.status === 'CHANGES_REQUESTED' ? 'Changes requested' : 'Awaiting decision'}</p>
                            {feedback.data.decisionNote && <p className="whitespace-pre-wrap break-words text-sm">{feedback.data.decisionNote}</p>}
                            {feedback.data.comments.length ? <ul className="space-y-3">{feedback.data.comments.map(comment => <li key={comment.id} className="rounded-lg border border-border p-3 text-sm">
                                <p className="font-medium">{comment.authorName}{comment.timeSeconds === null ? '' : ` · ${comment.timeSeconds.toFixed(1)}s`}</p>
                                <p className="whitespace-pre-wrap break-words">{comment.body}</p>
                                <button type="button" disabled={feedbackBusy} onClick={() => updateComment(comment.id, !comment.resolved)} className="ff-link mt-1 inline-flex min-h-11 items-center text-sm">{comment.resolved ? 'Reopen comment' : 'Resolve comment'}</button>
                            </li>)}</ul> : <p className="text-sm text-muted-foreground">No comments on this review yet.</p>}
                        </section>}
                    </div>
                </div>
            </div>
        </dialog>
    );
}
