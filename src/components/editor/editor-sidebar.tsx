'use client';

import { useState } from 'react';
import { RemixChat } from '@/components/editor/remix-chat';
import { AssetPanel } from '@/components/editor/asset-panel';
import { MessageSquare, FolderOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EditorSidebarProps {
    projectId: string;
    studioId: string;
    renderJobId: string;
    isRemixing: boolean;
    initialMessages: { role: 'user' | 'assistant', content: string }[];
}

type Tab = 'chat' | 'assets';

export function EditorSidebar({
    projectId,
    studioId,
    renderJobId,
    isRemixing,
    initialMessages
}: EditorSidebarProps) {
    const [activeTab, setActiveTab] = useState<Tab>('chat');

    return (
        <div className="flex flex-col h-full bg-zinc-950 border-l border-zinc-800 w-[400px] shadow-3xl">
            {/* Tab Header */}
            <div className="flex items-center border-b border-zinc-800">
                <button
                    onClick={() => setActiveTab('chat')}
                    className={cn(
                        "flex-1 flex items-center justify-center gap-4 py-5 text-metadata font-black uppercase tracking-[0.2em] transition-all border-b",
                        activeTab === 'chat'
                            ? "text-primary border-primary bg-primary/5 italic"
                            : "text-zinc-600 border-zinc-800 hover:text-zinc-400 hover:bg-zinc-900"
                    )}
                >
                    <MessageSquare className="w-4 h-4" />
                    Video details
                </button>
                <button
                    onClick={() => setActiveTab('assets')}
                    className={cn(
                        "flex-1 flex items-center justify-center gap-4 py-5 text-metadata font-black uppercase tracking-[0.2em] transition-all border-b",
                        activeTab === 'assets'
                            ? "text-primary border-primary bg-primary/5 italic"
                            : "text-zinc-600 border-zinc-800 hover:text-zinc-400 hover:bg-zinc-900"
                    )}
                >
                    <FolderOpen className="w-4 h-4" />
                    Media library
                </button>
            </div>

            {/* Content Content */}
            <div className="flex-1 overflow-hidden relative">
                {activeTab === 'chat' ? (
                    <RemixChat
                        projectId={projectId}
                        renderJobId={renderJobId}
                        isRemixing={isRemixing}
                        initialMessages={initialMessages}
                    />
                ) : (
                    <AssetPanel
                        studioId={studioId}
                        projectId={projectId}
                    />
                )}
            </div>
        </div>
    );
}
