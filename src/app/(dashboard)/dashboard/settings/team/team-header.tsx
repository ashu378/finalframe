'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { UserPlus } from 'lucide-react';
import { InviteDialog } from '@/components/team/invite-dialog';

export function TeamHeader({ studioId }: { studioId: string }) {
    const [open, setOpen] = useState(false);

    return (
        <>
            <Button
                onClick={() => setOpen(true)}
                className="h-14 px-10 rounded-sm bg-primary text-black font-black text-metadata uppercase tracking-[0.3em] transition-all hover:bg-white active:scale-[0.98] shadow-3xl border border-primary/30 italic group"
            >
                <div className="w-8 h-8 rounded-sm bg-black/20 flex items-center justify-center mr-4 group-hover:bg-black/40 transition-colors shadow-inner">
                    <UserPlus className="w-4 h-4 text-black" />
                </div>
                Authorize_Personnel_Registry
            </Button>
            <InviteDialog open={open} onOpenChange={setOpen} studioId={studioId} />
        </>
    );
}
