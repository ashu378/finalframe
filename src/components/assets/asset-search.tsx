'use client';

import { Search, Image as ImageIcon, Video, Music, X, type LucideIcon } from 'lucide-react';
import { type AssetType } from '@/lib/types/database';

interface AssetSearchProps { query: string; onQueryChange: (q: string) => void; selectedType: AssetType | 'all'; onTypeChange: (t: AssetType | 'all') => void; }

export function AssetSearch({ query, onQueryChange, selectedType, onTypeChange }: AssetSearchProps) {
  const types: {value: AssetType | 'all'; label: string; icon: LucideIcon}[] = [
    {value:'all',label:'All files',icon:Search},{value:'image',label:'Images',icon:ImageIcon},{value:'video',label:'Videos',icon:Video},{value:'audio',label:'Audio',icon:Music},
  ];
  return <div className="flex min-w-0 flex-col gap-4 xl:flex-row">
    <label className="relative min-w-0 flex-1"><span className="sr-only">Search your media</span><Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><input type="search" value={query} onChange={e=>onQueryChange(e.target.value)} placeholder="Search your media" className="min-h-12 w-full rounded-xl border border-input bg-background py-3 pl-11 pr-12 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-primary" />{query && <button type="button" aria-label="Clear media search" onClick={()=>onQueryChange('')} className="absolute right-1 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-lg hover:bg-secondary"><X className="size-4" /></button>}</label>
    <div className="grid grid-cols-2 gap-2 sm:flex" aria-label="Filter media type">{types.map(type=>{const Icon=type.icon,isActive=selectedType===type.value;return <button type="button" key={type.value} onClick={()=>onTypeChange(type.value)} aria-pressed={isActive} className={`flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors ${isActive?'bg-primary text-primary-foreground':'bg-secondary text-muted-foreground hover:text-foreground'}`}><Icon className="size-4 shrink-0" aria-hidden="true" />{type.label}</button>})}</div>
  </div>;
}
