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
    const welcomeMsg = { role: 'assistant' as const, content: 'Production Assistant online. Define adjustments for specific layers, technical timing, or visual execution.' };

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
                setMessages(prev => [...prev, { role: 'assistant', content: 'Execution completed. Manifest updated with new layers.' }]);
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
        <div className="flex flex-col h-full bg-zinc-950 border-l border-zinc-800 shadow-3xl">
            {/* Header */}
            <div className="p-8 border-b border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Terminal className="w-5 h-5 text-primary italic" />
                    <span className="text-metadata font-black uppercase tracking-[0.4em] text-zinc-50 italic">Director_Command</span>
                </div>
                <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-primary shadow-[0_0_10px_rgba(251,191,36,0.6)] animate-pulse" />
                    <span className="text-metadata font-black text-primary uppercase tracking-[0.4em] italic leading-none">Status: Linked</span>
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-8 space-y-10 scrollbar-hide">
                {messages.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[95%] rounded-sm p-6 text-sm font-bold leading-relaxed tracking-wide uppercase italic shadow-lg ${msg.role === 'user'
                            ? 'bg-zinc-900 text-zinc-50 border border-zinc-800'
                            : 'bg-primary/5 text-primary border border-primary/20'
                            }`}>
                            <span className="block text-metadata font-black text-zinc-600 mb-4 tracking-[0.2em]">
                                {msg.role === 'user' ? 'OPERATOR_SIGNAL' : 'ASSISTANT_RESONANCE'}
                            </span>
                            {msg.content}
                        </div>
                    </div>
                ))}
            </div>

            {/* Input */}
            <div className="p-8 border-t border-zinc-800 bg-zinc-950">
                <div className="relative group">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                        placeholder="ENTER DIRECTIVE Command..."
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-sm py-5 pl-8 pr-16 text-sm font-black text-zinc-50 focus:outline-none focus:border-primary/50 placeholder:text-zinc-700 transition-all uppercase tracking-[0.2em] italic"
                        disabled={loading || isRemixing}
                    />
                    <button
                        onClick={handleSend}
                        disabled={loading || isRemixing || !input.trim()}
                        className="absolute right-4 top-1/2 -translate-y-1/2 p-3.5 rounded-sm bg-primary/10 text-primary hover:bg-primary hover:text-black transition-all disabled:opacity-20 shadow-2xl"
                    >
                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                    </button>
                </div>
            </div>
        </div>
    );
}
