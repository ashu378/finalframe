'use client';

import { useState, useEffect } from 'react';
import { Send, Terminal, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { submitRemixJob, estimateRemixCost, checkRemixStatus } from '@/lib/remix/actions';
import { useRouter } from 'next/navigation';

interface RemixChatProps {
    projectId: string;
    renderJobId: string;
    isRemixing: boolean;
    initialMessages?: { role: 'user' | 'assistant', content: string }[];
}

export function RemixChat({ projectId, renderJobId, isRemixing: initialIsRemixing, initialMessages = [] }: RemixChatProps) {
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [isRemixing, setIsRemixing] = useState(initialIsRemixing);

    // Default welcome message
    const welcomeMsg = { role: 'assistant' as const, content: 'Tell the assistant what you want to change: a clip, the timing, text or the look of your video.' };

    // Merge initial history with welcome message if empty
    const [messages, setMessages] = useState<{ role: 'user' | 'assistant', content: string }[]>(
        initialMessages.length > 0 ? initialMessages : [welcomeMsg]
    );
    const router = useRouter();

    // Polling Effect
    useEffect(() => {
        if (!isRemixing) return;

        const interval = setInterval(async () => {
            const locked = await checkRemixStatus(renderJobId);
            if (!locked) {
                setIsRemixing(false);
                clearInterval(interval);
                router.refresh(); // Refresh to see new layers
                setMessages(prev => [...prev, { role: 'assistant', content: 'Your changes are saved in the edit.' }]);
            }
        }, 3000);

        return () => clearInterval(interval);
    }, [isRemixing, renderJobId, router]);

    // Update local state if prop changes (e.g. parent refresh)
    useEffect(() => {
        setIsRemixing(initialIsRemixing);
    }, [initialIsRemixing]);

    async function handleSend() {
        if (!input.trim() || loading) return;

        const userMsg = input;
        setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
        setInput('');
        setLoading(true);

        try {
            // 1. Submit Job
            const result = await submitRemixJob(projectId, renderJobId, userMsg);

            if (result.success) {
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: `Executing directive. Target: ${result.parsedIntent.target_layer} layer. Please hold for manifestation.`
                }]);
                setIsRemixing(true); // Start polling
                router.refresh(); // Refresh to show "Processing" state in layers
            }
        } catch (err) {
            console.error(err);
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: `Sorry, I couldn't process that. ${err instanceof Error ? err.message : 'Unknown error'}`
            }]);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="flex flex-col h-full bg-background border-l border-border shadow-3xl">
            {/* Header */}
            <div className="p-8 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Terminal className="w-5 h-5 text-primary italic" />
                    <span className="text-metadata font-semibold tracking-[0.4em] text-zinc-50 italic">Director_Command</span>
                </div>
                <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-primary  animate-pulse" />
                    <span className="text-metadata font-semibold text-primary tracking-[0.4em] italic leading-none">Status: Linked</span>
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-8 space-y-10 scrollbar-hide">
                {messages.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[95%] rounded-xl p-6 text-sm font-bold leading-relaxed tracking-wide italic shadow-lg ${msg.role === 'user'
                            ? 'bg-card text-zinc-50 border border-border'
                            : 'bg-primary/5 text-primary border border-primary/20'
                            }`}>
                            <span className="block text-metadata font-semibold text-muted-foreground mb-4">
                                {msg.role === 'user' ? 'You' : 'FinalFrame assistant'}
                            </span>
                            {msg.content}
                        </div>
                    </div>
                ))}
            </div>

            {/* Input */}
            <div className="p-8 border-t border-border bg-background">
                <div className="relative group">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                        placeholder="ENTER DIRECTIVE Command..."
                        className="w-full bg-card border border-border rounded-xl py-5 pl-8 pr-16 text-sm font-semibold text-zinc-50 focus:outline-none focus:border-primary/50 placeholder:text-muted-foreground transition-all italic"
                        disabled={loading || isRemixing}
                    />
                    <button
                        onClick={handleSend}
                        disabled={loading || isRemixing || !input.trim()}
                        className="min-w-11 min-h-11 absolute right-4 top-1/2 -translate-y-1/2 p-3.5 rounded-xl bg-primary/10 text-primary hover:bg-primary hover:text-black transition-all disabled:opacity-20 shadow-2xl"
                    >
                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                    </button>
                </div>
            </div>
        </div>
    );
}
