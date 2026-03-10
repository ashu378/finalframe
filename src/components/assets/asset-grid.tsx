'use client';

import { useState, useEffect } from 'react';
import { type StudioAsset, type AssetType } from '@/lib/types/database';
import { deleteAssets, stowPreset } from '@/lib/assets/actions';
import { FileImage, FileVideo, FileAudio, Trash2, MoreHorizontal, Download, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

interface AssetGridProps {
    initialAssets: StudioAsset[];
    studioId: string;
    searchQuery?: string;
    filterType?: AssetType | 'all';
    isPresetMode?: boolean;
}

export function AssetGrid({ initialAssets, studioId, searchQuery = '', filterType = 'all', isPresetMode = false }: AssetGridProps) {
    const router = useRouter();
    const [assets, setAssets] = useState<StudioAsset[]>(initialAssets);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isDeleting, setIsDeleting] = useState(false);
    const [stowingId, setStowingId] = useState<string | null>(null);
    const [recentStowed, setRecentStowed] = useState<string | null>(null);

    // Sync assets when initialAssets change (e.g. tab switch or upload)
    useEffect(() => {
        setAssets(initialAssets);
        setSelectedIds(new Set());
    }, [initialAssets]);

    const filteredAssets = assets.filter(asset => {
        const matchesQuery = asset.name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesType = filterType === 'all' || asset.type === filterType;
        return matchesQuery && matchesType;
    });

    const toggleSelect = (id: string) => {
        if (isPresetMode) return; // No multi-select for presets
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    const handleBulkDelete = async () => {
        if (selectedIds.size === 0) return;
        if (!confirm(`Are you sure you want to delete ${selectedIds.size} assets?`)) return;

        setIsDeleting(true);
        const idsToDelete = Array.from(selectedIds);

        // Optimistic
        setAssets(prev => prev.filter(a => !selectedIds.has(a.id)));
        setSelectedIds(new Set());

        const res = await deleteAssets(idsToDelete);
        if (!res.success) {
            alert('Failed to delete some assets: ' + res.error);
        }
        setIsDeleting(false);
    };

    const handleStow = async (e: React.MouseEvent, presetId: string) => {
        e.stopPropagation();
        setStowingId(presetId);
        const res = await stowPreset(studioId, presetId);
        if (res.success) {
            setRecentStowed(presetId);
            setTimeout(() => setRecentStowed(null), 3000);
        } else {
            alert('Failed to stow preset: ' + res.error);
        }
        setStowingId(null);
    };

    if (filteredAssets.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[500px] border border-zinc-800 bg-zinc-950/50 rounded-sm text-zinc-500 animate-in fade-in zoom-in duration-500 shadow-inner">
                <div className="w-20 h-20 rounded-sm bg-zinc-900 flex items-center justify-center mb-8 border border-zinc-800 shadow-3xl">
                    <FileImage className="w-8 h-8 opacity-20" />
                </div>
                <h3 className="text-sm font-black uppercase tracking-[0.3em] text-zinc-50 mb-4 italic">No Material Detected</h3>
                <p className="text-metadata font-bold uppercase tracking-[0.2em] text-zinc-700 italic">Adjust index filters or initiate material staging.</p>
            </div>
        );
    }

    return (
        <div className="relative space-y-4 pb-24">
            {/* Bulk Actions Bar */}
            {!isPresetMode && selectedIds.size > 0 && (
                <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[60] animate-in slide-in-from-bottom-12 fade-in duration-300">
                    <div className="flex items-center gap-8 px-10 py-5 bg-zinc-950 border border-primary/30 rounded-sm shadow-3xl backdrop-blur-2xl">
                        <span className="text-metadata font-black text-zinc-50 uppercase tracking-[0.3em] italic">
                            {selectedIds.size} {selectedIds.size === 1 ? 'MATERIAL' : 'MATERIALS'} SELECTED
                        </span>
                        <div className="h-6 w-px bg-zinc-800" />
                        <Button
                            variant="danger"
                            size="sm"
                            className="h-12 px-8 rounded-sm gap-3 font-black text-metadata uppercase tracking-widest bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500 hover:text-black transition-all shadow-2xl shadow-red-500/10 italic"
                            onClick={handleBulkDelete}
                            disabled={isDeleting}
                        >
                            <Trash2 className="w-4 h-4" />
                            Purge_Assets
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-12 px-8 rounded-sm text-zinc-500 hover:text-zinc-50 text-metadata font-black uppercase tracking-widest transition-colors"
                            onClick={() => setSelectedIds(new Set())}
                        >
                            Cancel
                        </Button>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {filteredAssets.map(asset => {
                    const isSelected = selectedIds.has(asset.id);
                    const isStowed = recentStowed === asset.id;
                    const isStowing = stowingId === asset.id;

                    return (
                        <div
                            key={asset.id}
                            onClick={() => toggleSelect(asset.id)}
                            className={cn(
                                "group relative bg-zinc-900 border border-zinc-800 rounded-sm overflow-hidden transition-all duration-500 hover:border-primary/40 shadow-sm hover:shadow-2xl",
                                !isPresetMode && "cursor-pointer",
                                isSelected && "border-primary shadow-[0_0_30_px_rgba(251,191,36,0.15)] bg-primary/5"
                            )}
                        >
                            {/* Selection Checkbox (only in private mode) */}
                            {!isPresetMode && (
                                <div className={cn(
                                    "absolute top-4 left-4 z-20 w-5 h-5 rounded-sm border border-zinc-700 bg-zinc-950/80 flex items-center justify-center transition-all",
                                    isSelected ? "bg-primary border-transparent shadow-2xl scale-110" : "opacity-0 group-hover:opacity-100"
                                )}>
                                    {isSelected && <div className="w-2.5 h-2.5 !bg-black rounded-[1px]" />}
                                </div>
                            )}

                            {/* Preset Badge */}
                            {isPresetMode && (
                                <div className="absolute top-4 left-4 z-20 px-2 py-1 bg-primary text-black text-[8px] font-black uppercase tracking-widest rounded-sm italic shadow-2xl">
                                    Preset
                                </div>
                            )}

                            {/* Preview */}
                            <div className="aspect-square bg-zinc-950/50 relative flex items-center justify-center">
                                {asset.type === 'image' ? (
                                    <div className="relative w-full h-full">
                                        <Image src={asset.url} alt={asset.name} fill className="object-cover transition-transform duration-500 group-hover:scale-110" />
                                    </div>
                                ) : asset.type === 'video' ? (
                                    <video src={asset.url} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                                ) : (
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="w-12 h-12 rounded-sm bg-primary/5 flex items-center justify-center border border-primary/20">
                                            <FileAudio className="w-5 h-5 text-primary" />
                                        </div>
                                    </div>
                                )}

                                {/* Hover Action (Stow to Studio) */}
                                {isPresetMode && (
                                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center backdrop-blur-[2px]">
                                        <Button
                                            onClick={(e) => handleStow(e, asset.id)}
                                            disabled={isStowing || isStowed}
                                            className={cn(
                                                "h-10 px-6 gap-2 rounded-sm font-black text-[9px] uppercase tracking-widest transition-all italic",
                                                isStowed ? "bg-emerald-500 text-black" : "bg-primary text-black hover:scale-105 shadow-2xl shadow-primary/20"
                                            )}
                                        >
                                            {isStowed ? (
                                                <><Check className="w-3.5 h-3.5" /> Stowed_Library</>
                                            ) : isStowing ? (
                                                "Staging..."
                                            ) : (
                                                <><Download className="w-3.5 h-3.5" /> Stow_To_Studio</>
                                            )}
                                        </Button>
                                    </div>
                                )}

                                {/* Top right type icon (only in private mode) */}
                                {!isPresetMode && (
                                    <div className="absolute top-4 right-4 z-10 w-8 h-8 rounded-sm bg-zinc-950/90 backdrop-blur-md border border-zinc-800 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 shadow-2xl">
                                        {asset.type === 'image' && <FileImage className="w-4 h-4 text-zinc-500" />}
                                        {asset.type === 'video' && <FileVideo className="w-4 h-4 text-zinc-500" />}
                                        {asset.type === 'audio' && <FileAudio className="w-4 h-4 text-zinc-500" />}
                                    </div>
                                )}
                            </div>

                            {/* Metadata */}
                            <div className="p-5 bg-zinc-950 border-t border-zinc-800">
                                <p className="text-metadata font-black text-zinc-50 truncate group-hover:text-primary transition-colors uppercase tracking-[0.15em] italic" title={asset.name}>
                                    {asset.name}
                                </p>
                                <div className="flex items-center justify-between mt-3">
                                    <p className="text-metadata text-zinc-700 uppercase tracking-[0.2em] font-black italic">
                                        {asset.size > 0 ? `${(asset.size / 1024 / 1024).toFixed(1)} MB` : 'STUDIO_REF'}
                                    </p>
                                    {!isPresetMode && (
                                        <div className="p-1.5 opacity-0 group-hover:opacity-100 transition-all hover:bg-zinc-800 rounded-sm">
                                            <MoreHorizontal className="w-4 h-4 text-zinc-600" />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

