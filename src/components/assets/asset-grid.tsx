'use client';

import { useState, useEffect } from 'react';
import { type StudioAsset, type AssetType } from '@/lib/types/database';
import { deleteAssets, stowPreset } from '@/lib/assets/actions';
import { FileImage, FileVideo, FileAudio, Trash2, Download, Check } from 'lucide-react';
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

function LibraryVideoPreview({ url, name }: { url: string; name: string }) {
    const [open, setOpen] = useState(false);
    return <details className="border-t border-border p-3" onClick={event => event.stopPropagation()} onToggle={event => setOpen(event.currentTarget.open)}>
        <summary aria-label={`Preview video ${name}`} className="min-h-11 cursor-pointer rounded-xl px-2 py-3 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">Preview video</summary>
        {open ? <video src={url} controls playsInline preload="metadata" aria-label={`Saved video ${name}`} className="mt-2 aspect-video w-full rounded-xl bg-black object-contain" /> : null}
    </details>;
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
        if (!confirm(`Are you sure you want to delete ${selectedIds.size} files?`)) return;

        setIsDeleting(true);
        const idsToDelete = Array.from(selectedIds);

        // Optimistic
        setAssets(prev => prev.filter(a => !selectedIds.has(a.id)));
        setSelectedIds(new Set());

        const res = await deleteAssets(idsToDelete);
        if (!res.success) {
            alert('Could not delete some files: ' + res.error);
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
            alert('Could not add this saved item: ' + res.error);
        }
        setStowingId(null);
    };

    if (filteredAssets.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[280px] px-6 text-center border border-border bg-background/50 rounded-xl text-foreground0 animate-in fade-in zoom-in duration-500 shadow-inner">
                <div className="size-14 rounded-2xl bg-secondary flex items-center justify-center mb-5">
                    <FileImage className="size-6" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2 ">No matching media</h3>
                <p className="text-sm font-normal leading-6 text-muted-foreground ">Upload a file, clear your search, or choose a different file type.</p>
            </div>
        );
    }

    return (
        <div className="relative space-y-4 pb-24">
            {/* Bulk Actions Bar */}
            {!isPresetMode && selectedIds.size > 0 && (
                <div className="fixed bottom-4 left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-[60] animate-in slide-in-from-bottom-12 fade-in duration-300">
                    <div className="flex flex-wrap items-center justify-center gap-3 px-4 py-3 bg-card border border-border rounded-2xl shadow-xl">
                        <span className="text-sm font-semibold text-foreground tracking-normal ">
                            {selectedIds.size} {selectedIds.size === 1 ? 'file' : 'files'} selected
                        </span>
                        <div className="h-6 w-px bg-secondary" />
                        <Button
                            variant="danger"
                            size="sm"
                            className="min-h-11 px-4 rounded-xl gap-2 font-semibold text-sm bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive hover:text-destructive-foreground transition-colors "
                            onClick={handleBulkDelete}
                            disabled={isDeleting}
                        >
                            <Trash2 className="w-4 h-4" />
                            Delete selected
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-12 px-8 rounded-xl text-foreground0 hover:text-foreground text-sm font-semibold tracking-widest transition-colors"
                            onClick={() => setSelectedIds(new Set())}
                        >
                            Cancel
                        </Button>
                    </div>
                </div>
            )}

            <p className="text-sm text-muted-foreground" aria-live="polite">{filteredAssets.length} {filteredAssets.length === 1 ? 'file' : 'files'}{searchQuery || filterType !== 'all' ? ' match your filters' : ' in your library'}. {isPresetMode ? 'Add a saved item to use it in your library.' : 'Choose a file to select it.'}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredAssets.map(asset => {
                    const isSelected = selectedIds.has(asset.id);
                    const isStowed = recentStowed === asset.id;
                    const isStowing = stowingId === asset.id;

                    return (
                        <div
                            key={asset.id}
                            onClick={() => toggleSelect(asset.id)}
                            className={cn(
                                "group relative overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:border-primary/50",
                                !isPresetMode && "cursor-pointer",
                                isSelected && "border-primary bg-primary/5"
                            )}
                        >
                            {/* Selection Checkbox (only in private mode) */}
                            {!isPresetMode && (
                                <button type="button" aria-label={`Select ${asset.name}`} aria-pressed={isSelected} onClick={event => { event.stopPropagation(); toggleSelect(asset.id); }} className={`absolute left-2 top-2 z-20 grid size-11 place-items-center rounded-xl border bg-background/90 ${isSelected ? 'border-primary text-primary' : 'border-border text-muted-foreground'}`}>
                                    {isSelected ? <Check className="size-5" /> : <span className="size-4 rounded border border-current" />}
                                </button>
                            )}

                            {/* Preset Badge */}
                            {isPresetMode && (
                                <div className="absolute top-4 left-4 z-20 px-2 py-1 bg-primary text-primary-foreground text-xs font-semibold rounded-lg">
                                    Preset
                                </div>
                            )}

                            {/* Preview */}
                            <div className="aspect-[4/3] bg-background/50 relative flex items-center justify-center">
                                {asset.type === 'image' ? (
                                    <div className="relative w-full h-full">
                                        <Image src={asset.url} alt={asset.name} fill className="object-cover" />
                                    </div>
                                ) : asset.type === 'video' ? (
                                    <FileVideo className="h-12 w-12 text-foreground0" aria-hidden="true" />
                                ) : (
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="w-12 h-12 rounded-xl bg-primary/5 flex items-center justify-center border border-primary/20">
                                            <FileAudio className="w-5 h-5 text-primary" />
                                        </div>
                                    </div>
                                )}

                                {/* Hover Action (Stow to Studio) */}
                                {isPresetMode && (
                                    <div className="absolute inset-0 bg-black/60 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                                        <Button
                                            onClick={(e) => handleStow(e, asset.id)}
                                            disabled={isStowing || isStowed}
                                            className={cn(
                                                "min-h-11 px-4 gap-2 rounded-xl font-semibold text-sm transition-colors",
                                                isStowed ? "bg-[hsl(var(--success))] text-background" : "bg-primary text-primary-foreground"
                                            )}
                                        >
                                            {isStowed ? (
                                                <><Check className="w-3.5 h-3.5" /> Added to library</>
                                            ) : isStowing ? (
                                                "Adding…"
                                            ) : (
                                                <><Download className="w-3.5 h-3.5" /> Add to library</>
                                            )}
                                        </Button>
                                    </div>
                                )}

                                {/* Top right type icon (only in private mode) */}
                                {!isPresetMode && (
                                    <div className="absolute top-4 right-4 z-10 w-8 h-8 rounded-xl bg-background/90 backdrop-blur-md border border-border flex items-center justify-center transition-colors">
                                        {asset.type === 'image' && <FileImage className="w-4 h-4 text-foreground0" />}
                                        {asset.type === 'video' && <FileVideo className="w-4 h-4 text-foreground0" />}
                                        {asset.type === 'audio' && <FileAudio className="w-4 h-4 text-foreground0" />}
                                    </div>
                                )}
                            </div>

                            {asset.type === 'video' ? <LibraryVideoPreview key={`${asset.id}:${asset.url}`} url={asset.url} name={asset.name} /> : null}

                            {/* Metadata */}
                            <div className="p-5 bg-background border-t border-border">
                                <p className="break-words text-sm font-semibold text-foreground group-hover:text-primary transition-colors " title={asset.name}>
                                    {asset.name}
                                </p>
                                <div className="flex items-center justify-between mt-3">
                                    <p className="text-sm text-muted-foreground tracking-normal font-semibold ">
                                        {asset.size > 0 ? `${(asset.size / 1024 / 1024).toFixed(1)} MB` : 'Saved reference'}
                                    </p>

                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

