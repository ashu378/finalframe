'use client';

import { useState } from 'react';
import { addComment } from '@/lib/review/actions';
import { type ReviewComment } from '@/lib/types/database';
import { Button } from '@/components/ui/button';
import { Send, User, Clock, MessageSquare, Loader2 } from 'lucide-react';

interface ReviewCommentsProps {
    reviewLinkId: string;
    comments: ReviewComment[];
    currentTime: number;
    onCommentAdded: (comment: ReviewComment) => void;
    onSeek: (time: number) => void;
}

export function ReviewComments({
    reviewLinkId,
    comments,
    currentTime,
    onCommentAdded,
    onSeek
}: ReviewCommentsProps) {
    const [name, setName] = useState('');
    const [content, setContent] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !content) return;

        setLoading(true);
        const res = await addComment(reviewLinkId, name, content, currentTime);
        if (res.success && res.comment) {
            onCommentAdded(res.comment);
            setContent('');
            // Persist name in local component state (or could use localStorage)
        }
        setLoading(false);
    };

    const formatTime = (seconds: number) => {
        const min = Math.floor(seconds / 60);
        const sec = Math.floor(seconds % 60);
        return `${min}:${sec.toString().padStart(2, '0')}`;
    };

    return (
        <div className="flex flex-col h-full gap-6">
            {/* Comment Form */}
            <form onSubmit={handleSubmit} className="space-y-4 p-5 rounded-sm bg-black/40 border border-white/5 shadow-2xl">
                <div className="relative group">
                    <User className="absolute left-4 top-3.5 w-3.5 h-3.5 text-zinc-700 group-focus-within:text-primary transition-colors" />
                    <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Your name"
                        required
                        className="w-full bg-transparent border-b border-white/5 pl-11 py-3 text-[11px] font-black text-white uppercase tracking-widest focus:border-primary/50 outline-none placeholder:text-zinc-800 transition-all"
                    />
                </div>

                <div className="relative">
                    <textarea
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        placeholder="Leave a note about this moment…"
                        required
                        rows={3}
                        className="w-full bg-black/40 border border-white/5 rounded-sm p-4 text-[12px] font-bold text-white focus:border-primary/50 outline-none placeholder:text-zinc-800 transition-all resize-none uppercase tracking-widest leading-loose"
                    />
                    <div className="absolute top-2 right-3 flex items-center gap-2 px-3 py-1 rounded-sm bg-black border border-white/10">
                        <Clock className="w-3 h-3 text-primary" />
                        <span className="text-[9px] font-black text-white/60 tracking-widest">{formatTime(currentTime)}</span>
                    </div>
                </div>

                <Button
                    type="submit"
                    disabled={loading || !name || !content}
                    variant="primary"
                    className="w-full h-12 gap-3 rounded-sm bg-primary text-black font-black text-[11px] uppercase tracking-[0.2em] shadow-2xl shadow-primary/20 hover:bg-white active:scale-[0.98] transition-all"
                >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Add note
                </Button>
            </form>

            <div className="flex-1 space-y-4">
                <div className="flex items-center gap-3 mb-4">
                    <MessageSquare className="w-3.5 h-3.5 text-zinc-700" />
                    <h3 className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.25em]">Notes on this version</h3>
                </div>

                {comments.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-zinc-600">
                        <MessageSquare className="w-8 h-8 opacity-10 mb-2" />
                        <p className="text-xs uppercase font-black tracking-widest opacity-50">No feedback yet</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {comments.map(comment => (
                            <div key={comment.id} className="group p-5 rounded-sm bg-black/20 border border-white/5 hover:border-primary/30 transition-all relative">
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-7 h-7 rounded-sm bg-primary/10 border border-primary/20 flex items-center justify-center">
                                            <span className="text-[9px] font-black text-primary">{comment.author_name[0].toUpperCase()}</span>
                                        </div>
                                        <span className="text-[10px] font-black text-white uppercase tracking-widest transition-colors group-hover:text-primary">{comment.author_name}</span>
                                    </div>
                                    <button
                                        onClick={() => onSeek(comment.timestamp)}
                                        className="flex items-center gap-2 px-3 py-1 rounded-sm bg-black border border-white/10 text-[9px] text-zinc-600 font-black uppercase tracking-widest hover:text-white hover:border-primary/50 transition-all"
                                    >
                                        <Clock className="w-2.5 h-2.5" />
                                        {formatTime(comment.timestamp)}
                                    </button>
                                </div>
                                <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest leading-loose pl-10 group-hover:text-zinc-300 transition-colors">{comment.content}</p>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
