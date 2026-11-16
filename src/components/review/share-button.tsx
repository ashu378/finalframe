'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Share2 } from 'lucide-react';
import { ShareDialog } from './share-dialog';

interface ShareButtonProps {
    projectId: string;
}

export function ShareButton({ projectId }: ShareButtonProps) {
    const [open, setOpen] = useState(false);

    return (
        <>
            <Button
                variant="primary"
                className="gap-3 h-11 px-8 rounded-xl font-semibold text-xs"
                onClick={() => setOpen(true)}
            >
                <Share2 className="w-3.5 h-3.5" />
                Share for review
            </Button>

            {open && (
                <ShareDialog
                    projectId={projectId}
                    onClose={() => setOpen(false)}
                />
            )}
        </>
    );
}
