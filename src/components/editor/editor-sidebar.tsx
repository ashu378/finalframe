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
        <div className="flex flex-col min-h-[28rem] h-full min-w-0 w-full border-t border-border bg-card lg:w-[360px] lg:border-l lg:border-t-0">
            {/* Tab Header */}
            <div className="flex items-center border-b border-border">
                <button
                    type="button" aria-pressed={activeTab === 'chat'} onClick={() => setActiveTab('chat')}
                    className={cn(
                        "flex-1 flex items-center justify-center min-h-12 gap-2 px-3 py-4 text-sm font-semibold transition-colors border-b",
                        activeTab === 'chat'
                            ? "text-primary border-primary bg-primary/10"
                            : "text-muted-foreground border-border hover:text-muted-foreground hover:bg-card"
                    )}
                >
                    <MessageSquare className="w-4 h-4" />
                    Video details
                </button>
                <button
                    type="button" aria-pressed={activeTab === 'assets'} onClick={() => setActiveTab('assets')}
                    className={cn(
                        "flex-1 flex items-center justify-center min-h-12 gap-2 px-3 py-4 text-sm font-semibold transition-colors border-b",
                        activeTab === 'assets'
                            ? "text-primary border-primary bg-primary/10"
                            : "text-muted-foreground border-border hover:text-muted-foreground hover:bg-card"
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
