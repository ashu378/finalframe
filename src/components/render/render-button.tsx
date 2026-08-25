'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Wand2 } from 'lucide-react';
import { submitRenderJob } from '@/lib/render/actions';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface RenderButtonProps {
    projectId: string;
    disabled?: boolean;
}

export function RenderButton({ projectId, disabled }: RenderButtonProps) {
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    const handleRender = async () => {
        setIsLoading(true);
        try {
            const result = await submitRenderJob(projectId);

            if (result.success) {
                toast.success('Your video is queued for finishing.');
                router.refresh();
            } else {
                console.error('Render Authorization Failure:', JSON.stringify(result, null, 2));
                toast.error(result.error || 'Failed to start rendering');
            }
        } catch (error) {
            console.error(error);
            toast.error('An unexpected error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Button
            onClick={handleRender}
            disabled={disabled || isLoading}
            variant="primary"
            className="h-14 px-10 shadow-2xl shadow-primary/20 active:scale-[0.98] transition-all uppercase tracking-[0.2em] text-[11px]"
        >
            {isLoading ? (
                <>
                    <Loader2 className="mr-3 h-4 w-4 animate-spin" />
                    PROPAGATING...
                </>
            ) : (
                <>
                    <Wand2 className="mr-3 h-4 w-4" />
                    Make the finished video
                </>
            )}
        </Button>
    );
}
