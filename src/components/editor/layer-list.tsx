'use client';

import { Layers, Eye, EyeOff, Lock, Unlock } from 'lucide-react';
import type { RemixLayerType } from '@/lib/types/database';

interface Layer {
    id: string;
    type: RemixLayerType;
    url: string;
    isOriginal: boolean;
}

interface LayerListProps {
    layers: Layer[];
}

export function LayerList({ layers }: LayerListProps) {
    return (
        <div className="space-y-3">
            <h3 className="text-metadata font-black text-zinc-500 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-primary rounded-full" />
                Active Composition Manifest
            </h3>

            {layers.length === 0 ? (
                <p className="text-sm text-zinc-600 italic px-2">No active layers in registry.</p>
            ) : (
                layers.map(layer => (
                    <div key={layer.id} className="flex items-center justify-between px-4 py-3 rounded-sm bg-zinc-900 border border-zinc-800 hover:border-primary/30 transition-all group shadow-sm">
                        <div className="flex items-center gap-4">
                            <div className={`w-2 h-2 rounded-full ${getLayerColor(layer.type)} shadow-sm`} />
                            <span className="text-sm font-black text-zinc-300 uppercase tracking-widest">{layer.type}</span>
                            {!layer.isOriginal && (
                                <span className="text-metadata px-2 py-0.5 bg-primary/10 text-primary rounded-sm border border-primary/20 font-black uppercase tracking-widest italic">
                                    Remixed
                                </span>
                            )}
                        </div>

                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            {layer.type === 'actor' && <Lock className="w-4 h-4 text-zinc-600" />}
                        </div>
                    </div>
                ))
            )}
        </div>
    );
}

function getLayerColor(type: string) {
    switch (type) {
        case 'video': return 'bg-zinc-100';
        case 'audio': return 'bg-amber-500';
        case 'text': return 'bg-zinc-500';
        case 'actor': return 'bg-zinc-700';
        default: return 'bg-zinc-800';
    }
}
