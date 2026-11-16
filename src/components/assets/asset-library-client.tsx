'use client';

import { useState } from 'react';
import { type StudioAsset, type AssetType, type Template } from '@/lib/types/database';
import { AssetSearch } from './asset-search';
import { AssetGrid } from './asset-grid';
import { cn } from '@/lib/utils';
import { TemplateList } from '@/components/templates/template-list';

interface AssetLibraryClientProps {
    initialAssets: StudioAsset[];
    presets: Template[];
    studioId: string;
}

export function AssetLibraryClient({ initialAssets, presets, studioId }: AssetLibraryClientProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [filterType, setFilterType] = useState<AssetType | 'all'>('all');
    const [activeTab, setActiveTab] = useState<'my_materials' | 'studio_presets'>('my_materials');

    return (
        <div className="space-y-6">
            <div className="space-y-5 rounded-2xl border border-border bg-card p-4 sm:p-5">
                {/* Tabs */}
                <div className="flex w-fit max-w-full flex-wrap items-center gap-1 rounded-xl bg-background p-1">
                    <button
                        aria-pressed={activeTab === 'my_materials'}
                        onClick={() => setActiveTab('my_materials')}
                        className={cn(
                            "min-h-11 rounded-lg px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            activeTab === 'my_materials'
                                ? "bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        My media
                    </button>
                    <button
                        aria-pressed={activeTab === 'studio_presets'}
                        onClick={() => setActiveTab('studio_presets')}
                        className={cn(
                            "min-h-11 rounded-lg px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            activeTab === 'studio_presets'
                                ? "bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        Saved starting points
                    </button>
                </div>

                {activeTab === 'my_materials' ? <AssetSearch
                    query={searchQuery}
                    onQueryChange={setSearchQuery}
                    selectedType={filterType}
                    onTypeChange={setFilterType}
                /> : <label className="flex w-full flex-col gap-2 text-sm font-medium">Search saved starting points<input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="min-h-12 w-full rounded-xl border border-input bg-background px-3 text-base" /></label>}
            </div>

            {activeTab === 'my_materials' ? <AssetGrid
                initialAssets={initialAssets}
                studioId={studioId}
                searchQuery={searchQuery}
                filterType={filterType}
            /> : <TemplateList key={presets.map((preset) => `${preset.id}:${preset.blueprint_data.saved}`).join(',')} templates={presets.filter((preset) => `${preset.name} ${preset.description ?? ''}`.toLowerCase().includes(searchQuery.toLowerCase()))} studioId={studioId} />}
        </div>
    );
}
