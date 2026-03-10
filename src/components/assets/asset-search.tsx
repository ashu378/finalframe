'use client';

import { Search, Image as ImageIcon, Video, Music, X } from 'lucide-react';
import { type AssetType } from '@/lib/types/database';

interface AssetSearchProps {
    query: string;
    onQueryChange: (q: string) => void;
    selectedType: AssetType | 'all';
    onTypeChange: (t: AssetType | 'all') => void;
}

export function AssetSearch({ query, onQueryChange, selectedType, onTypeChange }: AssetSearchProps) {
    const types: { value: AssetType | 'all'; label: string; icon: any }[] = [
        { value: 'all', label: 'All', icon: Search },
        { value: 'image', label: 'Images', icon: ImageIcon },
        { value: 'video', label: 'Videos', icon: Video },
        { value: 'audio', label: 'Audio', icon: Music },
    ];

    return (
        <div className="flex flex-col md:flex-row items-center gap-6 bg-zinc-900 border border-zinc-800 p-5 rounded-sm shadow-3xl">
            {/* Search Input */}
            <div className="relative flex-1 w-full">
                <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 italic" />
                <input
                    type="text"
                    value={query}
                    onChange={(e) => onQueryChange(e.target.value)}
                    placeholder="DEFINE_SEARCH_FILTER..."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-sm py-5 pl-14 pr-12 text-sm font-black text-zinc-50 uppercase tracking-[0.2em] placeholder:text-zinc-800 focus:outline-none focus:border-primary/50 transition-all italic shadow-inner"
                />
                {query && (
                    <button
                        onClick={() => onQueryChange('')}
                        className="absolute right-4 top-1/2 -translate-y-1/2 p-2 hover:bg-zinc-800 rounded-sm transition-colors"
                    >
                        <X className="w-4 h-4 text-zinc-600" />
                    </button>
                )}
            </div>

            {/* Type Filters */}
            <div className="flex items-center gap-2 p-2 bg-zinc-950 rounded-sm border border-zinc-800 shadow-inner">
                {types.map((type) => {
                    const Icon = type.icon;
                    const isActive = selectedType === type.value;
                    return (
                        <button
                            key={type.value}
                            onClick={() => onTypeChange(type.value)}
                            className={`
                                flex items-center gap-3 px-6 py-3.5 rounded-sm text-metadata font-black uppercase tracking-widest transition-all
                                ${isActive
                                    ? 'bg-primary !text-black shadow-2xl shadow-primary/20 italic'
                                    : 'text-zinc-600 hover:text-zinc-400 hover:bg-zinc-900'}
                            `}
                        >
                            <Icon className={`w-4 h-4 ${isActive ? '!text-black' : 'text-zinc-700'}`} />
                            <span className="hidden lg:inline">{type.label}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
