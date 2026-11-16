'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, Search, RefreshCw, FileVideo, FileAudio } from 'lucide-react';
import Image from 'next/image';

import { StudioAsset } from '@/lib/types/database';
import { getProjectAssets } from '@/lib/assets/actions';
import { UploadButton } from '@/components/assets/upload-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface AssetPanelProps {
    studioId: string;
    projectId: string;
}

export function AssetPanel({ studioId, projectId }: AssetPanelProps) {
    const [assets, setAssets] = useState<StudioAsset[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    const loadAssets = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getProjectAssets(projectId);
            setAssets(data);
        } catch (error) {
            console.error('Failed to load assets', error);
        } finally {
            setLoading(false);
        }
    }, [projectId]);

    useEffect(() => {
        void loadAssets();
    }, [loadAssets]);

    const filtered = assets.filter(a => a.name.toLowerCase().includes(search.toLowerCase()));

    return (
        <div className="flex flex-col h-full bg-transparent">
            {/* Header / Upload */}
            <div className="p-8 border-b border-border space-y-8">
                <div className="flex items-center justify-between">
                    <h2 className="text-metadata font-semibold text-muted-foreground">Media layers</h2>
                    <Button variant="ghost" size="sm" className="h-10 w-10 p-0 rounded-xl border border-border hover:bg-card" onClick={loadAssets}>
                        <RefreshCw className={`w-4 h-4 text-muted-foreground ${loading ? 'animate-spin text-primary' : ''}`} />
                    </Button>
                </div>

                {/* Reuse existing upload button */}
                <div className="w-full [&>div]:w-full [&_button]:w-full [&_button]:py-6 [&_button]:h-auto [&_button]:text-metadata [&_button]:font-semibold [&_button]:uppercase [&_button]:tracking-widest">
                    <UploadButton studioId={studioId} projectExternalId={projectId} />
                </div>

                <div className="relative group">
                    <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                    <Input
                        placeholder="FILTER_MATERIALS..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="pl-14 h-14 bg-background border-border text-sm font-semibold focus:border-primary/50 placeholder:text-muted-foreground rounded-xl shadow-inner"
                    />
                </div>
            </div>

            {/* Grid */}
            <div className="flex-1 overflow-y-auto p-4 content-start">
                {loading && assets.length === 0 ? (
                    <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary/50" /></div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-12 px-6">
                        <p className="text-xs font-semibold text-muted-foreground italic">No media yet</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-4">
                        {filtered.map(asset => (
                            <div
                                key={asset.id}
                                className="group relative aspect-square bg-background border border-border rounded-xl overflow-hidden cursor-grab active:cursor-grabbing hover:border-primary/50 transition-all shadow-2xl"
                                draggable
                                onDragStart={(e) => {
                                    e.dataTransfer.setData('application/json', JSON.stringify(asset));
                                }}
                            >
                                {asset.type === 'image' && (
                                    <Image src={asset.url} alt={asset.name} fill className="object-cover opacity-60 group-hover:opacity-100 transition-opacity" />
                                )}
                                {(asset.type === 'video' || asset.type === 'audio') && (
                                    <div className="w-full h-full flex items-center justify-center bg-card">
                                        {asset.type === 'video' ? <FileVideo className="w-8 h-8 text-muted-foreground group-hover:text-primary transition-colors" /> : <FileAudio className="w-8 h-8 text-muted-foreground group-hover:text-primary transition-colors" />}
                                    </div>
                                )}

                                <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                                    <p className="truncate text-metadata text-primary font-semibold italic">{asset.name}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="p-6 border-t border-border bg-card/50">
                <p className="text-metadata font-semibold text-muted-foreground text-center italic">
                        Drag media into your video
                </p>
            </div>
        </div>
    );
}
