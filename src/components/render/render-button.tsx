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
                toast.error(result.error || 'Your video could not start. Please try again.');
            }
        } catch (error) {
            console.error(error);
            toast.error('Your request could not be sent. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Button
            onClick={handleRender}
            disabled={disabled || isLoading}
            variant="primary"
            className="min-h-12 w-full px-5 py-3 text-sm font-semibold transition-colors sm:w-auto"
        >
            {isLoading ? (
                <>
                    <Loader2 className="mr-3 h-4 w-4 animate-spin" />
                    Sending your request…
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
