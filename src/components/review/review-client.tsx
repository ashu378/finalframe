'use client';

import { useState, useRef, useEffect } from 'react';
import { ReviewPlayer } from './review-player';
import { ReviewComments } from './review-comments';
import { type ReviewComment } from '@/lib/types/database';
import { MessageSquare, ListMusic, Layers, ChevronRight } from 'lucide-react';
import Image from 'next/image';
import { ReviewDecisionPanel } from './review-decision-panel';
import { ReviewStateCard } from './review-state-card';

interface ReviewClientProps {
    project: any;
    snapshot: any;
    layers: any[];
    scenes: any[];
    initialComments: ReviewComment[];
    reviewLinkId: string;
}

export function ReviewClient({
    project,
    snapshot,
    layers,
    scenes,
    initialComments,
    reviewLinkId
}: ReviewClientProps) {
    const [currentTime, setCurrentTime] = useState(0);
    const [comments, setComments] = useState<ReviewComment[]>(initialComments || []);
    const [activeTab, setActiveTab] = useState<'comments' | 'scenes' | 'layers'>('comments');
    const playerRef = useRef<any>(null);

    const videoUrl = snapshot?.output_result?.url || snapshot?.output_result?.video_url;

    const handleTimeUpdate = (time: number) => {
        setCurrentTime(time);
    };

    const handleSeek = (time: number) => {
        if (playerRef.current) {
            playerRef.current.seekTo(time);
        }
    };

    const handleCommentAdded = (newComment: ReviewComment) => {
        setComments([...comments, newComment].sort((a, b) => a.timestamp - b.timestamp));
    };

    return (
        <div className="review-theme grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
            {/* Left Column: Player & Meta */}
            <div className="lg:col-span-8 space-y-6">
                <ReviewStateCard availability={videoUrl ? 'READY' : 'WAITING'} />
                <div className="relative aspect-video rounded-3xl overflow-hidden bg-card border border-border shadow-2xl group">
                    <ReviewPlayer
                        url={videoUrl}
                        onTimeUpdate={handleTimeUpdate}
                        ref={playerRef}
                    />
                </div>

                <div className="glass-card rounded-3xl border border-border p-8 space-y-6">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-semibold tracking-tight">About this video</h2>
                        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-semibold text-primary">
                            {snapshot?.label || 'Current version'}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="p-4 rounded-2xl bg-white/[0.02] border border-border">
                            <p className="text-xs text-muted-foreground font-semibold mb-1">Goal</p>
                            <p className="text-sm font-bold text-white capitalize">{project.outcome_goal.replace('_', ' ')}</p>
                        </div>
                        <div className="p-4 rounded-2xl bg-white/[0.02] border border-border">
                            <p className="text-xs text-muted-foreground font-semibold mb-1">Platform</p>
                            <p className="text-sm font-bold text-white">{project.platform.replace('_', ' ')}</p>
                        </div>
                        <div className="p-4 rounded-2xl bg-white/[0.02] border border-border">
                            <p className="text-xs text-muted-foreground font-semibold mb-1">Scenes</p>
                            <p className="text-sm font-bold text-white">{scenes.length}</p>
                        </div>
                        <div className="p-4 rounded-2xl bg-white/[0.02] border border-border">
                            <p className="text-xs text-muted-foreground font-semibold mb-1">Layers</p>
                            <p className="text-sm font-bold text-white">{layers.length}</p>
                        </div>
                    </div>

                        <p className="text-muted-foreground text-sm leading-relaxed">
                        Watch the video, leave a note at the right moment, and approve it when it is ready. Your feedback stays attached to this version.
                        </p>
                    <div className="border-t border-border pt-6">
                        <ReviewDecisionPanel canDecide={false} />
                    </div>
                </div>
            </div>

            {/* Right Column: Interactive Sidebar */}
            <div className="lg:col-span-4 space-y-6 sticky top-28">
                <div className="glass-card rounded-3xl border border-border overflow-hidden flex flex-col min-h-[600px] max-h-[800px]">
                    {/* Tabs */}
                    <div className="flex border-b border-border bg-white/[0.01]">
                        <button
                            onClick={() => setActiveTab('comments')}
                            className={`flex-1 flex items-center justify-center gap-2 py-4 text-xs font-semibold transition-all ${activeTab === 'comments' ? 'text-white bg-white/5' : 'text-muted-foreground hover:text-zinc-300'}`}
                        >
                            <MessageSquare className="w-3.5 h-3.5" />
                            Notes
                        </button>
                        <button
                            onClick={() => setActiveTab('scenes')}
                            className={`flex-1 flex items-center justify-center gap-2 py-4 text-xs font-semibold transition-all ${activeTab === 'scenes' ? 'text-white bg-white/5' : 'text-muted-foreground hover:text-zinc-300'}`}
                        >
                            <ListMusic className="w-3.5 h-3.5" />
                            Parts
                        </button>
                        <button
                            onClick={() => setActiveTab('layers')}
                            className={`flex-1 flex items-center justify-center gap-2 py-4 text-xs font-semibold transition-all ${activeTab === 'layers' ? 'text-white bg-white/5' : 'text-muted-foreground hover:text-zinc-300'}`}
                        >
                            <Layers className="w-3.5 h-3.5" />
                            Media
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                        {activeTab === 'comments' && (
                            <ReviewComments
                                reviewLinkId={reviewLinkId}
                                comments={comments}
                                currentTime={currentTime}
                                onCommentAdded={handleCommentAdded}
                                onSeek={handleSeek}
                            />
                        )}

                        {activeTab === 'scenes' && (
                            <div className="space-y-4">
                                {scenes.map((scene, i) => (
                                    <div key={scene.id} className="p-4 rounded-2xl bg-white/[0.02] border border-border group hover:border-border transition-all">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-xs font-semibold text-muted-foreground">Part {i + 1}</span>
                                            <span className="text-xs font-semibold text-primary">{scene.scene_goal.split('_')[0]}</span>
                                        </div>
                                        <p className="text-white text-sm font-medium leading-relaxed mb-3">{scene.scene_text}</p>
                                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <ChevronRight className="w-3 h-3 text-muted-foreground" />
                                            <span className="text-xs text-muted-foreground font-semibold">Script Approved</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {activeTab === 'layers' && (
                            <div className="space-y-3">
                                {layers.map(layer => (
                                    <div key={layer.id} className="flex items-center gap-4 p-3 rounded-2xl bg-white/[0.02] border border-border">
                                        <div className="relative w-12 h-12 rounded-xl bg-background overflow-hidden flex items-center justify-center border border-border">
                                            {layer.layer_type === 'image' || layer.layer_type === 'background' ? (
                                            <Image src={layer.asset_url} alt="Media used in this video" fill unoptimized sizes="48px" className="object-cover" />
                                            ) : (
                                                <Layers className="w-5 h-5 text-muted-foreground" />
                                            )}
                                        </div>
                                        <div>
                                            <p className="text-xs font-semibold text-muted-foreground mb-0.5">{layer.layer_type}</p>
                                            <p className="text-xs text-white font-bold truncate max-w-[180px]">{layer.asset_url.split('/').pop()}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
