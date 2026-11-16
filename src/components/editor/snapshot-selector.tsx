'use client';

import { History, GitCommit } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';

interface Snapshot {
    id: string;
    label: string | null;
    created_at: string;
}

interface SnapshotSelectorProps {
    snapshots: Snapshot[];
    currentSnapshotId?: string;
}

export function SnapshotSelector({ snapshots, currentSnapshotId }: SnapshotSelectorProps) {
    const router = useRouter();
    const searchParams = useSearchParams();

    function handleSelect(id: string) {
        const params = new URLSearchParams(searchParams.toString());
        params.set('snapshotId', id);
        router.push(`?${params.toString()}`);
    }

    if (snapshots.length === 0) return null;

    return (
        <div className="border-t border-border p-6 bg-background">
            <h3 className="text-metadata font-semibold text-muted-foreground mb-6 flex items-center gap-3">
                <History className="w-4 h-4 text-primary italic" />
                Version history
            </h3>
            <div className="space-y-1 max-h-40 overflow-y-auto">
                {snapshots.map(snapshot => (
                    <Button
                        key={snapshot.id}
                        variant="ghost"
                        size="sm"
                        className={`w-full justify-start text-metadata h-10 px-4 rounded-xl font-semibold transition-all ${currentSnapshotId === snapshot.id
                            ? 'bg-primary/10 text-primary border border-primary/20 italic'
                            : 'text-muted-foreground hover:text-zinc-200 hover:bg-card border border-transparent hover:border-border'
                            }`}
                        onClick={() => handleSelect(snapshot.id)}
                    >
                        <span className="truncate flex-1 text-left">
                            {snapshot.label || `Version ${new Date(snapshot.created_at).getTime().toString().slice(-6)}`}
                        </span>
                    </Button>
                ))}
            </div>
        </div>
    );
}
