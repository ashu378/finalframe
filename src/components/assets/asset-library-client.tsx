'use client';

import { useState } from 'react';
import { type StudioAsset, type AssetType } from '@/lib/types/database';
import { AssetSearch } from './asset-search';
import { AssetGrid } from './asset-grid';
import { cn } from '@/lib/utils';

interface AssetLibraryClientProps {
    initialAssets: StudioAsset[];
    presets: StudioAsset[];
    studioId: string;
}

export function AssetLibraryClient({ initialAssets, presets, studioId }: AssetLibraryClientProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [filterType, setFilterType] = useState<AssetType | 'all'>('all');
    const [activeTab, setActiveTab] = useState<'my_materials' | 'studio_presets'>('my_materials');

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                {/* Tabs */}
                <div className="flex items-center gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-sm">
                    <button
                        onClick={() => setActiveTab('my_materials')}
                        className={cn(
                            "px-6 py-2.5 text-[10px] font-black uppercase tracking-[0.2em] transition-all rounded-sm italic",
                            activeTab === 'my_materials'
                                ? "bg-primary text-black shadow-2xl shadow-primary/20"
                                : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
                        )}
                    >
                        My_Materials
                    </button>
                    <button
                        onClick={() => setActiveTab('studio_presets')}
                        className={cn(
                            "px-6 py-2.5 text-[10px] font-black uppercase tracking-[0.2em] transition-all rounded-sm italic",
                            activeTab === 'studio_presets'
                                ? "bg-primary text-black shadow-2xl shadow-primary/20"
                                : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
                        )}
                    >
                        Studio_Presets
                    </button>
                </div>

                <AssetSearch
                    query={searchQuery}
                    onQueryChange={setSearchQuery}
                    selectedType={filterType}
                    onTypeChange={setFilterType}
                />
            </div>

            <AssetGrid
                initialAssets={activeTab === 'my_materials' ? initialAssets : presets}
                studioId={studioId}
                searchQuery={searchQuery}
                filterType={filterType}
                isPresetMode={activeTab === 'studio_presets'}
            />
        </div>
    );
}
